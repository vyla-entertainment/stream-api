const SOURCES = [
    { name: 'onion', movieApi: 'https://api.tulnex.com/onion/movie/${id}', tvApi: 'https://api.tulnex.com/onion/tv/${id}/${s}/${e}' },
    { name: 'vidzee', movieApi: 'https://api.tulnex.com/vidzee/movie/${id}?server=0', tvApi: 'https://api.tulnex.com/vidzee/tv/${id}/${s}/${e}?server=0' },
    { name: 'icefy', movieApi: 'https://api.tulnex.com/icefy/movie/${id}', tvApi: 'https://api.tulnex.com/icefy/tv/${id}/${s}/${e}' },
    { name: 'tik', movieApi: 'https://api.tulnex.com/tik/movie/${id}', tvApi: 'https://api.tulnex.com/tik/tv/${id}/${s}/${e}' },
    { name: 'vaplayer', movieApi: 'https://api.tulnex.com/vaplayer/movie/${id}', tvApi: 'https://api.tulnex.com/vaplayer/tv/${id}/${s}/${e}' },
    { name: 'vidfast-alpha', movieApi: 'https://api.tulnex.com/vidfast/movie/Alpha/${id}', tvApi: 'https://api.tulnex.com/vidfast/tv/Alpha/${id}/${s}/${e}' },
    { name: 'uniquestream', movieApi: 'https://api.tulnex.com/uniquestream/movie/${id}', tvApi: 'https://api.tulnex.com/uniquestream/tv/${id}/${s}/${e}' },
    { name: 'vidfast-mega', movieApi: 'https://api.tulnex.com/vidfast/movie/Mega/${id}', tvApi: 'https://api.tulnex.com/vidfast/tv/Mega/${id}/${s}/${e}' },
    { name: 'vidfast-vrapid', movieApi: 'https://api.tulnex.com/vidfast/movie/VRapid/${id}', tvApi: 'https://api.tulnex.com/vidfast/tv/VRapid/${id}/${s}/${e}' },
    { name: 'allmovies', movieApi: 'https://api.tulnex.com/provider/allmovies/movie/${id}?lang=english', tvApi: 'https://api.tulnex.com/provider/allmovies/tv/${id}/${s}/${e}?lang=english' },
    { name: 'vidlink', movieApi: 'https://api.tulnex.com/provider/vidlink/movie/${id}', tvApi: 'https://api.tulnex.com/provider/vidlink/tv/${id}/${s}/${e}' },
    { name: 'vidfast-vedge', movieApi: 'https://api.tulnex.com/vidfast/movie/vedge/${id}', tvApi: 'https://api.tulnex.com/vidfast/tv/vedge/${id}/${s}/${e}' },
    { name: 'vidfast-vfast', movieApi: 'https://api.tulnex.com/vidfast/movie/vfast/${id}', tvApi: 'https://api.tulnex.com/vidfast/tv/vfast/${id}/${s}/${e}' },
    { name: 'moviebox', movieApi: 'https://api.tulnex.com/moviebox/movie/${id}', tvApi: 'https://api.tulnex.com/moviebox/tv/${id}/${s}/${e}' },
];

export const SKIP_VERIFY = true;
export const VERIFY_HEADERS = {
    'Origin': 'https://onionplay.io',
    'Referer': 'https://onionplay.io/',
};

const L1_KEY = 'Sn00pD0g#L1_X0R_M4st3rK3y!2026sex';
const L1_SALT = 'xK9!mR2@pL5#nQ8sex';
const L3_KEY = 'Sn00pD0g#L3_AES_S3cur3K3y@2026$sex';
const L4_KEY = 'Sn00pD0g#L4_HMAC_F1n4lW4ll#2026!sex';

function base64ToBuffer(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
}

function bufferToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function strToBuffer(str) { return new TextEncoder().encode(str).buffer; }
function bufferToStr(buf) { return new TextDecoder().decode(buf); }

function hexToUint8(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.substr(i, 2), 16);
    return arr;
}

async function pbkdf2(pass, salt, iterations, keyLen, hash) {
    const keyMat = await crypto.subtle.importKey('raw', strToBuffer(pass), { name: 'PBKDF2' }, false, ['deriveKey']);
    const derived = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: strToBuffer(salt), iterations, hash },
        keyMat, { name: 'AES-GCM', length: keyLen * 8 }, true, ['encrypt', 'decrypt']
    );
    return new Uint8Array(await crypto.subtle.exportKey('raw', derived));
}

function xorDecrypt(hexStr, keyBytes) {
    const src = hexToUint8(hexStr);
    const out = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = src[i] ^ keyBytes[i % 32];
    return bufferToStr(out.buffer);
}

function binaryDecode(encoded) {
    return atob(encoded).split(' ').map(s => String.fromCharCode(parseInt(s, 2))).join('');
}

async function decodeL3(data) {
    const parts = data.split('.');
    if (parts.length !== 3) throw new Error('L3 invalid');
    const [ivB64, saltB64, ctB64] = parts;
    const salt = atob(saltB64);
    const keyBytes = await pbkdf2(L3_KEY, salt, 100000, 32, 'SHA-512');
    const aesKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: new Uint8Array(base64ToBuffer(ivB64)) },
        aesKey, base64ToBuffer(ctB64)
    );
    return bufferToStr(decrypted);
}

