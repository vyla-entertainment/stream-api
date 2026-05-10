const BASE = 'https://streams.icefy.top';

export const SKIP_VERIFY = false;

export const VERIFY_HEADERS = {
    'Referer': 'https://streams.icefy.top/',
    'Origin': 'https://streams.icefy.top',
};

export async function getStream(id, s, e) {
    const url = s && e
        ? `${BASE}/tv/${id}/${s}/${e}`
        : `${BASE}/movie/${id}`;
    const res = await fetch(url, { headers: { 'Referer': BASE + '/' } });
    if (!res.ok) { res.body?.cancel(); return null; }
    const data = await res.json();
    if (!data?.stream) return null;
    return {
        url: data.stream,
        headers: {
            'Referer': 'https://streams.icefy.top/',
            'Origin': 'https://streams.icefy.top',
        },
    };
}