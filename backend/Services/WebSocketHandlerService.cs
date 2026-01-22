using System.Net.WebSockets;
using System.Text;
using Defender.ChatRoom.Models;
using Microsoft.Extensions.Options;

namespace Defender.ChatRoom.Services;

public class WebSocketHandlerService
{
    private readonly SignalingService _signalingService;
    private readonly RoomService _roomService;
    private readonly WebSocketConnectionService _connectionService;
    private readonly RoomOptions _roomOptions;
    private readonly WebSocketMessageService _messageService;

    public WebSocketHandlerService(
        SignalingService signalingService,
        RoomService roomService,
        WebSocketConnectionService connectionService,
        IOptions<RoomOptions> roomOptions,
        WebSocketMessageService messageService)
    {
        _signalingService = signalingService;
        _roomService = roomService;
        _connectionService = connectionService;
        _roomOptions = roomOptions.Value;
        _messageService = messageService;
    }

    public async Task HandleWebSocketAsync(string connectionId, WebSocket ws)
    {
        Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] Starting WebSocket handler - ClientId: {connectionId}, State: {ws.State}, PingInterval: {Math.Min(_roomOptions.HeartbeatSeconds, 60)}s");
        
        var buffer = new byte[4096];
        var cts = new CancellationTokenSource();
        var pingInterval = TimeSpan.FromSeconds(Math.Min(_roomOptions.HeartbeatSeconds, 60));

        _ = Task.Run(async () =>
        {
            while (ws.State == WebSocketState.Open && !cts.Token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(pingInterval, cts.Token);
                    
                    if (ws.State == WebSocketState.Open)
                    {
                        var pingBytes = Encoding.UTF8.GetBytes("ping");
                        await ws.SendAsync(
                            new ArraySegment<byte>(pingBytes),
                            WebSocketMessageType.Text,
                            true,
                            cts.Token);
                    }
                    
                    var participant = _roomService.GetParticipant(connectionId);
                    if (participant != null)
                    {
                        var elapsed = DateTime.UtcNow - participant.LastSeen;
                        if (elapsed.TotalMinutes >= _roomOptions.InactivityMinutes)
                        {
                            _ = Task.Run(async () =>
                            {
                                await _messageService.SendMessageAsync(ws, new { type = "kicked", reason = "inactivity" });
                                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Inactivity", CancellationToken.None);
                            });
                            return;
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error in heartbeat task for {connectionId}: {ex.Message}");
                    break;
                }
            }
        }, cts.Token);

        try
        {
            while (ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
                
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] WebSocket close received - ClientId: {connectionId}, CloseStatus: {result.CloseStatus}, CloseStatusDescription: {result.CloseStatusDescription}");
                    break;
                }

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    _roomService.UpdateLastSeen(connectionId);
                    
                    var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    
                    if (message == "pong")
                    {
                        continue;
                    }
                    
                    await _signalingService.ProcessMessageAsync(connectionId, ws, message);
                }
            }
        }
        catch (OperationCanceledException)
        {
            Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] WebSocket handler cancelled - ClientId: {connectionId}, State: {ws.State}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] WebSocket handler error - ClientId: {connectionId}, Error: {ex.Message}, State: {ws.State}");
        }
        finally
        {
            cts.Cancel();
            Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] WebSocket handler ended - ClientId: {connectionId}, FinalState: {ws.State}");
        }
    }

    public void CleanupConnection(string connectionId)
    {
        var participant = _roomService.GetParticipant(connectionId);
        if (participant != null)
        {
            Console.WriteLine($"Cleaning up connection for {participant.Name} (ID: {connectionId})");
            _roomService.RemoveParticipant(connectionId);
            _signalingService.BroadcastParticipantLeft(connectionId, participant.Name, "disconnect");
        }
        else
        {
            Console.WriteLine($"Cleaning up connection for ID: {connectionId} (participant already removed)");
        }
        _connectionService.RemoveConnection(connectionId);
        Console.WriteLine($"Connection {connectionId} removed from connection service");
    }
}
