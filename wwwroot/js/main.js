const screens = {
    login: document.getElementById('screen-login'),
    customize: document.getElementById('screen-customize'),
    lobby: document.getElementById('screen-lobby'),             // the main MENU
    multiplayer: document.getElementById('screen-multiplayer'), // create / join room
    room: document.getElementById('screen-room'),               // waiting room + group quiz
    match: document.getElementById('screen-match'),
    matchover: document.getElementById('screen-matchover'),
};

function showScreen(name) {
    if (window.groupGameActive && name !== 'room') return;
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    document.body.dataset.screen = name; // CSS shows the top bar + chat only on lobby / multiplayer / room
}
document.body.dataset.screen = 'login';

document.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.go;
        showScreen(target);
        if (target === 'customize') initCustomizeScreen();
    });
});

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
    document.getElementById('current-player-name').textContent = name;
    const enterMenu = async () => {
        try {
            await window.hubConnectionStarted;
            await window.hubConnection.invoke('JoinLobby', name, window.gameState.characterConfig);
            showScreen('lobby');
            if (window.GameSound && typeof GameSound.menuMusicStart === 'function') {
                try { GameSound.menuMusicStart(); } catch (e) {}
            }
            const tryStartMusic = () => {
                if (window.GameSound && typeof GameSound.menuMusicStart === 'function') {
                    try { GameSound.menuMusicStart(); } catch (e) {}
                }
                document.removeEventListener('click', tryStartMusic);
                document.removeEventListener('keydown', tryStartMusic);
                document.removeEventListener('touchstart', tryStartMusic);
            };
            document.addEventListener('click', tryStartMusic, { once: true, passive: true });
            document.addEventListener('keydown', tryStartMusic, { once: true });
            document.addEventListener('touchstart', tryStartMusic, { once: true, passive: true });
        } catch (error) {
            console.error('JoinLobby failed:', error);
            showScreen('customize');
            initCustomizeScreen();
        }
    };
    enterMenu();
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const soundToggleBtn = document.getElementById('sound-toggle-btn');
const soundIconOn = document.getElementById('sound-icon-on');
const soundIconOff = document.getElementById('sound-icon-off');
function refreshSoundIcon() {
    const muted = GameSound.isMuted();
    soundIconOn.classList.toggle('hidden', muted);
    soundIconOff.classList.toggle('hidden', !muted);
}
refreshSoundIcon();
soundToggleBtn.addEventListener('click', () => {
    GameSound.setMuted(!GameSound.isMuted());
    refreshSoundIcon();
});