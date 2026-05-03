'use strict';

const BASE_URL = 'https://vsembed.ru';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    'Referer': BASE_URL + '/',
};

const PLAYER_DOMAINS = {
    '{v1}': 'neonhorizonworkshops.com',
    '{v2}': 'wanderlynest.com',
    '{v3}': 'orchidpixelgardens.com',
    '{v4}': 'cloudnestra.com',
};

async function fetchHtml(url, referer) {
    if (url.startsWith('//')) url = 'https:' + url;
    const headers = { ...HEADERS };
    if (referer) headers['Referer'] = referer;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (res.status !== 200) return null;
    return res.text();
}

function extractSecondUrl(html) {
    return html.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
}

function extractThirdUrl(html, secondUrl) {
    const rel = html.match(/src:\s*['"]([^'"]+)['"]/i)?.[1];
    if (!rel) return null;
    if (secondUrl.startsWith('//')) secondUrl = 'https:' + secondUrl;
    try {
        return new URL(rel, secondUrl).href;
    } catch {
        return null;
    }
}

function extractM3u8Urls(html) {
    const fileField = html.match(/file\s*:\s*["']([^"']+)["']/i)?.[1];
    if (!fileField) return null;

    const urls = fileField.split(/\s+or\s+/i).map(template => {
        let url = template;
        for (const [placeholder, domain] of Object.entries(PLAYER_DOMAINS)) {
            url = url.replace(placeholder, domain);
        }
        return (url.includes('{') || url.includes('}')) ? null : url;
    }).filter(Boolean);

    return urls.length ? urls : null;
}

async function getStream(id, s, e) {
    const pageUrl = s
        ? `${BASE_URL}/embed/tv?tmdb=${id}&season=${s}&episode=${e}`
        : `${BASE_URL}/embed/movie?tmdb=${id}`;

    const html1 = await fetchHtml(pageUrl, BASE_URL + '/');
    if (!html1) return null;

    let secondUrl = extractSecondUrl(html1);
    if (!secondUrl) return null;
    if (secondUrl.startsWith('//')) secondUrl = 'https:' + secondUrl;

    const html2 = await fetchHtml(secondUrl, pageUrl);
    if (!html2) return null;

    const thirdUrl = extractThirdUrl(html2, secondUrl);
    if (!thirdUrl) return null;

    const html3 = await fetchHtml(thirdUrl, secondUrl);
    if (!html3) return null;

    const urls = extractM3u8Urls(html3);
    if (!urls) return null;

    return urls[0];
}

const PROXY_HEADERS = {
    'Referer': 'https://cloudnestra.com/',
    'Origin': 'https://cloudnestra.com',
    'User-Agent': HEADERS['User-Agent'],
};

async function proxyStream(url, res, { fetchUpstream, rewriteM3u8 }) {
    const upstream = await fetchUpstream(url, 0, PROXY_HEADERS);
    const ct = (upstream.headers['content-type'] || '').toLowerCase();
    const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(url);
    if (isM3u8) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(rewriteM3u8(body, url, '&vs=1'));
    }
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
}

const VERIFY_HEADERS = { ...PROXY_HEADERS };

export { getStream, proxyStream, VERIFY_HEADERS };
export { PROXY_HEADERS as HEADERS };