namespace Defender.ChatRoom.Services;

public class BroadcastService
{
    private readonly WebSocketConnectionService _connectionService;
    private readonly RoomService _roomService;
    private readonly WebSocketMessageService _messageService;

    public BroadcastService(
        WebSocketConnectionService connectionService,
        RoomService roomService,
        WebSocketMessageService messageService)
    {
        _connectionService = connectionService;
        _roomService = roomService;
        _messageService = messageService;
    }

    public void BroadcastToParticipants(string excludeConnectionId, object message)
    {
        foreach (var kvp in _connectionService.GetAllConnectionsExcept(excludeConnectionId))
        {
            if (!_roomService.HasParticipant(kvp.Key))
                continue;

            _ = Task.Run(async () =>
            {
                try
                {
                    await _messageService.SendMessageAsync(kvp.Value, message);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error broadcasting to {kvp.Key}: {ex.Message}");
                }
            });
        }
    }
}
