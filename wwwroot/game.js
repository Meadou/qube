// SignalR client initialization.
// Assumes signalr.min.js is loaded locally (same-origin) via a <script> tag
// in index.html, BEFORE this file runs.
let connection = null;

function startConnection() {
    if (!window.signalR) {
        console.error('SignalR client not available. Make sure signalr.min.js is loaded before game.js.');
        return;
    }

    connection = new signalR.HubConnectionBuilder()
        .withUrl('/gamehub')
        .build();

    // Listen for HP updates
    connection.on('ReceiveHPUpdate', (p1HP, p2HP) => {
        const p1 = document.getElementById('p1-hp');
        const p2 = document.getElementById('p2-hp');
        if (p1) p1.innerText = p1HP;
        if (p2) p2.innerText = p2HP;
    });

    connection.start()
        .then(() => console.log('Successfully connected to C# SignalR Hub!'))
        .catch(err => console.error('SignalR Connection Error: ', err));
}

// Initialize once the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startConnection);
} else {
    startConnection();
}

function attackServerPlayer(playerName) {
    if (!connection) {
        console.error('SignalR connection not ready; try again in a moment.');
        return;
    }
    connection.invoke('DealDamage', playerName)
        .catch(err => console.error('Failed to send message to server:', err));
}