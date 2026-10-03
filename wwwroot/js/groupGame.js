const groupRoomStatus = document.getElementById('group-room-status');
const groupRoomError = document.getElementById('group-room-error');
const groupSeatGrid = document.getElementById('group-seat-grid');
const groupStartButton = document.getElementById('group-start-btn');
const groupLeaveButton = document.getElementById('group-leave-seat-btn');
const groupQuestionPanel = document.getElementById('group-question-panel');
const groupChoices = document.getElementById('group-choices');
const groupRoundStatus = document.getElementById('group-round-status');
const groupGameOver = document.getElementById('group-gameover');
const groupAnsweredSeats = new Map();
let groupQuestionTimer = null;
let groupHasAnswered = false;
let latestGroupRoom = null;

function renderGroupRoom(room) {
    if (!room || !Array.isArray(room.seats)) return;
    latestGroupRoom = room;
    const mySeat = room.seats.find(seat => seat?.connectionId === window.hubConnection.connectionId);
    window.groupGameActive = Boolean(room.started && mySeat);
    const players = room.seats.filter(Boolean);
    const host = players.find(seat => seat.connectionId === room.hostConnectionId);
    groupSeatGrid.replaceChildren();
    groupRoomError.textContent = '';

    for (let seatNumber = 1; seatNumber <= 20; seatNumber++) {
        const seat = room.seats[seatNumber - 1];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'group-seat';
        button.dataset.seatNumber = seatNumber;
        button.disabled = room.started || Boolean(seat);
        button.setAttribute('aria-label', seat ? `Chair ${seatNumber}, occupied by ${seat.name}` : `Sit in open chair ${seatNumber}`);
        const number = document.createElement('span');
        number.className = 'group-seat-number';
        number.textContent = `CHAIR ${String(seatNumber).padStart(2, '0')}`;
        const name = document.createElement('span');
        name.className = 'group-seat-name';
        name.textContent = seat?.name || 'Open seat';
        button.append(number, name);
        if (seat) {
            const score = document.createElement('span');
            score.className = 'group-seat-score';
            score.textContent = `${seat.score} pts`;
            button.append(score);
            if (seat.isHost) {
                const hostLabel = document.createElement('span');
                hostLabel.className = 'group-seat-host';
                hostLabel.textContent = 'HOST';
                button.append(hostLabel);
            }
            const result = groupAnsweredSeats.get(seatNumber);
            if (result?.connectionId === seat.connectionId) {
                button.classList.add('group-seat-answered', result.isCorrect ? 'answer-correct' : 'answer-wrong');
                const state = document.createElement('span');
                state.className = 'group-seat-answer-state';
                state.textContent = result.isCorrect ? `Correct +${result.points}` : 'Wrong';
                button.append(state);
            }
        }
        if (seat?.connectionId === window.hubConnection.connectionId) button.classList.add('group-seat-mine');
        button.addEventListener('click', () => window.hubConnection.invoke('SitInGroupChair', seatNumber).catch(err => showGroupRoomError(err.message)));
        groupSeatGrid.append(button);
    }
    const isHost = room.hostConnectionId === window.hubConnection.connectionId;
    groupLeaveButton.classList.toggle('hidden', !mySeat);
    groupStartButton.disabled = !isHost || players.length < 2 || room.started;
    groupStartButton.textContent = room.finished ? 'Play again' : 'Start game';
    document.getElementById('group-host-status').textContent = host ? `Host: ${host.name}${isHost ? ' (you)' : ''}` : 'No host yet';
    groupRoomStatus.textContent = room.started ? `Game in progress · ${players.length} players seated` : `${players.length}/20 chairs occupied · First player seated is host`;
    if (!document.body.classList.contains('group-game-active')) document.body.classList.remove('group-game-active');
}

