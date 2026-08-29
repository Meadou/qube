let myCharacter = null;
let opponentCharacter = null;
let currentRoomId = null;
let hasAnsweredThisRound = false;
let roundTimerInterval = null;
const ROUND_TIME_SECONDS = 15;

function startMatch(roomId, opponentName, opponentConfig, myHP, opponentHP) {
    currentRoomId = roomId;
    hasAnsweredThisRound = false;
    stopRoundTimer();
    document.getElementById('match-status').textContent = '';
    showScreen('match');

    document.getElementById('my-name').textContent = window.gameState.playerName;
    document.getElementById('opponent-name').textContent = opponentName;

    const myContainer = document.getElementById('my-character-container');
    const oppContainer = document.getElementById('opponent-character-container');
    myContainer.innerHTML = '';
    oppContainer.innerHTML = '';

    myCharacter = new CubeCharacter(myContainer, window.gameState.characterConfig, 'player-left');
    opponentCharacter = new CubeCharacter(oppContainer, opponentConfig, 'player-right');

    updateHP(myHP, opponentHP);
    document.getElementById('question-text').textContent = 'Get ready...';
    document.getElementById('choices-container').innerHTML = '';
    updateTimerDisplay(ROUND_TIME_SECONDS);
}

function startRoundTimer() {
    stopRoundTimer();
    let timeLeft = ROUND_TIME_SECONDS;
    updateTimerDisplay(timeLeft);

    roundTimerInterval = setInterval(() => {
        timeLeft--;
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

window.hubConnection.on('NewQuestion', (index, text, choices) => {
    hasAnsweredThisRound = false;
    document.getElementById('question-text').textContent = text;

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

    document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
    btn.classList.add('selected');
    window.hubConnection.invoke('SubmitAnswer', currentRoomId, index);
}

window.hubConnection.on('RoundResult', (correctIndex, outcome, myHP, opponentHP) => {
    stopRoundTimer();
    const buttons = document.querySelectorAll('.choice-btn');
    if (buttons[correctIndex]) buttons[correctIndex].classList.add('correct');

    if (outcome === 'win') {
        myCharacter.playAttack();
        opponentCharacter.playHurt();
    } else if (outcome === 'lose') {
        opponentCharacter.playAttack();
        myCharacter.playHurt();
    } else if (outcome === 'both_hurt') {
        myCharacter.playHurt();
        opponentCharacter.playHurt();
    }

    updateHP(myHP, opponentHP);
});

window.hubConnection.on('MatchOver', (winnerName) => {
    stopRoundTimer();
    const message = winnerName
        ? `${winnerName} wins the match!`
        : 'Match over.';
    setTimeout(() => {
        alert(message);
        document.getElementById('match-status').textContent = '';
        showScreen('lobby');
    }, 400);
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
    bar.style.background = pct <= 30 ? 'var(--hp-bad)' : 'var(--hp-good)';
}