'use strict';

import { getTmdbInfo, tmdbToAnilist } from '../utils/helpers.js';

const BASE = "https://nekowatch.xyz";
const ANIME_JS_URL = `${BASE}/js/anime.js?v=v263_fast_player_start`;

const FALLBACK_PROVIDER_ORDER = [
    'kiwi',
    'ally',
    'bee',
    'arc',
    'anikoto',
    'jet',
    'bonk',
    'moo',
    'hop',
    'pulsar',
    'pahe',
];

let providerOrderCache = null;
let providerOrderCacheTs = 0;
const PROVIDER_ORDER_TTL = 30 * 60 * 1000;

async function getProviderOrder() {
    const now = Date.now();
    if (providerOrderCache && (now - providerOrderCacheTs) < PROVIDER_ORDER_TTL) {
        return providerOrderCache;
    }
    try {
        const res = await fetch(ANIME_JS_URL, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const js = await res.text();
        const match = js.match(/PROVIDER_ORDER\s*=\s*\[([\s\S]*?)\]/);
        if (!match) throw new Error('PROVIDER_ORDER not found');
        const order = [...match[1].matchAll(/['"]([a-z0-9_]+)['"]/gi)].map(m => m[1]);
        if (order.length === 0) throw new Error('empty PROVIDER_ORDER');
        providerOrderCache = order;
        providerOrderCacheTs = now;
        return order;
    } catch {
        return providerOrderCache || FALLBACK_PROVIDER_ORDER;
    }
}

async function fetchProvider(provider, anilistId, audio, episodeNum) {
    const slug = `${provider}-${episodeNum}`;
    const url = `${BASE}/api/anime/watch/${provider}/${anilistId}/${audio}/${slug}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.ok || !Array.isArray(data.streams) || data.streams.length === 0) return null;
        return data;
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, audio: prefAudio } = args;
    try {
        const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
        if (!info || !info.isAnime) return null;

        const anilistId = await tmdbToAnilist(id, s ? 'tv' : 'movie', s, info.titles, info.year);
        if (!anilistId) return null;

        const episodeNum = e || 1;
        const audiosToTry = prefAudio === "all" ? ["sub", "dub"] : (prefAudio === "dub" ? ["dub", "sub"] : ["sub", "dub"]);
        const providerOrder = await getProviderOrder();

        for (const aud of audiosToTry) {
            const results = await Promise.all(
                providerOrder.map(provider => fetchProvider(provider, anilistId, aud, episodeNum))
            );

            const allUrls = [];
            const seenActual = new Set();
            for (const data of results) {
                if (!data) continue;
                const actual = data.attempted?.actualProvider || data.provider;
                if (actual && seenActual.has(actual)) continue;
                if (actual) seenActual.add(actual);

                const streams = [...data.streams]
                    .filter(s => s.type === "hls" && s.url)
                    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
                for (const s of streams) {
                    allUrls.push({
                        url: s.url,
                        type: "hls",
                        audio: aud,
                        server: s.server ? `NekoWatch-${s.server}` : "NekoWatch",
                        headers: s.referer ? { Referer: s.referer } : undefined,
                        skipProxy: /\.workers\.dev(\/|$)/i.test(s.url)
                    });
                }
            }

            if (allUrls.length > 0) return { allUrls };
        }

        return null;
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    if (!stream || !stream.allUrls) return [];
    return [...new Set(stream.allUrls.map(u => u.server))];
}