let myCharacter = null;
let opponentCharacter = null;
let currentRoomId = null;
let hasAnsweredThisRound = false;
let roundTimerInterval = null;
let currentRoundTimeSeconds = 15;
let lastOpponentName = '';
let lastOpponentConfig = null;

function startMatch(roomId, opponentName, opponentConfig, myHP, opponentHP) {
    currentRoomId = roomId;
    hasAnsweredThisRound = false;
    lastOpponentName = opponentName;
    lastOpponentConfig = opponentConfig;
    stopRoundTimer();
    document.getElementById('match-status').textContent = '';
    showScreen('match');

    document.getElementById('my-name').textContent = window.gameState.playerName;
    document.getElementById('opponent-name').textContent = opponentName;
    document.getElementById('round-counter').textContent = 'ROUND 1';

    const myContainer = document.getElementById('my-character-container');
    const oppContainer = document.getElementById('opponent-character-container');
    myContainer.innerHTML = '';
    oppContainer.innerHTML = '';

    myCharacter = new CubeCharacter(myContainer, window.gameState.characterConfig, 'player-left');
    opponentCharacter = new CubeCharacter(oppContainer, opponentConfig, 'player-right');

    updateHP(myHP, opponentHP);
    document.getElementById('question-text').textContent = 'Get ready...';
    document.getElementById('choices-container').innerHTML = '';
    updateTimerDisplay(currentRoundTimeSeconds);
}

function startRoundTimer() {
    stopRoundTimer();
    let timeLeft = currentRoundTimeSeconds;
    updateTimerDisplay(timeLeft);

    roundTimerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 5 && timeLeft > 0) GameSound.tick();
        if (timeLeft <= 0) {
            timeLeft = 0;
            stopRoundTimer();
        }
        updateTimerDisplay(timeLeft);
    }, 1000);
}

function stopRoundTimer() {
    if (roundTimerInterval) {
        clearInterval(roundTimerInterval);
        roundTimerInterval = null;
    }
}

function updateTimerDisplay(seconds) {
    const timerEl = document.getElementById('timer-display');
    if (!timerEl) return;
    timerEl.textContent = seconds;
    if (seconds <= 5 && seconds > 0) {
        timerEl.classList.add('warning');
    } else {
        timerEl.classList.remove('warning');
    }
}

window.hubConnection.on('MatchFound', (roomId, opponentName, opponentConfig, myHP, opponentHP) => {
    startMatch(roomId, opponentName, opponentConfig, myHP, opponentHP);
});

window.hubConnection.on('NewQuestion', (index, text, choices, roundTimeSeconds) => {
    hasAnsweredThisRound = false;
    if (roundTimeSeconds) currentRoundTimeSeconds = roundTimeSeconds;
    document.getElementById('question-text').textContent = text;
    document.getElementById('round-counter').textContent = `ROUND ${index + 1}`;

    const container = document.getElementById('choices-container');
    container.innerHTML = '';
    choices.forEach((choiceText, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn choice-btn';
        btn.textContent = choiceText;
        btn.addEventListener('click', () => submitAnswer(i, btn));
        container.appendChild(btn);
    });

    startRoundTimer();
});

window.hubConnection.on('PlayerAnswered', (connectionId) => {
    if (connectionId === window.hubConnection.connectionId) {
        myCharacter?.playJump();
    } else {
        opponentCharacter?.playJump();
    }
});

function submitAnswer(index, btn) {
    if (hasAnsweredThisRound) return;
    hasAnsweredThisRound = true;
    GameSound.answerLock();

    document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
    btn.classList.add('selected');
    window.hubConnection.invoke('SubmitAnswer', currentRoomId, index);
}

function showDamagePopup(containerId, amount) {
    if (!amount) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    const popup = document.createElement('div');
    popup.className = 'dmg-popup';
    popup.textContent = `-${amount}`;
    container.appendChild(popup);
    setTimeout(() => popup.remove(), 950);
}

