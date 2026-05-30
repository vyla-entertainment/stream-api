import { createHash, createDecipheriv } from 'crypto';
const BASE_URL = 'https://player.nhdapi.com';

const UA_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const getUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

export const SKIP_VERIFY = true;
export const MULTI_URL = true;

const TV_PACKAGES = ['Hydra', 'Titan', 'Nexus', 'Inferno', 'BKC'];

function decryptPayload(payload) {
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');
    const key = createHash('sha256').update('Z9#rL!v2K*5qP&7mXw').digest();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
}

async function getSessionCookie(headers) {
    try {
        const res = await fetch(BASE_URL + '/api/session', { method: 'POST', headers, body: null });
        return res?.headers.get('Set-Cookie') || '';
    } catch {
        return '';
    }
}

async function getToken(headers) {
    try {
        const res = await fetch(`${BASE_URL}/api/token`, { headers, referrer: BASE_URL + '/' });
        if (!res || res.status !== 200) return '';
        const data = await res.json();
        return data.token || '';
    } catch {
        return '';
    }
}

async function fetchEncrypted(url, headers) {
    try {
        const res = await fetch(url, { headers });
        if (!res || res.status !== 200) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function extractSources(api, proxyHeaders) {
    const sources = [];
    if (api.stream?.hls_streaming) {
        sources.push({ url: api.stream.hls_streaming, headers: proxyHeaders });
    }
    for (const download of api.stream?.download ?? []) {
        sources.push({ url: download.url, headers: proxyHeaders });
    }
    return sources;
}

function extractFallbackSources(api, proxyHeaders) {
    const sources = [];
    if (api.url) {
        sources.push({ url: api.url, headers: proxyHeaders });
    }
    return sources;
}

async function resolveSwitch(sw, headers, proxyHeaders) {
    try {
        const url = `${BASE_URL}/api/source/${sw.file_code}`;
        const encrypted = await fetchEncrypted(url, headers);
        if (!encrypted) return [];
        const api = decryptPayload(encrypted);
        return extractSources(api, proxyHeaders);
    } catch {
        return [];
    }
}

async function buildSession(id) {
    const ua = getUA();
    const headers = {
        'User-Agent': ua,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: BASE_URL + '/',
        Origin: BASE_URL,
        Cookie: '',
        'x-api-token': '',
        'x-content-id': String(id),
    };

    const cookie = await getSessionCookie(headers);
    if (!cookie) return null;

    headers.Cookie = cookie.split(';')[0] || 'vid_session=' + Buffer.from(JSON.stringify({ id: String(id), iat: Date.now() })).toString('base64');

    await new Promise(r => setTimeout(r, 100));

    const token = await getToken(headers);
    if (!token) return null;

    headers['x-api-token'] = token;

    return { headers, ua, token };
}

async function fetchTvFallback(id, s, e, headers, proxyHeaders) {
    const results = await Promise.all(
        TV_PACKAGES.map(async (pkg) => {
            try {
                const url = `${BASE_URL}/api/v3/fallback?type=tv&id=${id}&s=${s}&e=${e}&pkg=${pkg}`;
                const encrypted = await fetchEncrypted(url, headers);
                if (!encrypted) return [];
                const api = decryptPayload(encrypted);
                return extractFallbackSources(api, proxyHeaders);
            } catch {
                return [];
            }
        })
    );
    return results.flat();
}

export async function getStream(id, s, e) {
    try {
        const session = await buildSession(id);
        if (!session) return null;

        const { headers, ua, token } = session;

        const proxyHeaders = {
            'User-Agent': ua,
            Referer: BASE_URL + '/',
            Origin: BASE_URL,
            Cookie: headers.Cookie,
            'x-api-token': token,
            'x-content-id': String(id),
        };

        let allUrls = [];

        if (s) {
            allUrls = await fetchTvFallback(id, s, e, headers, proxyHeaders);
        } else {
            const url = `${BASE_URL}/api/movie/?id=${id}`;
            const encrypted = await fetchEncrypted(url, headers);
            if (!encrypted) return null;
            const api = decryptPayload(encrypted);
            const mainSources = extractSources(api, proxyHeaders);
            const switchSources = api.switches?.length
                ? (await Promise.all(api.switches.map(sw => resolveSwitch(sw, headers, proxyHeaders)))).flat()
                : [];
            allUrls = [...mainSources, ...switchSources];
        }

        const seen = new Set();
        const deduped = allUrls.filter(src => {
            if (seen.has(src.url)) return false;
            seen.add(src.url);
            return true;
        });

        if (!deduped.length) return null;

        return { allUrls: deduped };
    } catch {
        return null;
    }
}