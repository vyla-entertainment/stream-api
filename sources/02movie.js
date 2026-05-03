'use strict';

const BASE = 'https://02movie.com';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': `${BASE}/`,
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

async function fetchDecrypted(path) {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`02movie ${res.status}`);
    const json = await res.json();
    return json._e && typeof json._e === 'string' ? decrypt(json._e) : json;
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

export async function getDownloads(id, s, e) {
    const path = s && e
        ? `/api/tv/download?id=${id}&season=${s}&episode=${e}`
        : `/api/movies/download?id=${id}`;

    const data = await fetchDecrypted(path);
    const options = data?.downloadOptions;
    if (!Array.isArray(options) || !options.length) return null;

    return options
        .filter(o => o.url)
        .map(o => ({
            url: o.url.startsWith('/') ? `${BASE}${o.url}` : o.url,
            quality: o.quality || 'Unknown',
            size: formatSize(o.size),
            format: (o.format || 'mp4').toUpperCase(),
        }));
}