export const SKIP_VERIFY = true;
export const MULTI_URL = true;

async function resolveRedirect(url, headers) {
    try {
        const res = await fetch(url, {
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(8000),
        });
        res.body?.cancel();
        const location = res.headers.get('location');
        if ((res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) && location) {
            return new URL(location, url).href;
        }
        return url;
    } catch {
        return url;
    }
}

async function getAnimeInfo(tmdbId, season) {
    try {
        const k = process.env.TMDB_API_KEY;
        if (!k) return { isAnime: false, titles: [], year: null };

        const [showRes, seasonRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${k}`, { signal: AbortSignal.timeout(5000) }),
            season ? fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${k}`, { signal: AbortSignal.timeout(5000) }) : Promise.resolve(null),
        ]);

        let showData = null;
        let seasonData = null;

        if (showRes.ok) showData = await showRes.json();
        else showRes.body?.cancel();

        if (seasonRes) {
            if (seasonRes.ok) seasonData = await seasonRes.json();
            else seasonRes.body?.cancel();
        }

        const genres = showData?.genres || [];
        const originCountry = showData?.origin_country || [];
        const originalLanguage = showData?.original_language || '';
        const isAnimeShow = genres.some(g => g.id === 16) && (originCountry.includes('JP') || originalLanguage === 'ja');

        const titles = [];
        if (seasonData?.name) titles.push(seasonData.name);
        const t = showData?.title || showData?.name || '';
        const ot = showData?.original_title || showData?.original_name || '';
        if (t) titles.push(t);
        if (ot && ot !== t) titles.push(ot);

        let year = null;
        const dateStr = seasonData?.air_date || showData?.release_date || showData?.first_air_date || '';
        if (dateStr) year = parseInt(dateStr.slice(0, 4), 10);

        return { isAnime: isAnimeShow, titles: [...new Set(titles.filter(Boolean))], year };
    } catch {
        return { isAnime: false, titles: [], year: null };
    }
}

async function tmdbToAnilist(tmdbId, mediaType, season, prefetched = null) {
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

    const k = process.env.TMDB_API_KEY;
    if (!k) return null;

    let titles = prefetched?.titles?.length ? [...prefetched.titles] : [];
    let year = prefetched?.year ?? null;

    if (!titles.length) {
        try {
            if (mediaType === 'tv' && season && parseInt(season, 10) > 0) {
                const seasonRes = await fetch(
                    `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${k}`,
                    { signal: AbortSignal.timeout(5000) }
                );
                if (seasonRes.ok) {
                    const seasonData = await seasonRes.json();
                    if (seasonData.name) titles.push(seasonData.name);
                    const dateStr = seasonData.air_date || '';
                    if (dateStr) year = parseInt(dateStr.slice(0, 4), 10);
                } else { seasonRes.body?.cancel(); }
            }
            const showRes = await fetch(
                mediaType === 'tv'
                    ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${k}`
                    : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${k}`,
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
        } catch { return null; }
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
        } catch { continue; }

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
            'Referer': `https://tryembed.us.cc/embed/anime/${anilistId}/${e}/${audio}`,
            'Origin': 'https://tryembed.us.cc',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
        },
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { res.body?.cancel(); return null; }
    return await res.json();
}

function extractUrls(data) {
    const urls = [];
    const providers = data?.providers || [];
    for (const provider of providers) {
        for (const q of provider.qualities || []) {
            if (q.token) urls.push(`https://tryembed.us.cc/s/${q.token}.m3u8`);
            if (q.fallbackToken) urls.push(`https://tryembed.us.cc/s/${q.fallbackToken}.m3u8`);
        }
    }
    return urls;
}


const animeInfoCache = new Map();

async function getCachedAnimeInfo(tmdbId, season) {
    const key = `${tmdbId}-${season || ''}`;
    if (animeInfoCache.has(key)) return animeInfoCache.get(key);
    const result = await getAnimeInfo(tmdbId, season);
    animeInfoCache.set(key, result);
    setTimeout(() => animeInfoCache.delete(key), 10 * 60 * 1000);
    return result;
}

const anilistIdCache = new Map();

async function getCachedAnilistId(tmdbId, mediaType, season, info) {
    const key = `${tmdbId}-${mediaType}-${season || ''}`;
    if (anilistIdCache.has(key)) return anilistIdCache.get(key);
    const result = await tmdbToAnilist(tmdbId, mediaType, season, info);
    if (result) {
        anilistIdCache.set(key, result);
        setTimeout(() => anilistIdCache.delete(key), 10 * 60 * 1000);
    }
    return result;
}

export async function getStream(tmdbId, season, episode, _clientIP, _base, audio = 'sub') {
    const mediaType = season ? 'tv' : 'movie';
    if (mediaType === 'movie') return null;

    const info = await getCachedAnimeInfo(tmdbId, season);
    if (!info.isAnime) return null;

    const anilistId = await getCachedAnilistId(tmdbId, mediaType, season, info);
    if (!anilistId) return null;

    const data = await fetchTokens(anilistId, season, episode, audio);
    if (!data) return null;

    const rawUrls = extractUrls(data);
    if (!rawUrls.length) return null;

    const refHeaders = {
        'Referer': 'https://tryembed.us.cc/',
        'Origin': 'https://tryembed.us.cc',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
    };

    const allUrls = (await Promise.all(
        rawUrls.map(async (url) => {
            try {
                const res = await fetch(url, {
                    headers: refHeaders,
                    redirect: 'manual',
                    signal: AbortSignal.timeout(10000),
                });
                res.body?.cancel();
                const location = res.headers.get('location');
                const resolved = (location && res.status >= 301 && res.status <= 308)
                    ? new URL(location, url).href
                    : url;
                return {
                    url: resolved,
                    headers: refHeaders,
                    skipProxy: false,
                };
            } catch {
                return null;
            }
        })
    )).filter(Boolean);

    if (!allUrls.length) return null;

    return { allUrls, skipProxy: false };
}