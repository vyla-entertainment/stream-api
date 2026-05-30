const BASE_URL = 'https://peachify.top';
const MOVIEBOX_URL = 'https://uwu.eat-peach.sbs';
const API_URL = 'https://usa.eat-peach.sbs';

const SERVERS = [
    `${MOVIEBOX_URL}/moviebox`,
    `${API_URL}/holly`,
    `${API_URL}/air`,
    `${API_URL}/multi`,
    `${MOVIEBOX_URL}/net`,
    `${MOVIEBOX_URL}/bmb`,
];

const HEADERS = {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${BASE_URL}/`,
    Origin: BASE_URL,
};

const STREAM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Referer: `${BASE_URL}/`,
    Origin: BASE_URL,
};

export const SKIP_VERIFY = true;

const KEY_HEX = 'YThmMmExYjVlOWM0NzA4MTRmNmIyYzNhNWQ4ZTdmOWMxYTJiM2M0ZDVlM2Y3YThiOGNhZDFlMmQwYTRkNWM1Yg==';

const THIRD_PARTY_PROXY_PATTERNS = [
    /^https:\/\/[^/]+\.workers\.dev\/(?:m3u8|mp4)-proxy\?url=(.+?)(?:&|$)/,
    /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/|https?%3A%2F%2F).+)$/,
    /\/(?:m3u8|mp4)-proxy\?url=(.+?)(?:&|$)/,
];

function unwrapProxyUrl(url) {
    for (const pattern of THIRD_PARTY_PROXY_PATTERNS) {
        const match = url.match(pattern);
        if (match) {
            let inner = match[1];
            try { inner = decodeURIComponent(inner); } catch { }
            try { inner = decodeURIComponent(inner); } catch { }
            if (inner.startsWith('http')) return { url: inner, wasWrapped: true };
        }
    }
    return { url, wasWrapped: false };
}

function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return new Uint8Array(Buffer.from(padded, 'base64'));
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return bytes;
}

async function decrypt(payload) {
    try {
        const parts = payload.split('.');
        if (parts.length !== 3) return null;
        const iv = base64UrlToBytes(parts[0]);
        const ciphertext = base64UrlToBytes(parts[1]);
        const authTag = base64UrlToBytes(parts[2]);
        const combined = new Uint8Array(ciphertext.length + authTag.length);
        combined.set(ciphertext);
        combined.set(authTag, ciphertext.length);
        const keyBytes = hexToBytes(Buffer.from(KEY_HEX, 'base64').toString());
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch {
        return null;
    }
}

function pickString(obj, keys) {
    for (const key of keys) {
        const val = obj[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
    }
    return '';
}

function pickNumber(obj, keys) {
    for (const key of keys) {
        const val = obj[key];
        if (typeof val === 'number' && Number.isFinite(val)) return val;
        if (typeof val === 'string' && val.trim()) {
            const match = val.match(/\d{3,4}/);
            if (match) return Number(match[0]);
            const parsed = Number(val);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return undefined;
}

function normalizeHeaders(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const entries = Object.entries(raw)
        .filter(([k, v]) => k.trim().length > 0 && v != null)
        .map(([k, v]) => [k, String(v)]);
    return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeDub(raw) {
    if (!raw.trim()) return 'Original';
    const lower = raw.trim().toLowerCase();
    if (lower === 'dubbed') return 'Dub';
    if (lower === 'subbed') return 'Sub';
    return raw.trim();
}

function buildUrl(serverBase, id, s, e) {
    if (!s || !e) return `${serverBase}/movie/${id}`;
    return `${serverBase}/tv/${id}/${s}/${e}`;
}

async function fetchServer(serverBase, id, s, e, ua) {
    const url = buildUrl(serverBase, id, s, e);
    const res = await fetch(url, { headers: { ...HEADERS, 'User-Agent': ua } });
    if (!res.ok) return null;
    let body = await res.json();
    if (body.isEncrypted && body.data) {
        body = await decrypt(body.data);
        if (!body) return null;
    }
    const rawSources = Array.isArray(body.sources) ? body.sources : [];
    if (rawSources.length === 0) return null;
    const rawSubtitles = Array.isArray(body.subtitles) ? body.subtitles : [];
    return { rawSources, rawSubtitles };
}

export async function getStream(id, s, e, clientIP, absoluteBase, audio) {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const results = await Promise.allSettled(SERVERS.map(srv => fetchServer(srv, id, s, e, ua)));

    const allSources = [];
    const allSubtitles = [];

    for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const { rawSources, rawSubtitles } = result.value;

        for (const raw of rawSources) {
            const rawUrl = pickString(raw, ['url', 'src', 'file', 'stream', 'streamUrl', 'playbackUrl']);
            if (!rawUrl) continue;

            const { url, wasWrapped } = unwrapProxyUrl(rawUrl);

            const rawType = pickString(raw, ['type', 'format', 'container']).toLowerCase();
            const type = rawType.includes('hls') || rawType.includes('m3u8') || url.toLowerCase().includes('.m3u8') ? 'hls' : 'mp4';
            const rawDub = pickString(raw, ['dub', 'audio', 'audioName', 'audioLang', 'language', 'lang', 'label', 'name', 'title']);
            const dub = normalizeDub(rawDub);
            const quality = pickNumber(raw, ['quality', 'resolution', 'height', 'res']);

            const rawHeaders = raw.headers ?? raw.header ?? raw.requestHeaders ?? raw.httpHeaders;
            const headers = normalizeHeaders(rawHeaders) ?? { ...STREAM_HEADERS };

            allSources.push({ url, type, quality, dub, headers });
        }

        for (const raw of rawSubtitles) {
            const url = raw.url ?? raw.file ?? raw.src;
            if (!url) continue;
            const label = raw.label ?? raw.name ?? raw.language ?? 'Auto';
            allSubtitles.push({ url, label });
        }
    }

    if (allSources.length === 0) return null;

    const sorted = [...allSources].sort((a, b) => {
        const aIsHls = a.type === 'hls';
        const bIsHls = b.type === 'hls';
        if (aIsHls && !bIsHls) return -1;
        if (!aIsHls && bIsHls) return 1;
        return 0;
    });

    const primary = sorted[0];

    return {
        url: primary.url,
        headers: primary.headers,
        skipProxy: false,
        skipHlsCheck: true,
        allUrls: sorted.map(src => ({ url: src.url, headers: src.headers, skipProxy: false, skipHlsCheck: true })),
        subtitles: allSubtitles,
    };
}