import crypto from 'node:crypto';
import { fetchJson, fetchText, USER_AGENT } from '../utils/helpers.js';

const API_BASE = 'https://enc-dec.app/api';
const DOMAINS = ['hexa.su', 'flixer.su'];

async function getChallengeToken() {
    try {
        const data = await fetchJson(`${API_BASE}/enc-hexa`, { signal: AbortSignal.timeout(6000) });
        return data?.status === 200 ? data.result.token : null;
    } catch { return null; }
}

export async function getStream({ id, s, e, server }) {
    try {
        const apiKey = crypto.randomBytes(32).toString('hex');
        const capToken = await getChallengeToken();
        if (!capToken) return null;

        const isTv = s != null && e != null;
        let decrypted = null;

        for (const domain of DOMAINS) {
            try {
                const url = isTv
                    ? `https://theemoviedb.${domain}/api/tmdb/tv/${id}/season/${s}/episode/${e}/images`
                    : `https://theemoviedb.${domain}/api/tmdb/movie/${id}/images`;

                const encrypted = await fetchText(url, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Referer': `https://${domain}/`,
                        'Accept': 'text/plain',
                        'X-Fingerprint-Lite': 'e9136c41504646444',
                        'X-Api-Key': apiKey,
                        'X-Cap-Token': capToken
                    },
                    signal: AbortSignal.timeout(10000)
                });

                if (!encrypted) continue;

                const decData = await fetchJson(`${API_BASE}/dec-hexa`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: encrypted, key: apiKey }),
                    signal: AbortSignal.timeout(8000)
                });

                if (decData?.status === 200 && decData.result?.sources?.length) {
                    decrypted = decData.result;
                    break;
                }
            } catch { continue; }
        }

        if (!decrypted?.sources?.length) return null;

        let sources = decrypted.sources.map(src => ({
            url: src.url,
            server: `Hexa - ${src.name || src.server || 'Server'}`,
            type: src.url.includes('.m3u8') ? 'hls' : 'mp4',
            quality: src.quality || 'Auto',
            subtitles: (decrypted.subtitles || []).map(sub => ({
                url: sub.url,
                lang: sub.label || sub.lang || 'Unknown'
            })),
            skipProxy: false
        }));

        if (server && server !== 'all') {
            const cleanName = server.replace('Hexa - ', '');
            sources = sources.filter(u => u.server.includes(cleanName));
        }

        return sources.length ? { allUrls: sources } : null;
    } catch { return null; }
}

export async function getSources() {
    return ['Hexa'];
}