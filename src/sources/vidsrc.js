import { fetchText, USER_AGENT } from '../utils/helpers.js';

const BASE_URL = 'https://vsembed.ru';
const HEADERS = { 'User-Agent': USER_AGENT, 'Referer': `${BASE_URL}/` };
const PLAYER_DOMAINS = { '{v1}': 'neonhorizonworkshops.com', '{v2}': 'wanderlynest.com', '{v3}': 'orchidpixelgardens.com', '{v4}': 'cloudnestra.com' };
const PROXY_HEADERS = { 'User-Agent': USER_AGENT, 'Referer': 'https://cloudnestra.com/', 'Origin': 'https://cloudnestra.com', 'Accept': '*/*' };

function extractM3u8Urls(html) {
    const idx = html.indexOf('file:');
    if (idx === -1) return null;
    const start = html.indexOf('"', idx) + 1;
    const end = html.indexOf('"', start);
    const fileField = html.slice(start, end);
    const urls = [];
    for (const template of fileField.split(/\s+or\s+/i)) {
        let url = template;
        for (const [p, d] of Object.entries(PLAYER_DOMAINS)) url = url.replace(p, d);
        if (!url.includes('{') && !url.includes('}')) urls.push(url);
    }
    return urls.length ? urls : null;
}

export async function getStream({ id, s, e }) {
    try {
        const html1 = await fetchText(s ? `${BASE_URL}/embed/tv?tmdb=${id}&season=${s}&episode=${e}` : `${BASE_URL}/embed/movie?tmdb=${id}`, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
        let rcpUrl = html1.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
        if (!rcpUrl) return null;
        if (rcpUrl.startsWith('//')) rcpUrl = 'https:' + rcpUrl;
        const html2 = await fetchText(rcpUrl, { headers: { 'Referer': `${BASE_URL}/` }, signal: AbortSignal.timeout(7000) });
        const prorcpMatch = html2.match(/src:\s*['"]([^'"]*\/prorcp\/[^'"]+)['"]/i)?.[1];
        const playerUrl = prorcpMatch ? (prorcpMatch.startsWith('http') ? prorcpMatch : rcpUrl.slice(0, rcpUrl.indexOf('/', rcpUrl.indexOf('//') + 2)) + prorcpMatch) : rcpUrl.replace('/rcp/', '/prorcp/');
        const html3 = await fetchText(playerUrl, { headers: { 'Referer': rcpUrl }, signal: AbortSignal.timeout(7000) });
        let urls = extractM3u8Urls(html3);
        if (!urls) {
            const apiSrc = html3.match(/src=["']([^"']*\/e\/[^"']+)["']/i)?.[1] ?? html3.match(/src=["']([^"']*\/embed[^"']+)["']/i)?.[1] ?? html3.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
            if (!apiSrc) return null;
            const html4 = await fetchText(new URL(apiSrc, playerUrl).href, { headers: { 'Referer': playerUrl }, signal: AbortSignal.timeout(7000) });
            urls = extractM3u8Urls(html4);
        }
        return urls?.length ? { url: urls[0], headers: PROXY_HEADERS, allUrls: urls.map(u => ({ url: u, headers: PROXY_HEADERS })) } : null;
    } catch { return null; }
}