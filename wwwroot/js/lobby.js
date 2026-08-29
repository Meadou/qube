window.hubConnection.on('LobbyPlayerList', (names) => {
    const list = document.getElementById('lobby-player-list');
    list.innerHTML = '';
    names.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        list.appendChild(li);
    });
});

window.hubConnection.on('ReceiveChatMessage', (sender, message) => {
    const chatBox = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(message)}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
});

window.hubConnection.on('QueueStatus', (status) => {
    const statusEl = document.getElementById('match-status');
    if (status === 'waiting') {
        statusEl.textContent = 'Waiting for an opponent...';
    } else if (status === 'no-questions') {
        statusEl.textContent = 'No quiz questions loaded yet — ask the admin to add some.';
    } else {
        statusEl.textContent = '';
    }
});

document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    window.hubConnection.invoke('SendChatMessage', msg);
    input.value = '';
});

document.getElementById('find-match-btn').addEventListener('click', () => {
    window.hubConnection.invoke('RequestMatch');
    document.getElementById('match-status').textContent = 'Waiting for an opponent...';
});
