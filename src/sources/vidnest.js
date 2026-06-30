const BASE_URL = 'https://vidnest.fun';
const API_BASE_URL = 'https://new.vidnest.fun';

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        },
    },
    {
        pattern: /cdn\.mewstream\.buzz/i,
        headers: {
            'Referer': 'https://vidnest.fun/',
            'Origin': 'https://vidnest.fun',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
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
        if (showRes.ok) showData = await showRes.json();
        if (seasonRes?.ok) seasonData = await seasonRes.json();
        const genres = showData?.genres || [];
        const isAnime = genres.some(g => g.id === 16);
        const titles = [];
        if (seasonData?.name) titles.push(seasonData.name);
        if (showData?.name) titles.push(showData.name);
        const dateStr = seasonData?.air_date || showData?.first_air_date || '';
        let year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
        return { isAnime, titles: [...new Set(titles.filter(Boolean))], year };
    } catch { return { isAnime: false, titles: [], year: null }; }
}

async function tmdbToAnilist(tmdbId, season, info) {
    try {
        const res = await fetch(`https://api.ani.zip/mappings?tmdb_id=${tmdbId}&type=tv&season=${season || 1}`, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
            const data = await res.json();
            const id = data?.mappings?.[0]?.anilist_id;
            if (id) return id;
        }
    } catch { }

    const k = process.env.TMDB_API_KEY;
    if (!k) return null;
    const { titles = [], year = null } = info || {};
    const query = `query ($search: String) { Page(page:1,perPage:5) { media(search:$search,type:ANIME) { id title { romaji english native } startDate { year } format } } }`;
    for (const searchTitle of titles) {
        try {
            const res = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables: { search: searchTitle } }),
                signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) continue;
            const data = await res.json();
            const entry = data?.data?.Page?.media?.[0];
            if (entry) return entry.id;
        } catch { continue; }
    }
    return null;
}

const SERVER_KEYS = ['hollymoviehd', 'allmovies', 'catflix', 'purstream', 'lamda', 'vidlink', 'klikxxi'];

export async function getStream(args) {
    const { id, s, e, audio } = args;
    const ep = e ? parseInt(e, 10) : 1;
    const audioParam = audio === 'dub' ? 'dub' : 'sub';

    if (s) {
        const info = await getAnimeInfo(id, s);
        if (info.isAnime) {
            const anilistId = await tmdbToAnilist(id, s, info);
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
                    }
                } catch { }
            }
        }
    }

    if (audio === 'dub') return null;
    const segment = s ? `tv/${id}/${s}/${ep}` : `movie/${id}`;
    const settled = await Promise.allSettled(
        SERVER_KEYS.map(async (server) => {
            const url = `${API_BASE_URL}/${server}/${segment}`;
            const res = await fetch(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(10000) });
            if (!res.ok) return null;
            const json = await res.json();
            const data = json.encrypted ? decrypt(json.data) : json.data;
            const file = data?.sources?.[0]?.file ?? data?.streams?.[0]?.url ?? data?.url?.[0]?.link ?? data?.data?.stream?.playlist;
            return file ? { url: file, server } : null;
        })
    );

    const candidates = settled.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    if (!candidates.length) return null;

    return {
        allUrls: candidates.map(c => ({
            url: c.url,
            server: c.server,
            headers: REQUEST_HEADERS,
            skipProxy: false,
            skipVerify: true,
            skipHlsCheck: true
        }))
    };
}

export async function getSources(args) {
    const res = await getStream(args);
    return res ? res.allUrls.map(u => u.server) : [];
}

export const VERIFY_HEADERS = { ...REQUEST_HEADERS };