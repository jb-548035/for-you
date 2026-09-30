/* Stage 2: "Kwek-kwek Challenge" (most kwek-kwek eaten wins) */
import { navigateToStage, safely } from './app.js';
import { el, art, spriteImg, sfx } from './shared.js';

const STAGE_ID = 'rps';
const NEXT_STAGE = 'stage3';
const TOTAL_EGGS = 10;
const LOOP_MS = 2000;     // hop length; sent to CSS as --loop-ms so JS and CSS never disagree
const INTRO_MS = 2200;    // entry animation length; sent to CSS as --intro-ms

const HANDS = { rock: '✊', paper: '✋', scissors: '✌️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const LABEL = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

const SPRITES = {
    bon: { idle: 'assets/bon-grin.png', run: 'assets/bon-running.png', fallback: () => art.pajamas('#8fb0f0') },
    babar: { idle: 'assets/babar-grin.png', run: 'assets/babar-running.png', fallback: () => art.pajamas('#f0a8b8') },
};

let ctx = null;

const preload = src => new Promise(res => {
    const i = new Image();
    i.onload = () => res(true);
    i.onerror = () => res(false);
    i.src = src;
});

/* One player column: [sprite] / NAME / Score: n  (sprite is positioned directly above the name plate) */
function buildActor(key, plate) {
    const set = SPRITES[key];
    const wrap = el('div', `rps-${key} is-entering`);
    const img = spriteImg(set.idle, plate, set.fallback, 'rps-sprite');
    wrap.append(img);
    const score = el('span', 'rps-score', 'Score: 0');
    const root = el('div', 'rps-actor');
    root.append(wrap, el('span', 'rps-name', plate), score);
    return { root, wrap, img, score, set };
}

/* ---------- Lifecycle ---------- */
function mount() {
    const host = document.getElementById('rps-container');
    if (!host || ctx) return;
    host.style.setProperty('--loop-ms', LOOP_MS + 'ms');
    host.style.setProperty('--intro-ms', INTRO_MS + 'ms');

    const actors = { bon: buildActor('bon', 'BON'), babar: buildActor('babar', 'BAR') };

    const stick = el('div', 'stick');
    stick.setAttribute('role', 'img');
    stick.setAttribute('aria-label', `${TOTAL_EGGS} kwek-kwek on the stick`);
    const eggs = Array.from({ length: TOTAL_EGGS }, () => stick.appendChild(el('div', 'stick__egg')));

    const arena = el('div', 'rps-arena');
    arena.append(actors.bon.root, stick, actors.babar.root);

    /* Centre display: empty until a hand is picked, then "✊ VS ✋" */
    const reveal = el('p', 'rps-vs');
    reveal.setAttribute('aria-live', 'polite');

    const status = el('p', 'rps-status');
    status.setAttribute('role', 'alert');

    const controls = el('div', 'rps-controls');
    Object.keys(HANDS).forEach(k => {
        const b = el('button', 'btn rps-btn');
        b.type = 'button'; b.dataset.hand = k;
        b.append(el('span', 'rps-btn__icon', HANDS[k]), el('span', 'rps-btn__label', LABEL[k]));
        controls.append(b);
    });

    host.replaceChildren(arena, reveal, status, controls);

    const ac = new AbortController();
    ctx = {
        host, eggs, stick, actors, reveal, status, controls,
        playerScore: 0, babarScore: 0, remaining: TOTAL_EGGS,
        locked: true, runOk: { bon: false, babar: false },
        timers: [], loopTimers: { bon: 0, babar: 0 }, ac,
    };

    /* Cache the running sprites so the swap is instant; if one is missing, that actor just keeps its grin */
    const c = ctx;
    ['bon', 'babar'].forEach(k => preload(SPRITES[k].run).then(ok => { if (ctx === c) c.runOk[k] = ok; }));

    controls.addEventListener('click', safely(onPick, { title: 'Kwek-kwek error' }), { signal: ac.signal });

    setButtons(false);
    ctx.timers.push(setTimeout(() => {
        actors.bon.wrap.classList.remove('is-entering');
        actors.babar.wrap.classList.remove('is-entering');
        setButtons(true);
    }, INTRO_MS));
}

function setButtons(enabled) {
    if (!ctx) return;
    ctx.locked = !enabled;
    ctx.controls.querySelectorAll('button').forEach(b => {
        b.disabled = !enabled;
        enabled ? b.removeAttribute('aria-disabled') : b.setAttribute('aria-disabled', 'true');
    });
}

function unmount() {
    if (!ctx) return;
    ctx.ac.abort();
    ctx.timers.forEach(clearTimeout);
    Object.values(ctx.loopTimers).forEach(clearTimeout);
    document.querySelectorAll('.winner-popup').forEach(n => n.remove());
    ctx.host.replaceChildren();
    ctx = null;
}

/* ---------- Gameplay ---------- */
function onPick(e) {
    const btn = e.target.closest('[data-hand]');
    if (!btn || !ctx || ctx.locked) return;

    const player = btn.dataset.hand;
    const keys = Object.keys(HANDS);
    const babar = keys[Math.floor(Math.random() * keys.length)];
    ctx.reveal.textContent = `${HANDS[player]} VS ${HANDS[babar]}`;

    if (player === babar) {
        sfx.tie();
        ctx.status.textContent = 'Tie! No one eats this round.';
        return;
    }
    ctx.status.textContent = '';

    const winnerIsPlayer = BEATS[player] === babar;
    const egg = ctx.eggs[ctx.remaining - 1];
    if (egg) egg.classList.add('is-eaten', winnerIsPlayer ? 'is-eaten-player' : 'is-eaten-babar');
    ctx.remaining -= 1;
    ctx.stick.setAttribute('aria-label', `${ctx.remaining} kwek-kwek left on the stick`);

    if (winnerIsPlayer) {
        sfx.win();
        ctx.playerScore += 1;
        hopActor('babar');           // the loser of the round hops
    } else {
        sfx.lose();
        ctx.babarScore += 1;
        hopActor('bon');
    }
    ctx.actors.bon.score.textContent = `Score: ${ctx.playerScore}`;
    ctx.actors.babar.score.textContent = `Score: ${ctx.babarScore}`;

    if (ctx.remaining <= 0) {
        setButtons(false);           // freeze: nothing can change until the popup's OK is pressed
        const winner = ctx.playerScore > ctx.babarScore ? 'BON' : ctx.babarScore > ctx.playerScore ? 'BABAR' : 'NOBODY';
        ctx.timers.push(setTimeout(() => showWinnerPopup(winner), LOOP_MS + 100));   // let the last hop land first
    }
}

/* ---------- Loser hop: running sprite for the whole jump, grin again on landing ---------- */
async function hopActor(key) {
    if (!ctx) return;
    const a = ctx.actors[key];
    a.hopAbort?.abort();                                  // cancel any hop still in flight for this actor
    const ac = new AbortController();
    a.hopAbort = ac;
    clearTimeout(ctx.loopTimers[key]);

    const restore = () => {
        ac.abort();
        clearTimeout(ctx?.loopTimers[key]);
        a.img.src = a.set.idle;                           // back to the default grin
        a.wrap.classList.remove('is-looping');
    };

    if (ctx.runOk[key]) {
        a.img.src = a.set.run;
        try { await a.img.decode(); } catch { /* still fine to animate */ }
        if (!ctx || a.hopAbort !== ac) return;            // unmounted or superseded while decoding
    }

    a.wrap.classList.remove('is-looping');
    void a.wrap.offsetWidth;                              // restart the animation cleanly
    a.wrap.classList.add('is-looping');

    a.wrap.addEventListener('animationend', e => { if (e.target === a.wrap) restore(); }, { signal: ac.signal });
    ctx.loopTimers[key] = setTimeout(restore, LOOP_MS + 150);   // safety net if animationend never fires
}

/* ---------- Winner popup: stays until OK is clicked ---------- */
function showWinnerPopup(winnerName) {
    if (!ctx) return;
    document.querySelectorAll('.winner-popup').forEach(n => n.remove());

    const overlay = el('div', 'winner-popup');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', winnerName === 'NOBODY' ? 'Nobody won this challenge' : `${winnerName} won this challenge`);

    const win = el('div', 'winner-popup__window');
    const bar = el('div', 'winner-popup__bar');
    bar.append(el('span', 'winner-popup__ctrl', '–'), el('span', 'winner-popup__ctrl', '▢'), el('span', 'winner-popup__ctrl winner-popup__ctrl--close', '✕'));

    const heading = el('div', 'winner-popup__heading', winnerName === 'NOBODY' ? 'NO ONE WON' : `${winnerName} WON`);

    const trophy = el('div', 'winner-popup__trophy');
    trophy.innerHTML = `
        <svg viewBox="0 0 64 64" width="120" height="120" shape-rendering="crispEdges" aria-hidden="true">
            <rect x="22" y="8"  width="20" height="4"  fill="#f5c518"/>
            <rect x="18" y="12" width="28" height="14" fill="#f5c518"/>
            <rect x="22" y="26" width="20" height="4"  fill="#c8a415"/>
            <rect x="18" y="12" width="4"  height="14" fill="#c8a415"/>
            <rect x="42" y="12" width="4"  height="14" fill="#c8a415"/>
            <rect x="10" y="12" width="6"  height="10" fill="#c8a415"/>
            <rect x="48" y="12" width="6"  height="10" fill="#c8a415"/>
            <rect x="8"  y="10" width="6"  height="4"  fill="#f5c518"/>
            <rect x="50" y="10" width="6"  height="4"  fill="#f5c518"/>
            <rect x="28" y="30" width="8"  height="10" fill="#8a6a00"/>
            <rect x="22" y="40" width="20" height="6"  fill="#c8a415"/>
            <rect x="18" y="46" width="28" height="12" fill="#7bc47f"/>
            <rect x="18" y="46" width="28" height="12" fill="none" stroke="#2b3952" stroke-width="2"/>
            <rect x="4"  y="24" width="3"  height="3"  fill="#2b3952"/>
            <rect x="0"  y="28" width="3"  height="3"  fill="#2b3952"/>
            <rect x="57" y="24" width="3"  height="3"  fill="#2b3952"/>
            <rect x="60" y="28" width="3"  height="3"  fill="#2b3952"/>
        </svg>`;

    const sub = el('div', 'winner-popup__sub', 'THIS CHALLENGE.');

    const actions = el('div', 'winner-popup__actions');
    const ok = el('button', 'btn btn--primary winner-popup__ok', 'OK');
    ok.type = 'button';
    actions.append(ok);

    win.append(bar, heading, trophy, sub, actions);
    overlay.append(win);
    (document.getElementById('alert-root') || document.body).append(overlay);

    ok.addEventListener('click', safely(() => {
        ok.disabled = true;
        overlay.classList.add('winner-popup--leaving');
        setTimeout(() => overlay.remove(), 300);
        return navigateToStage(NEXT_STAGE);
    }), { once: true, signal: ctx.ac.signal });
    requestAnimationFrame(() => ok.focus());
}

document.addEventListener('stagechange', safely(e => {
    e.detail.stageId === STAGE_ID ? mount() : unmount();
}, { title: 'Could not load the challenge' }));