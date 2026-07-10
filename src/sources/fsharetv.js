import { fetchText, fetchJson, USER_AGENT, getTmdbInfo } from '../utils/helpers.js';

const BASE_URL = 'https://fsharetv.cc';
const HEADERS = { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': `${BASE_URL}/` };
const API_HEADERS = { ...HEADERS, 'Accept': 'application/json, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' };

export async function getStream({ id, s }) {
    if (s != null) return null;
    try {
        const info = await getTmdbInfo(id, 'movie');
        if (!info?.imdbId) return null;
        const html = await fetchText(`${BASE_URL}/movie/${info.imdbId}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        let watchPath = null;
        const match = html.match(/href="(\/w\/[^"]+)"/);
        if (match) watchPath = match[1];
        if (!watchPath) return null;
        const watchHtml = await fetchText(`${BASE_URL}${watchPath}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        let sourceId = null;
        const sidMatch = watchHtml.match(/(?:source_id|file_id|setSource)[\s=:\('"]+([^'"\)]+)/i);
        if (sidMatch) sourceId = sidMatch[1];
        if (!sourceId) return null;
        const json = await fetchJson(`${BASE_URL}/api/file/${sourceId}/source?trailer=Png81APqcxU&type=watch`, { headers: { ...API_HEADERS, 'Referer': `${BASE_URL}${watchPath}` }, signal: AbortSignal.timeout(8000) });
        if (json.status !== 'ok') return null;
        const groups = [];
        if (Array.isArray(json.data?.file?.sources)) groups.push(json.data.file.sources);
        if (Array.isArray(json.data?.file?.alternatives)) json.data.file.alternatives.forEach(g => Array.isArray(g) && groups.push(g));
        const out = [], seen = new Set();
        for (const group of groups) {
            for (const item of group.filter(st => st?.src).sort((a, b) => parseInt(b.quality) - parseInt(a.quality))) {
                const url = item.src.startsWith('http') ? item.src : `${BASE_URL}${item.src}`;
                if (seen.has(url)) continue;
                seen.add(url);
                out.push({ url, quality: parseInt(item.quality) || 0, label: item.label || null });
            }
        }
        out.sort((a, b) => b.quality - a.quality);
        return out.length ? { allUrls: out.map(u => ({ url: u.url, headers: HEADERS, skipProxy: false })) } : null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? stream.allUrls.map(u => u.url) : [];
}