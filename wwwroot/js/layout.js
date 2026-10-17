(() => {
    const EASE_POP = 'cubic-bezier(.2,1.5,.4,1)';
    const $ = id => document.getElementById(id);
    const body = document.body, stage = document.querySelector('.stage');
    const chat = $('global-chat'), inner = $('chat-body'), tab = $('chat-toggle');
    const badge = $('chat-badge'), msgs = $('chat-messages');
    const arrow = tab.querySelector('.chat-arrow');
    const OFF = 'translateX(calc(-100% - 16px))';
    const reserve = () => (innerWidth > 900 ? 392 : 0);
    let open = innerWidth > 900, unread = 0;

    

    function setOpen(next, animate) {
        const prev = open;
        open = next;
        body.dataset.chat = open ? 'open' : 'closed';
        tab.setAttribute('aria-expanded', String(open));
        tab.setAttribute('aria-label', open ? 'Hide chat' : 'Show chat');
        inner.inert = !open;
        stage.style.setProperty('--reserve', (open ? reserve() : 0) + 'px');
        if (open) { unread = 0; badge.classList.add('hidden'); }
        if (!animate || prev === open) return;

        // snappy: quick slide with a small overshoot on open, a fast ease-in on close
        const dur = open ? 240 : 150;
        chat.animate([{ transform: open ? OFF : 'none' }, { transform: open ? 'none' : OFF }],
            { duration: dur, easing: open ? 'cubic-bezier(.2,1.25,.4,1)' : 'cubic-bezier(.5,0,.9,.4)' });
        arrow.animate([{ rotate: open ? '180deg' : '0deg' }, { rotate: open ? '0deg' : '180deg' }],
            { duration: dur, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
    tab.addEventListener('click', () => setOpen(!open, true));
    addEventListener('resize', () => setOpen(open, false));
    setOpen(open, false);

        // screen title lives in the top bar
    const TITLES = { lobby: 'HOME', multiplayer: 'MULTIPLAYER', room: 'ROOM' };
    const hudTitle = $('hud-title');
    const syncTitle = () => {
        const t = TITLES[body.dataset.screen] || '';
        if (hudTitle.textContent === t) return;
        hudTitle.textContent = t;
        if (t) hudTitle.animate(
            [{ translate: '-40px 0', scale: .7, opacity: 0 }, { translate: '0 0', scale: 1, opacity: 1 }],
            { duration: 360, easing: EASE_POP });
    };
    new MutationObserver(syncTitle).observe(body, { attributes: true, attributeFilter: ['data-screen'] });
    syncTitle();

    // "ON AIR" burst pulses forever
    $('chat-onair').animate([{ scale: 1 }, { scale: 1.14 }, { scale: 1 }], { duration: 900, iterations: Infinity });

    // new messages pop in; your own go right in mustard; unread count while hidden
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        const who = n.querySelector('strong');
        const me = window.gameState && window.gameState.playerName;
        if (who && me && who.textContent.replace(/:$/, '') === me) n.classList.add('is-mine');
        n.animate([{ translate: '-34px 0', scale: .75, opacity: 0 }, { translate: '0 0', scale: 1, opacity: 1 }],
            { duration: 340, easing: EASE_POP });
        if (!open) {
            unread++;
            badge.textContent = unread > 9 ? '9+' : unread;
            badge.classList.remove('hidden');
            tab.animate([{ rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '7deg' }, { rotate: '-4deg' }, { rotate: '0deg' }],
                { duration: 420 });
        }
    }))).observe(msgs, { childList: true });

    // ---------- backdrop for the menu screens ----------
    const deco = $('deco');
    if (!deco) return;
    const C = ['#e2483d', '#f4b63f', '#f6ecd2', '#6aa7cf'];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const star = (spikes, rMax, rMin) => {
        const pts = [], n = spikes * 2;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const r = i % 2 ? rMin * rnd(.9, 1.1) : rMax * rnd(.86, 1);
            pts.push(`${(50 + Math.cos(a) * r).toFixed(1)}% ${(50 + Math.sin(a) * r).toFixed(1)}%`);
        }
        return `polygon(${pts.join(',')})`;
    };

    // giant slow-spinning comic burst (3 layers)
    const burst = document.createElement('div');
    burst.className = 'deco-burst';
    const poly = star(16, 50, 32);
    [['#14100d', 1], ['#e2483d', .94], ['#f4b63f radial-gradient(rgba(20,16,13,.35) 2px,transparent 2.4px) 0 0/11px 11px', .87]]
        .forEach(([bg, s]) => {
            const l = document.createElement('i');
            l.style.cssText = `background:${bg};clip-path:${poly};transform:scale(${s})`;
            burst.append(l);
        });
    deco.append(burst);
    burst.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 70000, iterations: Infinity });

    const word = document.createElement('div');
    word.className = 'deco-word';
    word.textContent = 'QUBE';
    deco.append(word);

    // two crossing ticker stripes
    function stripe(bg, fg, top, rot, dur, rev) {
        const el = document.createElement('div');
        el.className = 'deco-stripe';
        el.style.cssText = `top:${top};background:${bg};color:${fg};transform:rotate(${rot})`;
        const unit = '\u2605 FASTEST FINGER WINS \u2605 NO PAIN NO BRAIN \u2605 QUBE '.repeat(3);
        el.innerHTML = `<div class="deco-track"><span>${unit}</span><span>${unit}</span></div>`;
        deco.append(el);
        el.firstChild.animate([
            { transform: `translateX(${rev ? '-50%' : '0'})` },
            { transform: `translateX(${rev ? '0' : '-50%'})` },
        ], { duration: dur, iterations: Infinity });
    }
    stripe('#e2483d', '#f6ecd2', '22%', '-11deg', 26000, false);
    stripe('#14100d', '#f4b63f', '70%', '-11deg', 32000, true);

    // floating confetti shapes
    const SHAPES = [star(5, 50, 22), 'polygon(50% 0,100% 100%,0 100%)', 'circle(50%)',
        'polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)'];
    for (let i = 0; i < 16; i++) {
        const size = rnd(22, 70);
        const f = document.createElement('div');
        f.className = 'deco-float';
        f.style.cssText = `left:${rnd(2, 96)}%;top:${rnd(4, 92)}%;width:${size}px;height:${size}px`;
        const s = document.createElement('i');
        s.style.cssText = `background:${C[i % C.length]};clip-path:${SHAPES[i % SHAPES.length]}`;
        f.append(s);
        deco.append(f);
        const dy = rnd(14, 34), r = rnd(25, 80);
        f.animate([
            { transform: 'translateY(0) rotate(0deg)' },
            { transform: `translateY(${-dy}px) rotate(${r}deg)` },
        ], { duration: rnd(2200, 5000), iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -rnd(0, 3000) });
    }
})();