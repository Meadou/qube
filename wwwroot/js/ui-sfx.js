(function () {
    function playHover() {
        if (window.GameSound && typeof GameSound.hover === 'function') {
            try { GameSound.hover(); } catch (e) {}
        }
    }
    function playSelect() {
        if (window.GameSound && typeof GameSound.select === 'function') {
            try { GameSound.select(); } catch (e) {}
        }
    }

    const hoverTargets = ['.btn', '.menu-slab', '.choice-btn', '.group-seat', '.room-code', '.back-btn', '.sound-toggle'];
    const clickTargets = ['.btn', '.menu-slab', '.choice-btn', '.group-seat', '.room-code', '.back-btn', '.sound-toggle'];

    function attach() {
        hoverTargets.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
                el.removeEventListener('mouseenter', playHover);
                el.addEventListener('mouseenter', playHover, { passive: true });
            });
        });
        clickTargets.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
                el.removeEventListener('click', playSelect);
                el.addEventListener('click', playSelect, { passive: true });
            });
        });

        document.querySelectorAll('#join-room-form').forEach((form) => {
            form.removeEventListener('submit', playSelect);
            form.addEventListener('submit', playSelect, { passive: true });
        });
        document.querySelectorAll('#chat-form').forEach((form) => {
            form.removeEventListener('submit', playSelect);
            form.addEventListener('submit', playSelect, { passive: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        attach();
    }

    const observer = new MutationObserver(() => {
        attach();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();