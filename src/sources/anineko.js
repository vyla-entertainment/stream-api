'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

const BASE = "https://anineko.to";

function stripTags(str) {
    return str.replace(/<[^>]*>?/gm, '').trim();
}

function attr(html, attrName) {
    const match = html.match(new RegExp(`${attrName}=["']([^"']*)["']`, 'i'));
    return match ? match[1] : null;
}

function decodeEntities(encodedString) {
    const translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    const translate = {
        "nbsp": " ",
        "amp": "&",
        "quot": "\"",
        "lt": "<",
        "gt": ">"
    };
    return encodedString.replace(translate_re, function (match, entity) {
        return translate[entity];
    }).replace(/&#(\d+);/gi, function (match, numStr) {
        const num = parseInt(numStr, 10);
        return String.fromCharCode(num);
    });
}

function cleanTitle(t) {
    if (!t) return '';
    return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function search(query) {
    try {
        const res = await fetch(`${BASE}/browser?keyword=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return [];
        const html = await res.text();
        const results = [];
        for (const m of html.matchAll(/<a\b[^>]*class=["'][^"']*nv-anime-thumb[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)) {
            const tag = m[0].match(/<a\b[^>]*>/i)?.[0] ?? "";
            const href = attr(tag, "href");
            const slug = href?.match(/\/watch\/([^/?#]+)/)?.[1];
            if (!slug) continue;
            const titleMatch = m[0].match(/<(?:h3|[^>]+class=["'][^"']*nv-anime-title[^"']*["'][^>]*)>([\s\S]*?)<\/(?:h3|[^>]+)>/i);
            results.push({ slug, text: titleMatch ? stripTags(titleMatch[1]) : slug.replace(/-/g, " ") });
        }
        return results;
    } catch {
        return [];
    }
}

async function extractHls(embedUrl) {
    try {
        const res = await fetch(embedUrl, { headers: { Referer: `${BASE}/` }, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const html = await res.text();
        const patterns = [
            /const\s+src\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
            /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
            /["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/i,
            /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
        ];
        for (const pattern of patterns) {
            const m = html.match(pattern);
            if (m) return decodeEntities(m[1]);
        }
    } catch { }
    return null;
}

export async function getStream(args) {
    const { id, s, e, audio: prefAudio } = args;
    try {
        const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
        if (!info || !info.isAnime) return null;

        const episodeNum = e || 1;
        let seriesSlug = null;

        for (const title of info.titles) {
            const results = await search(title);
            const targetClean = cleanTitle(title);
            for (const r of results) {
                if (cleanTitle(r.text) === targetClean || r.text.toLowerCase().includes(title.toLowerCase())) {
                    seriesSlug = r.slug;
                    break;
                }
            }
            if (seriesSlug) break;
        }

        if (!seriesSlug && info.titles.length > 0) {
            const fallbackSearch = await search(info.titles[0]);
            if (fallbackSearch.length > 0) seriesSlug = fallbackSearch[0].slug;
        }

        if (!seriesSlug) return null;

        const epSlug = `ep-${episodeNum}`;
        const watchUrl = `${BASE}/watch/${seriesSlug}/${epSlug}`;

        const watchRes = await fetch(watchUrl, { headers: { Referer: `${BASE}/watch/${seriesSlug}` }, signal: AbortSignal.timeout(6000) });
        if (!watchRes.ok) return null;
        const watchHtml = await watchRes.text();

        const byAudio = { sub: [], dub: [] };
        for (const panel of watchHtml.matchAll(/<div\b[^>]*class=["'][^"']*nv-server-grid[^"']*["'][^>]*data-id=["']([^"']+)["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*nv-server-grid|$)/gi)) {
            const rawAudio = panel[1].toLowerCase();
            const panelAudio = rawAudio.includes("dub") ? "dub" : "sub";
            for (const btn of panel[2].matchAll(/data-video=["']([^"']+)["']/gi)) {
                byAudio[panelAudio].push(decodeEntities(btn[1]));
            }
        }

        const audiosToTry = prefAudio === "all" ? ["sub", "dub"] : (prefAudio === "dub" ? ["dub", "sub"] : ["sub", "dub"]);
        const allUrls = [];

        for (const aud of audiosToTry) {
            const embeds = byAudio[aud] ?? [];
            for (const embed of embeds) {
                const hls = await extractHls(embed);
                if (hls) {
                    allUrls.push({
                        url: hls,
                        type: "hls",
                        audio: aud,
                        server: "AniNeko",
                        headers: undefined,
                        skipProxy: false
                    });
                }
            }
            if (allUrls.length > 0) break;
        }

        if (allUrls.length === 0) return null;
        return { allUrls };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    if (!stream || !stream.allUrls) return [];
    return [...new Set(stream.allUrls.map(u => u.server))];
}