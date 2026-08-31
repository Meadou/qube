using Microsoft.AspNetCore.SignalR;
using CSharpQuizGame.Models;
using CSharpQuizGame.Services;

namespace CSharpQuizGame.Hubs;

public class GameHub : Hub
{
    private const int RoundTimeoutSeconds = 15;
    private const int DamagePerHit = 20;
    private const int DelayBetweenRoundsMs = 2500;

    private readonly RoomManager _rooms;
    private readonly QuizService _quiz;
    private readonly IHubContext<GameHub> _hubContext;

    public GameHub(RoomManager rooms, QuizService quiz, IHubContext<GameHub> hubContext)
    {
        _rooms = rooms;
        _quiz = quiz;
        _hubContext = hubContext;
    }

    // ---------- Lobby ----------

    public async Task JoinLobby(string playerName, CharacterConfig character)
    {
        var player = new PlayerInfo
        {
            ConnectionId = Context.ConnectionId,
            Name = string.IsNullOrWhiteSpace(playerName) ? "Player" : playerName.Trim(),
            Character = character
        };
        _rooms.AddToLobby(player);
        await _hubContext.Groups.AddToGroupAsync(Context.ConnectionId, "Lobby");
        await BroadcastLobbyPlayers();
    }

    public async Task SendChatMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        if (!_rooms.LobbyPlayers.TryGetValue(Context.ConnectionId, out var player)) return;

