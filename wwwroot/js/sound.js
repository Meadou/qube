const GameSound = (() => {
    let ctx = null;
    let musicMuted = localStorage.getItem('brawl-music-muted') === 'true';
    let sfxMuted = localStorage.getItem('brawl-sfx-muted') === 'true';

    let menuMusic = null;
    let selectSfx = null;
    let selectedSfx = null;
    let joinSfx = null;

    function getCtx() {
        if (!ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            ctx = new AudioContextClass();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function tone(freq, duration, type, gainPeak, delay = 0) {
        if (sfxMuted) return;
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

    function loadAudio(path, loop = false) {
        try {
            const audio = new Audio(path);
            audio.loop = loop;
            audio.preload = 'auto';
            return audio;
        } catch (e) {
            return null;
        }
    }

    function ensureMenuMusic() {
        if (!menuMusic) menuMusic = loadAudio('audio/QUBE-MENU-Song.wav', true);
    }

    function ensureSfx() {
        if (!selectSfx) selectSfx = loadAudio('audio/select.wav', false);
        if (!selectedSfx) selectedSfx = loadAudio('audio/selected.wav', false);
        if (!joinSfx) joinSfx = loadAudio('audio/join.wav', false);
    }

    return {
        isMuted: () => musicMuted && sfxMuted,
        isMusicMuted: () => musicMuted,
        isSfxMuted: () => sfxMuted,
        setMuted(value) {
            musicMuted = value;
            sfxMuted = value;
            localStorage.setItem('brawl-music-muted', String(musicMuted));
            localStorage.setItem('brawl-sfx-muted', String(sfxMuted));
            try {
                ensureMenuMusic();
                if (menuMusic) menuMusic.muted = musicMuted;
                if (musicMuted) {
                    menuMusic.pause();
                } else {
                    const p = menuMusic.play();
                    if (p && p.catch) p.catch(() => {});
                }
            } catch (e) {
            }
        },
        setMusicMuted(value) {
            musicMuted = value;
            localStorage.setItem('brawl-music-muted', String(musicMuted));
            try {
                ensureMenuMusic();
                if (menuMusic) menuMusic.muted = musicMuted;
                if (musicMuted) {
                    menuMusic.pause();
                } else {
                    const p = menuMusic.play();
                    if (p && p.catch) p.catch(() => {});
                }
            } catch (e) {
            }
        },
        setSfxMuted(value) {
            sfxMuted = value;
            localStorage.setItem('brawl-sfx-muted', String(sfxMuted));
        },
        menuMusicStart() {
            ensureMenuMusic();
            if (!menuMusic) return;
            try {
                getCtx();
                menuMusic.muted = musicMuted;
                menuMusic.loop = true;
                const p = menuMusic.play();
                if (p && p.catch) p.catch(() => {});
            } catch (e) {
            }
        },
        menuMusicStop() {
            ensureMenuMusic();
            if (menuMusic) {
                try { menuMusic.pause(); } catch (e) {}
                menuMusic.currentTime = 0;
            }
        },
        hover() {
            ensureSfx();
            if (sfxMuted || !selectSfx) return;
            try {
                selectSfx.currentTime = 0;
                const p = selectSfx.play();
                if (p && p.catch) p.catch(() => {});
            } catch (e) {
            }
        },
        select() {
            ensureSfx();
            if (sfxMuted || !selectedSfx) return;
            try {
                selectedSfx.currentTime = 0;
                const p = selectedSfx.play();
                if (p && p.catch) p.catch(() => {});
            } catch (e) {
            }
        },
        join() {
            ensureSfx();
            if (sfxMuted || !joinSfx) return;
            try {
                joinSfx.currentTime = 0;
                const p = joinSfx.play();
                if (p && p.catch) p.catch(() => {});
            } catch (e) {
            }
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
    window.GameSound = GameSound;
})();