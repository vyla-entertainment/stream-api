import { fetchJson, fetchText, USER_AGENT, getTmdbInfo } from '../utils/helpers.js';

const API_BASE = "https://enc-dec.app/api";
const DOMAIN = "https://vidsync.xyz";
const HEADERS = { "Accept": "*/*", "Origin": DOMAIN, "Referer": `${DOMAIN}/`, "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest" };
const SERVERS = ["cinevault", "cinedub", "cinebox", "cineflix", "cinevip", "cinecloud", "cine4k"];

export async function getStream({ id, s, e, server }) {
    try {
        const isTv = s != null && e != null;
        const type = isTv ? 'tv' : 'movie';
        const info = await getTmdbInfo(id, type);
        if (!info?.titles?.length) return null;
        const turnstileJson = await fetchJson(`${API_BASE}/enc-vidsync`, { signal: AbortSignal.timeout(5000) });
        if (turnstileJson.status !== 200 || !turnstileJson.result?.token) return null;
        const turnstileToken = turnstileJson.result.token;
        let targets = SERVERS;
        if (server && server !== 'all') {
            const clean = server.replace('VidSync - ', '');
            targets = SERVERS.includes(clean) ? [clean] : SERVERS;
        }
        const encTitle = encodeURIComponent(info.titles[0]).replace(/%20/g, '+');
        const results = await Promise.allSettled(targets.map(async srv => {
            let url = `${DOMAIN}/api/stream/fetch?title=${encTitle}&type=${type}&releaseYear=${info.year}&mediaId=${id}&serverName=${srv}`;
            if (isTv) url += `&season=${s}&episode=${e}`;
            const encryptedText = await fetchText(url, { headers: { ...HEADERS, "X-Cf-Turnstile": turnstileToken }, signal: AbortSignal.timeout(10000) });
            const decJson = await fetchJson(`${API_BASE}/dec-vidsync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: encryptedText, id: String(id) }), signal: AbortSignal.timeout(10000) });
            if (decJson.status !== 200 || !decJson.result) throw new Error();
            const streams = Array.isArray(decJson.result) ? decJson.result : [decJson.result];
            return streams.map(st => ({ url: st.url || st.file, server: `VidSync - ${srv}`, quality: st.quality || "Auto", type: (st.url || st.file || "").includes(".m3u8") ? "hls" : "mp4", headers: { ...HEADERS, "Origin": DOMAIN }, skipProxy: false, skipVerify: true, skipHlsCheck: true }));
        }));
        const allUrls = [];
        for (const r of results) if (r.status === 'fulfilled') allUrls.push(...r.value);
        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources() { return SERVERS.map(s => `VidSync - ${s}`); }