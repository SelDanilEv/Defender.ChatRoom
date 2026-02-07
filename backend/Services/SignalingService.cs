using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Defender.ChatRoom.Models;
using Microsoft.Extensions.Options;

namespace Defender.ChatRoom.Services;

public class SignalingService
{
    private readonly RoomService _roomService;
    private readonly WebSocketConnectionService _connectionService;
    private readonly ChallengeService _challengeService;
    private readonly CryptographyService _cryptographyService;
    private readonly WebSocketMessageService _messageService;
    private readonly RoomOptions _roomOptions;
    private readonly string? _roomPassphraseHash;

    public SignalingService(
        RoomService roomService,
        WebSocketConnectionService connectionService,
        ChallengeService challengeService,
        CryptographyService cryptographyService,
        WebSocketMessageService messageService,
        IOptions<RoomOptions> roomOptions)
    {
        _roomService = roomService;
        _connectionService = connectionService;
        _challengeService = challengeService;
        _cryptographyService = cryptographyService;
        _messageService = messageService;
        _roomOptions = roomOptions.Value;
        
        if (!string.IsNullOrEmpty(_roomOptions.Passphrase))
        {
            _roomPassphraseHash = _cryptographyService.ComputeSha256Hash(_roomOptions.Passphrase);
        }
    }

    public async Task ProcessMessageAsync(string connectionId, WebSocket ws, string message)
    {
        JsonElement root;
        try
        {
            var doc = JsonDocument.Parse(message);
            root = doc.RootElement;
        }
        catch (JsonException ex)
        {
            Console.WriteLine($"Error parsing message: {ex.Message}");
            await SendErrorAsync(ws, "Invalid JSON");
            return;
        }

        if (!root.TryGetProperty("type", out var typeProp))
        {
            await SendErrorAsync(ws, "Missing type");
            return;
        }

        var type = typeProp.GetString();
        if (string.IsNullOrEmpty(type))
        {
            await SendErrorAsync(ws, "Invalid type");
            return;
        }

        try
        {
            switch (type)
            {
                case "join":
                    await HandleJoinAsync(connectionId, ws, root);
                    break;
                case "join-response":
                    await HandleJoinResponseAsync(connectionId, ws, root);
                    break;
                case "leave":
                    HandleLeave(connectionId);
                    break;
                case "heartbeat":
                    _roomService.UpdateLastSeen(connectionId);
                    break;
                case "mute":
                    await HandleMuteAsync(connectionId, ws, root);
                    break;
                case "offer":
                    await HandleOfferAsync(connectionId, root);
                    break;
                case "answer":
                    await HandleAnswerAsync(connectionId, root);
                    break;
                case "ice":
                    await HandleIceAsync(connectionId, root);
                    break;
                default:
                    await SendErrorAsync(ws, "Unknown message type");
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error processing message: {ex.Message}");
            await SendErrorAsync(ws, "Processing failed");
        }
    }

    private async Task SendErrorAsync(WebSocket ws, string message)
    {
        if (ws.State == WebSocketState.Open)
        {
            await _messageService.SendMessageAsync(ws, new { type = "error", message = message });
        }
    }

    public async Task SendChallengeAsync(string connectionId, WebSocket ws)
    {
        if (!string.IsNullOrEmpty(_roomPassphraseHash))
        {
            var challenge = _challengeService.GenerateAndStoreChallenge(connectionId);
            await _messageService.SendMessageAsync(ws, new { type = "challenge", challenge = challenge });
        }
    }

    private async Task HandleJoinAsync(string connectionId, WebSocket ws, JsonElement data)
    {
        if (!string.IsNullOrEmpty(_roomPassphraseHash))
        {
            await _messageService.SendMessageAsync(ws, new
            {
                type = "join-error",
                message = "Passphrase required. Please respond to challenge."
            });
            return;
        }

        await CompleteJoinAsync(connectionId, ws, data);
    }

    private async Task HandleJoinResponseAsync(string connectionId, WebSocket ws, JsonElement data)
    {
        if (!string.IsNullOrEmpty(_roomPassphraseHash))
        {
            var challenge = _challengeService.GetChallenge(connectionId);

            if (string.IsNullOrEmpty(challenge))
            {
                await _messageService.SendMessageAsync(ws, new
                {
                    type = "join-error",
                    message = "No pending challenge. Please reconnect."
                });
                await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "No challenge", CancellationToken.None);
                return;
            }

            var providedResponse = data.TryGetProperty("response", out var responseProp) 
                ? responseProp.GetString() 
                : null;

            if (string.IsNullOrEmpty(providedResponse))
            {
                await _messageService.SendMessageAsync(ws, new
                {
                    type = "join-error",
                    message = "Invalid response"
                });
                await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Invalid response", CancellationToken.None);
                return;
            }

            var expectedResponse = _cryptographyService.ComputeSha256Hash(_roomPassphraseHash + challenge);

            if (providedResponse != expectedResponse)
            {
                await _messageService.SendMessageAsync(ws, new
                {
                    type = "join-error",
                    message = "Invalid passphrase"
                });
                await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Invalid passphrase", CancellationToken.None);
                return;
            }

            _challengeService.RemoveChallenge(connectionId);
        }

        await CompleteJoinAsync(connectionId, ws, data);
    }

