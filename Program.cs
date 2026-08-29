using CSharpQuizGame.Hubs;
using CSharpQuizGame.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSingleton<QuizService>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHub<GameHub>("/gamehub");

// ---- Admin: paste Aiken-format text to replace the active question set ----
app.MapPost("/api/admin/quiz", async (HttpRequest request, QuizService quiz) =>
{
    using var reader = new StreamReader(request.Body);
    var text = await reader.ReadToEndAsync();
    quiz.ReplaceQuestions(text);
    return Results.Ok(new { count = quiz.Count });
});

app.MapGet("/api/admin/quiz/count", (QuizService quiz) => Results.Ok(new { count = quiz.Count }));

// Seed a small sample question set on startup so the game is playable immediately.
// Replace these anytime from /admin.html.
var quizService = app.Services.GetRequiredService<QuizService>();
var sampleQuestionsPath = Path.Combine(builder.Environment.ContentRootPath, "SampleQuestions.aiken.txt");
if (File.Exists(sampleQuestionsPath))
{
    quizService.ReplaceQuestions(File.ReadAllText(sampleQuestionsPath));
}

app.Run();
