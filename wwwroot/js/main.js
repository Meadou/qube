const screens = {
    login: document.getElementById('screen-login'),
    customize: document.getElementById('screen-customize'),
    lobby: document.getElementById('screen-lobby'),
    match: document.getElementById('screen-match'),
};

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// Shared state used across customize.js / lobby.js / game.js
window.gameState = {
    playerName: '',
    characterConfig: {
        color: '#ffffff'
    }
};

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim();
    if (!name) return;

    window.gameState.playerName = name;
    showScreen('customize');
    initCustomizeScreen();
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}