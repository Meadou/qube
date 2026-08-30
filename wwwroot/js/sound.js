const GameSound = (() => {
    let ctx = null;
    let muted = localStorage.getItem('brawl-muted') === 'true';

    function getCtx() {
        if (!ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            ctx = new AudioContextClass();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function tone(freq, duration, type, gainPeak, delay = 0) {
        if (muted) return;
        try {
            const audioCtx = getCtx();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            const start = audioCtx.currentTime + delay;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(gainPeak, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(start);
            osc.stop(start + duration + 0.02);
        } catch (e) {
        }
    }

    return {
        isMuted: () => muted,
        setMuted(value) {
            muted = value;
            localStorage.setItem('brawl-muted', String(muted));
        },
        answerLock() { tone(500, 0.08, 'square', 0.05); },
        correct() {
            tone(660, 0.09, 'square', 0.07, 0);
            tone(990, 0.14, 'square', 0.07, 0.08);
        },
        hit() {
            tone(140, 0.18, 'sawtooth', 0.09, 0);
        },
        tick() { tone(880, 0.05, 'square', 0.03); },
        matchWin() {
            [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.08, i * 0.11));
        },
        matchLose() {
            [400, 320, 240].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.08, i * 0.13));
        },
    };
})();