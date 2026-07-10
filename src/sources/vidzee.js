import { webcrypto } from 'node:crypto';
import { fetchJson, USER_AGENT } from '../utils/helpers.js';

const PLAYER_URL = 'https://player.vidzee.wtf';
const CORE_URL = 'https://core.vidzee.wtf';

let cachedKey = null, cachedKeyTs = 0;

async function getDecKey(headers) {
    const now = Date.now();
    if (cachedKey && now - cachedKeyTs < 300000) return cachedKey;

    const res = await fetch(`${CORE_URL}/api-key`, {
        headers,
        signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) throw new Error(`API key fetch failed: ${res.status}`);

    const e = await res.text();
    const t = Buffer.from(e.replace(/\s+/g, ''), 'base64');

    const s = new Uint8Array(t.length - 28 + 16);
    s.set(t.subarray(28), 0);
    s.set(t.subarray(12, 28), t.length - 28);

    const keyMat = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('c4a8f1d7e2b9a6c3d0f5e8a1b7c4d9e2'));
    const key = await webcrypto.subtle.importKey('raw', keyMat, { name: 'AES-GCM' }, false, ['decrypt']);

    try {
        const decrypted = await webcrypto.subtle.decrypt({
            name: 'AES-GCM',
            iv: t.subarray(0, 12),
            tagLength: 128
        }, key, s);

        cachedKey = new TextDecoder().decode(decrypted);
        cachedKeyTs = now;
        return cachedKey;
    } catch (err) {
        throw new Error('Failed to decrypt Vidzee master key');
    }
}

function decrypt(enc, key) {
    try {
        const dec = Buffer.from(enc, 'base64').toString('utf8');
        const sep = dec.indexOf(':');
        if (sep === -1) return '';

        const ivBase64 = dec.slice(0, sep);
        const ciphertext = dec.slice(sep + 1);
        const keyPadded = key.padEnd(32, '\0');

        const decrypted = CryptoJS.AES.decrypt(
            ciphertext,
            CryptoJS.enc.Utf8.parse(keyPadded),
            {
                iv: CryptoJS.enc.Base64.parse(ivBase64),
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        return decrypted.toString(CryptoJS.enc.Utf8) || '';
    } catch (err) {
        return '';
    }
}

export async function getStream({ id, s, e, clientIP }) {
    const headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Referer': PLAYER_URL,
        'Origin': PLAYER_URL,
        ...(clientIP && { 'X-Forwarded-For': clientIP })
    };

    try {
        const decKey = await getDecKey(headers);

        const serversToTry = [3, 0, 1, 2, 4, 5, 6, 8];

        for (const sr of serversToTry) {
            try {
                const url = `${PLAYER_URL}/api/server?id=${id}&sr=${sr}${s ? `&ss=${s}&ep=${e || 1}` : ''}`;
                const data = await fetchJson(url, { headers, signal: AbortSignal.timeout(5000) });

                if (data?.url?.length) {
                    for (const entry of data.url) {
                        if (!entry.link) continue;

                        const decrypted = decrypt(entry.link, decKey);
                        if (decrypted?.startsWith('http')) {

                            return {
                                allUrls: [
                                    {
                                        url: decrypted,
                                        skipHlsCheck: true,
                                        headers: {
                                            'User-Agent': USER_AGENT,
                                            'Referer': PLAYER_URL,
                                            'Origin': PLAYER_URL
                                        }
                                    }
                                ]
                            };
                        }
                    }
                }
            } catch (err) {
                continue;
            }
        }
        return null;
    } catch (err) {
        return null;
    }
}