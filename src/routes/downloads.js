import { getDownloads as get02movieDownloads } from '../sources/02movie.js';
import { getDownloads as getMovieBoxDownloads } from '../sources/moviebox.js';

async function mergeDownloads(tmdbId, season, episode) {
    const [s02, smb] = await Promise.allSettled([
        get02movieDownloads(tmdbId, season, episode),
        getMovieBoxDownloads(tmdbId, season, episode),
    ]);
    return [
        ...(s02.status === 'fulfilled' ? s02.value : []),
        ...(smb.status === 'fulfilled' ? smb.value : []),
    ];
}

function respondDownload(corsHeaders, fn) {
    return fn()
        .then(downloads => ({
            status: 200,
            body: JSON.stringify({ downloads }, null, 2),
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }))
        .catch(e => ({
            status: 500,
            body: JSON.stringify({ error: e.message }),
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }));
}

export const handleDownloadMovie = (id, corsHeaders) =>
    respondDownload(corsHeaders, () => mergeDownloads(id, null, null));

export const handleDownloadTv = (id, season, episode, corsHeaders) =>
    respondDownload(corsHeaders, () => mergeDownloads(id, season, episode));