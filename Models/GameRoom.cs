namespace CSharpQuizGame.Models;

public class RoundAnswer
{
    public string ConnectionId { get; set; } = "";
    public int ChoiceIndex { get; set; }
    public long ElapsedMs { get; set; }
}

public class GameRoom
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public PlayerInfo Player1 { get; set; } = null!;
    public PlayerInfo Player2 { get; set; } = null!;
    public List<QuizQuestion> Questions { get; set; } = new();
    public int CurrentQuestionIndex { get; set; } = -1;
    public DateTime QuestionSentAt { get; set; }
    public List<RoundAnswer> CurrentAnswers { get; set; } = new();
    public CancellationTokenSource? RoundTimeoutCts { get; set; }

    // Both players must ready-up before the first question of a match (or rematch) is sent.
    public bool Player1Ready { get; set; }
    public bool Player2Ready { get; set; }

    // Set once a match ends. The room is kept alive (not removed) after this so the
    // two players can request a rematch without going through the queue again.
    public bool Finished { get; set; }
    public HashSet<string> RematchRequests { get; set; } = new();

    // Guards CurrentAnswers / RoundTimeoutCts against concurrent access from
    // two players submitting answers (or a timeout firing) at nearly the same time.
    public readonly object Lock = new();
}