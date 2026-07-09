import crypto from 'node:crypto';

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let sharedDcKey = null;

export function decryptPartner(responseText, keyEnv) {
    try {
        const sep = responseText.indexOf(':');
        if (sep === -1) return null;
        const iv = Buffer.from(responseText.slice(0, sep), 'base64');
        const encrypted = responseText.slice(sep + 1);
        if (!sharedDcKey) sharedDcKey = crypto.createHash('sha256').update(keyEnv || '').digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', sharedDcKey, iv);
        return JSON.parse(decipher.update(encrypted, 'base64', 'utf8') + decipher.final('utf8'));
    } catch {
        return null;
    }
}

export async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error();
    return res.json();
}

export async function fetchText(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error();
    return res.text();
}