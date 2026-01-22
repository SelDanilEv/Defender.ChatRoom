using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace Defender.ChatRoom.Services;

public class WebSocketMessageService
{
    public async Task SendMessageAsync(WebSocket ws, object message)
    {
        if (ws.State == WebSocketState.Open)
        {
            var json = JsonSerializer.Serialize(message);
            var bytes = Encoding.UTF8.GetBytes(json);
            await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
}
