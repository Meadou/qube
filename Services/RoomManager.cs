using System.Collections.Concurrent;
using CSharpQuizGame.Models;

namespace CSharpQuizGame.Services;

// Singleton tracking who's in the lobby, who's waiting to be matched, and
// which rooms (1v1 matches) are currently active.
public class RoomManager
{
    public ConcurrentDictionary<string, PlayerInfo> LobbyPlayers { get; } = new();
    public ConcurrentDictionary<string, GameRoom> Rooms { get; } = new();

    // code -> creator's connectionId. A code exists only while its creator is
    // sitting in the lobby waiting for someone to join with it.
    public ConcurrentDictionary<string, string> PendingPrivateRooms { get; } = new();

    // Ambiguous characters (0/O, 1/I) are excluded so codes are easy to read
    // aloud or type on a phone.
    private static readonly char[] CodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    private readonly Queue<string> _waitingQueue = new();
    private readonly object _queueLock = new();

    public void AddToLobby(PlayerInfo player)
    {
        LobbyPlayers[player.ConnectionId] = player;
    }

    public void RemovePlayer(string connectionId)
    {
        LobbyPlayers.TryRemove(connectionId, out _);
        CancelQueue(connectionId);
        RemovePendingPrivateRoomsFor(connectionId);
    }

    public string CreatePrivateRoomCode(string connectionId)
    {
        string code;
        do
        {
            var chars = new char[5];
            for (int i = 0; i < chars.Length; i++)
            {
                chars[i] = CodeChars[Random.Shared.Next(CodeChars.Length)];
            }
            code = new string(chars);
        } while (!PendingPrivateRooms.TryAdd(code, connectionId));

        return code;
    }

    public bool TryConsumePrivateRoomCode(string code, out string? creatorConnectionId)
    {
        return PendingPrivateRooms.TryRemove(code, out creatorConnectionId);
    }

    public void CancelPrivateRoomCode(string code)
    {
        PendingPrivateRooms.TryRemove(code, out _);
    }

    private void RemovePendingPrivateRoomsFor(string connectionId)
    {
        foreach (var kvp in PendingPrivateRooms)
        {
            if (kvp.Value == connectionId) PendingPrivateRooms.TryRemove(kvp.Key, out _);
        }
    }

    // Adds connectionId to the matchmaking queue. If this makes 2+ people
    // waiting, dequeues the first two and returns them as a pair to be matched.
    public (string, string)? EnqueueForMatch(string connectionId)
    {
        lock (_queueLock)
        {
            if (_waitingQueue.Contains(connectionId)) return null;
            _waitingQueue.Enqueue(connectionId);

            if (_waitingQueue.Count >= 2)
            {
                var p1 = _waitingQueue.Dequeue();
                var p2 = _waitingQueue.Dequeue();
                return (p1, p2);
            }

            return null;
        }
    }

    public void CancelQueue(string connectionId)
    {
        lock (_queueLock)
        {
            if (!_waitingQueue.Contains(connectionId)) return;
            var remaining = new Queue<string>(_waitingQueue.Where(id => id != connectionId));
            _waitingQueue.Clear();
            foreach (var id in remaining) _waitingQueue.Enqueue(id);
        }
    }

    public GameRoom CreateRoom(PlayerInfo p1, PlayerInfo p2, List<QuizQuestion> questions)
    {
        var room = new GameRoom
        {
            Player1 = p1,
            Player2 = p2,
            Questions = questions
        };
        p1.RoomId = room.Id;
        p2.RoomId = room.Id;
        Rooms[room.Id] = room;
        return room;
    }

    public void RemoveRoom(string roomId)
    {
        Rooms.TryRemove(roomId, out _);
    }
}