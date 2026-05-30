export const SKIP_VERIFY = true;
export const MULTI_URL = false;

const BASE_URL = 'https://vidnest.fun';
const API_BASE_URL = 'https://new.vidnest.fun';

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
};

export const CDN_HEADERS = [
    {
        pattern: /letsgocdn\d+\.shop/i,
        headers: {
            'Referer': 'https://vidnest.fun/',
            'Origin': 'https://vidnest.fun',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
        },
    },
    {
        pattern: /cdn\.mewstream\.buzz/i,
        headers: {
            'Referer': 'https://vidnest.fun/',
            'Origin': 'https://vidnest.fun',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
        },
    },
];

const CDN_PROXY_HEADERS = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.5',
    'origin': 'https://megaplay.buzz',
    'referer': 'https://megaplay.buzz/',
};

const VIDNEST_ALPHABET = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';

const VIDNEST_REVERSE_MAP = (() => {
    const map = {};
    for (let i = 0; i < VIDNEST_ALPHABET.length; i++) map[VIDNEST_ALPHABET[i]] = i;
    return map;
})();

function decodeVidnestBase64(input) {
    let padded = input;
    const mod = padded.length % 4;
    if (mod !== 0) padded += '='.repeat(4 - mod);
    const bytes = [];
    for (let i = 0; i < padded.length; i += 4) {
        const chunk = padded.slice(i, i + 4);
        const c0 = VIDNEST_REVERSE_MAP[chunk[0]] ?? 64;
        const c1 = VIDNEST_REVERSE_MAP[chunk[1]] ?? 64;
        const c2 = chunk[2] === '=' ? 64 : (VIDNEST_REVERSE_MAP[chunk[2]] ?? 64);
        const c3 = chunk[3] === '=' ? 64 : (VIDNEST_REVERSE_MAP[chunk[3]] ?? 64);
        bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
        if (c2 !== 64) bytes.push((((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff);
        if (c3 !== 64) bytes.push((((c2 & 0x03) << 6) | c3) & 0xff);
    }
    return Buffer.from(bytes).toString('utf8');
}

function decrypt(payload) {
    return JSON.parse(decodeVidnestBase64(payload));
}

async function getAnimeInfo(tmdbId, season) {
    const k = process.env.TMDB_API_KEY;
    if (!k) return { isAnime: false, titles: [], year: null };
    try {
        const [showRes, seasonRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${k}`, { signal: AbortSignal.timeout(5000) }),
            season ? fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${k}`, { signal: AbortSignal.timeout(5000) }) : Promise.resolve(null),
        ]);
        let showData = null, seasonData = null;
        if (showRes.ok) showData = await showRes.json(); else showRes.body?.cancel();
        if (seasonRes) { if (seasonRes.ok) seasonData = await seasonRes.json(); else seasonRes.body?.cancel(); }
        const genres = showData?.genres || [];
        const originCountry = showData?.origin_country || [];
        const originalLanguage = showData?.original_language || '';
        const isAnime = genres.some(g => g.id === 16) && (originCountry.includes('JP') || originalLanguage === 'ja');
        const titles = [];
        if (seasonData?.name) titles.push(seasonData.name);
        const t = showData?.title || showData?.name || '';
        const ot = showData?.original_title || showData?.original_name || '';
        if (t) titles.push(t);
        if (ot && ot !== t) titles.push(ot);
        let year = null;
        const dateStr = seasonData?.air_date || showData?.first_air_date || '';
        if (dateStr) year = parseInt(dateStr.slice(0, 4), 10);
        return { isAnime, titles: [...new Set(titles.filter(Boolean))], year };
    } catch {
        return { isAnime: false, titles: [], year: null };
    }
}

async function tmdbToAnilist(tmdbId, season, info) {
    try {
        const res = await fetch(`https://api.ani.zip/mappings?tmdb_id=${tmdbId}&type=tv&season=${season || 1}`, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
            const data = await res.json();
            const id = data?.mappings?.[0]?.anilist_id ?? null;
            if (id) return id;
        } else res.body?.cancel();
    } catch { }

    const k = process.env.TMDB_API_KEY;
    if (!k) return null;

    let { titles = [], year = null } = info || {};
    titles = [...new Set(titles.filter(Boolean))];
    if (!titles.length) return null;

    const query = `query ($search: String) { Page(page:1,perPage:10) { media(search:$search,type:ANIME) { id title { romaji english native } startDate { year } format } } }`;
    let bestId = null, bestScore = -1;

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
            const entryTitles = [entry.title?.romaji, entry.title?.english, entry.title?.native].filter(Boolean).map(t => t.toLowerCase());
            const searchLower = searchTitle.toLowerCase();
            let score = 0;
            if (entryTitles.some(t => t === searchLower)) score += 5;
            else if (entryTitles.some(t => t.includes(searchLower) || searchLower.includes(t))) score += 3;
            else continue;
            if (year && entry.startDate?.year) {
                const diff = Math.abs(entry.startDate.year - year);
                if (diff === 0) score += 3;
                else if (diff === 1) score += 1;
                else if (diff > 2) score -= 3;
            }
            if (['TV', 'TV_SHORT', 'ONA', 'OVA'].includes(entry.format)) score += 1;
            if (score > bestScore) { bestScore = score; bestId = entry.id; }
        }
        if (bestScore >= 8) break;
    }
    return bestId;
}