    private async Task CompleteJoinAsync(string connectionId, WebSocket ws, JsonElement data)
    {
        var name = data.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
        if (string.IsNullOrWhiteSpace(name))
            name = $"Guest-{Random.Shared.Next(1000, 9999)}";
        var muted = data.TryGetProperty("muted", out var mutedProp) && mutedProp.GetBoolean();
        
        var existingParticipant = _roomService.GetParticipant(connectionId);
        if (existingParticipant != null)
        {
            _roomService.RemoveParticipant(connectionId);
            BroadcastParticipantLeft(connectionId, existingParticipant.Name, "reconnected");
        }
        
        _roomService.AddParticipant(connectionId, name, muted);

        var existingParticipants = _roomService.GetAllParticipantsExcept(connectionId)
            .Select(p => new { id = p.Id, name = p.Name, muted = p.Muted })
            .ToList();

        await _messageService.SendMessageAsync(ws, new
        {
            type = "joined",
            selfId = connectionId,
            participants = existingParticipants
        });

        BroadcastParticipantJoined(connectionId, name, muted);
    }

    private void HandleLeave(string connectionId)
    {
        var participant = _roomService.GetParticipant(connectionId);
        if (participant != null)
        {
            Console.WriteLine($"User {participant.Name} (ID: {connectionId}) left the room");
            _roomService.RemoveParticipant(connectionId);
            BroadcastParticipantLeft(connectionId, participant.Name, "left");
        }
        else
        {
            Console.WriteLine($"Leave message received for unknown connection ID: {connectionId}");
        }
    }

    private async Task HandleMuteAsync(string connectionId, WebSocket ws, JsonElement data)
    {
        if (!data.TryGetProperty("muted", out var mutedProp))
        {
            await SendErrorAsync(ws, "Missing muted");
            return;
        }
        var muted = mutedProp.GetBoolean();
        if (_roomService.UpdateMuteState(connectionId, muted))
        {
            BroadcastMuteState(connectionId, muted);
        }
    }