function flashHit() {
    const overlay = document.getElementById('hit-flash-overlay');
    if (!overlay) return;
    overlay.classList.remove('flash');
    void overlay.offsetWidth;
    overlay.classList.add('flash');
}

window.hubConnection.on('RoundResult', (correctIndex, outcome, myHP, opponentHP, opponentChoiceIndex, damage) => {
    stopRoundTimer();
    const buttons = document.querySelectorAll('.choice-btn');
    if (buttons[correctIndex]) buttons[correctIndex].classList.add('correct');
    if (opponentChoiceIndex !== undefined && opponentChoiceIndex >= 0 && buttons[opponentChoiceIndex]) {
        buttons[opponentChoiceIndex].classList.add('opponent-picked');
    }

    if (outcome === 'win') {
        myCharacter.playAttack();
        opponentCharacter.playHurt();
        showDamagePopup('opponent-character-container', damage);
        GameSound.correct();
        setTimeout(() => GameSound.hit(), 150);
    } else if (outcome === 'lose') {
        opponentCharacter.playAttack();
        myCharacter.playHurt();
        showDamagePopup('my-character-container', damage);
        flashHit();
        GameSound.hit();
    } else if (outcome === 'both_hurt') {
        myCharacter.playHurt();
        opponentCharacter.playHurt();
        showDamagePopup('my-character-container', damage);
        showDamagePopup('opponent-character-container', damage);
        flashHit();
        GameSound.hit();
    }

    updateHP(myHP, opponentHP);
});

window.hubConnection.on('MatchOver', (winnerName) => {
    stopRoundTimer();
    setTimeout(() => showMatchOver(winnerName), 500);
});

function showMatchOver(winnerName) {
    const titleEl = document.getElementById('matchover-title');
    const subEl = document.getElementById('matchover-sub');
    const iAmWinner = winnerName === window.gameState.playerName;
    const isDraw = !winnerName;

    titleEl.classList.remove('win', 'lose', 'draw');
    if (isDraw) {
        titleEl.textContent = 'Draw!';
        titleEl.classList.add('draw');
        subEl.textContent = 'Nobody made it out on top this time.';
    } else if (iAmWinner) {
        titleEl.textContent = 'Victory!';
        titleEl.classList.add('win');
        subEl.textContent = `You defeated ${lastOpponentName}.`;
        GameSound.matchWin();
        spawnConfetti();
    } else {
        titleEl.textContent = 'Defeated';
        titleEl.classList.add('lose');
        subEl.textContent = `${winnerName} took the win this time.`;
        GameSound.matchLose();
    }

    const myBox = document.getElementById('matchover-my-container');
    const oppBox = document.getElementById('matchover-opp-container');
    myBox.innerHTML = '';
    oppBox.innerHTML = '';
    new CubeCharacter(myBox, window.gameState.characterConfig, 'player-left');
    new CubeCharacter(oppBox, lastOpponentConfig || {}, 'player-right');

    document.getElementById('match-status').textContent = '';
    showScreen('matchover');
}

function spawnConfetti() {
    const colors = ['#00e5ff', '#ff2f92', '#39ff88', '#ffd24d', '#f2effa'];
    const count = 28;
    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = `${Math.random() * 100}vw`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
        piece.style.animationDelay = `${Math.random() * 0.5}s`;
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 3500);
    }
}

document.getElementById('matchover-continue-btn').addEventListener('click', () => {
    showScreen('lobby');
});

function updateHP(myHP, opponentHP) {
    document.getElementById('my-hp').textContent = myHP;
    document.getElementById('opponent-hp').textContent = opponentHP;
    setHpBar('my-hp-bar', myHP);
    setHpBar('opponent-hp-bar', opponentHP);
}

function setHpBar(elId, hp) {
    const bar = document.getElementById(elId);
    const pct = Math.max(0, Math.min(100, hp));
    bar.style.width = `${pct}%`;
    bar.style.background = pct <= 30 ? 'var(--hp-bad)' : (pct <= 60 ? 'var(--hp-warn)' : 'var(--hp-good)');
}