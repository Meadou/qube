using Microsoft.AspNetCore.SignalR;

namespace CSharpQuizGame;

public class GameHub : Hub
{
    // Global static variables to track player health in server memory
    private static int player1HP = 100;
    private static int player2HP = 100;

    // This method can be triggered by any browser client
    public async Task DealDamage(string targetPlayer)
    {
        if (targetPlayer == "Player1")
        {
            player1HP -= 20;
            if (player1HP < 0) player1HP = 0;
        }
        else if (targetPlayer == "Player2")
        {
            player2HP -= 20;
            if (player2HP < 0) player2HP = 0;
        }

        // Broadcast the new, updated health values back down to ALL connected clients
        await Clients.All.SendAsync("ReceiveHPUpdate", player1HP, player2HP);
    }
}
