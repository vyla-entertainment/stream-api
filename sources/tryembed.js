export const SKIP_VERIFY = true;
export const MULTI_URL = true;

async function tmdbToAnilist(tmdbId, mediaType, season) {
    try {
        const type = mediaType === 'movie' ? 'movie' : 'tv';
        const res = await fetch(`https://api.ani.zip/mappings?tmdb_id=${tmdbId}&type=${type}&season=${season || 1}`, {
            signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
            const data = await res.json();
            const anilistId = data?.mappings?.[0]?.anilist_id ?? null;
            if (anilistId) return anilistId;
        } else {
            res.body?.cancel();
        }
    } catch { }

    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return null;

    let titles = [];
    let year = null;

    try {
        if (mediaType === 'tv' && season && parseInt(season, 10) > 0) {
            const seasonRes = await fetch(
                `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${tmdbKey}`,
                { signal: AbortSignal.timeout(5000) }
            );
            if (seasonRes.ok) {
                const seasonData = await seasonRes.json();
                if (seasonData.name) titles.push(seasonData.name);
                const dateStr = seasonData.air_date || '';
                if (dateStr) year = parseInt(dateStr.slice(0, 4), 10);
            } else {
                seasonRes.body?.cancel();
            }
        }

        const showRes = await fetch(
            mediaType === 'tv'
                ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbKey}`
                : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbKey}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!showRes.ok) { showRes.body?.cancel(); }
        else {
            const showData = await showRes.json();
            const t = showData.title || showData.name || '';
            const ot = showData.original_title || showData.original_name || '';
            if (t) titles.push(t);
            if (ot && ot !== t) titles.push(ot);
            if (!year) {
                const dateStr = showData.release_date || showData.first_air_date || '';
                if (dateStr) year = parseInt(dateStr.slice(0, 4), 10);
            }
        }
    } catch {
        return null;
    }

    titles = [...new Set(titles.filter(Boolean))];
    if (!titles.length) return null;

    const query = `
        query ($search: String) {
            Page(page: 1, perPage: 10) {
                media(search: $search, type: ANIME) {
                    id
                    title { romaji english native }
                    startDate { year }
                    format
                }
            }
        }
    `;

    let bestId = null;
    let bestScore = -1;

    for (const searchTitle of titles) {
        let results;
        try {
            const res = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query, variables: { search: searchTitle } }),
                signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) { res.body?.cancel(); continue; }
            const data = await res.json();
            results = data?.data?.Page?.media || [];
        } catch {
            continue;
        }

        for (const entry of results) {
            const entryTitles = [
                entry.title?.romaji,
                entry.title?.english,
                entry.title?.native,
            ].filter(Boolean).map(t => t.toLowerCase());

            const searchLower = searchTitle.toLowerCase();
            let score = 0;

            if (entryTitles.some(t => t === searchLower)) score += 5;
            else if (entryTitles.some(t => t.includes(searchLower) || searchLower.includes(t))) score += 3;
            else if (entryTitles.some(t => {
                const words = searchLower.split(/\s+/).filter(w => w.length > 3);
                return words.length > 0 && words.every(w => t.includes(w));
            })) score += 2;
            else continue;

            if (year && entry.startDate?.year) {
                const diff = Math.abs(entry.startDate.year - year);
                if (diff === 0) score += 3;
                else if (diff === 1) score += 1;
                else if (diff > 2) score -= 3;
            }

            if (mediaType === 'tv' && ['TV', 'TV_SHORT', 'ONA', 'OVA'].includes(entry.format)) score += 1;
            if (mediaType === 'movie' && entry.format === 'MOVIE') score += 1;

            if (score > bestScore) {
                bestScore = score;
                bestId = entry.id;
            }
        }

        if (bestScore >= 8) break;
    }

    return bestId;
}

async function fetchTokens(anilistId, season, episode, audio) {
    const s = season ? parseInt(season, 10) : 1;
    const e = episode ? parseInt(episode, 10) : 1;
    const url = `https://tryembed.us.cc/api/stream_data?id=${anilistId}&episode=${e}&season=${s}&audio=${audio}`;
    const res = await fetch(url, {
        headers: {
            'Referer': 'https://tryembed.us.cc/',
            'Origin': 'https://tryembed.us.cc',
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { res.body?.cancel(); return null; }
    return await res.json();
}

function extractUrls(data) {
    const urls = [];
    const providers = data?.providers || [];
    for (const provider of providers) {
        const qualities = provider.qualities || [];
        for (const q of qualities) {
            if (q.token) urls.push(`https://tryembed.us.cc/s/${q.token}.m3u8`);
            if (q.fallbackToken) urls.push(`https://tryembed.us.cc/s/${q.fallbackToken}.m3u8`);
        }
    }
    return urls;
}

async function isAnime(tmdbId, season) {
    try {
        const k = process.env.TMDB_API_KEY;
        if (!k) return false;
        const res = await fetch(
            `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${k}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) { res.body?.cancel(); return false; }
        const data = await res.json();
        const genres = data.genres || [];
        const originCountry = data.origin_country || [];
        const originalLanguage = data.original_language || '';
        const isAnimationGenre = genres.some(g => g.id === 16);
        const isJapanese = originCountry.includes('JP') || originalLanguage === 'ja';
        return isAnimationGenre && isJapanese;
    } catch {
        return false;
    }
}

export async function getStream(tmdbId, season, episode, _clientIP, _base, audio = 'sub') {
    const mediaType = season ? 'tv' : 'movie';
    if (mediaType === 'movie') return null;

    const anime = await isAnime(tmdbId, season);
    if (!anime) return null;

    const anilistId = await tmdbToAnilist(tmdbId, mediaType, season);
    if (!anilistId) return null;

    const data = await fetchTokens(anilistId, season, episode, audio);
    if (!data) return null;

    const allUrls = extractUrls(data);
    if (!allUrls.length) return null;

    return {
        allUrls: allUrls.map(url => ({
            url,
            headers: {
                'Referer': 'https://tryembed.us.cc/',
                'Origin': 'https://tryembed.us.cc',
            }
        })), skipProxy: false
    };
}