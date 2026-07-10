import { USER_AGENT } from '../utils/helpers.js';

const BASE_URL = "https://1embed.cc";

const PROVIDERS = [
    { id: "sdev", name: "1Embed - SDev" },
    { id: "xpa", name: "1Embed - XPass" },
    { id: "vnes", name: "1Embed - VidNest" },
    { id: "pro", name: "1Embed - Pro" },
    { id: "pur", name: "1Embed - Purstream" },
    { id: "czo", name: "1Embed - Cinezo" },
    { id: "fas", name: "1Embed - VidFast" }
];

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && tokenExpiresAt > now + 10) return cachedToken;
    try {
        const res = await fetch(`${BASE_URL}/api/token`, { headers: { "Referer": `${BASE_URL}/`, "User-Agent": USER_AGENT, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const data = await res.json();
        cachedToken = data.token;
        tokenExpiresAt = data.expiresAt;
        return cachedToken;
    } catch { return null; }
}

async function fetchProviderStream(provider, type, id, s, e, token) {
    try {
        const referer = type === "movie" ? `${BASE_URL}/embed/movie/${id}` : `${BASE_URL}/embed/tv/${id}/${s}/${e}`;
        const payload = { type, id: String(id), provider: provider.id };
        if (type === "tv") { payload.season = Number(s); payload.episode = Number(e); }
        const res = await fetch(`${BASE_URL}/api/sources`, {
            method: "POST",
            headers: { "User-Agent": USER_AGENT, "Referer": referer, "Origin": BASE_URL, "Accept": "application/json", "Content-Type": "application/json", "x-bcine-key": token, "X-Requested-With": "XMLHttpRequest" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) return null;
        const data = await res.json();

        let rawSources = [];
        if (Array.isArray(data.servers)) rawSources.push(...data.servers);
        if (data.providerResults?.[provider.id]?.sources) rawSources.push(...data.providerResults[provider.id].sources);
        if (data.providerResults?.[provider.id] && Array.isArray(data.providerResults[provider.id])) rawSources.push(...data.providerResults[provider.id]);

        if (!rawSources.length) return null;
        const results = [];
        for (const src of rawSources) {
            if (typeof src !== 'object' || !src) continue;
            let streamUrl = src.url || src.file || src.link;
            if (typeof streamUrl !== 'string') continue;
            if (streamUrl.startsWith('/')) streamUrl = `${BASE_URL}${streamUrl}`;
            const isWorker = streamUrl.includes('omena-puu') || streamUrl.includes('nocach') || streamUrl.includes('?p=');
            const isHls = src.type === 'hls' || streamUrl.includes('m3u8') || isWorker;
            if (isHls && !streamUrl.includes('m3u8')) streamUrl += streamUrl.includes('?') ? '&format=.m3u8' : '?format=.m3u8';
            const srcHeaders = (src.headers && typeof src.headers === 'object') ? src.headers : {};
            results.push({
                url: streamUrl,
                server: provider.name,
                quality: src.quality || src.label || src.title || "Auto",
                type: isHls ? "hls" : "mp4",
                headers: { "User-Agent": USER_AGENT, "Referer": referer, "Origin": BASE_URL, ...srcHeaders },
            });
        }
        return results;
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, server } = args;
    const type = s != null && e != null ? "tv" : "movie";
    const token = await getToken();
    if (!token) return null;
    let targets = PROVIDERS;
    if (server && server !== 'all') {
        const cleanName = server.replace('1Embed - ', '').toLowerCase();
        targets = PROVIDERS.filter(p => p.id === cleanName || p.name.toLowerCase().includes(cleanName));
        if (!targets.length) targets = PROVIDERS;
    }
    const settled = await Promise.allSettled(targets.map(p => fetchProviderStream(p, type, id, s, e, token)));
    const allUrls = [];
    for (const r of settled) if (r.status === 'fulfilled' && r.value) allUrls.push(...r.value);
    return allUrls.length ? { allUrls } : null;
}

export async function getSources() { return PROVIDERS.map(p => p.name); }