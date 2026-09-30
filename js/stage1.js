/* Stage 1: "Escape the Maze" (Chase Mechanics with Pathfinding + Key/Lock) */
import { navigateToStage, showAlert, safely } from './app.js';

const STAGE_ID = 'maze';
const NEXT_STAGE = 'stage2';
const CAUGHT_MESSAGE = 'Oops! The dog caught you! Try again.';
const PATROL_MS = 400;
const MOVE_THROTTLE_MS = 80;
const WIN_DELAY_MS = 450;
const DPAD_REPEAT_MS = 120;

/* Legend:
 *   #  wall
 *   .  floor
 *   S  start (Bon)         — top-left
 *   E  exit (Babar)        — bottom-right
 *   K  key spawn           — mid-right corridor (upper)
 *   L  lock                — top-right
 *   B  blocked gate        — mid-bottom, on the only corridor to E
 *
 * Layout mirrors the reference image:
 *   Row 1  : Bon at (1,1); corridor heading right
 *   Row 3  : key at K (mid-right upper)
 *   Row 1 col 9: lock at L (top-right)
 *   Row 7 col 6: gate B (mid-bottom, blocks the path down to E)
 *   Row 7 col 9: Babar at E (bottom-right)
 */
const MAZE = [
    '###########',
    '#S.......L#',
    '#.#.###.#B#',
    '#.#...#.#.#',
    '#...#.#.#.#',
    '#.#.#...#.#',
    '###.###.#.#',
    '#K......#E#',
    '###########',
];

/* Single chaser dog. */
const DOGS = [
    { type: 'chaser', start: [5, 1] },
];

const ASSETS = {
    bon: { src: 'assets/bon-running.png', alt: 'Bon in pajamas', fallback: () => person('#8fb0f0') },
    babar: { src: 'assets/babar-wave.png', alt: 'Babar waving', fallback: () => person('#f0a8b8') },
    iro: { src: 'assets/iro.png', alt: 'Iro, a guard dog', fallback: () => dog() },
    key: { src: 'assets/key.png', alt: 'Golden key', fallback: () => keySVG() },
    lock: { src: 'assets/lock.png', alt: 'Locked gate', fallback: () => lockSVG() },
};

const KEY_DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

let ctx = null;

/* ---------- Placeholder art (inline SVG) ---------- */
const toUri = svg => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'>${svg}</svg>`);
const px = (x, y, w, h, f) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${f}'/>`;
const person = pj => toUri(px(4, 1, 8, 6, '#f6d7b8') + px(6, 3, 1, 1, '#333') + px(9, 3, 1, 1, '#333')
    + px(3, 7, 10, 8, pj) + px(3, 9, 10, 1, '#fff') + px(3, 12, 10, 1, '#fff'));
const dog = () => toUri(px(3, 4, 10, 7, '#a87850') + px(2, 3, 3, 4, '#6e4a2a') + px(11, 3, 3, 4, '#6e4a2a')
    + px(5, 6, 1, 1, '#222') + px(10, 6, 1, 1, '#222') + px(7, 8, 2, 2, '#222') + px(4, 11, 2, 3, '#a87850') + px(10, 11, 2, 3, '#a87850'));
const keySVG = () => toUri(
    px(6, 2, 4, 4, '#f5c518') +
    px(7, 3, 2, 2, '#8a6a00') +
    px(7, 6, 2, 7, '#f5c518') +
    px(9, 9, 3, 2, '#f5c518') +
    px(9, 12, 2, 2, '#f5c518')
);
const lockSVG = () => toUri(
    px(3, 6, 10, 8, '#c8a415') +
    px(5, 3, 6, 4, '#c8a415') +
    px(6, 2, 4, 2, '#8a6a00') +
    px(6, 8, 4, 4, '#5a4400') +
    px(7, 9, 2, 3, '#1a1a1a')
);

/* ---------- DOM helpers ---------- */
function el(tag, cls) { const n = document.createElement(tag); n.className = cls; return n; }

function sprite(kind) {
    const a = ASSETS[kind];
    const img = el('img', `maze__sprite maze__sprite--${kind}`);
    img.alt = a.alt;
    img.draggable = false;
    img.addEventListener('error', () => { img.src = a.fallback(); }, { once: true });
    img.src = a.src;
    return img;
}

function place(node, r, c) { node.style.setProperty('--r', r); node.style.setProperty('--c', c); }

const isWall = (r, c) => (MAZE[r]?.[c] ?? '#') === '#';
const isGate = (r, c) => (MAZE[r]?.[c] ?? '#') === 'B';
const find = ch => { for (let r = 0; r < MAZE.length; r++) { const c = MAZE[r].indexOf(ch); if (c > -1) return { r, c }; } return null; };

