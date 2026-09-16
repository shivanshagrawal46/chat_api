'use strict';

/** FNV-1a 32-bit hash of a string - cheap, deterministic, no dependencies. */
function hash(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/** Deterministically pick one variant from a list using a seed string. */
function pick(list, seed) {
    if (!Array.isArray(list) || list.length === 0) return '';
    if (list.length === 1) return list[0];
    return list[hash(seed) % list.length];
}

/**
 * Pick `n` consecutive (cyclic) items from a list, starting at a seeded
 * offset, so different charts surface different examples while the same
 * chart always gets the same ones.
 */
function pickSome(list, n, seed) {
    if (!Array.isArray(list) || list.length === 0) return [];
    if (list.length <= n) return list.slice();
    const start = hash(seed) % list.length;
    const out = [];
    for (let i = 0; i < n; i++) out.push(list[(start + i) % list.length]);
    return out;
}

/** "a, b and c" / "a, b और c" - switches to "; " when items already contain commas. */
function joinList(items, lang = 'en') {
    const arr = (items || []).filter(Boolean);
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    const conj = lang === 'hi' ? 'और' : 'and';
    const heavy = arr.some((x) => x.includes(','));
    const sep = heavy ? '; ' : ', ';
    const head = arr.slice(0, -1).join(sep);
    const last = arr[arr.length - 1];
    if (heavy && lang === 'en') return `${head}; ${conj} ${last}`;
    return `${head} ${conj} ${last}`;
}

function capFirst(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { hash, pick, pickSome, joinList, capFirst };
