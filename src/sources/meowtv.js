'use strict';

const GATE_V15 = 'https://gate.flicky.host/v15';
const GATE_V17 = 'https://gate.flicky.host/v17';
const GATE_V4 = 'https://gate.flicky.host/v4';
const REFERER = 'https://meowtv.ru';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36';

export const SKIP_VERIFY = true;
export const VERIFY_HEADERS = { 'User-Agent': UA, 'Referer': REFERER, 'Origin': REFERER };

const HEADERS = { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': REFERER, 'Origin': REFERER };
const OUT_HEADERS = { 'User-Agent': UA, 'Referer': REFERER, 'Origin': REFERER };

function path(type, id, s, e) {
    return s ? `/${type}/${id}/${s}/${e}` : `/${type}/${id}`;
}

async function fetchGate(base, type, id, s, e) {
    const res = await fetch(base + path(type, id, s, e), { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return res.json();
}

export async function getStream(id, s, e) {
    const type = s ? 'tv' : 'movie';
    const allUrls = [];

    try {
        const d = await fetchGate(GATE_V15, type, id, s, e);
        const url = typeof d?.stream === 'string' ? d.stream : d?.stream?.url;
        if (url?.startsWith('http')) allUrls.push({ url, headers: OUT_HEADERS });
    } catch { }

    try {
        const d = await fetchGate(GATE_V17, type, id, s, e);
        const url = typeof d?.stream === 'string' ? d.stream : d?.stream?.url;
        if (url?.startsWith('http')) allUrls.push({ url, headers: OUT_HEADERS });
    } catch { }

    try {
        const d = await fetchGate(GATE_V4, type, id, s, e);
        if (Array.isArray(d?.streams)) {
            for (const lang of ['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam']) {
                const s2 = d.streams.find(x => (x.language || '').toLowerCase() === lang.toLowerCase());
                if (s2?.url?.startsWith('http')) allUrls.push({ url: s2.url, headers: { ...OUT_HEADERS, ...(s2.headers || {}) } });
            }
        }
    } catch { }

    if (!allUrls.length) return null;
    return { ...allUrls[0], allUrls };
}