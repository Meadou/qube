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
        statusEl.textContent = 'No quiz questions loaded yet. Ask the admin to add some.';
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

// ---------- Private rooms ----------

let currentPrivateRoomCode = null;

function resetPrivateRoomUI() {
    currentPrivateRoomCode = null;
    document.getElementById('private-room-controls').classList.remove('hidden');
    document.getElementById('private-room-waiting').classList.add('hidden');
    document.getElementById('private-room-code-input').value = '';
}

document.getElementById('create-private-btn').addEventListener('click', () => {
    window.hubConnection.invoke('CreatePrivateRoom');
});

window.hubConnection.on('PrivateRoomCreated', (code) => {
    currentPrivateRoomCode = code;
    document.getElementById('private-room-controls').classList.add('hidden');
    document.getElementById('private-room-waiting').classList.remove('hidden');
    document.getElementById('private-room-code-display').textContent = code;
});

document.getElementById('cancel-private-btn').addEventListener('click', () => {
    if (currentPrivateRoomCode) {
        window.hubConnection.invoke('CancelPrivateRoom', currentPrivateRoomCode);
    }
    resetPrivateRoomUI();
});

document.getElementById('private-room-code-display').addEventListener('click', async () => {
    if (!currentPrivateRoomCode) return;
    const el = document.getElementById('private-room-code-display');
    try {
        await navigator.clipboard.writeText(currentPrivateRoomCode);
        const original = currentPrivateRoomCode;
        el.textContent = 'Copied!';
        setTimeout(() => { el.textContent = original; }, 1000);
    } catch (e) {
        // Clipboard API unavailable (e.g. non-HTTPS context). The code is
        // still fully visible to read and share manually, so just no-op.
    }
});

const privateRoomCodeInput = document.getElementById('private-room-code-input');
privateRoomCodeInput.addEventListener('input', () => {
    privateRoomCodeInput.value = privateRoomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

document.getElementById('join-private-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = privateRoomCodeInput.value.trim();
    if (!code) return;
    window.hubConnection.invoke('JoinPrivateRoom', code);
    document.getElementById('match-status').textContent = 'Joining room...';
});

window.hubConnection.on('PrivateRoomJoinFailed', (reason) => {
    const messages = {
        'not-found': "That code doesn't exist or the room already started.",
        'self': "That's your own room code. Share it with a friend instead of joining it yourself.",
        'opponent-left': 'The player who created that room is no longer available.',
        'no-questions': 'No quiz questions loaded yet. Ask the admin to add some.',
        'empty': 'Enter a room code first.',
    };
    document.getElementById('match-status').textContent = messages[reason] || 'Could not join that room.';
});