const screens = {
    login: document.getElementById('screen-login'),
    customize: document.getElementById('screen-customize'),
    lobby: document.getElementById('screen-lobby'),
    match: document.getElementById('screen-match'),
    matchover: document.getElementById('screen-matchover'),
};

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

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

const soundToggleBtn = document.getElementById('sound-toggle-btn');
function refreshSoundIcon() {
    soundToggleBtn.textContent = GameSound.isMuted() ? '🔇' : '🔊';
}
refreshSoundIcon();
soundToggleBtn.addEventListener('click', () => {
    GameSound.setMuted(!GameSound.isMuted());
    refreshSoundIcon();
});