const BASE_URL = 'https://cine.su';

export const VERIFY_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: BASE_URL + '/en/watch',
    Origin: BASE_URL,
};

export async function getStream(id, s = null, e = null) {
    const url =
        s && e
            ? `${BASE_URL}/v1/stream/master/tv/${id}/${s}/${e}.m3u8`
            : `${BASE_URL}/v1/stream/master/movie/${id}.m3u8`;

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: VERIFY_HEADERS,
        });

        if (res.status !== 200) return null;

        const text = await res.text();
        if (!text.trim().startsWith('#EXTM3U')) return null;

        return url;
    } catch {
        return null;
    }
}