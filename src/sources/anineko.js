import { getTmdbInfo } from '../utils/helpers.js';

const BASE_URL = "https://anineko.to";

function cleanTitle(t) { return t ? t.toLowerCase().replace(/[^a-z0-9]/g, '') : ''; }

function decodeEntities(str) {
    return str.replace(/&(nbsp|amp|quot|lt|gt);/g, (m, e) => ({ "nbsp": " ", "amp": "&", "quot": "\"", "lt": "<", "gt": ">" })[e]).replace(/&#(\d+);/gi, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

async function search(query) {
    try {
        const html = await fetchText(`${BASE_URL}/browser?keyword=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(6000) });
        const results = [];
        let idx = 0;
        while ((idx = html.indexOf('nv-anime-thumb', idx)) !== -1) {
            const startHref = html.lastIndexOf('<a', idx);
            if (startHref === -1) { idx += 14; continue; }
            const hrefMatch = html.slice(startHref, html.indexOf('>', startHref)).match(/href=["']([^"']+)["']/i);
            if (!hrefMatch) { idx += 14; continue; }
            const slug = hrefMatch[1].split('/').pop();
            const h3Start = html.indexOf('nv-anime-title', idx);
            if (h3Start !== -1) {
                const contentStart = html.indexOf('>', h3Start) + 1;
                const contentEnd = html.indexOf('<', contentStart);
                if (contentEnd !== -1) results.push({ slug, text: html.slice(contentStart, contentEnd).trim() });
            }
            idx += 14;
        }
        return results;
    } catch { return []; }
}

async function extractHls(embedUrl) {
    try {
        const html = await fetchText(embedUrl, { headers: { Referer: `${BASE_URL}/` }, signal: AbortSignal.timeout(6000) });
        const m = html.match(/const\s+src\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) || html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
        if (m) return decodeEntities(m[1]);
    } catch { }
    return null;
}

export async function getStream({ id, s, e, audio }) {
    try {
        const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
        if (!info || !info.isAnime) return null;
        let seriesSlug = null;
        for (const title of info.titles) {
            const results = await search(title);
            const targetClean = cleanTitle(title);
            for (const r of results) if (cleanTitle(r.text) === targetClean || r.text.toLowerCase().includes(title.toLowerCase())) { seriesSlug = r.slug; break; }
            if (seriesSlug) break;
        }
        if (!seriesSlug && info.titles.length) {
            const fSearch = await search(info.titles[0]);
            if (fSearch.length) seriesSlug = fSearch[0].slug;
        }
        if (!seriesSlug) return null;
        const watchHtml = await fetchText(`${BASE_URL}/watch/${seriesSlug}/ep-${e || 1}`, { headers: { Referer: `${BASE_URL}/watch/${seriesSlug}` }, signal: AbortSignal.timeout(6000) });
        const byAudio = { sub: [], dub: [] };
        for (const panel of watchHtml.matchAll(/<div\b[^>]*class=["'][^"']*nv-server-grid[^"']*["'][^>]*data-id=["']([^"']+)["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*nv-server-grid|$)/gi)) {
            const panelAudio = panel[1].toLowerCase().includes("dub") ? "dub" : "sub";
            for (const btn of panel[2].matchAll(/data-video=["']([^"']+)["']/gi)) byAudio[panelAudio].push(decodeEntities(btn[1]));
        }
        const audiosToTry = audio === "all" ? ["sub", "dub"] : (audio === "dub" ? ["dub", "sub"] : ["sub", "dub"]);
        const allUrls = [];
        for (const aud of audiosToTry) {
            for (const embed of byAudio[aud]) {
                const hls = await extractHls(embed);
                if (hls) allUrls.push({ url: hls, type: "hls", audio: aud, server: "AniNeko", skipProxy: false });
            }
            if (allUrls.length) break;
        }
        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? [...new Set(stream.allUrls.map(u => u.server))] : [];
}