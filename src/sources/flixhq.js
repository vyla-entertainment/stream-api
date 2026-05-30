import { webcrypto } from 'crypto';

const BASE = 'https://flixhq.one';
const F16PX = 'https://weneverbeenfree.com';

export const SKIP_VERIFY = true;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function b64urlToBytes(s) {
    return Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

function bytesToB64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function randomB64url(len) {
    return bytesToB64url(webcrypto.getRandomValues(new Uint8Array(len)));
}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function tmdbSlug(id, isMovie) {
    const k = process.env.TMDB_API_KEY;
    if (!k) throw new Error('no TMDB key');
    const url = isMovie
        ? `https://api.themoviedb.org/3/movie/${id}?api_key=${k}`
        : `https://api.themoviedb.org/3/tv/${id}?api_key=${k}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    const name = isMovie ? data.title : data.name;
    const year = isMovie
        ? (data.release_date || '').slice(0, 4)
        : (data.first_air_date || '').slice(0, 4);
    return `${slugify(name)}-${year}`;
}

async function fetchToken(slug, isMovie, s, e) {
    const url = isMovie
        ? `${BASE}/watch-movie/${slug}-watch-online/`
        : `${BASE}/episode/${slug}-watch-online/s${String(s).padStart(2, '0')}-e${String(e).padStart(2, '0')}/`;
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`flixhq page ${res.status} for ${url}`);
    const html = await res.text();
    const m = html.match(/data-token="([^"]+)"/);
    if (!m) throw new Error('no data-token on ' + url);
    return { token: m[1], pageUrl: url };
}

async function fetchEmbedUrl(token, pageUrl, isMovie = false) {
    const fd = new FormData();
    fd.append(isMovie ? 'players' : 'players_show', token);
    const res = await fetch(`${BASE}/ajax/ajax.php`, {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Referer': pageUrl,
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: fd,
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`ajax.php ${res.status}`);
    const list = await res.json();
    const arr = Array.isArray(list) ? list : (list ? [list] : []);
    if (arr[0]?.error) throw new Error(`ajax.php error: ${arr[0].error}`);
    const entry = arr.find(x => x.link && x.link.includes('weneverbeenfree.com'))
        || arr.find(x => x.link && x.name === 'FlixHQ')
        || arr.find(x => x.link);
    if (!entry) throw new Error(`no usable entry: ${JSON.stringify(arr)}`);
    return entry.link;
}

function extractVideoId(embedUrl) {
    const m = embedUrl.match(/weneverbeenfree\.com\/e\/([a-zA-Z0-9_-]+)/)
        || embedUrl.match(/f16px\.com\/e\/([a-zA-Z0-9_-]+)/);
    if (!m) throw new Error('no video id in ' + embedUrl);
    return m[1];
}

function makeCookieJar() {
    const store = new Map();
    return {
        get() { return [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
        update(setCookie) {
            if (!setCookie) return;
            for (const entry of setCookie.split(',')) {
                const part = entry.split(';')[0].trim();
                const eq = part.indexOf('=');
                if (eq === -1) continue;
                const k = part.slice(0, eq).trim();
                const v = part.slice(eq + 1).trim();
                if (k) store.set(k, v);
            }
        },
    };
}

async function f16pxChallenge(cookieJar) {
    const res = await fetch(`${F16PX}/api/videos/access/challenge`, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Referer': F16PX, 'Cookie': cookieJar.get() },
        signal: AbortSignal.timeout(8000),
    });
    cookieJar.update(res.headers.get('set-cookie'));
    return res.json();
}

async function f16pxAttest(challenge, cookieJar) {
    const { subtle } = webcrypto;
    const keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const viewerId = challenge.viewer_hint;
    const deviceId = randomB64url(16);
    const sigBytes = await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        new TextEncoder().encode(challenge.nonce)
    );
    const pubJwk = await subtle.exportKey('jwk', keyPair.publicKey);

    const res = await fetch(`${F16PX}/api/videos/access/attest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Referer': F16PX, 'Cookie': cookieJar.get() },
        body: JSON.stringify({
            viewer_id: viewerId,
            device_id: deviceId,
            challenge_id: challenge.challenge_id,
            nonce: challenge.nonce,
            signature: bytesToB64url(sigBytes),
            public_key: { crv: pubJwk.crv, ext: true, key_ops: ['verify'], kty: pubJwk.kty, x: pubJwk.x, y: pubJwk.y },
            client: {
                user_agent: UA, architecture: 'x86', bitness: '64', platform: 'Windows',
                platform_version: '10.0.0', model: '', languages: ['en-US', 'en'],
                timezone: 'America/New_York', hardware_concurrency: 8, device_memory: 8,
                touch_points: 0, pixel_ratio: 1, screen_width: 1920, screen_height: 1080, color_depth: 24,
            },
            storage: {
                cookie: viewerId, local_storage: viewerId,
                indexed_db: `${viewerId}:${deviceId}`, cache_storage: `${viewerId}:${deviceId}`,
            },
            attributes: { entropy: 'high' },
        }),
        signal: AbortSignal.timeout(10000),
    });
    cookieJar.update(res.headers.get('set-cookie'));
    const data = await res.json();
    if (!data.token) throw new Error('attest failed: ' + JSON.stringify(data));
    return { token: data.token, viewerId, deviceId: data.device_id || deviceId, confidence: data.confidence ?? 0.6 };
}

