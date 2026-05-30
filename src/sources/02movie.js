'use strict';

const BASE = 'https://02movie.com';
const DOWNLOADER_BASE = 'https://02moviedownloader.site';

export const SKIP_VERIFY = true;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': `${BASE}/`,
    ...(process.env.O2MOVIE_TOKEN ? { 'Authorization': `Bearer ${process.env.O2MOVIE_TOKEN}` } : {}),
};

const KEY_PARTS = ['o2by', 'M0v1e', 'S3cur', 'Ek3y!'];

async function getKey() {
    const raw = new TextEncoder().encode(KEY_PARTS.join('_'));
    const hash = await crypto.subtle.digest('SHA-256', raw);
    return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decrypt(encoded) {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const tag = bytes.slice(12, 28);
    const cipher = bytes.slice(28);
    const combined = new Uint8Array(cipher.length + tag.length);
    combined.set(cipher, 0);
    combined.set(tag, cipher.length);
    const key = await getKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
    return JSON.parse(new TextDecoder().decode(plain));
}

async function fetchToken(id, s, e) {
    const url = s && e
        ? `${BASE}/api/tv/download-token?id=${id}&season=${s}&episode=${e}`
        : `${BASE}/api/movies/download-token?id=${id}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`token fetch HTTP ${res.status}`);
    const json = await res.json();
    if (!json.token) throw new Error(`no token in response: ${JSON.stringify(json)}`);
    return json.token;
}

async function fetchDecrypted(path, token) {
    const url = `${BASE}${path}${token ? `&t=${encodeURIComponent(token)}` : ''}`;
    let res;
    try {
        res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    } catch (err) {
        throw new Error(`fetch failed for ${url}: ${err.message}`);
    }
    if (!res.ok) {
        let body = '';
        try { body = await res.text(); } catch { }
        throw new Error(`02movie HTTP ${res.status} for ${url} — body: ${body.slice(0, 200)}`);
    }
    let json;
    try {
        json = await res.json();
    } catch (err) {
        throw new Error(`JSON parse failed for ${url}: ${err.message}`);
    }
    if (json._e && typeof json._e === 'string') {
        try {
            return await decrypt(json._e);
        } catch (err) {
            throw new Error(`decryption failed for ${url}: ${err.message} — raw _e length: ${json._e.length}`);
        }
    }
    return json;
}

async function fetchDownloaderServer3(id, s, e) {
    const pagePath = s && e ? `/api/download/tv/${id}/${s}/${e}` : `/api/download/movie/${id}`;
    const pageUrl = `${DOWNLOADER_BASE}${pagePath}`;

    const pageRes = await fetch(pageUrl, {
        headers: { 'User-Agent': HEADERS['User-Agent'], 'Accept': 'text/html' },
        signal: AbortSignal.timeout(10000),
    });
    if (!pageRes.ok) throw new Error(`02moviedownloader page HTTP ${pageRes.status}`);
    const html = await pageRes.text();

    const configMatch = html.match(/const VERIFY_CONFIG\s*=\s*(\{[^;]+\})/);
    if (!configMatch) throw new Error('02moviedownloader: VERIFY_CONFIG not found in page');
    const config = JSON.parse(configMatch[1]);

    const { scope, pageNonce, powChallenge, powDifficulty } = config;
    const powNonce = await solvePoW(powChallenge, powDifficulty ?? 4);

    const verifyRes = await fetch(`${DOWNLOADER_BASE}/api/verify-robot`, {
        method: 'POST',
        headers: {
            'User-Agent': HEADERS['User-Agent'],
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': DOWNLOADER_BASE,
            'Referer': pageUrl,
        },
        body: JSON.stringify({ scope, pageNonce, powChallenge, powNonce }),
        signal: AbortSignal.timeout(30000),
    });

    if (!verifyRes.ok) {
        const body = await verifyRes.text().catch(() => '');
        throw new Error(`02moviedownloader verify-robot HTTP ${verifyRes.status} — ${body.slice(0, 200)}`);
    }

    const { token } = await verifyRes.json();
    if (!token) throw new Error('02moviedownloader verify-robot did not return a token');

    const dlRes = await fetch(`${DOWNLOADER_BASE}/api/download${pagePath}`, {
        headers: {
            'User-Agent': HEADERS['User-Agent'],
            'Accept': 'application/json',
            'Origin': DOWNLOADER_BASE,
            'Referer': pageUrl,
            'x-session-token': token,
        },
        signal: AbortSignal.timeout(12000),
    });

    if (!dlRes.ok) {
        const body = await dlRes.text().catch(() => '');
        throw new Error(`02moviedownloader download HTTP ${dlRes.status} — ${body.slice(0, 300)}`);
    }

    const dlJson = await dlRes.json();
    if (dlJson.encrypted && typeof dlJson.data === 'string') {
        const [ivB64, cipherB64] = dlJson.data.split(':');
        const ivBytes = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const cipherBytes = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
        const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
        const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, cipherBytes);
        return JSON.parse(new TextDecoder().decode(plain));
    }
    return dlJson;
}

async function solvePoW(challenge, difficulty) {
    const prefix = '0'.repeat(difficulty);
    let nonce = 0;
    while (true) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge + String(nonce)));
        const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hex.startsWith(prefix)) return String(nonce);
        nonce++;
    }
}

function extractDownloaderOptions(data) {
    const options = [];

    const streams = Array.isArray(data?.externalStreams) ? data.externalStreams : [];
    for (const s of streams) {
        if (s.url) options.push({
            url: s.url,
            quality: s.quality || 'HD',
            size: formatSize(s.size || null),
            format: (s.type || 'mp4').toUpperCase(),
            server: 3,
        });
    }

    const downloads = Array.isArray(data?.data?.downloadData?.data?.downloads)
        ? data.data.downloadData.data.downloads : [];
    for (const d of downloads) {
        if (d.url) options.push({
            url: d.url,
            quality: d.resolution ? `${d.resolution}p` : 'Unknown',
            size: formatSize(d.size || null),
            format: 'MP4',
            server: 3,
        });
    }

    return options;
}

function formatSize(val) {
    if (!val) return null;
    if (typeof val === 'string' && /[KMGT]B/i.test(val)) return val;
    const n = Number(val);
    if (isNaN(n)) return null;
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1073741824) return `${(n / 1048576).toFixed(2)} MB`;
    return `${(n / 1073741824).toFixed(2)} GB`;
}

function extractOptions(data, server) {
    if (Array.isArray(data?.streams) && data.streams.length) {
        return data.streams.flatMap(stream => {
            const links = Array.isArray(stream.links) ? stream.links : [];
            return links.map(o => ({
                url: o.url?.startsWith('/') ? `${BASE}${o.url}` : o.url,
                quality: o.quality || stream.quality || 'Unknown',
                size: formatSize(o.size || null),
                format: (o.format || 'mp4').toUpperCase(),
                server,
            }));
        }).filter(o => o.url);
    }

    if (Array.isArray(data?.downloadOptions) && data.downloadOptions.length) {
        return data.downloadOptions.map(o => ({
            url: o.url?.startsWith('/') ? `${BASE}${o.url}` : o.url,
            quality: o.quality || 'Unknown',
            size: formatSize(o.size),
            format: (o.format || 'mp4').toUpperCase(),
            server,
        })).filter(o => o.url);
    }

    if (Array.isArray(data?.links) && data.links.length) {
        return data.links.map(o => ({
            url: o.downloadLink,
            quality: o.quality || 'Unknown',
            size: formatSize(o.size),
            format: (o.format || 'mp4').toUpperCase(),
            server,
        })).filter(o => o.url);
    }

    return [];
}

export async function getStream(id, s, e) {
    const token = await fetchToken(id, s, e);

    const primaryPath = s && e
        ? `/api/tv/download?id=${id}&season=${s}&episode=${e}`
        : `/api/movies/download?id=${id}`;

    const fallbackPath = s && e
        ? `/api/tv/fallback?tmdbId=${id}&season=${s}&episode=${e}`
        : `/api/movies/fallback?tmdbId=${id}`;

    const [primary, fallback, downloader] = await Promise.allSettled([
        fetchDecrypted(primaryPath, token),
        fetchDecrypted(fallbackPath, token),
        fetchDownloaderServer3(id, s, e),
    ]);

    const server1 = primary.status === 'fulfilled' ? extractOptions(primary.value, 1) : [];
    const server2 = fallback.status === 'fulfilled' ? extractOptions(fallback.value, 2) : [];
    const server3 = downloader.status === 'fulfilled' ? extractDownloaderOptions(downloader.value) : [];

    const all = [...server1, ...server2, ...server3];
    if (!all.length) return null;

    const results = await Promise.allSettled(
        all.map(option =>
            option.server === 3
                ? Promise.resolve(option.url)
                : fetch(option.url, {
                    method: 'HEAD',
                    headers: { 'User-Agent': HEADERS['User-Agent'] },
                    signal: AbortSignal.timeout(6000),
                    redirect: 'follow',
                }).then(res => {
                    if (res.status >= 400 && res.status !== 405) throw new Error('not ok');
                    return option.url;
                })
        )
    );

    const hit = results.find(r => r.status === 'fulfilled');
    return hit ? hit.value : null;
}

export async function getDownloads(id, s, e) {
    const token = await fetchToken(id, s, e);

    const primaryPath = s && e
        ? `/api/tv/download?id=${id}&season=${s}&episode=${e}`
        : `/api/movies/download?id=${id}`;

    const fallbackPath = s && e
        ? `/api/tv/fallback?tmdbId=${id}&season=${s}&episode=${e}`
        : `/api/movies/fallback?tmdbId=${id}`;

    const [primary, fallback, downloader] = await Promise.allSettled([
        fetchDecrypted(primaryPath, token),
        fetchDecrypted(fallbackPath, token),
        fetchDownloaderServer3(id, s, e),
    ]);

    const server1 = primary.status === 'fulfilled' ? extractOptions(primary.value, 1) : [];
    const server2 = fallback.status === 'fulfilled' ? extractOptions(fallback.value, 2) : [];
    const server3 = downloader.status === 'fulfilled' ? extractDownloaderOptions(downloader.value) : [];

    const all = [...server1, ...server2, ...server3];

    if (!all.length) {
        const p = primary.status === 'rejected' ? primary.reason?.message : `empty (keys: ${JSON.stringify(Object.keys(primary.value ?? {}))})`;
        const f = fallback.status === 'rejected' ? fallback.reason?.message : `empty (keys: ${JSON.stringify(Object.keys(fallback.value ?? {}))})`;
        const d = downloader.status === 'rejected' ? downloader.reason?.message : `empty (keys: ${JSON.stringify(Object.keys(downloader.value ?? {}))})`;
        throw new Error(`no downloads from any server. primary: ${p} | fallback: ${f} | downloader: ${d}`);
    }

    const verified = await Promise.all(
        all.map(async o => {
            if (o.server === 3) return { ...o, verified: true };
            const ok = await verifyDownload(o.url);
            return { ...o, verified: ok };
        })
    );

    return verified.filter(o => o.verified).map(({ verified, ...rest }) => rest);
}

async function verifyDownload(url) {
    try {
        const res = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': HEADERS['User-Agent'] },
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
        });
        return res.status < 400 || res.status === 405;
    } catch {
        return false;
    }
}