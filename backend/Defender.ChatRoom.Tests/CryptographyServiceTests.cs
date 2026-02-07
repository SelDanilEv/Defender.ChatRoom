using Defender.ChatRoom.Services;
using Xunit;

namespace Defender.ChatRoom.Tests;

public class CryptographyServiceTests
{
    private readonly CryptographyService _sut = new();

    [Fact]
    public void ComputeSha256Hash_ReturnsLowercaseHexString()
    {
        var hash = _sut.ComputeSha256Hash("hello");
        Assert.False(string.IsNullOrEmpty(hash));
        Assert.Equal(64, hash.Length);
        Assert.True(hash.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f'));
    }

    [Fact]
    public void ComputeSha256Hash_IsDeterministic()
    {
        var one = _sut.ComputeSha256Hash("same");
        var two = _sut.ComputeSha256Hash("same");
        Assert.Equal(one, two);
    }

    [Fact]
    public void ComputeSha256Hash_DiffersForDifferentInput()
    {
        var a = _sut.ComputeSha256Hash("a");
        var b = _sut.ComputeSha256Hash("b");
        Assert.NotEqual(a, b);
    }

    [Fact]
    public void ComputeSha256Hash_EmptyString_ProducesKnownHash()
    {
        var hash = _sut.ComputeSha256Hash("");
        Assert.Equal("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", hash);
    }
}
