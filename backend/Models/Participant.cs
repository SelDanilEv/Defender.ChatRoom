namespace Defender.ChatRoom.Models;

public class Participant
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateTime LastSeen { get; set; }
    public bool Muted { get; set; } = false;
}
