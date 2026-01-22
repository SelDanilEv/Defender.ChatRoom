namespace Defender.ChatRoom.Services;

public class ChallengeService
{
    private readonly Dictionary<string, string> _pendingChallenges = new();
    private readonly object _lockObj = new();

    public string GenerateAndStoreChallenge(string connectionId)
    {
        var challenge = GenerateChallenge();
        lock (_lockObj)
        {
            _pendingChallenges[connectionId] = challenge;
        }
        return challenge;
    }

    public string? GetChallenge(string connectionId)
    {
        lock (_lockObj)
        {
            return _pendingChallenges.TryGetValue(connectionId, out var challenge) ? challenge : null;
        }
    }

    public void RemoveChallenge(string connectionId)
    {
        lock (_lockObj)
        {
            _pendingChallenges.Remove(connectionId);
        }
    }

    private static string GenerateChallenge()
    {
        var bytes = new byte[16];
        Random.Shared.NextBytes(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
