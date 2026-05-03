const BASE_URL = 'https://peachify.top';
const MOVIEBOX_URL = 'https://uwu.peachify.top';
const API_URL = 'https://usa.eat-peach.sbs';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: BASE_URL,
    Origin: BASE_URL,
};

export const VERIFY_HEADERS = { ...HEADERS };

const SERVERS = [
    `${MOVIEBOX_URL}/moviebox`,
    `${API_URL}/holly`,
    `${API_URL}/air`,
    `${API_URL}/multi`,
    `${API_URL}/ice`,
    `${API_URL}/net`,
];

const KEY = 'ZDhmMmExYjVlOWM0NzA4MTRmNmIyYzNhNWQ4ZTdmOTAxYTJiM2M0ZDVlM2Y3YThiOWMwZDFlMmYzYTRiNWM2ZA==';

function b64UrlDecode(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function decrypt(payload) {
    try {
        const hex = atob(KEY);
        const raw = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);

        const [ivPart, tagPart, cipherPart] = payload.split('.');
        const iv = b64UrlDecode(ivPart);
        const tag = b64UrlDecode(tagPart);
        const cipher = b64UrlDecode(cipherPart);

        const combined = new Uint8Array(tag.length + cipher.length);
        combined.set(tag, 0);
        combined.set(cipher, tag.length);

        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
        return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
        return null;
    }
}

async function fetchFromServer(serverBase, id, s, e) {
    const apiUrl = s && e
        ? `${serverBase}/tv/${id}/${s}/${e}`
        : `${serverBase}/movie/${id}`;

    try {
        const res = await fetch(apiUrl, { headers: HEADERS });
        if (!res.ok) return null;

        let body = await res.json();

        if (body.isEncrypted && body.data) {
            body = await decrypt(body.data);
            if (!body) return null;
        }

        const sources = Array.isArray(body.sources) ? body.sources : [];
        if (!sources.length) return null;

        for (const src of sources) {
            const url = src.url ?? src.src ?? src.file ?? src.stream ?? src.streamUrl ?? src.playbackUrl;
            if (!url) continue;
            return url;
        }

        return null;
    } catch {
        return null;
    }
}

export async function getStream(id, s = null, e = null) {
    const results = await Promise.allSettled(
        SERVERS.map(server => fetchFromServer(server, id, s, e))
    );

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) return result.value;
    }

    return null;
}