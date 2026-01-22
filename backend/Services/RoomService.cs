using Defender.ChatRoom.Models;

namespace Defender.ChatRoom.Services;

public class RoomService
{
    private readonly Dictionary<string, Participant> _participants = new();
    private readonly object _lockObj = new();

    public void AddParticipant(string connectionId, string name, bool muted)
    {
        lock (_lockObj)
        {
            _participants[connectionId] = new Participant
            {
                Id = connectionId,
                Name = name,
                LastSeen = DateTime.UtcNow,
                Muted = muted
            };
        }
    }

    public Participant? GetParticipant(string connectionId)
    {
        lock (_lockObj)
        {
            return _participants.TryGetValue(connectionId, out var participant) ? participant : null;
        }
    }

    public void UpdateLastSeen(string connectionId)
    {
        lock (_lockObj)
        {
            if (_participants.TryGetValue(connectionId, out var participant))
            {
                participant.LastSeen = DateTime.UtcNow;
            }
        }
    }

    public void RemoveParticipant(string connectionId)
    {
        lock (_lockObj)
        {
            _participants.Remove(connectionId);
        }
    }

    public List<Participant> GetAllParticipantsExcept(string excludeConnectionId)
    {
        lock (_lockObj)
        {
            return _participants.Values
                .Where(p => p.Id != excludeConnectionId)
                .ToList();
        }
    }

    public void UpdateMuteState(string connectionId, bool muted)
    {
        lock (_lockObj)
        {
            if (_participants.TryGetValue(connectionId, out var participant))
            {
                participant.Muted = muted;
            }
        }
    }

    public bool HasParticipant(string connectionId)
    {
        lock (_lockObj)
        {
            return _participants.ContainsKey(connectionId);
        }
    }

    public List<Participant> GetAllParticipants()
    {
        lock (_lockObj)
        {
            return _participants.Values.ToList();
        }
    }

    public void ClearAllParticipants()
    {
        lock (_lockObj)
        {
            _participants.Clear();
        }
    }
}
