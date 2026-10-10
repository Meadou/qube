const GameSound = (() => {
    let ctx = null;
    let musicMuted = localStorage.getItem('brawl-music-muted') === 'true';
    let sfxMuted = localStorage.getItem('brawl-sfx-muted') === 'true';

    const MUSIC_VOLUME = 0.4;   // 30% quieter than full
    const SFX_VOLUME = 1;

    let selectSfx = null;
    let selectedSfx = null;
    let joinSfx = null;

    // ---- Menu music (streaming <audio>: starts after a small buffer, no full download) ----
    const MUSIC_SRC = 'audio/IttyBitty.mp3';
    let music = null;
    let musicWanted = false;

    function ensureMusic() {
        if (!music) {
            music = new Audio(MUSIC_SRC);
            music.loop = true;
            music.preload = 'auto';
            music.volume = MUSIC_VOLUME;
            music.muted = musicMuted;
        }
        return music;
    }

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
            audio.volume = SFX_VOLUME;
            return audio;
        } catch (e) {
            return null;
        }
    }

    function ensureSfx() {
        if (!selectSfx) selectSfx = loadAudio('audio/select.wav', false);
        if (!selectedSfx) selectedSfx = loadAudio('audio/selected.wav', false);
        if (!joinSfx) joinSfx = loadAudio('audio/join.wav', false);
    }

    function playSfx(name) {
        ensureSfx();
        const audio = name === 'select' ? selectSfx : name === 'selected' ? selectedSfx : joinSfx;
        if (sfxMuted || !audio) return;
        try {
            audio.currentTime = 0;
            const p = audio.play();
            if (p && p.catch) p.catch(() => {});
        } catch (e) {
        }
    }

    function startMusic() {
        musicWanted = true;
        const el = ensureMusic();
        el.muted = musicMuted;
        el.volume = MUSIC_VOLUME;
        if (!el.paused) return;
        const p = el.play();
        // Autoplay may be blocked until the first user gesture; retried on the next one.
        if (p && p.catch) p.catch(() => {});
    }

    function stopMusic() {
        musicWanted = false;
        if (music) {
            try { music.pause(); } catch (e) {}
        }
    }

    function applyMusicMute() {
        if (music) {
            music.muted = musicMuted;
            music.volume = MUSIC_VOLUME;
        }
        if (!musicMuted && musicWanted) startMusic();
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
            applyMusicMute();
        },
        setMusicMuted(value) {
            musicMuted = value;
            localStorage.setItem('brawl-music-muted', String(musicMuted));
            applyMusicMute();
        },
        setSfxMuted(value) {
            sfxMuted = value;
            localStorage.setItem('brawl-sfx-muted', String(sfxMuted));
        },
        menuMusicStart() {
            getCtx();   // also resumes the context after a user gesture
            startMusic();
        },
        ensureMenuMusicStarted() {
            getCtx();
            startMusic();   // no-op if already playing
        },
        menuMusicStop() {
            stopMusic();
        },
        hover() { playSfx('select'); },
        select() { playSfx('selected'); },
        join() { playSfx('join'); },
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
window.GameSound = GameSound;   // outside the IIFE so it actually runs