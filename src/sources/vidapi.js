const BASE_URL = 'https://vaplayer.ru';
const IFRAME_URL = 'https://brightpathsignals.com';
const API_URL = 'https://streamdata.vaplayer.ru/api.php';

const UA_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

const getUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

export const SKIP_VERIFY = true;
export const MULTI_URL = true;

function getHeaders() {
    return {
        'User-Agent': getUA(),
        'Referer': `${IFRAME_URL}/`,
        'Origin': IFRAME_URL,
        'Accept': '*/*',
    };
}

export async function getStream(id, s, e) {
    const headers = getHeaders();
    const url = new URL(API_URL);
    url.searchParams.set('tmdb', id);

    if (s != null && e != null) {
        url.searchParams.set('type', 'tv');
        url.searchParams.set('season', String(s));
        url.searchParams.set('episode', String(e));
    } else {
        url.searchParams.set('type', 'movie');
    }

    try {
        const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;

        const json = await res.json();
        if (json.status_code !== '200' || !json.data) return null;

        const allUrls = (json.data.stream_urls ?? [])
            .filter(u => !u.includes('tmstrd.justhd.tv'))
            .map(u => ({ url: u, headers }));

        if (!allUrls.length) return null;
        return { allUrls };
    } catch {
        return null;
    }
}

export const VERIFY_HEADERS = getHeaders();