async function f16pxPlayback(videoId, attest, cookieJar) {
    const res = await fetch(`${F16PX}/api/videos/${videoId}/embed/playback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Referer': `${F16PX}/e/${videoId}`,
            'Origin': F16PX,
            'Cookie': cookieJar.get(),
        },
        body: JSON.stringify({
            fingerprint: {
                token: attest.token,
                viewer_id: attest.viewerId,
                device_id: attest.deviceId,
                confidence: attest.confidence,
            },
        }),
        signal: AbortSignal.timeout(10000),
    });
    cookieJar.update(res.headers.get('set-cookie'));
    const data = await res.json();
    if (!data.playback) throw new Error('no playback: ' + JSON.stringify(data));
    return data.playback;
}

function extractStreamUrl(text) {
    if (text.startsWith('{') || text.startsWith('[')) {
        try {
            const obj = JSON.parse(text);
            const sources = obj.sources || (Array.isArray(obj) ? obj : null);
            if (sources && sources.length > 0) {
                const best = sources.reduce((a, b) => ((b.height || 0) > (a.height || 0) ? b : a));
                if (best.url) return best.url;
            }
            if (obj.url) return obj.url;
            if (obj.stream) return obj.stream;
        } catch { }
    }
    if (text.startsWith('http') || text.includes('m3u8') || text.includes('.mp4')) return text.trim();
    return null;
}

async function decryptPlayback(playback) {
    const { subtle } = webcrypto;

    async function tryAesGcm(ivRaw, ciphertextRaw, keyBytes) {
        try {
            const iv = b64urlToBytes(ivRaw);
            const ciphertext = b64urlToBytes(ciphertextRaw);
            const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
            const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            const text = new TextDecoder().decode(plain);
            return extractStreamUrl(text);
        } catch { }
        return null;
    }

    const parts = (playback.key_parts || []).map(b64urlToBytes);
    const iv = playback.iv;
    const payload = playback.payload;

    const candidates = [];

    const parts32 = parts.filter(p => p.length === 32);
    const parts24 = parts.filter(p => p.length === 24);
    const parts16 = parts.filter(p => p.length === 16);

    function xorAll(byteArrays, len) {
        const out = new Uint8Array(len);
        for (const b of byteArrays) for (let i = 0; i < len; i++) out[i] ^= b[i] ?? 0;
        return out;
    }

    function concatPair(a, b) {
        const out = new Uint8Array(a.length + b.length);
        out.set(a); out.set(b, a.length);
        return out;
    }

    if (parts32.length > 0) candidates.push(xorAll(parts32, 32));
    if (parts24.length > 0) candidates.push(xorAll(parts24, 32).slice(0, 32));
    if (parts16.length > 0) candidates.push(xorAll(parts16, 16));
    candidates.push(xorAll(parts, 32));
    candidates.push(xorAll(parts, 16));

    for (let i = 0; i < parts.length; i++) {
        if (parts[i].length === 32) candidates.push(parts[i]);
        if (parts[i].length === 16) candidates.push(parts[i]);
        for (let j = i + 1; j < parts.length; j++) {
            const c = concatPair(parts[i], parts[j]);
            if (c.length === 32 || c.length === 16) candidates.push(c);
        }
    }

    for (const keyBytes of candidates) {
        if (keyBytes.length !== 32 && keyBytes.length !== 16) continue;
        const result = await tryAesGcm(iv, payload, keyBytes);
        if (result) {
            return result;
        }
    }

    throw new Error(`decryption failed — tried ${candidates.length} candidates`);
}

export async function getStream(id, s, e) {
    const isMovie = !s && !e;
    const slug = await tmdbSlug(id, isMovie);
    const { token, pageUrl } = await fetchToken(slug, isMovie, s, e);
    const embedUrl = await fetchEmbedUrl(token, pageUrl, isMovie);
    const videoId = extractVideoId(embedUrl);
    const cookieJar = makeCookieJar();
    const challenge = await f16pxChallenge(cookieJar);
    const attest = await f16pxAttest(challenge, cookieJar);
    const playback = await f16pxPlayback(videoId, attest, cookieJar);
    const streamUrl = await decryptPlayback(playback);
    return {
        url: streamUrl,
        headers: {
            'Referer': `${F16PX}/e/${videoId}`,
            'Origin': F16PX,
        },
    };
}