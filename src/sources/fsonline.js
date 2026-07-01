'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

const ORIGIN = 'https://www3.fsonline.app';
const AJAX_URL = 'https://www3.fsonline.app/wp-admin/admin-ajax.php';
const PLAYER_ORIGIN = 'https://player.fsonline.app';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': ORIGIN,
    'Referer': ORIGIN + '/'
};

async function resolveFileSuN(embedUrl) {
    try {
        const res = await fetch(embedUrl, {
            headers: {
                'Referer': ORIGIN,
                'User-Agent': HEADERS['User-Agent']
            }
        });
        if (!res.ok) return null;
        const html = await res.text();

        const m3u8Match = html.match(/file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/) ||
            html.match(/["']?file["']?:\s*["'](https?:\/\/[^"']+)["']/);

        if (!m3u8Match) return null;

        let finalUrl = m3u8Match[1].replace(/\\\//g, '/');

        return {
            url: finalUrl,
            headers: {
                'Referer': embedUrl,
                'Origin': PLAYER_ORIGIN,
                'User-Agent': HEADERS['User-Agent']
            }
        };
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e } = args;
    try {
        const isTv = s != null && e != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        if (!info || !info.titles || !info.titles.length) return null;

        const title = info.titles[0];
        const searchUrl = `${ORIGIN}/?s=${encodeURIComponent(title + (info.year ? ' ' + info.year : ''))}`;

        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        if (!searchRes.ok) return null;
        const searchHtml = await searchRes.text();

        const typeFolder = isTv ? 'seriale' : 'film';
        const linkRegex = new RegExp(`href=["'](https?://www3\\.fsonline\\.app/${typeFolder}/([^"'/]+)/)["']`, 'i');
        const matchLink = searchHtml.match(linkRegex);

        if (!matchLink) return null;
        const mediaPageUrl = matchLink[1];
        const mediaSlug = matchLink[2];

        let targetPageUrl = mediaPageUrl;
        if (isTv) {
            const cleanSlug = mediaSlug.replace(/-\d{4}$/, '');
            targetPageUrl = `${ORIGIN}/episoade/${cleanSlug}-sezonul-${s}-episodul-${e}/`;
        }

        const pageRes = await fetch(targetPageUrl, { headers: HEADERS });
        if (!pageRes.ok) return null;
        const html = await pageRes.text();

        const movieIdMatch = html.match(/movie-id=['"]([^'"]+)['"]/) || html.match(/movie-id=([^ >]+)/);
        if (!movieIdMatch) return null;

        const movieId = movieIdMatch[1];
        const ajaxRes = await fetch(AJAX_URL, {
            method: 'POST',
            headers: {
                ...HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': targetPageUrl
            },
            body: `action=lazy_player&movieID=${movieId}`
        });

        if (!ajaxRes.ok) return null;
        const ajaxHtml = await ajaxRes.text();

        const results = [];
        const sourceRegex = /data-vs=['"]([^'"]+)['"][^>]*>.*?<span>([^<]+)<\/span>/gs;
        let sMatch;

        while ((sMatch = sourceRegex.exec(ajaxHtml)) !== null) {
            const embedUrl = sMatch[1];
            const serverLabel = sMatch[2].trim();

            if (serverLabel.toLowerCase().includes('filesun')) {
                const resolved = await resolveFileSuN(embedUrl);
                if (resolved) {
                    results.push({
                        url: resolved.url,
                        server: `FSOnline - FileSuN`,
                        headers: resolved.headers,
                    });
                }
            }
        }

        if (results.length === 0) return null;
        return { allUrls: results };

    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res || !res.allUrls) return [];
    return [...new Set(res.allUrls.map(u => u.server))];
}

export const SKIP_VERIFY = true;
export const MULTI_URL = true;