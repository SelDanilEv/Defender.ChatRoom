using System.Net.WebSockets;

namespace Defender.ChatRoom.Services;

public class WebSocketConnectionService
{
    private readonly Dictionary<string, WebSocket> _connections = new();
    private readonly object _lockObj = new();

    public void AddConnection(string connectionId, WebSocket webSocket)
    {
        lock (_lockObj)
        {
            var wasExisting = _connections.ContainsKey(connectionId);
            _connections[connectionId] = webSocket;
            var totalConnections = _connections.Count;
            
            if (wasExisting)
            {
                Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] Connection updated in service - ClientId: {connectionId}, TotalConnections: {totalConnections}");
            }
            else
            {
                Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] Connection added to service - ClientId: {connectionId}, TotalConnections: {totalConnections}");
            }
        }
    }

    public WebSocket? GetConnection(string connectionId)
    {
        lock (_lockObj)
        {
            return _connections.TryGetValue(connectionId, out var ws) ? ws : null;
        }
    }

    public void RemoveConnection(string connectionId)
    {
        lock (_lockObj)
        {
            var removed = _connections.Remove(connectionId);
            var totalConnections = _connections.Count;
            
            if (removed)
            {
                Console.WriteLine($"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC] Connection removed from service - ClientId: {connectionId}, TotalConnections: {totalConnections}");
            }
        }
    }

    public List<KeyValuePair<string, WebSocket>> GetAllConnectionsExcept(string excludeConnectionId)
    {
        lock (_lockObj)
        {
            return _connections
                .Where(kvp => kvp.Key != excludeConnectionId)
                .ToList();
        }
    }

    public bool HasConnection(string connectionId)
    {
        lock (_lockObj)
        {
            return _connections.ContainsKey(connectionId);
        }
    }

    public List<KeyValuePair<string, WebSocket>> GetAllConnections()
    {
        lock (_lockObj)
        {
            return _connections.ToList();
        }
    }
}