    private async Task HandleOfferAsync(string connectionId, JsonElement data)
    {
        if (!data.TryGetProperty("toId", out var toIdProp) || !data.TryGetProperty("sdp", out var sdpProp))
        {
            var senderWs = _connectionService.GetConnection(connectionId);
            if (senderWs != null) await SendErrorAsync(senderWs, "Missing toId or sdp");
            return;
        }
        var toId = toIdProp.GetString();
        var sdp = sdpProp.GetString();
        if (string.IsNullOrEmpty(toId) || string.IsNullOrEmpty(sdp))
        {
            var senderWs = _connectionService.GetConnection(connectionId);
            if (senderWs != null) await SendErrorAsync(senderWs, "Invalid toId or sdp");
            return;
        }

        var targetWs = _connectionService.GetConnection(toId);
        if (targetWs != null)
        {
            var participant = _roomService.GetParticipant(connectionId);
            var name = participant?.Name ?? "Guest";
            var muted = participant?.Muted ?? false;
            await _messageService.SendMessageAsync(targetWs, new
            {
                type = "offer",
                fromId = connectionId,
                name = name,
                muted = muted,
                sdp = sdp
            });
        }
    }

    private async Task HandleAnswerAsync(string connectionId, JsonElement data)
    {
        var toId = data.GetProperty("toId").GetString();
        var sdp = data.GetProperty("sdp").GetString();

        if (string.IsNullOrEmpty(toId) || string.IsNullOrEmpty(sdp))
        {
            return;
        }

        var targetWs = _connectionService.GetConnection(toId);
        if (targetWs != null)
        {
            await _messageService.SendMessageAsync(targetWs, new
            {
                type = "answer",
                fromId = connectionId,
                sdp = sdp
            });
        }
    }

    private async Task HandleIceAsync(string connectionId, JsonElement data)
    {
        var toId = data.GetProperty("toId").GetString();
        var candidate = data.GetProperty("candidate").GetString();

        if (string.IsNullOrEmpty(toId) || string.IsNullOrEmpty(candidate))
        {
            return;
        }

        var targetWs = _connectionService.GetConnection(toId);
        if (targetWs != null)
        {
            await _messageService.SendMessageAsync(targetWs, new
            {
                type = "ice",
                fromId = connectionId,
                candidate = candidate
            });
        }
    }

    private void BroadcastParticipantJoined(string connectionId, string name, bool muted)
    {
        var message = new
        {
            type = "participant-joined",
            id = connectionId,
            name = name,
            muted = muted
        };

        var connections = _connectionService.GetAllConnectionsExcept(connectionId);
        foreach (var kvp in connections)
        {
            if (_roomService.HasParticipant(kvp.Key))
            {
                _ = Task.Run(async () =>
                {
                    await _messageService.SendMessageAsync(kvp.Value, message);
                });
            }
        }
    }

    public void BroadcastParticipantLeft(string connectionId, string name, string reason)
    {
        var message = new
        {
            type = "participant-left",
            id = connectionId,
            reason = reason
        };

        var connections = _connectionService.GetAllConnectionsExcept(connectionId);
        var broadcastCount = 0;
        foreach (var kvp in connections)
        {
            if (_roomService.HasParticipant(kvp.Key))
            {
                broadcastCount++;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _messageService.SendMessageAsync(kvp.Value, message);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error broadcasting participant-left to {kvp.Key}: {ex.Message}");
                    }
                });
            }
        }
        Console.WriteLine($"Broadcasted participant-left for {name} (ID: {connectionId}, reason: {reason}) to {broadcastCount} participant(s)");
    }

    private void BroadcastMuteState(string connectionId, bool muted)
    {
        var participant = _roomService.GetParticipant(connectionId);
        var participantName = participant?.Name ?? "Unknown";
        
        var message = new
        {
            type = "participant-mute",
            id = connectionId,
            muted = muted
        };

        var connections = _connectionService.GetAllConnectionsExcept(connectionId);
        var broadcastCount = 0;
        foreach (var kvp in connections)
        {
            if (_roomService.HasParticipant(kvp.Key))
            {
                broadcastCount++;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _messageService.SendMessageAsync(kvp.Value, message);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error broadcasting participant-mute to {kvp.Key}: {ex.Message}");
                    }
                });
            }
        }
        Console.WriteLine($"Broadcasted participant-mute for {participantName} (ID: {connectionId}, muted: {muted}) to {broadcastCount} participant(s)");
    }
}
