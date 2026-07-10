import crypto from 'node:crypto';
import { fetchJson, fetchText, USER_AGENT } from '../utils/helpers.js';

const ENC_API = "https://enc-dec.app/api";
const DOMAINS = ['hexa.su', 'flixer.su'];

async function getChallengeToken() {
    try {
        const data = await fetchJson(`${ENC_API}/enc-hexa`, { signal: AbortSignal.timeout(6000) });
        return data?.status === 200 ? data.result.token : null;
    } catch { return null; }
}

export async function getStream({ id, s, e }) {
    try {
        const apiKey = crypto.randomBytes(32).toString('hex');
        const capToken = await getChallengeToken();
        if (!capToken) return null;
        let decrypted = null;
        for (const domain of DOMAINS) {
            try {
                const url = s ? `https://theemoviedb.${domain}/api/tmdb/tv/${id}/season/${s}/episode/${e || 1}/images` : `https://theemoviedb.${domain}/api/tmdb/movie/${id}/images`;
                const encrypted = await fetchText(url, { headers: { 'User-Agent': USER_AGENT, Referer: `https://${domain}/`, Accept: 'text/plain', 'X-Fingerprint-Lite': 'e9136c41504646444', 'X-Api-Key': apiKey, 'X-Cap-Token': capToken }, signal: AbortSignal.timeout(10000) });
                const data = await fetchJson(`${ENC_API}/dec-hexa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: encrypted, key: apiKey }), signal: AbortSignal.timeout(8000) });
                if (data?.status === 200 && data.result?.sources?.length) { decrypted = data.result; break; }
            } catch { }
        }
        if (!decrypted?.sources?.length) return null;
        const allUrls = decrypted.sources.filter(src => src.url).map(src => ({ url: src.url, type: src.url.includes('.m3u8') ? 'hls' : 'mp4', audio: 'sub', server: `Hexa-${src.server || 'unknown'}`, skipProxy: false }));
        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? [...new Set(stream.allUrls.map(u => u.server))] : [];
}