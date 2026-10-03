namespace CSharpQuizGame.Models;

public sealed class GroupQuizSeat
{
    public required PlayerInfo Player { get; init; }
    public required int SeatNumber { get; init; }
    public DateTime SeatedAt { get; init; } = DateTime.UtcNow;
    public int Score { get; set; }
}

public sealed class GroupQuizAnswer
{
    public required int ChoiceIndex { get; init; }
    public required long ElapsedMs { get; init; }
    public required bool IsCorrect { get; init; }
    public int Points { get; init; }
}

public sealed class GroupQuizRoom
{
    public const int Capacity = 20;
    public const int QuestionTimeLimitSeconds = 5;

    public required string Code { get; init; }
    public HashSet<string> Members { get; } = new();

    public GroupQuizSeat?[] Seats { get; } = new GroupQuizSeat?[Capacity];
    public string? HostConnectionId { get; set; }
    public bool Started { get; set; }
    public bool Finished { get; set; }
    public List<QuizQuestion> Questions { get; set; } = new();
    public int CurrentQuestionIndex { get; set; } = -1;
    public DateTime QuestionStartedAt { get; set; }
    public Dictionary<string, GroupQuizAnswer> Answers { get; } = new();
    public CancellationTokenSource? QuestionTimeoutCts { get; set; }
    public readonly object Lock = new();
}