using System.Collections.Concurrent;
using CSharpQuizGame.Models;

namespace CSharpQuizGame.Services;

public class RoomManager
{
    public ConcurrentDictionary<string, PlayerInfo> LobbyPlayers { get; } = new();
    public ConcurrentDictionary<string, GameRoom> Rooms { get; } = new();

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
    }

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