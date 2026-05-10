import { getDownloads as get02movieDownloads } from '../sources/02movie.js';

export async function handleDownloadMovie(id, corsHeaders) {
    try {
        const downloads = await get02movieDownloads(id, null, null);

        return {
            status: 200,
            body: JSON.stringify({ downloads }, null, 2),
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        };
    } catch (e) {
        return {
            status: 500,
            body: JSON.stringify({ error: e.message }),
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        };
    }
}

export async function handleDownloadTv(id, season, episode, corsHeaders) {
    try {
        const downloads = await get02movieDownloads(id, season, episode);

        return {
            status: 200,
            body: JSON.stringify({ downloads }, null, 2),
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        };
    } catch (e) {
        return {
            status: 500,
            body: JSON.stringify({ error: e.message }),
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        };
    }
}