/* ---------- Pathfinding (BFS) — respects gate state ---------- */
function getNextStep(startR, startC, targetR, targetC, gateOpen) {
    const queue = [[startR, startC]];
    const visited = new Set([`${startR},${startC}`]);
    const parentMap = new Map();
    const blocked = (r, c) => isWall(r, c) || (!gateOpen && isGate(r, c));

    while (queue.length > 0) {
        const [r, c] = queue.shift();

        if (r === targetR && c === targetC) {
            let curr = `${r},${c}`;
            const path = [];
            while (parentMap.has(curr)) {
                path.push(curr);
                curr = parentMap.get(curr);
            }
            const firstStep = path[path.length - 1];
            if (firstStep) {
                const [nr, nc] = firstStep.split(',').map(Number);
                return { r: nr, c: nc };
            }
            return null;
        }

        for (const [dr, dc] of Object.values(KEY_DIRS)) {
            const nr = r + dr, nc = c + dc;
            const k = `${nr},${nc}`;
            if (!blocked(nr, nc) && !visited.has(k)) {
                visited.add(k);
                queue.push([nr, nc]);
                parentMap.set(k, `${r},${c}`);
            }
        }
    }
    return null;
}

/* ---------- Lifecycle ---------- */
function mount() {
    const host = document.getElementById('maze-container');
    if (!host || ctx) return;

    const start = find('S'), exit = find('E');
    const keyPos = find('K'), lockPos = find('L');
    if (!start || !exit) throw new Error('Maze layout needs both a start (S) and an exit (E).');

    const board = el('div', 'maze');
    board.style.setProperty('--cols', MAZE[0].length);

    const tileRefs = { gate: null, lock: null, key: null };
    MAZE.forEach((row, r) => [...row].forEach((ch, c) => {
        let cls = 'maze__tile';
        if (ch === '#') cls += ' maze__tile--wall';
        else if (ch === 'E') cls += ' maze__tile--exit';
        else if (ch === 'B') cls += ' maze__tile--gate';
        else if (ch === 'L') cls += ' maze__tile--lock';
        else if (ch === 'K') cls += ' maze__tile--key';
        const t = el('div', cls);
        board.append(t);
        if (ch === 'B') tileRefs.gate = t;
        if (ch === 'L') tileRefs.lock = t;
        if (ch === 'K') tileRefs.key = t;
    }));

    /* Babar at exit */
    const babar = sprite('babar');
    place(babar, exit.r, exit.c);

    /* Bon at start */
    const bon = sprite('bon');
    place(bon, start.r, start.c);

    /* Key sprite */
    const keySprite = sprite('key');
    keySprite.classList.add('maze__sprite--item');
    place(keySprite, keyPos.r, keyPos.c);

    /* Lock sprite */
    const lockSprite = sprite('lock');
    lockSprite.classList.add('maze__sprite--item');
    place(lockSprite, lockPos.r, lockPos.c);

    /* Dogs */
    const dogs = DOGS.map(d => {
        const node = sprite('iro');
        let r, c;
        if (d.type === 'chaser') [r, c] = d.start;
        else[r, c] = d.path[0];
        place(node, r, c);
        return { node, ...d, r, c, i: 0, dir: 1 };
    });

    board.append(babar, ...dogs.map(d => d.node), keySprite, lockSprite, bon);

    host.replaceChildren(board);

    ctx = {
        host, board, bon, keySprite, lockSprite, tileRefs, start, exit, keyPos, lockPos,
        dogs, player: { ...start },
        locked: false, lastMove: 0, timers: [], started: false,
        hasKey: false, gateOpen: false,
    };

    ctx.onKey = safely(onKeydown, { title: 'Maze error' });
    document.addEventListener('keydown', ctx.onKey);

    ctx.dpad = buildDpad();
    host.insertAdjacentElement('afterend', ctx.dpad);

    ctx.patrol = setInterval(safely(gameTick, { title: 'Maze error' }), PATROL_MS);
}

function unmount() {
    if (!ctx) return;
    document.removeEventListener('keydown', ctx.onKey);
    clearInterval(ctx.patrol);
    clearInterval(ctx.repeat);
    ctx.dpad?.remove();
    ctx.timers.forEach(clearTimeout);
    ctx.host.replaceChildren();
    ctx = null;
}

/* ---------- Touch controls ---------- */
const DPAD = [
    { key: 'ArrowUp', icon: 'up.png', cls: 'up', aria: 'Move up' },
    { key: 'ArrowLeft', icon: 'left.png', cls: 'left', aria: 'Move left' },
    { key: 'ArrowRight', icon: 'right.png', cls: 'right', aria: 'Move right' },
    { key: 'ArrowDown', icon: 'down.png', cls: 'down', aria: 'Move down' },
];

