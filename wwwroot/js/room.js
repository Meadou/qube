(() => {
    const hub = window.hubConnection;
    const $ = id => document.getElementById(id);

    const waitingView = $('room-waiting');
    const gameView = $('room-game');
    const seatGrid = $('group-seat-grid');
    const startBtn = $('group-start-btn');
    const standBtn = $('group-leave-seat-btn');
    const choicesEl = $('group-choices');
    const roundStatus = $('group-round-status');
    const questionPanel = $('group-question-panel');
    const gameOverEl = $('group-gameover');
    const codeInput = $('room-code-input');

    let room = null;
    let firstRender = true;
    let questionTimer = null;
    let hasAnswered = false;
    let knownMembers = new Set();
    let seatOwners = new Map();
    const myId = () => hub.connectionId;

    const ERRORS = {
        'not-in-lobby': 'Enter your name first.',
        'in-duel': 'Finish your duel first.',
        'empty': 'Enter a room code.',
        'room-not-found': "That room doesn't exist.",
        'room-full': 'That room is full.',
        'game-started': 'That game already started.',
        'not-in-room': 'Join a room first.',
        'invalid-seat': 'That chair does not exist.',
        'seat-taken': 'That chair is taken.',
        'no-questions': 'No quiz questions are loaded yet.',
        'not-host': 'Only the host can start the game.',
        'not-enough-players': 'At least two players must be seated.',
    };
    function showError(message) {
        $('group-room-error').textContent = message;
        $('lobby-error').textContent = message;
    }

    // ---------- view switching ----------
    function stopTimer() {
        if (questionTimer) { clearInterval(questionTimer); questionTimer = null; }
    }
    function showWaiting() {
        stopTimer();
        gameView.classList.add('hidden');
        waitingView.classList.remove('hidden');
        questionPanel.classList.add('hidden');
        gameOverEl.classList.add('hidden');
        document.body.classList.remove('group-game-active');
    }
    function showGame() {
        waitingView.classList.add('hidden');
        gameView.classList.remove('hidden');
        document.body.classList.add('group-game-active'); // hides top bar + chat
    }

    // ---------- multiplayer screen: create / join ----------
    $('create-room-btn').addEventListener('click', () => {
        $('lobby-error').textContent = '';
        hub.invoke('CreateGroupRoom').catch(() => showError('Could not create a room.'));
    });

    codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    $('join-room-form').addEventListener('submit', e => {
        e.preventDefault();
        const code = codeInput.value.trim();
        if (!code) return;
        $('lobby-error').textContent = '';
        hub.invoke('JoinGroupRoom', code).catch(() => showError('Could not reach the server.'));
    });

    hub.on('RoomEntered', () => {
        window.groupGameActive = false;
        firstRender = true;
        knownMembers = new Set();
        seatOwners = new Map();
        codeInput.value = '';
        $('lobby-error').textContent = '';
        showWaiting();
        showScreen('room');
    });

    // ---------- waiting room ----------
    function toast(text) {
        const el = document.createElement('div');
        el.className = 'room-toast';
        el.textContent = text;
        $('room-toasts').append(el);
        setTimeout(() => el.remove(), 3000);
    }
    hub.on('RoomMemberJoined', (name, connectionId) => {
        if (connectionId !== myId()) toast(`${name} joined the room`);
    });

    function renderRoom(snap) {
        room = snap;
        const me = myId();
        const mySeat = room.seats.find(s => s && s.connectionId === me);
        const isHost = room.hostConnectionId === me;
        const seated = room.seats.filter(Boolean);
        window.groupGameActive = room.started;

        $('room-code-display').textContent = room.code;
        $('group-room-error').textContent = '';

        // members list (newcomers pop in)
        const list = $('room-members');
        list.replaceChildren();
        room.members.forEach(m => {
            const li = document.createElement('li');
            li.className = 'room-member';
            li.textContent = m.name + (m.connectionId === room.hostConnectionId ? ' \u2605' : '');
            if (!firstRender && !knownMembers.has(m.connectionId)) li.classList.add('member-pop');
            list.append(li);
        });
        knownMembers = new Set(room.members.map(m => m.connectionId));

        // 20 chairs
        seatGrid.replaceChildren();
        const nextOwners = new Map();
        for (let n = 1; n <= 20; n++) {
            const seat = room.seats[n - 1];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'group-seat';
            btn.dataset.seatNumber = n;
            btn.disabled = room.started || Boolean(seat);
            btn.setAttribute('aria-label', seat ? `Chair ${n}, ${seat.name}` : `Sit in open chair ${n}`);

            const num = document.createElement('span');
            num.className = 'group-seat-number';
            num.textContent = `CHAIR ${String(n).padStart(2, '0')}`;
            const name = document.createElement('span');
            name.className = 'group-seat-name';
            name.textContent = seat ? seat.name : 'Open seat';
            btn.append(num, name);

            if (seat) {
                nextOwners.set(n, seat.connectionId);
                btn.style.setProperty('--seat-color', seat.color || '#ffffff');
                if (seat.connectionId === me) btn.classList.add('group-seat-mine');
                if (!firstRender && seatOwners.get(n) !== seat.connectionId) btn.classList.add('seat-pop');
            }
            btn.addEventListener('click', () =>
                hub.invoke('SitInGroupChair', n).catch(e => showError(e.message)));
            seatGrid.append(btn);
        }
        seatOwners = nextOwners;
        firstRender = false;

        standBtn.classList.toggle('hidden', !mySeat || room.started);
        startBtn.disabled = !isHost || seated.length < 2 || room.started;
        startBtn.textContent = room.finished ? 'Play again' : 'Start game';
        const host = room.members.find(m => m.connectionId === room.hostConnectionId);
        $('group-host-status').textContent = host ? `Host: ${host.name}${isHost ? ' (you)' : ''}` : '';
        $('group-room-status').textContent =
            `${seated.length}/20 seated \u00b7 ${room.members.length} in room \u00b7 pick a chair to play`;
    }
    hub.on('RoomUpdated', renderRoom);
    hub.on('GroupRoomActionFailed', reason => showError(ERRORS[reason] || 'Action failed.'));

    startBtn.addEventListener('click', () => {
        startBtn.disabled = true;
        hub.invoke('StartGroupGame').catch(e => { startBtn.disabled = false; showError(e.message); });
    });
    standBtn.addEventListener('click', () => hub.invoke('LeaveGroupChair'));
    $('room-leave-btn').addEventListener('click', () => {
        window.groupGameActive = false;
        document.body.classList.remove('group-game-active');
        hub.invoke('LeaveGroupRoom');
        room = null;
        showScreen('multiplayer');
    });
    $('room-code-display').addEventListener('click', async () => {
        const el = $('room-code-display');
        const code = room && room.code;
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            el.textContent = 'COPIED';
            setTimeout(() => { el.textContent = code; }, 900);
        } catch (e) {
            // Clipboard unavailable (non-HTTPS). The code is still visible to read out.
        }
    });

    // ---------- game: only the question and the choices ----------
    hub.on('GroupNewQuestion', (index, text, choices, seconds) => {
        const seated = Boolean(room && room.seats.some(s => s && s.connectionId === myId()));
        showGame();
        stopTimer();
        hasAnswered = false;
        gameOverEl.classList.add('hidden');
        questionPanel.classList.remove('hidden');
        roundStatus.textContent = seated ? '' : 'Spectating';
        $('group-round-number').textContent = `Question ${index + 1}`;
        $('group-question-text').textContent = text;

        choicesEl.replaceChildren();
        choices.forEach((choice, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn choice-btn';
            btn.textContent = choice;
            btn.disabled = !seated;
            btn.addEventListener('click', () => {
                if (hasAnswered) return;
                hasAnswered = true;
                choicesEl.querySelectorAll('button').forEach(o => { o.disabled = true; });
                btn.classList.add('selected');
                hub.invoke('SubmitGroupAnswer', i).catch(() => {
                    hasAnswered = false;
                    choicesEl.querySelectorAll('button').forEach(o => { o.disabled = false; });
                    btn.classList.remove('selected');
                });
            });
            choicesEl.append(btn);
        });

        const deadline = Date.now() + seconds * 1000;
        const tick = () => {
            $('group-timer').textContent = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (Date.now() >= deadline) stopTimer();
        };
        tick();
        questionTimer = setInterval(tick, 100);
    });

    hub.on('GroupRoundResolved', (index, correctIndex) => {
        stopTimer();
        choicesEl.querySelectorAll('button').forEach((b, i) => {
            b.disabled = true;
            if (i === correctIndex) b.classList.add('correct');
        });
    });

    hub.on('GroupGameOver', scores => {
        stopTimer();
        questionPanel.classList.add('hidden');
        gameOverEl.classList.remove('hidden');
        const ol = $('group-final-scoreboard');
        ol.replaceChildren();
        (scores || []).forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.name} \u2014 ${p.score} pts`;
            ol.append(li);
        });
    });
    $('group-back-btn').addEventListener('click', showWaiting);
})();