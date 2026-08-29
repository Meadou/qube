using CSharpQuizGame.Models;

namespace CSharpQuizGame.Services;

// Parses the standard Aiken quiz format:
//
//   What color is the sky?
//   A) Red
//   B) Blue
//   C) Green
//   D) Yellow
//   ANSWER: B
//
//   (blank line between questions)
public static class AikenParser
{
    public static List<QuizQuestion> Parse(string aikenText)
    {
        var questions = new List<QuizQuestion>();
        if (string.IsNullOrWhiteSpace(aikenText)) return questions;

        var lines = aikenText.Replace("\r\n", "\n").Split('\n');

        QuizQuestion? current = null;
        var choiceLetterToIndex = new Dictionary<char, int>();

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;

            if (line.StartsWith("ANSWER:", StringComparison.OrdinalIgnoreCase))
            {
                if (current == null) continue;

                var answerPart = line.Substring("ANSWER:".Length).Trim().ToUpperInvariant();
                if (answerPart.Length > 0 && choiceLetterToIndex.TryGetValue(answerPart[0], out var idx))
                {
                    current.CorrectIndex = idx;
                }

                if (current.Choices.Count >= 2)
                {
                    questions.Add(current);
                }

                current = null;
                choiceLetterToIndex.Clear();
            }
            else if (line.Length >= 2 && char.IsLetter(line[0]) && line[1] == ')')
            {
                // A choice line, e.g. "B) Blue" — only valid once a question line has started
                if (current == null) continue;

                var letter = char.ToUpperInvariant(line[0]);
                var choiceText = line.Substring(2).Trim();
                choiceLetterToIndex[letter] = current.Choices.Count;
                current.Choices.Add(choiceText);
            }
            else
            {
                // Any other non-blank line starts a new question
                current = new QuizQuestion { Text = line };
                choiceLetterToIndex.Clear();
            }
        }

        return questions;
    }
}
