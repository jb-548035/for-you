/* Stage 2: "Kwek-kwek Challenge" (best of 3 wins vs Babar) */
import { navigateToStage, showAlert, safely } from './app.js';
import { el, art, spriteImg, sfx } from './shared.js';

const STAGE_ID = 'rps';
const NEXT_STAGE = 'stage3';
const TOTAL_EGGS = 10;
const LOOP_MS = 5000;
const FINISH_DELAY_MS = 1500;
const INTRO_MS = 2200; // character entry animation duration

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

    host.replaceChildren(arena, reveal, scoreLabel, status, controls);

    const ac = new AbortController();
    ctx = {
        host, eggs, stick, babarWrap, bonWrap, reveal, status, controls, scoreLabel, bon,
        playerScore: 0, babarScore: 0, remaining: TOTAL_EGGS,
        locked: true, // start locked during intro animation
        timers: [], loopTimer: 0, ac,
    };

    controls.addEventListener('click', safely(onPick, { title: 'Kwek-kwek error' }), { signal: ac.signal });

    // Lock buttons during character entry animation
    lockButtons();
    const introTimer = setTimeout(() => {
        babarWrap.classList.remove('is-entering');
        bonWrap.classList.remove('is-entering');
        unlockButtons();
    }, INTRO_MS);
    ctx.timers.push(introTimer);
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
    clearTimeout(ctx.loopTimer);
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
        try { bonLoop(); } catch (e) { /* ignore */ }
    }
    ctx.scoreLabel.textContent = `Score — Bon ${ctx.playerScore} : ${ctx.babarScore} Babar`;

    // If no eggs remain — ALWAYS proceed to next stage (Task 7 fix)
    if (ctx.remaining <= 0) {
        ctx.locked = true;
        ctx.controls.querySelectorAll('button').forEach(b => b.disabled = true);

        if (ctx.playerScore > ctx.babarScore) {
            ctx.status.textContent = 'You ate the most kwek-kwek! Proceeding...';
        } else if (ctx.playerScore < ctx.babarScore) {
            ctx.status.textContent = 'Babar ate more, but the quest continues! Proceeding...';
        } else {
            ctx.status.textContent = 'Tie game! But the quest continues. Proceeding...';
        }
        ctx.timers.push(setTimeout(() => navigateToStage(NEXT_STAGE), FINISH_DELAY_MS));
    } else {
        if (winnerIsPlayer) babarLoop();
    }
}

function babarLoop() {
    const w = ctx.babarWrap;
    clearTimeout(ctx.loopTimer);
    w.classList.remove('is-looping');
    void w.offsetWidth;
    w.classList.add('is-looping');
    ctx.loopTimer = setTimeout(() => w.classList.remove('is-looping'), LOOP_MS);
}

function bonLoop() {
    const w = ctx.bonWrap;
    clearTimeout(ctx.loopTimer);
    w.classList.remove('is-looping');
    void w.offsetWidth;
    w.classList.add('is-looping');
    ctx.loopTimer = setTimeout(() => w.classList.remove('is-looping'), LOOP_MS);
}

document.addEventListener('stagechange', safely(e => {
    e.detail.stageId === STAGE_ID ? mount() : unmount();
}, { title: 'Could not load the challenge' }));

function bonRun() {
    if (!ctx || !ctx.bon) return;
    const b = ctx.bon;
    b.classList.remove('is-panicked');
    void b.offsetWidth;
    b.classList.add('is-panicked');
    const t = setTimeout(() => b.classList.remove('is-panicked'), 1200);
    ctx.timers.push(t);
}