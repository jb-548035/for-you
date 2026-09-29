/* Shared helpers: DOM, placeholder pixel sprites, synthesized sound effects, script loader */

export function el(tag, cls = '', text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

/* ---------- Placeholder art (inline SVG). Real files in assets/ win when present. ---------- */
const toUri = svg => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'>${svg}</svg>`);
const px = (x, y, w, h, f) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${f}'/>`;
const face = px(4, 3, 8, 5, '#f6d7b8') + px(6, 5, 1, 1, '#333') + px(9, 5, 1, 1, '#333');

export const art = {
    pajamas: c => toUri(face + px(4, 1, 8, 2, '#5a4636') + px(3, 8, 10, 7, c) + px(3, 10, 10, 1, '#fff') + px(3, 13, 10, 1, '#fff')),
    santa: () => toUri(px(4, 0, 8, 3, '#d32f2f') + px(11, 0, 3, 2, '#fff') + px(3, 3, 10, 1, '#fff') + face
        + px(5, 7, 6, 2, '#fff') + px(3, 9, 10, 6, '#d32f2f') + px(3, 12, 10, 1, '#222') + px(7, 12, 2, 1, '#f0c040')),
};

export function spriteImg(src, alt, fallback, cls = '') {
    const img = el('img', cls);
    img.alt = alt;
    img.draggable = false;
    img.addEventListener('error', () => { img.src = fallback(); }, { once: true });
    img.src = src;
    return img;
}

/* ---------- Sound effects (WebAudio, no files needed) ---------- */
let ac = null;
function tone(freq, start, dur, type = 'square', vol = 0.07) {
    try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
        const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + start;
        o.type = type; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
    } catch { /* audio is optional: never break the game */ }
}
const seq = (notes, step, dur, type) => notes.forEach((f, i) => tone(f, i * step, dur, type));
export const sfx = {
    win: () => seq([523, 659, 784, 1047], 0.09, 0.14),
    lose: () => seq([330, 262, 196], 0.14, 0.2, 'sawtooth'),
    tie: () => seq([392, 392], 0.12, 0.1, 'triangle'),
    cheer: () => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.08, 0.16),
    reveal: () => seq([784, 988, 1175, 1568], 0.08, 0.16),
};

/* ---------- Lazy script loader (deduped) ---------- */
const loaded = new Map();
export function loadScript(url) {
    if (!loaded.has(url)) {
        loaded.set(url, new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url; s.async = true;
            s.onload = resolve;
            s.onerror = () => { loaded.delete(url); s.remove(); reject(new Error(`Could not load ${url}`)); };
            document.head.append(s);
        }));
    }
    return loaded.get(url);
}