function showGroupRoomError(message) { groupRoomError.textContent = message; }
window.hubConnection.on('GroupRoomUpdated', renderGroupRoom);
window.hubConnection.on('GroupRoomActionFailed', reason => showGroupRoomError({
    'not-in-lobby': 'Join the lobby before choosing a chair.', 'in-duel': 'Leave your 1v1 duel before joining the group room.',
    'invalid-seat': 'That chair does not exist.', 'game-started': 'The group game has already started.',
    'already-seated': 'You already have a chair.', 'seat-taken': 'That chair is already occupied.',
    'no-questions': 'No quiz questions are loaded yet.', 'not-host': 'Only the group host can start the game.',
    'not-enough-players': 'At least two players must be seated to start.'
}[reason] || 'The group room action could not be completed.'));
groupStartButton.addEventListener('click', () => {
    groupStartButton.disabled = true;
    window.hubConnection.invoke('StartGroupGame').catch(err => { groupStartButton.disabled = false; showGroupRoomError(err.message); });
});
groupLeaveButton.addEventListener('click', () => window.hubConnection.invoke('LeaveGroupRoom').catch(err => showGroupRoomError(err.message)));

function stopGroupQuestionTimer() { if (groupQuestionTimer) { clearInterval(groupQuestionTimer); groupQuestionTimer = null; } }
function renderGroupScoreboard(target, scores) {
    target.replaceChildren();
    scores.forEach(player => { const item = document.createElement('li'); item.textContent = `${player.name} — ${player.score} pts`; target.append(item); });
}
window.hubConnection.on('GroupNewQuestion', (index, text, choices, seconds) => {
    document.body.classList.add('group-game-active');
    stopGroupQuestionTimer(); groupHasAnswered = false; groupAnsweredSeats.clear();
    groupQuestionPanel.classList.remove('hidden'); groupGameOver.classList.add('hidden'); groupRoundStatus.textContent = '';
    document.getElementById('group-round-number').textContent = `Question ${index + 1}`;
    document.getElementById('group-question-text').textContent = text; groupChoices.replaceChildren();
    choices.forEach((choice, choiceIndex) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn choice-btn'; button.textContent = choice;
        button.addEventListener('click', () => {
            if (groupHasAnswered) return;
            groupHasAnswered = true; groupChoices.querySelectorAll('button').forEach(option => { option.disabled = true; });
            button.classList.add('selected'); groupRoundStatus.textContent = 'Answer submitted';
            window.hubConnection.invoke('SubmitGroupAnswer', choiceIndex).catch(() => {
                groupHasAnswered = false; groupChoices.querySelectorAll('button').forEach(option => { option.disabled = false; });
                button.classList.remove('selected'); groupRoundStatus.textContent = 'Could not submit answer. Try again.';
            });
        });
        groupChoices.append(button);
    });
    const deadline = Date.now() + seconds * 1000;
    const updateTimer = () => { document.getElementById('group-timer').textContent = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); if (Date.now() >= deadline) stopGroupQuestionTimer(); };
    updateTimer(); groupQuestionTimer = setInterval(updateTimer, 100);
});
window.hubConnection.on('GroupPlayerAnswered', (seatNumber, playerName, connectionId, isCorrect, points, totalScore) => {
    groupAnsweredSeats.set(seatNumber, { connectionId, isCorrect, points });
    const seat = groupSeatGrid.querySelector(`[data-seat-number="${seatNumber}"]`);
    if (seat) { seat.classList.add('group-seat-answered', isCorrect ? 'answer-correct' : 'answer-wrong'); const score = seat.querySelector('.group-seat-score'); if (score) score.textContent = `${totalScore} pts`; }
    groupRoundStatus.textContent = isCorrect ? `${playerName} answered correctly (+${points})` : `${playerName} answered incorrectly`;
});
window.hubConnection.on('GroupRoundResolved', (index, correctIndex, scores) => {
    stopGroupQuestionTimer(); groupChoices.querySelectorAll('button').forEach((button, i) => { button.disabled = true; if (i === correctIndex) button.classList.add('correct'); });
    groupRoundStatus.textContent = 'Round complete. The correct answer is highlighted.';
    renderGroupScoreboard(document.getElementById('group-scoreboard'), scores);
});
window.hubConnection.on('GroupGameOver', scores => {
    stopGroupQuestionTimer();
    document.body.classList.remove('group-game-active');
    groupGameOver.classList.remove('hidden');
    renderGroupScoreboard(document.getElementById('group-final-scoreboard'), scores || []);
});
