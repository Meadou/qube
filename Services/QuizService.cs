using CSharpQuizGame.Models;

namespace CSharpQuizGame.Services;

public class QuizService
{
    private List<QuizQuestion> _questions = new();
    private readonly object _lock = new();

    public void ReplaceQuestions(string aikenText)
    {
        var parsed = AikenParser.Parse(aikenText);
        lock (_lock)
        {
            _questions = parsed;
        }
    }

    public List<QuizQuestion> GetShuffledQuestions()
    {
        lock (_lock)
        {
            var rng = new Random();
            return _questions.OrderBy(_ => rng.Next()).ToList();
        }
    }

    public int Count
    {
        get { lock (_lock) { return _questions.Count; } }
    }
}