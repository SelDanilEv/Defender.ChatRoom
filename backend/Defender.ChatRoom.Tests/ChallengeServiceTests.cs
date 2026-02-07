using Defender.ChatRoom.Services;
using Xunit;

namespace Defender.ChatRoom.Tests;

public class ChallengeServiceTests
{
    [Fact]
    public void GenerateAndStoreChallenge_ReturnsNonEmptyHexString()
    {
        var sut = new ChallengeService();
        var challenge = sut.GenerateAndStoreChallenge("conn1");
        Assert.False(string.IsNullOrEmpty(challenge));
        Assert.Equal(32, challenge.Length);
        Assert.True(challenge.All(c => char.IsAsciiHexDigit(c) && (c is >= '0' and <= '9' or >= 'a' and <= 'f')));
    }

    [Fact]
    public void GetChallenge_ReturnsStoredChallenge()
    {
        var sut = new ChallengeService();
        var stored = sut.GenerateAndStoreChallenge("conn1");
        var retrieved = sut.GetChallenge("conn1");
        Assert.Equal(stored, retrieved);
    }

    [Fact]
    public void GetChallenge_ReturnsNull_WhenNotStored()
    {
        var sut = new ChallengeService();
        Assert.Null(sut.GetChallenge("missing"));
    }

    [Fact]
    public void RemoveChallenge_RemovesStoredChallenge()
    {
        var sut = new ChallengeService();
        sut.GenerateAndStoreChallenge("conn1");
        sut.RemoveChallenge("conn1");
        Assert.Null(sut.GetChallenge("conn1"));
    }

    [Fact]
    public void GenerateAndStoreChallenge_OverwritesPreviousForSameConnection()
    {
        var sut = new ChallengeService();
        var first = sut.GenerateAndStoreChallenge("conn1");
        var second = sut.GenerateAndStoreChallenge("conn1");
        Assert.NotEqual(first, second);
        Assert.Equal(second, sut.GetChallenge("conn1"));
    }
}
