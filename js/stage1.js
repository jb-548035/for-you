/* Stage 1: "Escape the Maze" (Chase Mechanics with Pathfinding) */
import { navigateToStage, showAlert, safely } from './app.js';

const STAGE_ID = 'maze';
const NEXT_STAGE = 'stage2';
const CAUGHT_MESSAGE = 'Oops! The dog caught you! Try again.';
const PATROL_MS = 400;
const MOVE_THROTTLE_MS = 80;
const WIN_DELAY_MS = 450;
const DPAD_REPEAT_MS = 120; // hold a D-pad button to keep moving

/* Legend: # wall | . floor | S start | E exit  (row, col) */
const MAZE = [
    '###########',
    '#S..#.....#',
    '#.#.#.....#',
    '#.#...#...#',
    '#.#####.#.#',
    '#.......#.#',
    '###.###.#.#',
    '#...#...#E#',
    '###########',
];

/* 
 * Dog Configuration:
 * - chaser: starts at a valid open floor tile and hunts the player.
 * - patrol: moves back and forth along a defined path.
 */
// Single chaser dog. Start near the red X location (row 5, col 2) so it's visible in the left corridor.
const DOGS = [
    { type: 'chaser', start: [5, 2] },
];

/* Assets mapped to the provided images */
const ASSETS = {
    bon: { src: 'assets/bon-running.png', alt: 'Bon in pajamas', fallback: () => person('#8fb0f0') },
    babar: { src: 'assets/babar-wave.png', alt: 'Babar waving', fallback: () => person('#f0a8b8') },
    iro: { src: 'assets/iro.png', alt: 'Iro, a guard dog', fallback: () => dog() },
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
const find = ch => { for (let r = 0; r < MAZE.length; r++) { const c = MAZE[r].indexOf(ch); if (c > -1) return { r, c }; } return null; };

/* ---------- Pathfinding (BFS) ---------- */
function getNextStep(startR, startC, targetR, targetC) {
    const queue = [[startR, startC]];
    const visited = new Set();
    visited.add(`${startR},${startC}`);

    const parentMap = new Map();

    while (queue.length > 0) {
        const [r, c] = queue.shift();

        if (r === targetR && c === targetC) {
            let curr = `${r},${c}`;
            let path = [];
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
            const key = `${nr},${nc}`;

            if (!isWall(nr, nc) && !visited.has(key)) {
                visited.add(key);
                queue.push([nr, nc]);
                parentMap.set(key, `${r},${c}`);
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
    if (!start || !exit) throw new Error('Maze layout needs both a start (S) and an exit (E).');

    const board = el('div', 'maze');
    board.style.setProperty('--cols', MAZE[0].length);
    MAZE.forEach(row => [...row].forEach(ch => {
        board.append(el('div', 'maze__tile' + (ch === '#' ? ' maze__tile--wall' : ch === 'E' ? ' maze__tile--exit' : '')));
    }));

    // Babar is placed at the exit tile; visual offset handled by CSS so transforms remain dynamic
    const babar = sprite('babar');
    place(babar, exit.r, exit.c);

    // Bon is at the start
    const bon = sprite('bon'); place(bon, start.r, start.c);

    // Setup Dogs
    const dogs = DOGS.map(d => {
        const node = sprite('iro');
        let r, c;
        if (d.type === 'chaser') {
            [r, c] = d.start;
        } else {
            [r, c] = d.path[0];
        }
        place(node, r, c);
        return { node, ...d, r, c, i: 0, dir: 1 };
    });

    board.append(babar, ...dogs.map(d => d.node), bon);

    host.replaceChildren(board);

    ctx = { host, board, bon, start, exit, dogs, player: { ...start }, locked: false, lastMove: 0, timers: [], started: false };

    ctx.onKey = safely(onKeydown, { title: 'Maze error' });
    document.addEventListener('keydown', ctx.onKey);

    // On-screen D-pad for touch devices (shown via CSS on phones/tablets)
    ctx.dpad = buildDpad();
    host.insertAdjacentElement('afterend', ctx.dpad);

    // Start the chase loop
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
    { key: 'ArrowUp', label: '▲', cls: 'up', aria: 'Move up' },
    { key: 'ArrowLeft', label: '◀', cls: 'left', aria: 'Move left' },
    { key: 'ArrowRight', label: '▶', cls: 'right', aria: 'Move right' },
    { key: 'ArrowDown', label: '▼', cls: 'down', aria: 'Move down' },
];

function buildDpad() {
    const pad = el('div', 'dpad');
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', 'Movement controls');

    const stop = () => { if (ctx) { clearInterval(ctx.repeat); ctx.repeat = 0; } };

    DPAD.forEach(({ key, label, cls, aria }) => {
        const b = el('button', `dpad__btn dpad__btn--${cls}`);
        b.type = 'button';
        b.textContent = label;
        b.setAttribute('aria-label', aria);

        b.addEventListener('pointerdown', e => {
            e.preventDefault();                       // no focus / text selection / double-tap zoom
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

/* Shared by keyboard and on-screen buttons */
function move(dir) {
    if (!ctx) return;

    if (!ctx.started) {
        ctx.started = true;
    }

    const now = performance.now();
    if (ctx.locked || now - ctx.lastMove < MOVE_THROTTLE_MS) return;
    ctx.lastMove = now;

    const r = ctx.player.r + dir[0], c = ctx.player.c + dir[1];
    if (isWall(r, c)) return;
    ctx.player = { r, c };
    place(ctx.bon, r, c);

    // Check if dog caught you immediately
    if (dogAt(r, c)) return caught();

    // Check if you reached Babar
    if (r === ctx.exit.r && c === ctx.exit.c) win();
}

function gameTick() {
    if (!ctx || ctx.locked || !ctx.started) return;

    // Move all dogs
    for (const d of ctx.dogs) {
        if (d.type === 'chaser') {
            // BFS Pathfinding to the player
            const nextStep = getNextStep(d.r, d.c, ctx.player.r, ctx.player.c);
            if (nextStep) {
                d.r = nextStep.r;
                d.c = nextStep.c;
                place(d.node, d.r, d.c);
            }
        } else if (d.type === 'patrol' && d.path.length > 1) {
            // Patrol logic
            let next = d.i + d.dir;
            if (next < 0 || next >= d.path.length) { d.dir *= -1; next = d.i + d.dir; }
            d.i = next;
            [d.r, d.c] = d.path[next];
            place(d.node, d.r, d.c);
        }
    }

    // Check for collisions after dogs move
    if (dogAt(ctx.player.r, ctx.player.c)) caught();
}

const dogAt = (r, c) => ctx.dogs.some(d => d.r === r && d.c === c);

function caught() {
    clearInterval(ctx.repeat);
    ctx.locked = true;
    ctx.started = false;
    ctx.player = { ...ctx.start };
    place(ctx.bon, ctx.start.r, ctx.start.c);

    // Reset chaser dog to start
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

/* ---------- Wiring: mount on entering, unmount on leaving ---------- */
document.addEventListener('stagechange', safely(e => {
    e.detail.stageId === STAGE_ID ? mount() : unmount();
}, { title: 'Could not load the maze' }));