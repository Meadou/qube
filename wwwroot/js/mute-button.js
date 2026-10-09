(function () {
    function ensureButtons() {
        if (document.getElementById('music-mute-btn') && document.getElementById('sfx-mute-btn')) return;

        const container = document.createElement('div');
        container.id = 'audio-mute-container';
        container.style.position = 'fixed';
        container.style.bottom = '1rem';
        container.style.left = '1rem';
        container.style.zIndex = '1000';
        container.style.display = 'flex';
        container.style.gap = '0.5rem';

        // Music mute button
        const musicBtn = document.createElement('button');
        musicBtn.id = 'music-mute-btn';
        musicBtn.className = 'sound-toggle';
        musicBtn.type = 'button';
        musicBtn.title = 'Toggle music (m)';
        musicBtn.setAttribute('aria-label', 'Toggle music');
        musicBtn.innerHTML = `
            <svg id="music-icon-on" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <svg id="music-icon-off" class="hidden" viewBox="0 0 24 24"><path d="M4.27 3L3 4.27 12 13.27V13.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4v-1.73l4.25 4.25L21 19.73 4.27 3zM14 7h4V3h-6v5.18l2 2z"/></svg>
        `;
        container.appendChild(musicBtn);

        // SFX mute button
        const sfxBtn = document.createElement('button');
        sfxBtn.id = 'sfx-mute-btn';
        sfxBtn.className = 'sound-toggle';
        sfxBtn.type = 'button';
        sfxBtn.title = 'Toggle sound effects';
        sfxBtn.setAttribute('aria-label', 'Toggle sound effects');
        sfxBtn.innerHTML = `
            <svg id="sfx-icon-on" viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM13 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            <svg id="sfx-icon-off" class="hidden" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
        `;
        container.appendChild(sfxBtn);

        document.body.appendChild(container);

        const musicOn = musicBtn.querySelector('#music-icon-on');
        const musicOff = musicBtn.querySelector('#music-icon-off');
        const sfxOn = sfxBtn.querySelector('#sfx-icon-on');
        const sfxOff = sfxBtn.querySelector('#sfx-icon-off');

        function refresh() {
            if (!window.GameSound) return;
            const mMuted = GameSound.isMusicMuted();
            const sMuted = GameSound.isSfxMuted();
            musicOn.classList.toggle('hidden', mMuted);
            musicOff.classList.toggle('hidden', !mMuted);
            sfxOn.classList.toggle('hidden', sMuted);
            sfxOff.classList.toggle('hidden', !sMuted);
        }

        musicBtn.addEventListener('click', () => {
            if (window.GameSound) {
                GameSound.setMusicMuted(!GameSound.isMusicMuted());
                refresh();
            }
        });
        sfxBtn.addEventListener('click', () => {
            if (window.GameSound) {
                GameSound.setSfxMuted(!GameSound.isSfxMuted());
                refresh();
            }
        });

        refresh();
        window.addEventListener('storage', refresh);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureButtons);
    } else {
        ensureButtons();
    }
})();