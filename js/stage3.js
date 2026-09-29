/* Stage 3: "Annoying Yes Button" */
import { navigateToStage, safely } from './app.js';
import { el, sfx } from './shared.js';

const STAGE_ID = 'question';
const NEXT_STAGE = 'stage4';
const ADVANCE_DELAY_MS = 1400;
const MARGIN_PCT = 2;

/* Final choice, readable by other modules (also kept in sessionStorage) */
export const answers = { cuter: null };

let ctx = null;

function mount() {
    const host = document.getElementById('question-container');
    if (!host || ctx) return;

    const header = el('h3', 'question-header', 'Mas cute si Babar or Bon2?');
    const yes = el('button', 'btn btn--primary question-yes', 'BON');
    const no = el('button', 'btn question-no', 'BABAR');
    yes.type = no.type = 'button';

    const slot = el('div', 'question-slot');       // holds Yes's place once it starts running away
    slot.append(yes);
    const row = el('div', 'question-choices');
    row.append(slot, no);
    const note = el('p', 'question-note');
    note.setAttribute('aria-live', 'polite');
    host.replaceChildren(header, row, note);

    const ac = new AbortController();
    const { signal } = ac;
    ctx = { host, yes, no, slot, note, header, ac, done: false, timer: 0, fled: false };

    const flee = safely(e => { if (!ctx.done) { e.preventDefault?.(); runAway(); } }, { title: 'Button error' });
    ['pointerenter', 'pointerdown', 'click', 'touchstart', 'focus'].forEach(t =>
        yes.addEventListener(t, flee, { signal, passive: false }));
    window.addEventListener('resize', () => ctx.fled && runAway(), { signal });
    no.addEventListener('click', safely(onNo, { title: 'Button error' }), { signal });
}

function unmount() {
    if (!ctx) return;
    ctx.ac.abort();
    clearTimeout(ctx.timer);
    ctx.yes.remove();               // Yes may live on <body> while fleeing
    ctx.host.replaceChildren();
    ctx = null;
}

/* Pick a fresh random top/left (in % of the viewport), away from the No button and the last spot */
function runAway() {
    const { yes, no, slot } = ctx;
    if (!ctx.fled) {
        const r = yes.getBoundingClientRect();
        slot.style.width = r.width + 'px';
        slot.style.height = r.height + 'px';
        document.body.append(yes);    // position: fixed is measured from the viewport, not from a transformed panel
        yes.classList.add('is-fleeing');
        ctx.fled = true;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    const b = yes.getBoundingClientRect();
    const maxLeft = Math.max(MARGIN_PCT, 100 - (b.width / vw) * 100 - MARGIN_PCT);
    const maxTop = Math.max(MARGIN_PCT, 100 - (b.height / vh) * 100 - MARGIN_PCT);
    const noBox = no.getBoundingClientRect();
    const from = { x: b.left, y: b.top };

    let left = 0, top = 0;
    for (let i = 0; i < 12; i++) {
        left = MARGIN_PCT + Math.random() * (maxLeft - MARGIN_PCT);
        top = MARGIN_PCT + Math.random() * (maxTop - MARGIN_PCT);
        const x = (left / 100) * vw, y = (top / 100) * vh;
        const hitsNo = x < noBox.right + 16 && x + b.width > noBox.left - 16 && y < noBox.bottom + 16 && y + b.height > noBox.top - 16;
        const tooClose = Math.hypot(x - from.x, y - from.y) < Math.min(vw, vh) * 0.25;
        if (!hitsNo && !tooClose) break;
    }
    yes.style.left = left.toFixed(1) + '%';
    yes.style.top = top.toFixed(1) + '%';
    yes.blur();
}

function onNo() {
    if (ctx.done) return;
    ctx.done = true;
    answers.cuter = 'No';
    try { sessionStorage.setItem('babar.cuter', 'No'); } catch { /* storage is optional */ }
    document.dispatchEvent(new CustomEvent('answer', { detail: { question: 'cuter', value: 'No' } }));

    sfx.cheer();
    ctx.no.disabled = true;
    ctx.yes.disabled = true;
    ctx.yes.classList.add('is-gone');
    ctx.note.textContent = 'TAMA!';
    ctx.timer = setTimeout(() => navigateToStage(NEXT_STAGE), ADVANCE_DELAY_MS);
}

document.addEventListener('stagechange', safely(e => {
    e.detail.stageId === STAGE_ID ? mount() : unmount();
}, { title: 'Could not load the question' }));