// One shared connection, reused across the lobby, chat, and match screens.
window.hubConnection = new signalR.HubConnectionBuilder()
    .withUrl('/gamehub')
    .withAutomaticReconnect()
    .build();

window.hubConnectionStarted = window.hubConnection.start()
    .then(() => console.log('Connected to game hub'))
    .catch(err => console.error('SignalR connection failed:', err));
