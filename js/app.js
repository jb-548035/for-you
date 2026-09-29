/* Game Manager: screen navigation + global error handling */

const STAGES = ['welcome', 'maze', 'rps', 'question', 'lotto'];
const TRANSITION_MS = 300;

/* Friendly aliases so game modules can say 'stage2' instead of 'rps' */
const STAGE_ALIASES = { stage1: 'maze', stage2: 'rps', stage3: 'question', stage4: 'lotto' };

const state = { current: 'welcome', busy: false };

/* ---------- Alert modal ---------- */
export function showAlert({ title = 'Something went wrong', message = 'Please try again.', actions, onClose } = {}) {
    const root = document.getElementById('alert-root');
    if (!root) return console.error(title, message);
    root.innerHTML = '';

    const backdrop = el('div', 'alert-backdrop');
    const box = el('div', 'alert');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.append(
        Object.assign(el('div', 'alert__icon'), { textContent: '!' }),
        Object.assign(el('h3', 'alert__title'), { textContent: title }),
        Object.assign(el('p', 'alert__msg'), { textContent: message })
    );

    const bar = el('div', 'alert__actions');
    const close = () => { root.innerHTML = ''; onClose?.(); };
    (actions || [{ label: 'Got it' }]).forEach(({ label, onClick }) => {
        const b = Object.assign(el('button', 'btn'), { textContent: label, type: 'button' });
        b.addEventListener('click', () => { close(); onClick?.(); });
        bar.append(b);
    });
    box.append(bar);
    backdrop.addEventListener('click', close);
    root.append(backdrop, box);
    bar.querySelector('button')?.focus();
}

function el(tag, cls) { const n = document.createElement(tag); n.className = cls; return n; }

/* ---------- Error wrapper ---------- */
export function safely(fn, { title, retry } = {}) {
    return async (...args) => {
        try { return await fn(...args); }
        catch (err) { reportError(err, { title, retry }); }
    };
}

function reportError(err, { title, retry } = {}) {
    console.error(err);
    const actions = [{ label: 'Close' }];
    if (retry) actions.unshift({ label: 'Retry', onClick: retry });
    showAlert({ title: title || 'Oops, Babar tripped', message: err?.message || String(err), actions });
}

/* Preload an image; rejects with a readable message */
export function loadAsset(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load asset: ${src}`));
        img.src = src;
    });
}

/* ---------- Navigation ---------- */
export async function navigateToStage(stageId) {
    stageId = STAGE_ALIASES[stageId] ?? stageId;
    if (state.busy) return;
    const next = document.querySelector(`[data-stage="${stageId}"]`);
    if (!STAGES.includes(stageId) || !next) {
        return reportError(new Error(`Unknown stage "${stageId}".`), { title: 'Screen not found' });
    }
    if (stageId === state.current) return;

    state.busy = true;
    try {
        const prev = document.querySelector(`[data-stage="${state.current}"]`);
        if (prev) {
            prev.classList.add('is-leaving');
            await new Promise(r => setTimeout(r, TRANSITION_MS));
            prev.classList.remove('is-leaving', 'is-active');
            prev.classList.add('screen--hidden');
        }
        next.classList.remove('screen--hidden');
        next.classList.add('is-active');
        state.current = stageId;
        document.dispatchEvent(new CustomEvent('stagechange', { detail: { stageId } }));
    } catch (err) {
        reportError(err, { title: 'Navigation failed' });
    } finally {
        state.busy = false;
    }
}

/* ---------- Boot ---------- */
function init() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-goto]');
        if (btn) navigateToStage(btn.dataset.goto);
    });

    // Asset fallbacks: any <img data-asset> that fails triggers the alert
    document.querySelectorAll('img[data-asset]').forEach(img =>
        img.addEventListener('error', () =>
            reportError(new Error(`Failed to load ${img.getAttribute('src')}`), { title: 'Missing asset' })));

    window.addEventListener('error', e => reportError(e.error || new Error(e.message)));
    window.addEventListener('unhandledrejection', e => reportError(e.reason));
}

document.addEventListener('DOMContentLoaded', init);
window.Game = { navigateToStage, showAlert, safely, loadAsset };