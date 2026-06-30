const BASE = 'https://apexmovies.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const QUALITY_ORDER = ['4K', '1080P', '720P', '480P', '360P'];
const FETCH_HEADERS = {
    'User-Agent': UA,
    'Referer': `${BASE}/`,
    'Origin': BASE,
};

export async function getStream({ id, s, e }) {
    const params = new URLSearchParams({
        tmdb_id: id,
        media_type: s ? 'tv' : 'movie',
        _t: Date.now(),
    });
    if (s) params.set('season', s);
    if (e) params.set('episode', e);

    const res = await fetch(`${BASE}/wp-json/stream/v1/sources?${params}`, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`apexmovies: ${res.status}`);

    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || !json.data.length) return null;

    const m3u8 = json.data.filter(s => s.type === 'm3u8' && s.link);
    if (!m3u8.length) return null;

    m3u8.sort((a, b) => {
        const ai = QUALITY_ORDER.indexOf(a.quality?.toUpperCase());
        const bi = QUALITY_ORDER.indexOf(b.quality?.toUpperCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const allUrls = m3u8.map(s => ({ url: s.link }));
    return {
        url: allUrls[0].url,
        headers: FETCH_HEADERS,
        allUrls,
    };
}