const SERVERS = ['hollymoviehd', 'allmovies', 'catflix', 'purstream', 'lamda', 'vidlink', 'klikxxi'];

export async function getStream(tmdbId, season, episode, _clientIP, _base, audio = 'sub') {
    const ep = episode ? parseInt(episode, 10) : 1;
    const audioParam = audio === 'dub' ? 'dub' : 'sub';

    if (season) {
        const info = await getAnimeInfo(tmdbId, season);
        if (info.isAnime) {
            const anilistId = await tmdbToAnilist(tmdbId, season, info);
            if (anilistId) {
                try {
                    const apiUrl = `${API_BASE_URL}/hianime/anime/${anilistId}/${ep}/${audioParam}`;
                    const res = await fetch(apiUrl, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(15000) });
                    if (res.ok) {
                        const json = await res.json();
                        const data = json.encrypted ? decrypt(json.data) : json.data;
                        const file = data?.sources?.[0]?.file;
                        if (file) {
                            const proxiedUrl = `https://megacloud.animanga.fun/proxy?url=${encodeURIComponent(file)}&headers=${encodeURIComponent(JSON.stringify(CDN_PROXY_HEADERS))}`;
                            return { url: proxiedUrl, headers: REQUEST_HEADERS };
                        }
                    } else res.body?.cancel();
                } catch { }
            }
        }
    }

    if (audio === 'dub') return null;

    const segment = season ? `tv/${tmdbId}/${season}/${ep}` : `movie/${tmdbId}`;

    const results = await Promise.allSettled(
        SERVERS.map(async (server) => {
            const url = `${API_BASE_URL}/${server}/${segment}`;
            const res = await fetch(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(10000) });
            if (!res.ok) { res.body?.cancel(); throw new Error(`${server}: ${res.status}`); }
            const json = await res.json();
            if (!json.data) throw new Error(`${server}: no data`);
            const data = json.encrypted ? decrypt(json.data) : json.data;
            const file = data?.sources?.[0]?.file
                ?? data?.streams?.[0]?.url
                ?? data?.url?.[0]?.link
                ?? data?.data?.stream?.playlist;
            if (!file) throw new Error(`${server}: no file`);
            return file;
        })
    );

    const file = results.find(r => r.status === 'fulfilled')?.value;
    if (!file) return null;

    return { url: file, headers: REQUEST_HEADERS, skipProxy: false };
}

export const VERIFY_HEADERS = { ...REQUEST_HEADERS };