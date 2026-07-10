import { fetchText, fetchJson, USER_AGENT, getTmdbInfo } from '../utils/helpers.js';

const BASE_URL = 'https://www.fsonic.net';
const FSHARE_BASE = 'https://fsharetv.co';
const HEADERS = { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };

export async function getStream({ id, s }) {
    if (s != null) return null;
    try {
        const info = await getTmdbInfo(id, 'movie');
        if (!info?.titles?.length) return null;
        let watchSlug = null;
        for (const title of info.titles) {
            try {
                const html = await fetchText(`${BASE_URL}/movie/search/${encodeURIComponent(title)}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
                let idx = 0, found = null;
                const yearStr = String(info.year);
                while ((idx = html.indexOf('href="/watch/', idx)) !== -1) {
                    const start = idx + 6;
                    const end = html.indexOf('"', start);
                    const link = html.slice(start, end);
                    if (!found) found = link;
                    if (link.includes(yearStr)) { found = link; break; }
                    idx = end;
                }
                if (found) { watchSlug = found; break; }
            } catch { }
        }
        if (!watchSlug) return null;
        const wHtml = await fetchText(`${BASE_URL}${watchSlug}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        let token = null, trailer = null;
        const match = wHtml.match(/init\('([^']+)',\s*(?:'[^']*',\s*)?'([^']+)'/);
        if (match) { token = match[1]; trailer = match[2]; }
        if (!token) return null;
        const json = await fetchJson(`${BASE_URL}/api/source/${token}?trailer=${trailer}&type=watch`, { headers: { ...HEADERS, 'Accept': 'application/json, text/plain, */*', 'Referer': `${BASE_URL}${watchSlug}` }, signal: AbortSignal.timeout(8000) });
        if (json.status !== 'ok') return null;
        const allGroups = [];
        if (json.data?.file?.sources?.length) allGroups.push(json.data.file.sources);
        if (json.data?.file?.alternatives) for (const g of json.data.file.alternatives) if (g?.length) allGroups.push(g);
        const urls = new Set();
        for (const group of allGroups) {
            const best = [...group].filter(st => st?.src).sort((a, b) => parseInt(b.quality) - parseInt(a.quality))[0];
            if (best) urls.add(best.src.startsWith('http') ? best.src : `${FSHARE_BASE}${best.src}`);
        }
        return urls.size ? { allUrls: [...urls].map(url => ({ url, headers: { ...HEADERS, 'Referer': `${FSHARE_BASE}/` }, skipProxy: false })) } : null;
    } catch { return null; }
}