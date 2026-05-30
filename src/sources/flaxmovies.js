const API_BASE = 'https://itjiocunahckqxcnzpoy.supabase.co/functions/v1';
const APIKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0amlvY3VuYWhja3F4Y256cG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzM1MjQsImV4cCI6MjA5MjkwOTUyNH0.9x9ykdHAzrv_GSvnawPeQaOxQeh3sZg0QAh4u9VOF4M';

const HEADERS = {
    'apikey': APIKEY,
    'authorization': `Bearer ${APIKEY}`,
    'content-type': 'application/json',
    'origin': 'https://flaxmovies.xyz',
    'referer': 'https://flaxmovies.xyz/',
};

export const SKIP_VERIFY = true;
export const MULTI_URL = true;

export const CDN_HEADERS = [
    {
        pattern: /flix2watch\.pro/i,
        headers: {
            'Referer': 'https://flaxmovies.xyz/',
            'Origin': 'https://flaxmovies.xyz',
        },
    },
];

export async function getStream(id, season, episode) {
    const isMovie = !season;
    const endpoint = isMovie ? `${API_BASE}/get-movie` : `${API_BASE}/get-tv`;
    const body = isMovie
        ? JSON.stringify({ id: String(id) })
        : JSON.stringify({ id: String(id), season: Number(season), episode: Number(episode) });

    const res = await fetch(endpoint, { method: 'POST', headers: HEADERS, body, signal: AbortSignal.timeout(15000) });
    if (!res.ok) { res.body?.cancel(); return null; }
    const data = await res.json();
    if (!data?.signed_url) return null;
    return {
        allUrls: [{ url: data.signed_url, headers: { 'Referer': 'https://flaxmovies.xyz/', 'Origin': 'https://flaxmovies.xyz' }, skipProxy: false, skipHlsCheck: true }],
    };
}