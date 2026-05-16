'use strict';

const GATE_URL = 'https://gate.flicky.host';
const REFERER = 'https://meowtv.ru';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36';

const VERIFY_HEADERS = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': REFERER,
    'Origin': REFERER,
};

function fetchWithTimeout(url, headers, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { headers, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

async function getStream(id, s, e) {
    const type = s ? 'tv' : 'movie';
    let url = `${GATE_URL}/v17/${type}/${id}`;
    if (s) url += `/${s}/${e}`;

    const res = await fetchWithTimeout(url, {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Referer': REFERER,
        'Origin': REFERER,
    }, 8000);

    if (!res.ok) throw new Error(`MeowTV gate failed: ${res.status}`);
    const data = await res.json();
    const streamUrl = data?.stream?.url;
    if (!streamUrl || !streamUrl.startsWith('http')) throw new Error('MeowTV: no stream url');
    return {
        url: streamUrl,
        headers: {
            'User-Agent': UA,
            'Referer': REFERER,
            'Origin': REFERER,
        },
    };
}

export { getStream, VERIFY_HEADERS };
export const SKIP_VERIFY = true;