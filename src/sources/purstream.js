'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

const DOMAIN = 'https://purstream.club';
const API_BASE = 'https://api.purstream.club/api/v1';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': DOMAIN + '/',
    'Origin': DOMAIN,
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
};

export async function getStream(args) {
    try {
        const { id, s, e } = args;
        const isTv = s != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        if (!info || !info.titles || info.titles.length === 0) return null;

        const title = info.titles[0];
        const searchUrl = `${API_BASE}/search-bar/search/${encodeURIComponent(title)}`;

        const searchRes = await fetch(searchUrl, {
            headers: HEADERS,
            signal: AbortSignal.timeout(10000)
        });

        if (!searchRes.ok) return null;

        const searchData = await searchRes.json();
        const items = searchData.data?.items?.movies?.items || [];
        if (!items.length) return null;

        const typeStr = isTv ? 'tv' : 'movie';
        const match = items.find(item =>
            item.type === typeStr &&
            item.title.toLowerCase() === title.toLowerCase() &&
            (!info.year || (item.release_date && item.release_date.startsWith(info.year.toString())))
        );

        const purstreamId = match ? match.id : (items.find(i => i.type === typeStr)?.id);
        if (!purstreamId) return null;

        const streamUrl = isTv
            ? `${API_BASE}/stream/${purstreamId}/episode?season=${s}&episode=${e}`
            : `${API_BASE}/stream/${purstreamId}`;

        const res = await fetch(streamUrl, {
            headers: HEADERS,
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) return null;

        const json = await res.json();
        if (json.type !== 'success' || !json.data?.items?.sources) return null;

        const allSources = json.data.items.sources;
        const chosen = allSources.find(src => src.stream_url && src.stream_url.includes('/premium')) ||
            allSources.find(src => src.stream_url);

        if (!chosen) return null;

        return {
            url: chosen.stream_url,
            headers: {
                'User-Agent': HEADERS['User-Agent'],
                'Referer': DOMAIN + '/'
            },
            server: 'purstream',
            quality: 'Auto',
            type: 'hls',
            skipProxy: true
        };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream ? [stream.url] : [];
}

export const VERIFY_HEADERS = { ...HEADERS };