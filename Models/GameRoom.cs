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

    public readonly object Lock = new();
}