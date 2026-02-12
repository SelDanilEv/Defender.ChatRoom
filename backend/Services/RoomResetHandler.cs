using System.Net.WebSockets;
using Microsoft.Extensions.Options;

namespace Defender.ChatRoom.Services;

public class RoomResetHandler
{
    private readonly RoomOptions _roomOptions;
    private readonly WebSocketConnectionService _connectionService;
    private readonly RoomService _roomService;
    private readonly WebSocketMessageService _messageService;
    private readonly CryptographyService _cryptographyService;

    public RoomResetHandler(
        IOptions<RoomOptions> roomOptions,
        WebSocketConnectionService connectionService,
        RoomService roomService,
        WebSocketMessageService messageService,
        CryptographyService cryptographyService)
    {
        _roomOptions = roomOptions.Value;
        _connectionService = connectionService;
        _roomService = roomService;
        _messageService = messageService;
        _cryptographyService = cryptographyService;
    }

    public async Task<IResult> HandleAsync(HttpContext context)
    {
        if (string.IsNullOrEmpty(_roomOptions.Passphrase))
            return Results.BadRequest(new { error = "Reset endpoint requires a passphrase to be configured" });

        var (passphrase, parseError) = await ReadPassphraseAsync(context);
        if (parseError != null)
            return parseError;
        if (string.IsNullOrEmpty(passphrase))
            return Results.Unauthorized();

        var expectedHash = _cryptographyService.ComputeSha256Hash(_roomOptions.Passphrase);
        var providedHash = _cryptographyService.ComputeSha256Hash(passphrase);
        if (providedHash != expectedHash)
            return Results.Unauthorized();

        var disconnectedCount = await DisconnectAllAsync();
        _roomService.ClearAllParticipants();

        return Results.Ok(new { message = "Room reset successfully", disconnectedCount });
    }

    private static async Task<(string? Passphrase, IResult? Error)> ReadPassphraseAsync(HttpContext context)
    {
        if (context.Request.HasJsonContentType())
        {
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync();
            if (!string.IsNullOrEmpty(body))
            {
                try
                {
                    var json = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(body);
                    if (json.TryGetProperty("passphrase", out var prop))
                        return (prop.GetString(), null);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[reset] Invalid JSON body: {ex.Message}");
                    return (null, Results.BadRequest(new { error = "Invalid JSON body" }));
                }
            }
        }
        return (context.Request.Query["passphrase"].ToString(), null);
    }

    private async Task<int> DisconnectAllAsync()
    {
        var count = 0;
        foreach (var kvp in _connectionService.GetAllConnections())
        {
            try
            {
                if (kvp.Value.State == WebSocketState.Open)
                {
                    await _messageService.SendMessageAsync(kvp.Value, new { type = "kicked", reason = "room_reset" });
                    await kvp.Value.CloseAsync(WebSocketCloseStatus.NormalClosure, "Room reset", CancellationToken.None);
                    count++;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error disconnecting {kvp.Key}: {ex.Message}");
            }
        }
        return count;
    }
}
