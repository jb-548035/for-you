/* Stage 2: "Kwek-kwek Challenge" (buttons locked during intro; always proceeds to next stage) */
import { navigateToStage, showAlert, safely } from './app.js';
import { el, art, spriteImg, sfx } from './shared.js';

const STAGE_ID = 'rps';
const NEXT_STAGE = 'stage3';
const TOTAL_EGGS = 10;
const LOOP_MS = 2000;
const INTRO_MS = 1000; // character entry animation duration

const HANDS = { rock: '✊', paper: '✋', scissors: '✌️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const LABEL = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

let ctx = null;

function mount() {
    const host = document.getElementById('rps-container');
    if (!host || ctx) return;

    const bon = el('div', 'rps-actor');
    const bonWrap = el('div', 'rps-bon is-entering');
    bonWrap.append(spriteImg('assets/bon-grin.png', 'Bon', () => art.pajamas('#8fb0f0'), 'rps-sprite'));
    bon.append(bonWrap, el('span', 'rps-name', 'Bon'));

    const babarSprite = spriteImg('assets/babar-grin.png', 'Babar', () => art.pajamas('#f0a8b8'), 'rps-sprite');
    const babar = el('div', 'rps-actor');
    const babarWrap = el('div', 'rps-babar is-entering');
    babarWrap.append(babarSprite);
    babar.append(babarWrap, el('span', 'rps-name', 'Babar'));

    const stick = el('div', 'stick');
    stick.setAttribute('role', 'img');
    stick.setAttribute('aria-label', `${TOTAL_EGGS} kwek-kwek on the stick`);
    const eggs = Array.from({ length: TOTAL_EGGS }, () => { const n = el('div', 'stick__egg'); stick.appendChild(n); return n; });

    const arena = el('div', 'rps-arena');
    arena.append(bon, stick, babar);

    const reveal = el('p', 'rps-reveal', 'Pick one to win a kwek-kwek!');
    const status = el('p', 'rps-status');
    const scoreLabel = el('p', 'rps-score', `Score — Bon 0 : 0 Babar`);
    status.setAttribute('role', 'alert');

    const controls = el('div', 'rps-controls');
    Object.keys(HANDS).forEach(k => {
        const b = el('button', 'btn rps-btn');
        b.type = 'button'; b.dataset.hand = k;
        b.append(el('span', 'rps-btn__icon', HANDS[k]), el('span', '', LABEL[k]));
        controls.append(b);
    });

    // Single source of truth: CSS animation durations come from these constants
    host.style.setProperty('--intro-ms', INTRO_MS + 'ms');
    host.style.setProperty('--loop-ms', LOOP_MS + 'ms');

    host.replaceChildren(arena, reveal, scoreLabel, status, controls);

    const ac = new AbortController();
    ctx = {
        host, eggs, stick, babarWrap, bonWrap, reveal, status, controls, scoreLabel, bon,
        playerScore: 0, babarScore: 0, remaining: TOTAL_EGGS,
        locked: true, // start locked during intro animation
        timers: [], ac,
        pending: 0,      // animations currently blocking input
        finished: false, // game over: buttons stay locked
    };

    controls.addEventListener('click', safely(onPick, { title: 'Kwek-kwek error' }), { signal: ac.signal });

    // Buttons stay locked until BOTH entry animations have actually finished
    // (animationend), with a fallback timer in case an animation never fires.
    const intro = Promise.race([
        Promise.all([animationEnd(bonWrap), animationEnd(babarWrap)]),
        wait(INTRO_MS + 600),
    ]).then(() => {
        if (!ctx) return;
        babarWrap.classList.remove('is-entering');
        bonWrap.classList.remove('is-entering');
    });
    lockUntil(intro);
}

/* ---------- Animation-lock helpers ---------- */
function wait(ms) {
    return new Promise(res => { if (ctx) ctx.timers.push(setTimeout(res, ms)); });
}

function animationEnd(node) {
    return new Promise(res => {
        const onEnd = e => {
            if (e.target !== node) return;
            node.removeEventListener('animationend', onEnd);
            res();
        };
        node.addEventListener('animationend', onEnd);
    });
}

/* Lock the buttons until `promise` settles. Overlapping animations stack. */
function lockUntil(promise) {
    if (!ctx) return;
    const c = ctx;
    c.pending += 1;
    lockButtons();
    promise.then(() => {
        if (ctx !== c) return;              // stage was left / restarted
        c.pending -= 1;
        if (c.pending === 0 && !c.finished) unlockButtons();
    });
}

function lockButtons() {
    if (!ctx) return;
    ctx.locked = true;
    ctx.controls.querySelectorAll('button').forEach(b => {
        b.disabled = true;
        b.setAttribute('aria-disabled', 'true');
    });
}

function unlockButtons() {
    if (!ctx) return;
    ctx.locked = false;
    ctx.controls.querySelectorAll('button').forEach(b => {
        b.disabled = false;
        b.removeAttribute('aria-disabled');
    });
}

function unmount() {
    if (!ctx) return;
    ctx.ac.abort();
    ctx.timers.forEach(clearTimeout);
    ctx.host.replaceChildren();
    ctx = null;
}

function onPick(e) {
    const btn = e.target.closest('[data-hand]');
    if (!btn || !ctx || ctx.locked) return;

    const player = btn.dataset.hand;
    const keys = Object.keys(HANDS);
    const babar = keys[Math.floor(Math.random() * keys.length)];
    ctx.reveal.textContent = `Bon ${HANDS[player]}  vs  ${HANDS[babar]} Babar`;

    if (player === babar) {
        sfx.tie();
        ctx.status.textContent = 'Tie! No one eats this round.';
        return;
    }

    const winnerIsPlayer = (BEATS[player] === babar);
    const eggIndex = ctx.remaining - 1;
    const egg = ctx.eggs[eggIndex];
    if (egg) {
        egg.classList.add('is-eaten');
        egg.classList.add(winnerIsPlayer ? 'is-eaten-player' : 'is-eaten-babar');
    }
    ctx.remaining -= 1;
    ctx.stick.setAttribute('aria-label', `${ctx.remaining} kwek-kwek left on the stick`);

    if (winnerIsPlayer) {
        sfx.win();
        ctx.playerScore += 1;
        ctx.status.textContent = `You ate one! (${ctx.playerScore} - ${ctx.babarScore})`;
    } else {
        sfx.lose();
        ctx.babarScore += 1;
        ctx.status.textContent = `Babar ate one! (${ctx.playerScore} - ${ctx.babarScore})`;
    }
    ctx.scoreLabel.textContent = `Score — Bon ${ctx.playerScore} : ${ctx.babarScore} Babar`;

    // The loser hops up and back; buttons stay locked until that animation ends
    const hopDone = hop(winnerIsPlayer ? ctx.babarWrap : ctx.bonWrap);

    // No eggs left: wait for the last animation, then show the final result
    if (ctx.remaining <= 0) {
        ctx.finished = true;
        lockButtons();
        hopDone.then(showResult);
    }
}

/* Loser animation: up, then back to origin. Resolves when the animation has ended. */
function hop(node) {
    const c = ctx;
    node.classList.remove('is-looping');
    void node.offsetWidth;                       // restart the animation
    node.classList.add('is-looping');

    const ended = Promise.race([
        new Promise(res => {
            const onEnd = e => {
                if (e.target !== node) return;
                node.removeEventListener('animationend', onEnd);
                res();
            };
            node.addEventListener('animationend', onEnd);
        }),
        wait(LOOP_MS + 300),                     // fallback if animationend never fires
    ]).then(() => { if (ctx === c) node.classList.remove('is-looping'); });

    lockUntil(ended);
    return ended;
}

/* Final message: who won + score. Continues to the next stage when dismissed. */
function showResult() {
    if (!ctx) return;
    const p = ctx.playerScore, b = ctx.babarScore;
    const title = p > b ? 'Bon wins!' : p < b ? 'Babar wins!' : "It's a tie!";
    ctx.status.textContent = `${title} Final score — Bon ${p} : ${b} Babar`;
    showAlert({
        title,
        message: `Final score — Bon ${p} : ${b} Babar. The quest continues!`,
        actions: [{ label: 'Next stage' }],
        onClose: () => navigateToStage(NEXT_STAGE),
    });
}

document.addEventListener('stagechange', safely(e => {
    e.detail.stageId === STAGE_ID ? mount() : unmount();
}, { title: 'Could not load the challenge' }));