        await _hubContext.Clients.Group("Lobby").SendAsync("ReceiveChatMessage", player.Name, message);
    }

    // ---------- Matchmaking ----------

    public async Task RequestMatch()
    {
        var match = _rooms.EnqueueForMatch(Context.ConnectionId);
        if (match == null)
        {
            await Clients.Caller.SendAsync("QueueStatus", "waiting");
            return;
        }

        var (id1, id2) = match.Value;
        if (!_rooms.LobbyPlayers.TryGetValue(id1, out var p1) ||
            !_rooms.LobbyPlayers.TryGetValue(id2, out var p2))
        {
            return;
        }

        if (_quiz.Count == 0)
        {
            await _hubContext.Clients.Client(id1).SendAsync("QueueStatus", "no-questions");
            await _hubContext.Clients.Client(id2).SendAsync("QueueStatus", "no-questions");
            return;
        }

        var room = _rooms.CreateRoom(p1, p2, _quiz.GetShuffledQuestions());

        await _hubContext.Groups.AddToGroupAsync(id1, room.Id);
        await _hubContext.Groups.AddToGroupAsync(id2, room.Id);
        await _hubContext.Groups.RemoveFromGroupAsync(id1, "Lobby");
        await _hubContext.Groups.RemoveFromGroupAsync(id2, "Lobby");

        // Each client is told about the *opponent* plus their own perspective HP.
        await _hubContext.Clients.Client(id1).SendAsync("MatchFound", room.Id, p2.Name, p2.Character, p1.HP, p2.HP);
        await _hubContext.Clients.Client(id2).SendAsync("MatchFound", room.Id, p1.Name, p1.Character, p2.HP, p1.HP);

        // The quiz doesn't start yet — both players need to click "I'm Ready" first (see PlayerReady).
    }

    // ---------- Private rooms ----------

    public async Task CreatePrivateRoom()
    {
        if (!_rooms.LobbyPlayers.ContainsKey(Context.ConnectionId)) return;
        var code = _rooms.CreatePrivateRoomCode(Context.ConnectionId);
        await Clients.Caller.SendAsync("PrivateRoomCreated", code);
    }

    public Task CancelPrivateRoom(string code)
    {
        if (!string.IsNullOrWhiteSpace(code))
        {
            _rooms.CancelPrivateRoomCode(code.Trim().ToUpperInvariant());
        }
        return Task.CompletedTask;
    }

    public async Task JoinPrivateRoom(string code)
    {
        var normalized = (code ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(normalized))
        {
            await Clients.Caller.SendAsync("PrivateRoomJoinFailed", "empty");
            return;
        }

        if (!_rooms.TryConsumePrivateRoomCode(normalized, out var creatorId) || creatorId == null)
        {
            await Clients.Caller.SendAsync("PrivateRoomJoinFailed", "not-found");
            return;
        }

        if (creatorId == Context.ConnectionId)
        {
            await Clients.Caller.SendAsync("PrivateRoomJoinFailed", "self");
            return;
        }

        if (!_rooms.LobbyPlayers.TryGetValue(creatorId, out var p1) ||
            !_rooms.LobbyPlayers.TryGetValue(Context.ConnectionId, out var p2))
        {
            await Clients.Caller.SendAsync("PrivateRoomJoinFailed", "opponent-left");
            return;
        }

        if (_quiz.Count == 0)
        {
            await Clients.Caller.SendAsync("PrivateRoomJoinFailed", "no-questions");
            return;
        }

        var room = _rooms.CreateRoom(p1, p2, _quiz.GetShuffledQuestions());

        await _hubContext.Groups.AddToGroupAsync(p1.ConnectionId, room.Id);
        await _hubContext.Groups.AddToGroupAsync(p2.ConnectionId, room.Id);
        await _hubContext.Groups.RemoveFromGroupAsync(p1.ConnectionId, "Lobby");
        await _hubContext.Groups.RemoveFromGroupAsync(p2.ConnectionId, "Lobby");

        await _hubContext.Clients.Client(p1.ConnectionId).SendAsync("MatchFound", room.Id, p2.Name, p2.Character, p1.HP, p2.HP);
        await _hubContext.Clients.Client(p2.ConnectionId).SendAsync("MatchFound", room.Id, p1.Name, p1.Character, p2.HP, p1.HP);

        // Same "both click ready" flow as random matchmaking (see PlayerReady) — no special-casing needed here.
    }

    public async Task PlayerReady(string roomId)
    {
        if (!_rooms.Rooms.TryGetValue(roomId, out var room)) return;

        bool bothReady;
        lock (room.Lock)
        {
            if (Context.ConnectionId == room.Player1.ConnectionId) room.Player1Ready = true;
            else if (Context.ConnectionId == room.Player2.ConnectionId) room.Player2Ready = true;
            bothReady = room.Player1Ready && room.Player2Ready;
        }

        await _hubContext.Clients.Group(roomId).SendAsync("ReadyUpdate", Context.ConnectionId);

        if (bothReady)
        {
            await SendNextQuestion(room);
        }
    }

    public void CancelMatchRequest()
    {
        _rooms.CancelQueue(Context.ConnectionId);
    }

    // ---------- Gameplay ----------

    public async Task SubmitAnswer(string roomId, int choiceIndex)
    {
        if (!_rooms.Rooms.TryGetValue(roomId, out var room)) return;

        bool shouldResolve = false;
        lock (room.Lock)
        {
            if (room.RoundTimeoutCts == null) return; // round already resolved
            if (room.CurrentAnswers.Any(a => a.ConnectionId == Context.ConnectionId)) return;

            var elapsed = (long)(DateTime.UtcNow - room.QuestionSentAt).TotalMilliseconds;
            room.CurrentAnswers.Add(new RoundAnswer
            {
                ConnectionId = Context.ConnectionId,
                ChoiceIndex = choiceIndex,
                ElapsedMs = elapsed
            });

            if (room.CurrentAnswers.Count >= 2)
            {
                shouldResolve = true;
            }
        }

        // Let both clients know someone answered (not what they picked) so they can
        // show a quick "jump" reaction on that player's character.
        await _hubContext.Clients.Group(roomId).SendAsync("PlayerAnswered", Context.ConnectionId);

        if (shouldResolve)
        {
            await ResolveRound(room);
        }
    }

    private async Task SendNextQuestion(GameRoom room)
    {
        room.CurrentQuestionIndex++;
        if (room.CurrentQuestionIndex >= room.Questions.Count)
        {
            room.Questions.AddRange(_quiz.GetShuffledQuestions());
            if (room.Questions.Count == 0 || room.CurrentQuestionIndex >= room.Questions.Count)
            {
                await EndMatch(room, null);
                return;
            }
        }

        var question = room.Questions[room.CurrentQuestionIndex];

        CancellationToken token;
        lock (room.Lock)
        {
            room.CurrentAnswers.Clear();
            room.QuestionSentAt = DateTime.UtcNow;
            room.RoundTimeoutCts = new CancellationTokenSource();
            token = room.RoundTimeoutCts.Token;
        }

        await _hubContext.Clients.Group(room.Id).SendAsync("NewQuestion", room.CurrentQuestionIndex, question.Text, question.Choices, RoundTimeoutSeconds);

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(RoundTimeoutSeconds * 1000, token);
                await ResolveRound(room);
            }
            catch (TaskCanceledException)
            {
                // Round was already resolved because both players answered in time.
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in background round timeout timer: {ex}");
            }
        });
    }

    private async Task ResolveRound(GameRoom room)
    {
        List<RoundAnswer> answers;
        QuizQuestion question;

        lock (room.Lock)
        {
            if (room.RoundTimeoutCts == null) return; // already resolved by the other path
            room.RoundTimeoutCts.Cancel();
            room.RoundTimeoutCts = null;
            answers = new List<RoundAnswer>(room.CurrentAnswers);
            question = room.Questions[room.CurrentQuestionIndex];
        }

        var p1Answer = answers.FirstOrDefault(a => a.ConnectionId == room.Player1.ConnectionId);
        var p2Answer = answers.FirstOrDefault(a => a.ConnectionId == room.Player2.ConnectionId);

        string p1Outcome;
        string p2Outcome;

        // Correctness is independent of whether the opponent answered at all.
        bool p1Correct = p1Answer != null && p1Answer.ChoiceIndex == question.CorrectIndex;
        bool p2Correct = p2Answer != null && p2Answer.ChoiceIndex == question.CorrectIndex;

        if (p1Correct && p2Correct)
        {
            // Both got it right: the slower of the two still takes the hit.
            bool p1Faster = p1Answer!.ElapsedMs <= p2Answer!.ElapsedMs;

            if (p1Faster)
            {
                room.Player2.HP = Math.Max(0, room.Player2.HP - DamagePerHit);
                p1Outcome = "win";
                p2Outcome = "lose";
            }
            else
            {
                room.Player1.HP = Math.Max(0, room.Player1.HP - DamagePerHit);
                p1Outcome = "lose";
                p2Outcome = "win";
            }
        }
        else
        {
            // Anyone who did NOT answer correctly — whether they answered wrong
            // or didn't answer at all — takes damage. This can hurt one or both players.
            bool p1Hurt = !p1Correct;
            bool p2Hurt = !p2Correct;

            if (p1Hurt) room.Player1.HP = Math.Max(0, room.Player1.HP - DamagePerHit);
            if (p2Hurt) room.Player2.HP = Math.Max(0, room.Player2.HP - DamagePerHit);

            if (p1Hurt && p2Hurt)
            {
                p1Outcome = "both_hurt";
                p2Outcome = "both_hurt";
            }
            else if (p1Hurt)
            {
                p1Outcome = "lose";
                p2Outcome = "win";
            }
            else
            {
                p1Outcome = "win";
                p2Outcome = "lose";
            }
        }

        int p1OpponentChoice = p2Answer?.ChoiceIndex ?? -1;
        int p2OpponentChoice = p1Answer?.ChoiceIndex ?? -1;

        await _hubContext.Clients.Client(room.Player1.ConnectionId).SendAsync(
            "RoundResult", question.CorrectIndex, p1Outcome, room.Player1.HP, room.Player2.HP, p1OpponentChoice, DamagePerHit);
        await _hubContext.Clients.Client(room.Player2.ConnectionId).SendAsync(
            "RoundResult", question.CorrectIndex, p2Outcome, room.Player2.HP, room.Player1.HP, p2OpponentChoice, DamagePerHit);

        if (room.Player1.HP <= 0 || room.Player2.HP <= 0)
        {
            string? winnerName = null;
            if (room.Player1.HP > 0 && room.Player2.HP <= 0)
                winnerName = room.Player1.Name;
            else if (room.Player2.HP > 0 && room.Player1.HP <= 0)
                winnerName = room.Player2.Name;

            await EndMatch(room, winnerName);
            return;
        }

        await Task.Delay(DelayBetweenRoundsMs);
        await SendNextQuestion(room);
    }

    private async Task EndMatch(GameRoom room, string? winnerName)
    {
        lock (room.Lock)
        {
            room.Finished = true;
        }

        await _hubContext.Clients.Group(room.Id).SendAsync("MatchOver", winnerName);

        // The room is intentionally NOT removed here — it's kept alive in case both
        // players request a rematch (see RequestRematch). It's cleaned up once either
        // player heads back to the lobby (LeaveToLobby) or disconnects.
    }

    public async Task RequestRematch(string roomId)
    {
        if (!_rooms.Rooms.TryGetValue(roomId, out var room)) return;
        if (!room.Finished) return; // safety: only valid once a match has actually ended
        if (_quiz.Count == 0) return;

        bool bothWant;
        lock (room.Lock)
        {
            room.RematchRequests.Add(Context.ConnectionId);
            bothWant = room.RematchRequests.Contains(room.Player1.ConnectionId)
                       && room.RematchRequests.Contains(room.Player2.ConnectionId);
        }

        await _hubContext.Clients.Group(roomId).SendAsync("RematchRequested", Context.ConnectionId);

        if (!bothWant) return;

        lock (room.Lock)
        {
            room.Player1.HP = 100;
            room.Player2.HP = 100;
            room.CurrentQuestionIndex = -1;
            room.Questions = _quiz.GetShuffledQuestions();
            room.CurrentAnswers.Clear();
            room.RoundTimeoutCts = null;
            room.Player1Ready = false;
            room.Player2Ready = false;
            room.Finished = false;
            room.RematchRequests.Clear();
        }

        await _hubContext.Clients.Client(room.Player1.ConnectionId).SendAsync(
            "MatchFound", room.Id, room.Player2.Name, room.Player2.Character, room.Player1.HP, room.Player2.HP);
        await _hubContext.Clients.Client(room.Player2.ConnectionId).SendAsync(
            "MatchFound", room.Id, room.Player1.Name, room.Player1.Character, room.Player2.HP, room.Player1.HP);
    }

    public async Task LeaveToLobby(string roomId)
    {
        if (!_rooms.Rooms.TryGetValue(roomId, out var room)) return;

        var otherId = Context.ConnectionId == room.Player1.ConnectionId
            ? room.Player2.ConnectionId
            : room.Player1.ConnectionId;

        // Let the other player know, in case they're still sitting on the match-over
        // screen waiting for a rematch that's no longer coming.
        await _hubContext.Clients.Client(otherId).SendAsync("OpponentLeftMatch");

        room.Player1.RoomId = null;
        room.Player2.RoomId = null;

        await _hubContext.Groups.RemoveFromGroupAsync(room.Player1.ConnectionId, room.Id);
        await _hubContext.Groups.RemoveFromGroupAsync(room.Player2.ConnectionId, room.Id);
        await _hubContext.Groups.AddToGroupAsync(room.Player1.ConnectionId, "Lobby");
        await _hubContext.Groups.AddToGroupAsync(room.Player2.ConnectionId, "Lobby");

        _rooms.RemoveRoom(room.Id);
        await BroadcastLobbyPlayers();
    }

    private async Task BroadcastLobbyPlayers()
    {
        var names = _rooms.LobbyPlayers.Values.Select(p => p.Name).ToList();
        await _hubContext.Clients.Group("Lobby").SendAsync("LobbyPlayerList", names);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var id = Context.ConnectionId;
        _rooms.RemovePlayer(id);

        var room = _rooms.Rooms.Values.FirstOrDefault(r => r.Player1.ConnectionId == id || r.Player2.ConnectionId == id);
        if (room != null)
        {
            var otherId = room.Player1.ConnectionId == id ? room.Player2.ConnectionId : room.Player1.ConnectionId;
            await _hubContext.Clients.Client(otherId).SendAsync("OpponentLeftMatch");
            await _hubContext.Groups.AddToGroupAsync(otherId, "Lobby");
            _rooms.RemoveRoom(room.Id);
        }

        await BroadcastLobbyPlayers();
        await base.OnDisconnectedAsync(exception);
    }
}