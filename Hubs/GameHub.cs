using Microsoft.AspNetCore.SignalR;
using CSharpQuizGame.Models;
using CSharpQuizGame.Services;

namespace CSharpQuizGame.Hubs;

public class GameHub : Hub
{
    private const int RoundTimeoutSeconds = 15;
    private const int DamagePerHit = 20;
    private const int DelayBetweenRoundsMs = 2500;
    private const int CountdownMs = 3800;   // 3 + 2 + 1 + GO

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
        var name = string.IsNullOrWhiteSpace(playerName) ? "Player" : playerName.Trim();
        if (name.Length > 16) name = name.Substring(0, 16);
        var player = new PlayerInfo
        {
            ConnectionId = Context.ConnectionId,
            Name = name,
            Character = character
        };
        _rooms.AddToLobby(player);
        await _hubContext.Groups.AddToGroupAsync(Context.ConnectionId, "Lobby");
        await BroadcastLobbyPlayers();
    }

    // Lets a player change their fighter color from the lobby without
    // re-joining. Only affects the lobby record; a match already in
    // progress keeps whatever character each side had at match start.
    public Task UpdateCharacter(CharacterConfig character)
    {
        if (_rooms.LobbyPlayers.TryGetValue(Context.ConnectionId, out var player))
        {
            player.Character = character;
        }
        return Task.CompletedTask;
    }

    public async Task SendChatMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        if (message.Length > 200) return;
        if (!_rooms.LobbyPlayers.TryGetValue(Context.ConnectionId, out var player)) return;

        await _hubContext.Clients.Group("Lobby").SendAsync("ReceiveChatMessage", player.Name, message);
    }

    // ---------- Code-based group rooms ----------

    public async Task CreateGroupRoom()
    {
        if (!_rooms.LobbyPlayers.TryGetValue(Context.ConnectionId, out var player))
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "not-in-lobby");
            return;
        }
        if (player.RoomId != null)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "in-duel");
            return;
        }

        await LeaveRoomCore(Context.ConnectionId);
        var room = _rooms.CreateGroupRoom();
        lock (room.Lock)
        {
            room.Members.Add(Context.ConnectionId);
            room.HostConnectionId = Context.ConnectionId;
        }
        await _hubContext.Groups.AddToGroupAsync(Context.ConnectionId, GroupName(room));
        await Clients.Caller.SendAsync("RoomEntered", room.Code);
        await BroadcastRoom(room);
    }

    public async Task JoinGroupRoom(string code)
    {
        var normalized = (code ?? "").Trim().ToUpperInvariant();
        if (normalized.Length == 0)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "empty");
            return;
        }
        if (!_rooms.LobbyPlayers.TryGetValue(Context.ConnectionId, out var player))
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "not-in-lobby");
            return;
        }
        if (player.RoomId != null)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "in-duel");
            return;
        }
        if (!_rooms.GroupRooms.TryGetValue(normalized, out var room))
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "room-not-found");
            return;
        }

        // Validate BEFORE leaving any current room, so a typo never kicks you out.
        var current = _rooms.FindGroupRoom(Context.ConnectionId);
        if (current != null && current.Code != room.Code)
        {
            await LeaveRoomCore(Context.ConnectionId);
        }

        string? error = null;
        bool newlyJoined = false;
        lock (room.Lock)
        {
            if (room.Members.Contains(Context.ConnectionId))
            {
                // already in this room: just re-enter it
            }
            else if (room.Started)
            {
                error = "game-started";
            }
            else if (room.Members.Count >= GroupQuizRoom.Capacity)
            {
                error = "room-full";
            }
            else
            {
                room.Members.Add(Context.ConnectionId);
                newlyJoined = true;
            }
        }

        if (error != null)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", error);
            return;
        }

        await _hubContext.Groups.AddToGroupAsync(Context.ConnectionId, GroupName(room));
        await Clients.Caller.SendAsync("RoomEntered", room.Code);
        if (newlyJoined)
        {
            await _hubContext.Clients.Group(GroupName(room))
                .SendAsync("RoomMemberJoined", player.Name, Context.ConnectionId);
        }
        await BroadcastRoom(room);
    }

    public async Task SitInGroupChair(int seatNumber)
    {
        var room = _rooms.FindGroupRoom(Context.ConnectionId);
        if (room == null || !_rooms.LobbyPlayers.TryGetValue(Context.ConnectionId, out var player))
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "not-in-room");
            return;
        }
        if (seatNumber < 1 || seatNumber > GroupQuizRoom.Capacity)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "invalid-seat");
            return;
        }

        string? error = null;
        lock (room.Lock)
        {
            if (room.Started)
            {
                error = "game-started";
            }
            else if (room.Seats[seatNumber - 1] != null)
            {
                error = "seat-taken";
            }
            else
            {
                // Moving to another chair is allowed: free the old one first.
                var old = Array.FindIndex(room.Seats, s => s?.Player.ConnectionId == Context.ConnectionId);
                if (old >= 0) room.Seats[old] = null;
                room.Seats[seatNumber - 1] = new GroupQuizSeat { Player = player, SeatNumber = seatNumber };
            }
        }

        if (error != null)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", error);
            return;
        }
        await BroadcastRoom(room);
    }

    public async Task LeaveGroupChair()
    {
        var room = _rooms.FindGroupRoom(Context.ConnectionId);
        if (room == null) return;
        lock (room.Lock)
        {
            if (room.Started) return;
            var idx = Array.FindIndex(room.Seats, s => s?.Player.ConnectionId == Context.ConnectionId);
            if (idx >= 0) room.Seats[idx] = null;
        }
        await BroadcastRoom(room);
    }

    public Task LeaveGroupRoom() => LeaveRoomCore(Context.ConnectionId);

    public async Task StartGroupGame()
    {
        if (_quiz.Count == 0)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "no-questions");
            return;
        }

        var groupRoom = _rooms.FindGroupRoom(Context.ConnectionId);
        if (groupRoom == null)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", "not-in-room");
            return;
        }
        string? error = null;
        lock (groupRoom.Lock)
        {
            var seatedPlayers = groupRoom.Seats.Count(seat => seat != null);
            if (groupRoom.HostConnectionId != Context.ConnectionId)
            {
                error = "not-host";
            }
            else if (seatedPlayers < 2)
            {
                error = "not-enough-players";
            }
            else if (groupRoom.Started)
            {
                error = "game-started";
            }
            else
            {
                groupRoom.Started = true;
                groupRoom.Finished = false;
                groupRoom.Questions = _quiz.GetShuffledQuestions();
                groupRoom.CurrentQuestionIndex = -1;
                groupRoom.Answers.Clear();
                foreach (var seat in groupRoom.Seats)
                {
                    if (seat != null) seat.Score = 0;
                }
            }
        }

        if (error != null)
        {
            await Clients.Caller.SendAsync("GroupRoomActionFailed", error);
            return;
        }

        await BroadcastRoom(groupRoom);

        // Separate start-of-game countdown. The question timer only starts after it.
        await _hubContext.Clients.Group(GroupName(groupRoom)).SendAsync("GroupCountdown", 3);
        await Task.Delay(CountdownMs);

        await SendNextGroupQuestion(groupRoom);
    }

    public async Task SubmitGroupAnswer(int choiceIndex)
    {
        var groupRoom = _rooms.FindGroupRoom(Context.ConnectionId);
        if (groupRoom == null) return;
        GroupQuizSeat? playerSeat;
        GroupQuizAnswer answer;
        bool shouldResolve;

        lock (groupRoom.Lock)
        {
            playerSeat = groupRoom.Seats.FirstOrDefault(seat => seat?.Player.ConnectionId == Context.ConnectionId);
            if (playerSeat == null ||
                !groupRoom.Started ||
                groupRoom.QuestionTimeoutCts == null ||
                groupRoom.CurrentQuestionIndex < 0 ||
                groupRoom.CurrentQuestionIndex >= groupRoom.Questions.Count ||
                choiceIndex < 0 ||
                choiceIndex >= groupRoom.Questions[groupRoom.CurrentQuestionIndex].Choices.Count ||
                groupRoom.Answers.ContainsKey(Context.ConnectionId))
            {
                return;
            }

            var elapsed = Math.Clamp(
                (long)(DateTime.UtcNow - groupRoom.QuestionStartedAt).TotalMilliseconds,
                0,
                GroupQuizRoom.QuestionTimeLimitSeconds * 1000L);
            if (elapsed >= GroupQuizRoom.QuestionTimeLimitSeconds * 1000L)
            {
                return;
            }

            var question = groupRoom.Questions[groupRoom.CurrentQuestionIndex];
            var isCorrect = choiceIndex == question.CorrectIndex;
            var remainingFraction = 1.0 - (double)elapsed / (GroupQuizRoom.QuestionTimeLimitSeconds * 1000);
            var points = isCorrect ? (int)Math.Floor(1000 * remainingFraction) : 0;
            answer = new GroupQuizAnswer
            {
                ChoiceIndex = choiceIndex,
                ElapsedMs = elapsed,
                IsCorrect = isCorrect,
                Points = points
            };
            groupRoom.Answers.Add(Context.ConnectionId, answer);
            playerSeat.Score += points;
            shouldResolve = groupRoom.Seats
                .Where(seat => seat != null)
                .All(seat => groupRoom.Answers.ContainsKey(seat!.Player.ConnectionId));
        }

        await _hubContext.Clients.Group(GroupName(groupRoom)).SendAsync(
            "GroupPlayerAnswered",
            playerSeat.SeatNumber,
            playerSeat.Player.Name,
            Context.ConnectionId,
            answer.IsCorrect,
            answer.Points,
            playerSeat.Score);

        if (shouldResolve)
        {
            await ResolveGroupRound(groupRoom);
        }
    }

    private static string GroupName(GroupQuizRoom room) => $"Room:{room.Code}";

    private async Task LeaveRoomCore(string connectionId)
    {
        var room = _rooms.FindGroupRoom(connectionId);
        if (room == null) return;

        CancellationTokenSource? timeoutCts = null;
        bool destroy = false;
        bool shouldResolve = false;

        lock (room.Lock)
        {
            room.Members.Remove(connectionId);
            var idx = Array.FindIndex(room.Seats, seat => seat?.Player.ConnectionId == connectionId);
            if (idx >= 0) room.Seats[idx] = null;

            if (room.Members.Count == 0)
            {
                destroy = true;
                timeoutCts = room.QuestionTimeoutCts;
                room.QuestionTimeoutCts = null;
                room.Started = false;
            }
            else
            {
                if (room.HostConnectionId == connectionId)
                {
                    room.HostConnectionId = room.Seats
                        .Where(seat => seat != null)
                        .OrderBy(seat => seat!.SeatedAt)
                        .FirstOrDefault()?.Player.ConnectionId
                        ?? room.Members.First();
                }

                if (room.Started && room.Seats.All(seat => seat == null))
                {
                    // Everyone who was playing has left: end the game.
                    timeoutCts = room.QuestionTimeoutCts;
                    room.QuestionTimeoutCts = null;
                    room.Started = false;
                }
                else if (room.Started && room.QuestionTimeoutCts != null)
                {
                    shouldResolve = room.Seats
                        .Where(seat => seat != null)
                        .All(seat => room.Answers.ContainsKey(seat!.Player.ConnectionId));
                }
            }
        }

        timeoutCts?.Cancel();
        timeoutCts?.Dispose();
        await _hubContext.Groups.RemoveFromGroupAsync(connectionId, GroupName(room));

        if (destroy)
        {
            _rooms.GroupRooms.TryRemove(room.Code, out _);
            return;
        }

        await BroadcastRoom(room);
        if (shouldResolve)
        {
            await ResolveGroupRound(room);
        }
    }

    private async Task SendNextGroupQuestion(GroupQuizRoom groupRoom)
    {
        QuizQuestion? question = null;
        int questionIndex = -1;
        CancellationToken token = default;
        CancellationTokenSource? previousTimeout = null;
        bool gameOver = false;

        lock (groupRoom.Lock)
        {
            if (!groupRoom.Started || groupRoom.Seats.All(seat => seat == null)) return;

            previousTimeout = groupRoom.QuestionTimeoutCts;
            groupRoom.QuestionTimeoutCts = null;
            groupRoom.CurrentQuestionIndex++;
            if (groupRoom.CurrentQuestionIndex >= groupRoom.Questions.Count)
            {
                groupRoom.Started = false;
                groupRoom.Finished = true;
                gameOver = true;
            }
            else
            {
                questionIndex = groupRoom.CurrentQuestionIndex;
                question = groupRoom.Questions[questionIndex];
                groupRoom.Answers.Clear();
                groupRoom.QuestionStartedAt = DateTime.UtcNow;
                groupRoom.QuestionTimeoutCts = new CancellationTokenSource();
                token = groupRoom.QuestionTimeoutCts.Token;
            }
        }

        previousTimeout?.Dispose();
        if (gameOver)
        {
            await _hubContext.Clients.Group(GroupName(groupRoom)).SendAsync(
                "GroupGameOver",
                GetGroupScoreboard(groupRoom));
            await BroadcastRoom(groupRoom);
            return;
        }

        await _hubContext.Clients.Group(GroupName(groupRoom)).SendAsync(
            "GroupNewQuestion",
            questionIndex,
            question!.Text,
            question.Choices,
            GroupQuizRoom.QuestionTimeLimitSeconds);

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(GroupQuizRoom.QuestionTimeLimitSeconds * 1000, token);
                await ResolveGroupRound(groupRoom);
            }
            catch (OperationCanceledException)
            {
                // The round resolved before the timeout.
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in group quiz timeout timer: {ex}");
            }
        });
    }

    private async Task ResolveGroupRound(GroupQuizRoom groupRoom)
    {
        int questionIndex;
        int correctIndex;
        CancellationTokenSource? timeoutCts;

        lock (groupRoom.Lock)
        {
            if (groupRoom.QuestionTimeoutCts == null ||
                groupRoom.CurrentQuestionIndex < 0 ||
                groupRoom.CurrentQuestionIndex >= groupRoom.Questions.Count)
            {
                return;
            }

            timeoutCts = groupRoom.QuestionTimeoutCts;
            groupRoom.QuestionTimeoutCts = null;
            questionIndex = groupRoom.CurrentQuestionIndex;
            correctIndex = groupRoom.Questions[questionIndex].CorrectIndex;
        }

        timeoutCts.Cancel();
        timeoutCts.Dispose();
        await _hubContext.Clients.Group(GroupName(groupRoom)).SendAsync(
            "GroupRoundResolved",
            questionIndex,
            correctIndex,
            GetGroupScoreboard(groupRoom));

        await Task.Delay(1200);
        await SendNextGroupQuestion(groupRoom);
    }

    private object GetRoomSnapshot(GroupQuizRoom room)
    {
        lock (room.Lock)
        {
            return new
            {
                code = room.Code,
                seats = room.Seats.Select(seat => seat == null ? null : new
                {
                    seatNumber = seat.SeatNumber,
                    name = seat.Player.Name,
                    connectionId = seat.Player.ConnectionId,
                    score = seat.Score,
                    color = seat.Player.Character.Color
                }).ToArray(),
                members = room.Members
                    .Select(id => _rooms.LobbyPlayers.TryGetValue(id, out var p)
                        ? new { connectionId = id, name = p.Name }
                        : null)
                    .Where(m => m != null)
                    .ToArray(),
                hostConnectionId = room.HostConnectionId,
                started = room.Started,
                finished = room.Finished
            };
        }
    }

    private object GetGroupScoreboard(GroupQuizRoom groupRoom)
    {
        lock (groupRoom.Lock)
        {
            return groupRoom.Seats
                .Where(seat => seat != null)
                .Select(seat => new
                {
                    seatNumber = seat!.SeatNumber,
                    name = seat.Player.Name,
                    score = seat.Score
                })
                .OrderByDescending(player => player.score)
                .ThenBy(player => player.seatNumber)
                .ToArray();
        }
    }

    private Task BroadcastRoom(GroupQuizRoom room) =>
        _hubContext.Clients.Group(GroupName(room)).SendAsync("RoomUpdated", GetRoomSnapshot(room));

    // ---------- Matchmaking ----------

    public async Task RequestMatch()
    {
        await LeaveRoomCore(Context.ConnectionId);
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
            // Separate start-of-match countdown. The round timer only starts after it.
            await _hubContext.Clients.Group(roomId).SendAsync("MatchCountdown", 3);
            await Task.Delay(CountdownMs);
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
        await LeaveRoomCore(id);
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