/* Stage 4: "Supermarket Last Quest" (two-circle scratch-off, one chance) */
import { safely } from './app.js';
import { el, sfx } from './shared.js';

const STAGE_ID = 'lotto';
const SIZE = 160;          // circle size in css px (also sent to CSS as --node-size)
const BRUSH = 28;          // scratch brush width in css px
const DRAG_MIN = 6;        // px of travel while the button is held before a drag counts and the choice locks in
const REVEAL_AT = 0.5;     // fraction of the coating that must be cleared
const CHECK_MS = 90;

const OPTIONS = [
    { id: 1, img: 'assets/gift-item1.png', label: 'FOOD & DRINK VOUCHER', color: '#e8b94a' },
    { id: 2, img: 'assets/gift-item2.png', label: 'GREEN ITEM VOUCHER', color: '#5fb8a0' },
];
const CLAIM_TEXT = 'SHOW THIS TO BABAR TO CLAIM PRIZE NEXT KITA NINYO.';
const SCREENSHOT_TEXT = 'Take a screenshot of this screen so your win is on record.';

let ctx = null;

/* ---------- Lifecycle ---------- */
function mount() {
    const host = document.getElementById('lotto-container');
    if (!host || ctx) return;

    const hint = el('p', 'lotto-hint', 'Pick ONE circle. Hold your left mouse button and drag to scratch. You only get one chance.');
    const ticket = el('div', 'lotto-ticket');
    const result = el('div', 'lotto-result');
    host.replaceChildren(hint, ticket, result);

    const ac = new AbortController();
    ctx = { host, ticket, result, ac, nodes: [], active: null, chosen: null, done: false };
    ctx.nodes = OPTIONS.map(opt => buildNode(opt, ticket));

    /* Window-level move/up so the stroke keeps working when the cursor leaves the circle */
    const o = { signal: ac.signal, passive: false };
    window.addEventListener('mousemove', safely(e => scratch(e.clientX, e.clientY, e), { title: 'Scratch error' }), o);
    window.addEventListener('mouseup', e => { if (e.button === 0) endStroke(); }, { signal: ac.signal });
    window.addEventListener('touchmove', safely(e => { const t = e.touches[0]; if (t) scratch(t.clientX, t.clientY, e); }, { title: 'Scratch error' }), o);
    window.addEventListener('touchend', () => endStroke(), { signal: ac.signal });
    window.addEventListener('touchcancel', () => endStroke(), { signal: ac.signal });
}

function unmount() {
    if (!ctx) return;
    ctx.ac.abort();
    ctx.host.replaceChildren();
    ctx = null;
}

/* ---------- Scratch circles ---------- */
function buildNode(opt, parent) {
    const wrap = el('div', 'scratch-node');
    wrap.style.setProperty('--node-size', SIZE + 'px');
    wrap.setAttribute('aria-label', `Scratch option ${opt.id}`);

    /* Hidden layer: voucher graphic + label card text */
    const under = el('div', 'scratch-under');
    const img = document.createElement('img');
    img.src = opt.img;
    img.alt = opt.label;
    img.draggable = false;
    img.className = 'scratch-gift';
    img.addEventListener('error', () => img.remove(), { once: true });   // missing art: label still shows
    under.append(img, el('span', 'scratch-prize', opt.label));

    /* Mask layer */
    const canvas = el('canvas', 'scratch-canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.height = Math.round(SIZE * dpr);
    canvas.style.width = canvas.style.height = SIZE + 'px';
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.scale(dpr, dpr);
    g.fillStyle = opt.color;
    g.beginPath(); g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < 110; i++) g.fillRect(Math.random() * SIZE, Math.random() * SIZE, 3, 3);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.font = '12px "Press Start 2P", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SCRATCH', SIZE / 2, SIZE / 2);

    const node = { opt, wrap, canvas, g, last: null, travel: 0, lastCheck: 0, opaque0: countOpaque(g, canvas) };
    wrap.append(under, canvas);
    parent.append(wrap);

    const press = safely((x, y, e) => {
        if (ctx.done) return;
        if (ctx.chosen && ctx.chosen !== node) return;               // the other circle is locked out
        if (wrap.classList.contains('is-locked')) return;
        e.preventDefault();
        ctx.active = node;
        node.last = toLocal(node, x, y);
        node.travel = 0;                                             // a bare click is not a scratch; a drag is
    });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) press(e.clientX, e.clientY, e); }, { signal: ctx.ac.signal });
    canvas.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) press(t.clientX, t.clientY, e); }, { signal: ctx.ac.signal, passive: false });
    return node;
}

const toLocal = (node, x, y) => {
    const r = node.canvas.getBoundingClientRect();
    return { x: ((x - r.left) / r.width) * SIZE, y: ((y - r.top) / r.height) * SIZE };
};

function dab(node, from, to) {
    const g = node.g;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = BRUSH;
    g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(to.x, to.y); g.stroke();
    g.restore();
}

/* The first real drag on a circle locks that choice in and shuts the other one */
function lockIn(node) {
    ctx.chosen = node;
    ctx.nodes.filter(n => n !== node).forEach(n => {
        n.wrap.classList.add('is-locked');
        n.wrap.setAttribute('aria-disabled', 'true');
    });
    node.wrap.classList.add('is-chosen');
}

function scratch(x, y, e) {
    const node = ctx?.active;
    if (!node || ctx.done) return;
    e.preventDefault();
    const p = toLocal(node, x, y);
    node.travel += Math.hypot(p.x - node.last.x, p.y - node.last.y);

    if (!ctx.chosen) {
        if (node.travel < DRAG_MIN) return;                          // not a drag yet: keep the anchor point, don't scratch
        lockIn(node);
    }
    dab(node, node.last, p);
    node.last = p;

    const now = performance.now();
    if (now - node.lastCheck > CHECK_MS) { node.lastCheck = now; checkProgress(node); }
}

function endStroke() {
    if (!ctx?.active) return;
    const node = ctx.active;
    ctx.active = null;
    node.last = null;
    if (ctx.chosen === node) checkProgress(node);
}

const countOpaque = (g, canvas) => {
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 128) n++;      // every 4th pixel is plenty
    return n || 1;
};

function checkProgress(node) {
    if (ctx.done) return;
    const cleared = 1 - countOpaque(node.g, node.canvas) / node.opaque0;
    if (cleared >= REVEAL_AT) claim(node);
}

/* ---------- Claim card (permanent) ---------- */
function claim(node) {
    ctx.done = true;
    ctx.active = null;
    sfx.reveal();
    node.canvas.classList.add('is-revealed');                        // clears the rest of the coating

    const card = el('div', 'lotto-claim');
    card.setAttribute('role', 'status');
    card.append(
        el('p', 'lotto-claim__prize', `YOU WON: ${node.opt.label}`),
        el('p', 'lotto-claim__text', CLAIM_TEXT),
        el('p', 'lotto-claim__shot', SCREENSHOT_TEXT),
    );
    ctx.result.replaceChildren(card);
}

document.addEventListener('stagechange', safely(e => {
    e.detail.stageId === STAGE_ID ? mount() : unmount();
}, { title: 'Could not load the lotto' }));