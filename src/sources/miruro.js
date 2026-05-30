export const SKIP_VERIFY = true;
export const MULTI_URL = true;

const PIPE_OBF_KEY = Uint8Array.from(
    '71951034f8fbcf53d89db52ceb3dc22c'.match(/../g),
    x => parseInt(x, 16)
);

const PROTOCOL_VERSION = '0.2.0';
const DEFAULT_PROVIDER = 'kiwi';
const BASE_URL = 'https://www.miruro.tv';

const MIRURO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
};

function b64Encode(obj) {
    return Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function decodeObfuscated(text) {
    const e = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = e + '='.repeat((4 - e.length % 4) % 4);
    const bytes = Buffer.from(padded, 'base64');
    const xored = Buffer.allocUnsafe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        xored[i] = bytes[i] ^ PIPE_OBF_KEY[i % PIPE_OBF_KEY.length];
    }
    const { createGunzip } = await import('zlib');
    return new Promise((resolve, reject) => {
        const gz = createGunzip();
        const chunks = [];
        gz.on('data', c => chunks.push(c));
        gz.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch (err) { reject(err); }
        });
        gz.on('error', reject);
        gz.end(xored);
    });
}

async function pipeGet(path, query = {}) {
    const payload = { path, method: 'GET', query, body: null, version: PROTOCOL_VERSION };
    const res = await fetch(
        `${BASE_URL}/api/secure/pipe?e=${b64Encode(payload)}`,
        { headers: MIRURO_HEADERS, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) { res.body?.cancel(); throw new Error(`pipe ${path} → ${res.status}`); }
    const text = await res.text();
    if (res.headers.get('x-obfuscated') === '2') return decodeObfuscated(text);
    return JSON.parse(text);
}

async function tmdbToAnilist(tmdbId, season) {
    const type = 'tv';
    try {
        const res = await fetch(
            `https://api.ani.zip/mappings?tmdb_id=${tmdbId}&type=${type}&season=${season || 1}`,
            { signal: AbortSignal.timeout(6000) }
        );
        if (res.ok) {
            const data = await res.json();
            const id = data?.mappings?.[0]?.anilist_id ?? null;
            if (id) return id;
        } else { res.body?.cancel(); }
    } catch { }

    const k = process.env.TMDB_API_KEY;
    if (!k) return null;

    try {
        const [showRes, seasonRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${k}`, { signal: AbortSignal.timeout(5000) }),
            season ? fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${k}`, { signal: AbortSignal.timeout(5000) }) : Promise.resolve(null),
        ]);

        const titles = [];
        let year = null;

        if (seasonRes?.ok) {
            const sd = await seasonRes.json();
            if (sd.name) titles.push(sd.name);
            if (sd.air_date) year = parseInt(sd.air_date.slice(0, 4), 10);
        } else { seasonRes?.body?.cancel(); }

        if (showRes.ok) {
            const sd = await showRes.json();
            const t = sd.title || sd.name || '';
            const ot = sd.original_title || sd.original_name || '';
            if (t) titles.push(t);
            if (ot && ot !== t) titles.push(ot);
            if (!year) {
                const d = sd.release_date || sd.first_air_date || '';
                if (d) year = parseInt(d.slice(0, 4), 10);
            }
        } else { showRes.body?.cancel(); }

        const unique = [...new Set(titles.filter(Boolean))];
        if (!unique.length) return null;

        const query = `query($s:String){Page(page:1,perPage:10){media(search:$s,type:ANIME){id title{romaji english native}startDate{year}format}}}`;
        let bestId = null, bestScore = -1;

        for (const searchTitle of unique) {
            const res = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query, variables: { s: searchTitle } }),
                signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) { res.body?.cancel(); continue; }
            const data = await res.json();
            for (const entry of data?.data?.Page?.media || []) {
                const entryTitles = [entry.title?.romaji, entry.title?.english, entry.title?.native]
                    .filter(Boolean).map(t => t.toLowerCase());
                const sl = searchTitle.toLowerCase();
                let score = 0;
                if (entryTitles.some(t => t === sl)) score += 5;
                else if (entryTitles.some(t => t.includes(sl) || sl.includes(t))) score += 3;
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
    } catch { return null; }
}

async function isAnime(tmdbId, season) {
    const k = process.env.TMDB_API_KEY;
    if (!k) return false;
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${k}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) { res.body?.cancel(); return false; }
        const data = await res.json();
        const genres = data?.genres || [];
        const originCountry = data?.origin_country || [];
        const lang = data?.original_language || '';
        return genres.some(g => g.id === 16) && (originCountry.includes('JP') || lang === 'ja');
    } catch { return false; }
}

async function getEpisodeId(anilistId, episodeNumber, category = 'sub') {
    const data = await pipeGet('episodes', { anilistId: String(anilistId) });
    const providerData = data?.providers?.[DEFAULT_PROVIDER];
    if (!providerData) throw new Error(`provider ${DEFAULT_PROVIDER} not found`);
    const list = providerData.episodes?.[category] || providerData.episodes?.sub || [];
    const ep = list.find(e => e.number === episodeNumber);
    if (!ep) throw new Error(`episode ${episodeNumber} not found in ${category}`);
    return ep.id;
}

async function getSources(episodeId, anilistId, category = 'sub') {
    return pipeGet('sources', {
        episodeId,
        provider: DEFAULT_PROVIDER,
        category,
        anilistId: String(anilistId),
    });
}

const anilistCache = new Map();
const episodeIdCache = new Map();

async function getCachedAnilistId(tmdbId, season) {
    const key = `${tmdbId}-${season}`;
    if (anilistCache.has(key)) return anilistCache.get(key);
    const id = await tmdbToAnilist(tmdbId, season);
    if (id) {
        anilistCache.set(key, id);
        setTimeout(() => anilistCache.delete(key), 10 * 60 * 1000);
    }
    return id;
}

async function getCachedEpisodeId(anilistId, episodeNumber, category) {
    const key = `${anilistId}-${episodeNumber}-${category}`;
    if (episodeIdCache.has(key)) return episodeIdCache.get(key);
    const id = await getEpisodeId(anilistId, episodeNumber, category);
    if (id) {
        episodeIdCache.set(key, id);
        setTimeout(() => episodeIdCache.delete(key), 10 * 60 * 1000);
    }
    return id;
}

export async function getStream(tmdbId, season, episode, _clientIP, _base, audio = 'sub') {
    if (!season || !episode) return null;

    const anime = await isAnime(tmdbId, season).catch(() => false);
    if (!anime) return null;

    const anilistId = await getCachedAnilistId(tmdbId, season).catch(() => null);
    if (!anilistId) return null;

    const category = audio === 'dub' ? 'dub' : 'sub';
    const episodeNum = parseInt(episode, 10);

    const episodeId = await getCachedEpisodeId(anilistId, episodeNum, category).catch(() => null);
    if (!episodeId) return null;

    const sourcesData = await getSources(episodeId, anilistId, category).catch(() => null);
    if (!sourcesData?.streams?.length) return null;

    const hlsStreams = sourcesData.streams
        .filter(s => s.type === 'hls' && s.url && s.isActive !== false);

    if (!hlsStreams.length) return null;

    const refHeaders = {
        'Referer': 'https://kwik.cx/',
        'Origin': 'https://kwik.cx',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    };

    const allUrls = hlsStreams.map(s => ({
        url: s.url,
        headers: refHeaders,
        skipProxy: false,
        quality: s.quality,
    }));

    return { allUrls, skipProxy: false };
}