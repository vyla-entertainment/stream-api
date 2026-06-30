import { getTmdbInfo } from '../utils/helpers.js';

const BASE_URL = 'https://fsharetv.cc';
const TRAILER = 'Png81APqcxU';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${BASE_URL}/`,
};

const API_HEADERS = {
    ...HEADERS,
    'Accept': 'application/json, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
};

async function findWatchPath(imdbId) {
    try {
        const res = await fetch(`${BASE_URL}/movie/${imdbId}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        if (!res?.ok) return null;
        const html = await res.text();
        const match = html.match(/href="(\/w\/[^"]*?-tt\d+)"/) || html.match(/href="(\/w\/[^"]+)"/);
        return match ? match[1] : null;
    } catch { return null; }
}

async function extractSourceId(watchPath) {
    try {
        const res = await fetch(`${BASE_URL}${watchPath}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        if (!res?.ok) return null;
        const html = await res.text();
        const patterns = [
            /Movie\.setSource\("([^"]+)"/,
            /setSource\("([^"]+)"/,
            /setSource\('([^']+)'/,
            /"source_id"\s*:\s*"([^"]+)"/,
            /source_id\s*=\s*"([^"]+)"/,
            /file_id\s*=\s*"([^"]+)"/,
            /"file_id"\s*:\s*"([^"]+)"/,
        ];
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) return match[1];
        }
        return null;
    } catch { return null; }
}

function extractSources(json) {
    const groups = [];
    const primary = json?.data?.file?.sources;
    if (Array.isArray(primary) && primary.length) groups.push(primary);
    const alternatives = json?.data?.file?.alternatives;
    if (Array.isArray(alternatives)) {
        for (const group of alternatives) {
            if (Array.isArray(group) && group.length) groups.push(group);
        }
    }

    const seen = new Set();
    const out = [];
    for (const group of groups) {
        const items = group
            .filter(s => s?.src)
            .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        for (const item of items) {
            const url = item.src.startsWith('http') ? item.src : `${BASE_URL}${item.src}`;
            if (seen.has(url)) continue;
            seen.add(url);
            out.push({ url, quality: parseInt(item.quality) || 0, label: item.label || null });
        }
    }
    out.sort((a, b) => b.quality - a.quality);
    return out;
}

async function resolveSources(id) {
    const info = await getTmdbInfo(id, 'movie');
    if (!info?.imdbId) return [];

    const watchPath = await findWatchPath(info.imdbId);
    if (!watchPath) return [];

    const sourceId = await extractSourceId(watchPath);
    if (!sourceId) return [];

    const url = `${BASE_URL}/api/file/${sourceId}/source?trailer=${TRAILER}&type=watch`;
    const res = await fetch(url, { headers: { ...API_HEADERS, 'Referer': `${BASE_URL}${watchPath}` }, signal: AbortSignal.timeout(8000) });
    if (!res?.ok) return [];

    const json = await res.json();
    if (json.status !== 'ok') return [];

    return extractSources(json);
}

export async function getStream({ id, s }) {
    if (s != null) return null;
    try {
        const sources = await resolveSources(id);
        if (!sources.length) return null;

        const allUrls = sources.map(({ url }) => ({
            url,
            headers: HEADERS,
            skipProxy: false,
        }));

        return { allUrls };
    } catch { return null; }
}

export async function getSources({ id, s }) {
    if (s != null) return [];
    try {
        const sources = await resolveSources(id);
        return sources.map(s => s.url);
    } catch { return []; }
}