function buildDpad() {
    const pad = el('div', 'dpad');
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', 'Movement controls');

    const stop = () => { if (ctx) { clearInterval(ctx.repeat); ctx.repeat = 0; } };

    DPAD.forEach(({ key, icon, cls, aria }) => {
        const b = el('button', `dpad__btn dpad__btn--${cls}`);
        b.type = 'button';
        b.setAttribute('aria-label', aria);

        const img = document.createElement('img');
        img.src = `assets/${icon}`;
        img.alt = '';
        img.draggable = false;
        img.className = 'dpad__icon';
        b.appendChild(img);

        b.addEventListener('pointerdown', e => {
            e.preventDefault();
            if (!ctx) return;
            stop();
            move(KEY_DIRS[key]);
            ctx.repeat = setInterval(() => move(KEY_DIRS[key]), DPAD_REPEAT_MS);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, stop));
        b.addEventListener('contextmenu', e => e.preventDefault());
        pad.append(b);
    });
    return pad;
}

/* ---------- Gameplay ---------- */
function onKeydown(e) {
    const dir = KEY_DIRS[e.key];
    if (!dir || !ctx) return;
    e.preventDefault();
    move(dir);
}

function move(dir) {
    if (!ctx) return;
    if (!ctx.started) ctx.started = true;

    const now = performance.now();
    if (ctx.locked || now - ctx.lastMove < MOVE_THROTTLE_MS) return;
    ctx.lastMove = now;

    const r = ctx.player.r + dir[0], c = ctx.player.c + dir[1];

    if (isWall(r, c)) return;
    if (isGate(r, c) && !ctx.gateOpen) return;

    ctx.player = { r, c };
    place(ctx.bon, r, c);

    if (dogAt(r, c)) return caught();

    if (!ctx.hasKey && r === ctx.keyPos.r && c === ctx.keyPos.c) {
        ctx.hasKey = true;
        ctx.keySprite.classList.add('is-picked');
        ctx.bon.classList.add('has-key');
        pulseTile(ctx.tileRefs.key);
    }

    if (ctx.hasKey && !ctx.gateOpen && r === ctx.lockPos.r && c === ctx.lockPos.c) {
        ctx.gateOpen = true;
        ctx.lockSprite.classList.add('is-unlocked');
        ctx.tileRefs.lock?.classList.add('is-unlocked');
        ctx.tileRefs.gate?.classList.add('is-open');
        pulseTile(ctx.tileRefs.lock);
    }

    if (r === ctx.exit.r && c === ctx.exit.c) {
        if (!ctx.gateOpen) return;
        win();
    }
}

function pulseTile(t) {
    if (!t) return;
    t.classList.remove('is-pulse');
    void t.offsetWidth;
    t.classList.add('is-pulse');
}

function gameTick() {
    if (!ctx || ctx.locked || !ctx.started) return;

    for (const d of ctx.dogs) {
        if (d.type === 'chaser') {
            const nextStep = getNextStep(d.r, d.c, ctx.player.r, ctx.player.c, ctx.gateOpen);
            if (nextStep) {
                d.r = nextStep.r;
                d.c = nextStep.c;
                place(d.node, d.r, d.c);
            }
        } else if (d.type === 'patrol' && d.path.length > 1) {
            let next = d.i + d.dir;
            if (next < 0 || next >= d.path.length) { d.dir *= -1; next = d.i + d.dir; }
            d.i = next;
            [d.r, d.c] = d.path[next];
            place(d.node, d.r, d.c);
        }
    }

    if (dogAt(ctx.player.r, ctx.player.c)) caught();
}

const dogAt = (r, c) => ctx.dogs.some(d => d.r === r && d.c === c);

function caught() {
    clearInterval(ctx.repeat);
    ctx.locked = true;
    ctx.started = false;

    ctx.player = { ...ctx.start };
    place(ctx.bon, ctx.start.r, ctx.start.c);

    const chaser = ctx.dogs.find(d => d.type === 'chaser');
    if (chaser) {
        chaser.r = chaser.start[0];
        chaser.c = chaser.start[1];
        place(chaser.node, chaser.r, chaser.c);
    }

    showAlert({
        title: 'Caught!',
        message: CAUGHT_MESSAGE,
        actions: [{ label: 'Try again' }],
        onClose: () => { if (ctx) ctx.locked = false; },
    });
}

function win() {
    clearInterval(ctx.repeat);
    ctx.locked = true;
    ctx.board.classList.add('is-won');
    ctx.timers.push(setTimeout(() => navigateToStage(NEXT_STAGE), WIN_DELAY_MS));
}

document.addEventListener('stagechange', safely(e => {
    e.detail.stageId === STAGE_ID ? mount() : unmount();
}, { title: 'Could not load the maze' }));