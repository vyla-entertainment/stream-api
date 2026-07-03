'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, */*; q=0.01'
};

export async function getStream(args) {
    try {
        const { id, s, e } = args;
        const isTv = s != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        if (!info || !info.titles || info.titles.length === 0) return null;

        const title = info.titles[0];
        const searchUrl = `https://api.purstream.club/api/v1/search-bar/search/${encodeURIComponent(title)}`;
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        if (!searchRes.ok) return null;

        const searchData = await searchRes.json();
        if (!searchData.data || !searchData.data.items || !searchData.data.items.movies || !searchData.data.items.movies.items) return null;

        const results = searchData.data.items.movies.items;
        const typeStr = isTv ? 'tv' : 'movie';

        const match = results.find(item =>
            item.type === typeStr &&
            item.title.toLowerCase() === title.toLowerCase() &&
            (!info.year || (item.release_date && item.release_date.startsWith(info.year.toString())))
        );

        const purstreamId = match ? match.id : (results.find(i => i.type === typeStr)?.id);
        if (!purstreamId) return null;

        const url = isTv
            ? `https://api.purstream.club/api/v1/stream/${purstreamId}/episode?season=${s}&episode=${e}`
            : `https://api.purstream.club/api/v1/stream/${purstreamId}`;

        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return null;

        const json = await res.json();
        if (json.type !== 'success' || !json.data || !json.data.items || !json.data.items.sources) return null;

        const allSources = json.data.items.sources;
        if (!allSources || !allSources.length) return null;

        const premiumSources = allSources.filter(src => src.stream_url && src.stream_url.includes('/premium'));
        const chosen = premiumSources.length ? premiumSources : allSources.filter(src => src.stream_url);
        if (!chosen.length) return null;

        return {
            url: chosen[0].stream_url,
            headers: undefined,
            server: 'purstream',
            quality: 'Auto',
            type: 'hls',
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