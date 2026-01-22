namespace Defender.ChatRoom;

public class RoomOptions
{
    public const string SectionName = "Room";

    public string? Passphrase { get; set; }
    public int InactivityMinutes { get; set; } = 15;
    public int HeartbeatSeconds { get; set; } = 30;
}
