'use strict';

const DEC_API = 'https://enc-dec.app/api/dec-videasy';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, */*; q=0.01',
    'Referer': 'https://www.vidking.net/',
    'Origin': 'https://www.vidking.net'
};

const MOVIE_API = 'https://api.videasy.net/mb-flix/sources-with-title';
const TV_API = 'https://api.videasy.net/downloader2/sources-with-title';

export const SKIP_VERIFY = true;
export const MULTI_URL = false;
export const VERIFY_HEADERS = { ...HEADERS };

async function fetchMeta(tmdbId, mediaType) {
    const k = process.env.TMDB_API_KEY;
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${k}&append_to_response=external_ids`);
    if (!res) return { title: '', year: '', imdbId: '' };
    const d = await res.json();
    const title = mediaType === 'movie' ? (d.title || d.original_title || '') : (d.name || d.original_name || '');
    const year = (d.release_date || d.first_air_date || '').slice(0, 4);
    const imdbId = d.imdb_id || d.external_ids?.imdb_id || '';
    return { title, year, imdbId };
}

async function decrypt(blob, tmdbId) {
    if (!blob || blob.length < 10) return null;
    try {
        const res = await fetch(DEC_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: blob, id: tmdbId })
        });
        if (!res?.ok) return null;
        const json = await res.json();
        if (json.status !== 200 || !json.result?.sources) return null;
        return json.result.sources.filter(s => s?.url).map(s => s.url);
    } catch {
        return null;
    }
}

export async function getStream(id, s, e) {
    const isMovie = !s;
    const mediaType = isMovie ? 'movie' : 'tv';
    const { title, year, imdbId } = await fetchMeta(id, mediaType);
    const apiUrl = isMovie ? MOVIE_API : TV_API;
    const params = new URLSearchParams({
        title,
        mediaType,
        year,
        episodeId: String(e ?? 1),
        seasonId: String(s ?? 1),
        tmdbId: String(id),
        imdbId,
        _t: Date.now(),
    });
    const res = await fetch(`${apiUrl}?${params}`, { headers: HEADERS });
    if (!res?.ok) return null;
    const blob = await res.text();
    const urls = await decrypt(blob, String(id));
    if (!urls?.length) return null;
    return { url: urls[0], headers: HEADERS };
}