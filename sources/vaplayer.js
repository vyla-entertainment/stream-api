const BASE = 'https://streamdata.vaplayer.ru/api.php';

export const SKIP_VERIFY = true;

export const VERIFY_HEADERS = {
    'Referer': 'https://brightpathsignals.com/',
    'Origin': 'https://brightpathsignals.com',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
};

export async function getStream(id, s, e) {
    const params = new URLSearchParams({ tmdb: id, type: s ? 'tv' : 'movie' });
    if (s) params.set('season', s);
    if (e) params.set('episode', e);
    const url = `${BASE}?${params}`;
    const res = await fetch(url, { headers: VERIFY_HEADERS });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        return null;
    }
    const data = await res.json();
    if (data?.status_code !== '200' || !data?.data?.stream_urls?.length) return null;
    return {
        url: data.data.stream_urls[0],
        headers: VERIFY_HEADERS,
        allUrls: data.data.stream_urls,
    };
}