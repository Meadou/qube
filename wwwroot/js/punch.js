(() => {
    // Always on by design. Optional opt-out: localStorage.setItem('qube-calm','1')
    try { if (localStorage.getItem('qube-calm') === '1') return; } catch (e) {}

    const COLORS = ['#e2483d', '#f4b63f', '#f6ecd2', '#6aa7cf', '#ff7a59'];
    const INK = '#14100d';
    const CLIPS = [
        'polygon(50% 0,100% 100%,0 100%)',
        'polygon(25% 0,100% 0,75% 100%,0 100%)',
        'polygon(0 40%,100% 0,60% 100%)',
        'polygon(50% 0,60% 38%,100% 50%,60% 62%,50% 100%,40% 62%,0 50%,40% 38%)',
        'polygon(0 0,100% 20%,80% 100%,10% 70%)',
    ];
    const EASE_POP = 'cubic-bezier(.2,1.7,.4,1)';
    const EASE_OUT = 'cubic-bezier(.1,.9,.2,1)';

    const BIG = '.menu-slab, .btn-primary';
    const SEL = '.menu-slab, .btn, .choice-btn, .group-seat, .room-code';

    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    const style = document.createElement('style');
    style.textContent = `
        .slabs { position: relative; }
        .slabs > .menu-slab { z-index: 1; }
        .fx-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .fx-top { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; overflow: hidden; }
        .fx-shape { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform, opacity; }
    `;
    document.head.append(style);

    const top = document.createElement('div');
    top.className = 'fx-top';
    document.body.append(top);
    const stage = document.querySelector('.stage');

    // true only while the touch (tap) version of the slab effect is playing
    let fast = false;

    // ---------- building blocks ----------
    function shard(parent, cx, cy, tx, ty, size, dur) {
        const el = document.createElement('div');
        el.className = 'fx-shape';
        el.style.cssText = `width:${size}px;height:${size}px;background:${pick(COLORS)};clip-path:${pick(CLIPS)}`;
        parent.append(el);
        const rot = rnd(-320, 320);
        const at = (k, s, r) => `translate(${cx + tx * k - size / 2}px,${cy + ty * k - size / 2}px) scale(${s}) rotate(${r}deg)`;
        el.animate([
            { transform: at(0, 0, 0), opacity: 1 },
            { transform: at(.8, 1.15, rot * .7), opacity: 1, offset: .5 },
            { transform: at(1, .4, rot), opacity: 0 },
        ], { duration: dur || rnd(450, 780), easing: EASE_OUT, fill: 'forwards' }).onfinish = () => el.remove();
    }

    function streak(parent, x, y, dir, len, thick, dur) {
        const el = document.createElement('div');
        el.className = 'fx-shape';
        el.style.cssText = `width:${len}px;height:${thick}px;background:${pick([COLORS[1], COLORS[2], COLORS[0]])};transform-origin:${dir < 0 ? 'right' : 'left'} center`;
        parent.append(el);
        const px = dir < 0 ? x - len : x;
        el.animate([
            { transform: `translate(${px}px,${y}px) scaleX(.05)`, opacity: 1 },
            { transform: `translate(${px + dir * rnd(60, 160)}px,${y}px) scaleX(1)`, opacity: .9, offset: .45 },
            { transform: `translate(${px + dir * rnd(180, 320)}px,${y}px) scaleX(.6)`, opacity: 0 },
        ], { duration: dur || rnd(320, 520), easing: EASE_OUT, fill: 'forwards' }).onfinish = () => el.remove();
    }

    function bump(el, strength, dur) {
        const s = 1 + strength, r = strength * 20;
        el.animate([
            { scale: 1, rotate: '0deg' },
            { scale: 1 - strength * .7, rotate: `${-r}deg`, offset: .25 },
            { scale: s, rotate: `${r * .7}deg`, offset: .6 },
            { scale: 1, rotate: '0deg' },
        ], { duration: dur || 340, easing: EASE_POP });
    }

    function shake(amount) {
        if (!stage) return;
        const p = amount;
        stage.animate([
            { transform: 'none' },
            { transform: `translate(${-p}px,${p * .4}px) rotate(${-p * .05}deg)`, offset: .15 },
            { transform: `translate(${p * .85}px,${-p * .5}px) rotate(${p * .04}deg)`, offset: .3 },
            { transform: `translate(${-p * .6}px,${-p * .25}px)`, offset: .45 },
            { transform: `translate(${p * .4}px,${p * .3}px)`, offset: .6 },
            { transform: `translate(${-p * .2}px,${p * .1}px)`, offset: .8 },
            { transform: 'none' },
        ], { duration: 120 + amount * 12, easing: 'linear' });
    }

    // ---------- Persona-style plates behind a slab ----------
    const plates = new WeakMap();
    let owner = 0;

    function layerFor(container) {
        let l = container.querySelector(':scope > .fx-layer');
        if (!l) { l = document.createElement('div'); l.className = 'fx-layer'; container.append(l); }
        return l;
    }
    function clearPlates(slab) {
        const p = plates.get(slab);
        if (p) { p.forEach(el => el.remove()); plates.delete(slab); }
        delete slab.dataset.hot;
        slab.style.zIndex = '';
        const l = slab.parentElement && slab.parentElement.querySelector(':scope > .fx-layer');
        if (l) l.style.zIndex = 0;
    }
    function plate(layer, slab, css, to) {
        const el = document.createElement('div');
        el.className = 'fx-shape';
        el.style.cssText = `left:${slab.offsetLeft}px;top:${slab.offsetTop}px;width:${slab.offsetWidth}px;` +
            `height:${slab.offsetHeight}px;border:4px solid ${INK};${css}`;
        layer.append(el);
        el.animate([
            { transform: 'translate(0,0) scale(.92) skewX(0deg)', opacity: 0 },
            { transform: to, opacity: 1 },
        ], { duration: fast ? 140 : 280, easing: EASE_POP, fill: 'forwards' });
        return el;
    }

    function slabEnter(slab) {
        const container = slab.parentElement;
        if (!container) return;
        const layer = layerFor(container);
        clearPlates(slab);
        layer.dataset.owner = String(++owner);
        layer.style.zIndex = 2;   // plates above neighboring slabs...
        slab.style.zIndex = 3;    // ...but below the active slab
        slab.dataset.hot = '1';

        const red = plate(layer, slab, 'background:#e2483d;box-shadow:6px 6px 0 #14100d', 'translate(-28px,18px) scale(1.02) skewX(-6deg)');
        const gold = plate(layer, slab,
            'background:#f4b63f radial-gradient(rgba(20,16,13,.3) 2px,transparent 2.3px) 0 0/11px 11px;box-shadow:6px 6px 0 #14100d',
            'translate(24px,-18px) scale(1.04) skewX(6deg)');
        const dark = plate(layer, slab, `background:${INK};border-color:#f6ecd2`, 'translate(-8px,30px) scale(.97) skewX(-3deg)');
        plates.set(slab, [dark, gold, red]);
        layer.append(dark, gold, red);

        const w = slab.offsetWidth, h = slab.offsetHeight;
        const cx = slab.offsetLeft + w / 2, cy = slab.offsetTop + h / 2;
        for (let i = 0; i < 14; i++) {
            shard(layer, cx, cy, rnd(-1, 1) * (w / 2 + 130), rnd(-1, 1) * (h / 2 + 100), rnd(26, 90),
                fast ? rnd(220, 380) : undefined);
        }
        for (let i = 0; i < 6; i++) {
            const dir = i % 2 ? 1 : -1;
            const x = dir < 0 ? slab.offsetLeft : slab.offsetLeft + w;
            streak(layer, x, slab.offsetTop + rnd(6, h - 14), dir, rnd(120, 240), rnd(4, 10),
                fast ? rnd(200, 320) : undefined);
        }
        bump(slab, .05, fast ? 220 : 340);
        const glyph = slab.querySelector('.slab-glyph');
        if (glyph) glyph.animate(
            [{ rotate: '-4deg', scale: 1 }, { rotate: '10deg', scale: 1.25, offset: .4 }, { rotate: '-4deg', scale: 1 }],
            { duration: fast ? 260 : 420, easing: EASE_POP });
    }

    function slabLeave(slab) {
        const layer = slab.parentElement && slab.parentElement.querySelector(':scope > .fx-layer');
        const id = layer && layer.dataset.owner;
        delete slab.dataset.hot;
        setTimeout(() => {
            if (layer && layer.dataset.owner === id) layer.style.zIndex = 0;
            if (!slab.dataset.hot) slab.style.zIndex = '';
        }, 160);
        const p = plates.get(slab);
        if (!p) return;
        plates.delete(slab);
        p.forEach(el => {
            el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(0,0) scale(.9)' }],
                { duration: 140, easing: 'ease-in', fill: 'forwards' }).onfinish = () => el.remove();
        });
    }

    // ---------- hover (mouse only) ----------
    document.addEventListener('pointerover', e => {
        if (e.pointerType === 'touch') return;
        const t = e.target.closest(SEL);
        if (!t || t.contains(e.relatedTarget) || t.disabled) return;
        if (t.classList.contains('slab-static') || t.closest('.chat-form')) return;
        if (t.matches('.menu-slab')) {
            if (t.getAttribute('aria-disabled') !== 'true') slabEnter(t);
            return;
        }
        const r = t.getBoundingClientRect();
        bump(t, .05);
        for (let i = 0; i < 5; i++) {
            shard(top, r.left + r.width / 2, r.top + r.height / 2,
                rnd(-1, 1) * (r.width / 2 + 40), rnd(-1, 1) * (r.height / 2 + 40), rnd(14, 30), rnd(300, 500));
        }
    });
    document.addEventListener('pointerout', e => {
        if (e.pointerType === 'touch') return;
        const t = e.target.closest('.menu-slab');
        if (t && !t.contains(e.relatedTarget)) slabLeave(t);
    });

    // ---------- click ----------
    let lastPointerIsTouch = false;
    let replaying = false;
    document.addEventListener('pointerdown', e => { lastPointerIsTouch = e.pointerType !== 'mouse'; }, true);

    document.addEventListener('click', e => {
        const t = e.target.closest(SEL);
        if (!t || t.disabled) return;
        if (t.classList.contains('slab-static') || t.closest('.chat-form')) return;

        if (t.getAttribute('aria-disabled') === 'true') {
            t.animate([{ translate: '0 0' }, { translate: '-10px 0' }, { translate: '9px 0' },
                { translate: '-6px 0' }, { translate: '3px 0' }, { translate: '0 0' }], { duration: 340 });
            return;
        }

        // Touch screens have no hover: play a quick plate effect first, then run the real click.
        if (!replaying && lastPointerIsTouch && t.matches('.menu-slab')) {
            e.stopImmediatePropagation();
            e.preventDefault();
            fast = true;
            slabEnter(t);
            fast = false;
            setTimeout(() => { replaying = true; t.click(); replaying = false; }, 200);
            return;
        }

        const heavy = t.matches(BIG);
        const r = t.getBoundingClientRect();
        const x = e.clientX || r.left + r.width / 2;   // keyboard/replayed clicks report 0,0
        const y = e.clientY || r.top + r.height / 2;

        bump(t, heavy ? .09 : .06);
        shake(heavy ? 16 : 6);

        const n = heavy ? 22 : 8;
        for (let i = 0; i < n; i++) {
            const a = rnd(0, Math.PI * 2), d = rnd(heavy ? 120 : 50, heavy ? 340 : 130);
            shard(top, x, y, Math.cos(a) * d, Math.sin(a) * d, rnd(heavy ? 22 : 12, heavy ? 70 : 28));
        }
        if (heavy) {
            if (t.matches('.menu-slab')) clearPlates(t);
            try { window.GameSound && GameSound.hit(); } catch (err) {}
        }
    }, true);

    // ---------- screen change: slam-in plus a 3-stripe sweep ----------
    function sweep() {
        const cols = [INK, COLORS[0], COLORS[1]];
        cols.forEach((c, i) => {
            const el = document.createElement('div');
            el.className = 'fx-shape';
            el.style.cssText = `width:140vw;height:40vh;background:${c};top:${i * 30 - 5}vh;left:-20vw;` +
                `border-top:4px solid ${INK};border-bottom:4px solid ${INK}`;
            top.append(el);
            el.animate([
                { transform: 'translateX(-130%) skewX(-18deg)' },
                { transform: 'translateX(0) skewX(-18deg)', offset: .45 },
                { transform: 'translateX(130%) skewX(-18deg)' },
            ], { duration: 520, delay: i * 55, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'both' })
                .onfinish = () => el.remove();
        });
    }

    let first = true;
    new MutationObserver(() => {
        document.querySelectorAll('.menu-slab').forEach(clearPlates);
        const s = document.querySelector('.screen.active');
        if (first) { first = false; return; }
        if (s) s.animate([
            { opacity: 0, transform: 'translateX(70px) scale(1.12) skewX(-4deg)' },
            { opacity: 1, transform: 'none' },
        ], { duration: 360, delay: 160, easing: EASE_POP, fill: 'backwards' });
        sweep();
    }).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
})();