async function decodeL4(data) {
    const sep = data.indexOf('|');
    if (sep === -1) throw new Error('L4 no separator');
    const receivedHmac = data.slice(0, sep);
    const payload = data.slice(sep + 1);
    const payloadStr = bufferToStr(base64ToBuffer(payload));
    const hmacKey = await crypto.subtle.importKey('raw', strToBuffer(L4_KEY), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(payloadStr));
    if (receivedHmac !== bufferToHex(sig)) throw new Error('L4 HMAC mismatch');
    return payloadStr;
}

async function decryptPayload(payload) {
    const xorKey = await pbkdf2(L1_KEY, L1_SALT, 50000, 32, 'SHA-256');
    const l4out = await decodeL4(payload);
    const l3out = await decodeL3(l4out);
    const l2out = binaryDecode(l3out);
    return JSON.parse(xorDecrypt(l2out, xorKey));
}

async function fetchAndDecrypt(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, */*',
        },
        signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.v === 4 && data?.payload) {
        try { return await decryptPayload(data.payload); } catch { return null; }
    }
    return data;
}

function extractUrl(data) {
    if (!data) return null;

    const wrap = (url, headers = null) => {
        if (!url || typeof url !== 'string' || !url.includes('http')) return null;

        if (url.includes('mp4.himanshu464121.workers.dev')) {
            try {
                const urlObj = new URL(url);
                const extractedHeaders = urlObj.searchParams.get('headers');
                if (extractedHeaders) {
                    headers = { ...(headers || {}), ...JSON.parse(extractedHeaders) };
                }
            } catch (e) { }
        }

        const skipProxy = url.includes('pronhub.tulnex.com') ||
            url.includes('prxy.tulnex.com') ||
            (url.includes('workers.dev') && !url.includes('mp4.himanshu464121.workers')) ||
            url.includes('m3u8-proxy') ||
            url.includes('proxy.spencerdevs.xyz');

        return { url, headers, skipProxy };
    };

    if (typeof data === 'string' && data.includes('http')) return wrap(data);

    const headers = data.headers || null;

    if (data.url && typeof data.url === 'string' && data.url.includes('http')) return wrap(data.url, headers);
    if (data.stream && typeof data.stream === 'string' && data.stream.includes('http')) return wrap(data.stream, headers);
    if (data.playlist && typeof data.playlist === 'string' && data.playlist.includes('http')) return wrap(data.playlist, headers);
    if (data.streamUrl && typeof data.streamUrl === 'string' && data.streamUrl.includes('http')) return wrap(data.streamUrl, headers);
    if (data.stream_url && typeof data.stream_url === 'string' && data.stream_url.includes('http')) return wrap(data.stream_url, headers);
    if (data.streaming_url && typeof data.streaming_url === 'string' && data.streaming_url.includes('http')) return wrap(data.streaming_url, headers);
    if (data.video_url && typeof data.video_url === 'string' && data.video_url.includes('http')) return wrap(data.video_url, headers);
    if (data.m3u8 && typeof data.m3u8 === 'string' && data.m3u8.includes('http')) return wrap(data.m3u8, headers);

    if (data.sources?.primary?.url) return wrap(data.sources.primary.url, data.sources.primary.headers || headers);

    if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
        const sorted = data.sources
            .filter(s => s.url && s.url.includes('http'))
            .sort((a, b) => {
                const qa = parseInt((a.quality || '').replace('p', '') || '0');
                const qb = parseInt((b.quality || '').replace('p', '') || '0');
                return qb - qa;
            });
        if (sorted.length > 0) return wrap(sorted[0].url, sorted[0].headers || headers);
    }

    if (data.languages && Array.isArray(data.languages)) {
        const orig = data.languages.find(l => l.original === true && l.sources?.length > 0);
        if (orig) {
            const sorted = [...orig.sources].sort((a, b) => {
                return parseInt((b.quality || '').replace('p', '') || '0') - parseInt((a.quality || '').replace('p', '') || '0');
            });
            return wrap(sorted[0].url || sorted[0].file, sorted[0].headers || orig.headers || headers);
        }
    }

    if (data.links && Array.isArray(data.links) && data.links.length > 0) {
        const link = data.links.find(l => l.url && l.url.includes('http'));
        if (link) return wrap(link.url, headers);
    }

    if (data.data?.data?.stream?.playlist) return wrap(data.data.data.stream.playlist, headers);
    if (data.data?.stream?.playlist) return wrap(data.data.stream.playlist, headers);
    if (data.data?.url && typeof data.data.url === 'string' && data.data.url.includes('http')) return wrap(data.data.url, data.data.headers || headers);

    if (data.data?.sources && Array.isArray(data.data.sources)) {
        const src = data.data.sources.find(s => s.url && s.url.includes('http'));
        if (src) return wrap(src.url, src.headers || headers);
    }

    if (data.streams && Array.isArray(data.streams)) {
        const src = data.streams.find(s => (s.url || s.link) && (s.url || s.link).includes('http'));
        if (src) return wrap(src.url || src.link, src.headers || headers);
    }

    return null;
}

export async function getStream(id, s, e) {
    for (const src of SOURCES) {
        const url = s && e
            ? src.tvApi.replace('${id}', id).replace('${s}', s).replace('${e}', e)
            : src.movieApi.replace('${id}', id);
        try {
            const data = await fetchAndDecrypt(url);
            if (!data) continue;
            const extracted = extractUrl(data);
            if (extracted?.url) return extracted;
        } catch { }
    }
    return null;
}