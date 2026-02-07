using Defender.ChatRoom.Models;
using Defender.ChatRoom.Services;
using Xunit;

namespace Defender.ChatRoom.Tests;

public class RoomServiceTests
{
    [Fact]
    public void AddParticipant_StoresParticipant()
    {
        var sut = new RoomService();
        sut.AddParticipant("conn1", "Alice", false);

        var p = sut.GetParticipant("conn1");
        Assert.NotNull(p);
        Assert.Equal("conn1", p.Id);
        Assert.Equal("Alice", p.Name);
        Assert.False(p.Muted);
    }

    [Fact]
    public void GetParticipant_ReturnsNull_WhenMissing()
    {
        var sut = new RoomService();
        Assert.Null(sut.GetParticipant("missing"));
    }

    [Fact]
    public void RemoveParticipant_RemovesFromRoom()
    {
        var sut = new RoomService();
        sut.AddParticipant("conn1", "Alice", false);
        sut.RemoveParticipant("conn1");
        Assert.Null(sut.GetParticipant("conn1"));
        Assert.False(sut.HasParticipant("conn1"));
    }

    [Fact]
    public void GetAllParticipantsExcept_ExcludesGivenId()
    {
        var sut = new RoomService();
        sut.AddParticipant("a", "A", false);
        sut.AddParticipant("b", "B", false);
        sut.AddParticipant("c", "C", false);

        var list = sut.GetAllParticipantsExcept("b");
        Assert.Equal(2, list.Count);
        Assert.DoesNotContain(list, p => p.Id == "b");
    }

    [Fact]
    public void UpdateMuteState_ReturnsTrue_WhenStateChanged()
    {
        var sut = new RoomService();
        sut.AddParticipant("conn1", "Alice", false);
        Assert.True(sut.UpdateMuteState("conn1", true));
        Assert.True(sut.GetParticipant("conn1")!.Muted);
    }

    [Fact]
    public void UpdateMuteState_ReturnsFalse_WhenSameState()
    {
        var sut = new RoomService();
        sut.AddParticipant("conn1", "Alice", false);
        Assert.False(sut.UpdateMuteState("conn1", false));
    }

    [Fact]
    public void UpdateLastSeen_UpdatesParticipant()
    {
        var sut = new RoomService();
        sut.AddParticipant("conn1", "Alice", false);
        var before = sut.GetParticipant("conn1")!.LastSeen;
        System.Threading.Thread.Sleep(10);
        sut.UpdateLastSeen("conn1");
        var after = sut.GetParticipant("conn1")!.LastSeen;
        Assert.True(after >= before);
    }

    [Fact]
    public void ClearAllParticipants_RemovesEveryone()
    {
        var sut = new RoomService();
        sut.AddParticipant("a", "A", false);
        sut.AddParticipant("b", "B", false);
        sut.ClearAllParticipants();
        Assert.Empty(sut.GetAllParticipants());
        Assert.Null(sut.GetParticipant("a"));
    }
}
