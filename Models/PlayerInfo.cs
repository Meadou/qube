namespace CSharpQuizGame.Models;

public class PlayerInfo
{
    public string ConnectionId { get; set; } = "";
    public string Name { get; set; } = "";
    public CharacterConfig Character { get; set; } = new();
    public int HP { get; set; } = 100;
    public string? RoomId { get; set; }
}