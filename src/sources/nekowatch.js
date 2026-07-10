import { fetchJson, fetchText, getTmdbInfo, tmdbToAnilist } from '../utils/helpers.js';

const BASE_URL = "https://nekowatch.xyz";
const ANIME_JS_URL = `${BASE_URL}/js/anime.js?v=v263_fast_player_start`;
const FALLBACK_ORDER = ['kiwi', 'ally', 'bee', 'arc', 'anikoto', 'jet', 'bonk', 'moo', 'hop', 'pulsar', 'pahe'];

let providerOrderCache = null, providerOrderTs = 0;

async function getProviderOrder() {
    const now = Date.now();
    if (providerOrderCache && now - providerOrderTs < 1800000) return providerOrderCache;
    try {
        const js = await fetchText(ANIME_JS_URL, { signal: AbortSignal.timeout(6000) });
        const match = js.match(/PROVIDER_ORDER\s*=\s*\[([\s\S]*?)\]/);
        if (match) {
            const order = [...match[1].matchAll(/['"]([a-z0-9_]+)['"]/gi)].map(m => m[1]);
            if (order.length) { providerOrderCache = order; providerOrderTs = now; return order; }
        }
    } catch { }
    return providerOrderCache || FALLBACK_ORDER;
}

export async function getStream({ id, s, e, audio }) {
    try {
        const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
        if (!info || !info.isAnime) return null;
        const anilistId = await tmdbToAnilist(id, s ? 'tv' : 'movie', s, info.titles, info.year);
        if (!anilistId) return null;
        const ep = e || 1;
        const audiosToTry = audio === "all" ? ["sub", "dub"] : (audio === "dub" ? ["dub", "sub"] : ["sub", "dub"]);
        const providerOrder = await getProviderOrder();
        for (const aud of audiosToTry) {
            const results = await Promise.allSettled(providerOrder.map(p => fetchJson(`${BASE_URL}/api/anime/watch/${p}/${anilistId}/${aud}/${p}-${ep}`, { signal: AbortSignal.timeout(8000) })));
            const allUrls = [], seenActual = new Set();
            for (const r of results) {
                if (r.status !== 'fulfilled' || !r.value) continue;
                const data = r.value;
                let streams = [], actual = data.attempted?.actualProvider || data.provider;
                if (Array.isArray(data.streams)) streams = data.streams;
                else {
                    for (const key of Object.keys(data)) if (data[key] && Array.isArray(data[key].streams)) { streams.push(...data[key].streams); if (!actual) actual = data[key].provider || key; }
                }
                if (!streams.length) continue;
                if (actual) { if (seenActual.has(actual)) continue; seenActual.add(actual); }
                const valid = streams.filter(st => st.type === "hls" && st.url).sort((a, b) => (b.priority || 0) - (a.priority || 0));
                for (const st of valid) allUrls.push({ url: st.url, type: "hls", audio: aud, server: st.server ? `NekoWatch-${st.server}` : "NekoWatch", headers: st.referer ? { Referer: st.referer } : undefined, skipProxy: /\.workers\.dev(\/|$)/i.test(st.url) });
            }
            if (allUrls.length) return { allUrls };
        }
        return null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? [...new Set(stream.allUrls.map(u => u.server))] : [];
}