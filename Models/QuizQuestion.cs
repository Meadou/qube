namespace CSharpQuizGame.Models;

public class QuizQuestion
{
    public string Text { get; set; } = "";
    public List<string> Choices { get; set; } = new();
    public int CorrectIndex { get; set; }
}
