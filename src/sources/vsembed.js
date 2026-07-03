'use strict';

import crypto from 'node:crypto';

export const SKIP_VERIFY = true;

const BASE = 'https://api.khophim.indevs.in/api/partner';

function decrypt(responseText, key = process.env.DC_KEY) {
    try {
        const [ivBase64, encryptedBase64] = responseText.split(':');
        if (!ivBase64 || !encryptedBase64) return null;
        const iv = Buffer.from(ivBase64, 'base64');
        const keyBuf = crypto.createHash('sha256').update(key).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv);
        let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e } = args;
    try {
        const url = s
            ? `${BASE}/${id}?season=${s}&episode=${e || 1}&source=vsembed`
            : `${BASE}/${id}?source=vsembed`;

        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;

        const raw = await res.text();
        if (!raw) return null;

        const data = decrypt(raw);
        if (!data || data.ok === false || !data.raw_url) return null;

        const streamUrl = data.proxied_url || data.raw_url;
        const isHls = data.type === 'hls' || streamUrl.includes('.m3u8');

        const allUrls = [{
            url: streamUrl,
            type: isHls ? 'hls' : 'mp4',
            audio: 'sub',
            server: `vsembed-${data.server || 'unknown'}`,
            headers: data.headers || undefined,
            skipProxy: false,
        }];

        return { allUrls };
    } catch {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    if (!stream || !stream.allUrls) return [];
    return [...new Set(stream.allUrls.map(u => u.server))];
}