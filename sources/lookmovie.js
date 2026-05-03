const BASE = 'https://lmscript.xyz';
const TMDB_BASE = 'https://api.themoviedb.org/3';

export const VERIFY_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const HEADERS = { ...VERIFY_HEADERS };

const QUALITY_PRIORITY = ['1080p', '1080', '720p', '720', '480p', '480', '360p', '360', '240p', '240', '144p', '144', 'auto'];

export async function getStream(id, s = null, e = null, tmdbKey = null, clientIP = null) {
    try {
        if (!tmdbKey) return null;

        const isTV = s != null && e != null;
        const tmdbUrl = isTV
            ? `${TMDB_BASE}/tv/${id}?api_key=${tmdbKey}`
            : `${TMDB_BASE}/movie/${id}?api_key=${tmdbKey}`;

        const tmdbRes = await fetch(tmdbUrl);
        if (!tmdbRes.ok) return null;
        const tmdbData = await tmdbRes.json();
        const title = tmdbData?.title || tmdbData?.name;
        if (!title) return null;

        const searchUrl = isTV
            ? `${BASE}/v1/shows?filters[q]=${encodeURIComponent(title)}`
            : `${BASE}/v1/movies?filters[q]=${encodeURIComponent(title)}`;

        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        if (!searchRes.ok) return null;

        const searchData = await searchRes.json();
        const items = searchData?.items;
        if (!items?.length) return null;

        const match = items.find(item => String(item.tmdb_prefix) === String(id));
        if (!match) return null;

        let streamId = null;

        if (isTV) {
            const showRes = await fetch(`${BASE}/v1/shows?expand=episodes&id=${match.id_show}`, { headers: HEADERS });
            if (!showRes.ok) return null;
            const showData = await showRes.json();
            const episode = showData?.episodes?.find(ep =>
                Number(ep.season) === Number(s) && Number(ep.episode) === Number(e)
            );
            if (!episode) return null;
            streamId = episode.id;
        } else {
            streamId = match.id_movie;
        }

        const viewUrl = isTV
            ? `${BASE}/v1/episodes/view?expand=streams,subtitles&id=${streamId}`
            : `${BASE}/v1/movies/view?expand=streams,subtitles&id=${streamId}`;

        const viewRes = await fetch(viewUrl, { headers: HEADERS });
        if (!viewRes.ok) return null;

        const viewData = await viewRes.json();
        const streams = viewData?.streams;
        if (!streams) return null;

        for (const q of QUALITY_PRIORITY) {
            if (streams[q]) return streams[q];
        }

        return null;
    } catch {
        return null;
    }
}