import { getTmdbInfo } from '../utils/helpers.js';

const DEC_API = 'https://enc-dec.app/api/dec-videasy';
const VIDEASY_APIS = ['https://api.videasy.to', 'https://api2.videasy.to'];
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Referer': 'https://player.videasy.to/',
    'Origin': 'https://player.videasy.to'
};
const SERVERS = [
    { key: 'neon2' },
    { key: 'jett' },
    { key: 'ym' },
    { key: 'downloader2' },
    { key: 'm4uhd' },
    { key: 'meine' },
    { key: 'lamovie' },
    { key: 'superflix' }
];

const BLOCKED_DOMAINS = ['easy.speedsterwave.app'];

function isBlockedUrl(url) { try { const urlObj = new URL(url); return BLOCKED_DOMAINS.some(domain => urlObj.hostname.includes(domain)); } catch { return false; } }

async function getImdbId(type, id, title, year) {
    try {
        const res = await fetch(`https://api.anyembed.xyz/api/meta?tmdb_id=${id}&title=${encodeURIComponent(title)}&year=${year}&type=${type}`);
        if (!res.ok) return '';
        const json = await res.json();
        return json.imdb_id ?? '';
    } catch { return ''; }
}

function doubleEncode(str) {
    return encodeURIComponent(encodeURIComponent(str));
}

async function fetchServerFromApi(apiBase, server, id, s, e, title, year, imdbId) {
    const type = s != null ? 'tv' : 'movie';
    const params = [
        `title=${doubleEncode(title ?? '')}`,
        `mediaType=${type}`,
        `year=${encodeURIComponent(year ?? '')}`,
        `tmdbId=${encodeURIComponent(id)}`,
        `imdbId=${encodeURIComponent(imdbId ?? '')}`,
    ];
    if (type === 'tv') {
        params.push(`episodeId=${encodeURIComponent(e ?? 1)}`, `seasonId=${encodeURIComponent(s ?? 1)}`);
    }
    if (server.language) params.push(`language=${server.language}`);
    const url = `${apiBase}/${server.key}/sources-with-title?${params.join('&')}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
    if (!res?.ok) return null;
    const blob = await res.text();
    if (!blob || blob.length < 10) return null;
    return blob;
}

async function fetchServer(server, id, s, e, title, year, imdbId) {
    try {
        let blob = null;
        for (const apiBase of VIDEASY_APIS) {
            blob = await fetchServerFromApi(apiBase, server, id, s, e, title, year, imdbId);
            if (blob) break;
        }
        if (!blob) return [];

        const decRes = await fetch(DEC_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: blob, id: String(id) }) });
        if (!decRes?.ok) return [];
        const json = await decRes.json();
        if (json.status !== 200 || !json.result?.sources?.length) return [];

        let sources = json.result.sources;
        if (server.key === 'hdmovie') {
            const wantQuality = server.language === undefined && server.key === 'hdmovie' ? null : null;
        }

        return sources
            .filter(st => st?.url && !isBlockedUrl(st.url))
            .map(st => ({ url: st.url, headers: HEADERS }));
    } catch { return []; }
}

export async function getStream({ id, s, e }) {
    const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
    const title = info.titles?.[0] ?? '';
    const year = info.year ?? '';
    const type = s ? 'tv' : 'movie';
    const imdbId = await getImdbId(type, id, title, year);
    const results = await Promise.all(SERVERS.map(async srv => {
        const urls = await fetchServer(srv, id, s, e, title, year, imdbId);
        return urls.length ? { server: srv.key, urls } : null;
    }));
    const valid = results.filter(Boolean);
    if (!valid.length) return null;
    const allUrls = valid.flatMap(r => r.urls.map(u => ({ ...u, label: r.server })));
    return { allUrls };
}