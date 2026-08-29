// Renders a simple flat 2D pixel-art sprite: a 9x11 grid where
// 'K' = black outline/eyes, 'F' = the player's chosen body color, '.' = empty.
// Movement/attack/hurt are done by toggling CSS classes — see css/style.css.
const SPRITE_ROWS = [
    "..KKKKKK..",
    ".KFFFFFFK.",
    "KFFFKFFKFK",
    "KFFFKFFKFK",
    ".KFFFFFFK.",
    "..KFFFFK..",
    "..KFFFFK..",
    "..KFFFFK..",
    "..KFFFFK..",
    "..KFFKFK..",
    "..KKKKKK..",
];

class CubeCharacter {
    // side: 'player-left' or 'player-right' — controls which way "attack" lunges
    constructor(container, config, side) {
        this.container = container;
        this.side = side;

        this.el = document.createElement('div');
        this.el.className = `cube-character ${side}`;

        this.spriteEl = document.createElement('div');
        this.spriteEl.className = 'pixel-sprite';

        this.fillCells = [];
        for (const rowStr of SPRITE_ROWS) {
            for (const ch of rowStr) {
                const cell = document.createElement('div');
                if (ch === 'K') {
                    cell.className = 'px px-k';
                } else if (ch === 'F') {
                    cell.className = 'px px-f';
                    this.fillCells.push(cell);
                } else {
                    cell.className = 'px px-t';
                }
                this.spriteEl.appendChild(cell);
            }
        }

        this.el.appendChild(this.spriteEl);
        this.container.appendChild(this.el);

        this.setColors(config);
    }

    setColors(config) {
        const color = (config && config.color) || '#ffffff';
        this.fillCells.forEach(cell => {
            cell.style.backgroundColor = color;
        });
    }

    playJump() {
        this.el.classList.remove('jumping');
        void this.el.offsetWidth;
        this.el.classList.add('jumping');
        this.el.addEventListener('animationend', () => {
            this.el.classList.remove('jumping');
        }, { once: true });
    }

    playAttack() {
        this.el.classList.remove('hurting');
        // Force reflow so the animation restarts even if it was just played
        void this.el.offsetWidth;
        this.el.classList.add('attacking');
        this.el.addEventListener('animationend', () => {
            this.el.classList.remove('attacking');
        }, { once: true });
    }

    playHurt() {
        this.el.classList.remove('attacking');
        void this.el.offsetWidth;
        this.el.classList.add('hurting');
        this.el.addEventListener('animationend', () => {
            this.el.classList.remove('hurting');
        }, { once: true });
    }

    destroy() {
        this.el.remove();
    }
}