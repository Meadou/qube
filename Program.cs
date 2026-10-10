using CSharpQuizGame.Hubs;
using CSharpQuizGame.Services;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Bind to the port provided by the hosting platform (Render/Railway/etc.) on all interfaces.
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// Trust the platform's reverse proxy so the rate limiter sees the real client IP
// instead of the proxy's address (which would make every player share one bucket).
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSingleton<QuizService>();

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("api", opt =>
    {
        opt.PermitLimit = 20;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 5;
    });

    options.AddFixedWindowLimiter("chat", opt =>
    {
        opt.PermitLimit = 30;
        opt.Window = TimeSpan.FromSeconds(10);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 2;
    });

    options.AddFixedWindowLimiter("hub", opt =>
    {
        opt.PermitLimit = 60;
        opt.Window = TimeSpan.FromSeconds(10);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 5;
    });

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, key => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 100,
            Window = TimeSpan.FromSeconds(10),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 10
        });
    });

    options.OnRejected = (context, token) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.Headers["Retry-After"] = "10";
        return new ValueTask();
    };
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();

app.MapHub<GameHub>("/gamehub").RequireRateLimiting("hub");

app.MapPost("/api/admin/quiz", async (HttpRequest request, QuizService quiz) =>
{
    using var reader = new StreamReader(request.Body);
    var text = await reader.ReadToEndAsync();
    quiz.ReplaceQuestions(text);
    return Results.Ok(new { count = quiz.Count });
}).RequireRateLimiting("api");

app.MapGet("/api/admin/quiz/count", (QuizService quiz) => Results.Ok(new { count = quiz.Count })).RequireRateLimiting("api");

var quizService = app.Services.GetRequiredService<QuizService>();
var sampleQuestionsPath = Path.Combine(builder.Environment.ContentRootPath, "SampleQuestions.aiken.txt");
if (File.Exists(sampleQuestionsPath))
{
    quizService.ReplaceQuestions(File.ReadAllText(sampleQuestionsPath));
}

app.Run();