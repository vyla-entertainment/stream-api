'use strict';

import { pbkdf2Sync, createDecipheriv } from 'crypto';

const HEADERS = {
    'Referer': 'https://spencerdevs.xyz/',
    'Origin': 'https://spencerdevs.xyz',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7378.102 Safari/537.36',
};

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const eM = {};
for (let i = 0; i < BASE64_CHARS.length; i++) {
    eM[i.toString(2).padStart(8, "0")] = BASE64_CHARS[i];
}

function decryptSnoopdog(snoopdog) {
    const base64Str = snoopdog
        .trim()
        .split(/\s+/)
        .map(token => eM[token] ?? "")
        .join("");

    const buf = Buffer.from(base64Str, "base64");
    const salt = buf.subarray(0, 32);
    const kdfSalt = buf.subarray(32, 48);
    const iv = buf.subarray(48, 64);
    const cipher = buf.subarray(64);

    const key = pbkdf2Sync(salt, kdfSalt, 100000, 32, "sha512");
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(cipher, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

const SERVERS = Array.from({ length: 25 }, (_, i) => i + 1);

async function fetchServer(serverId, id, s, e) {
    try {
        const type = s && e ? "t" : "m";
        const url = type === "t"
            ? `https://servers.spencerdevs.xyz/${serverId}/t/${id}/${s}/${e}`
            : `https://servers.spencerdevs.xyz/${serverId}/m/${id}`;

        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(3500) });
        if (!res.ok) return null;

        const data = await res.json();
        if (!data || !data.snoopdog) return null;

        const streamUrl = decryptSnoopdog(data.snoopdog);
        if (!streamUrl) return null;

        const isHls = streamUrl.includes(".m3u8") || streamUrl.includes(".txt") || streamUrl.includes("playlist");
        return {
            url: streamUrl,
            headers: HEADERS,
            type: isHls ? "hls" : "mp4",
            server: `Server ${serverId}`
        };
    } catch (err) {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    let serversToTest = SERVERS;

    if (serverName && serverName !== 'all') {
        const match = serverName.match(/\d+/);
        if (match) serversToTest = [parseInt(match[0], 10)];
    }

    const chunkSize = 5;
    for (let i = 0; i < serversToTest.length; i += chunkSize) {
        const chunk = serversToTest.slice(i, i + chunkSize);
        const results = await Promise.allSettled(chunk.map(async serverId => {
            const source = await fetchServer(serverId, id, s, e);
            if (source) {
                const r = await fetch(source.url, { headers: { ...HEADERS, 'Range': 'bytes=0-511' }, signal: AbortSignal.timeout(3500) });
                if (r.ok || r.status === 206) {
                    const text = (await r.text()).trim();
                    if (text.length > 0 && (!source.url.includes('.m3u8') || text.startsWith('#EXT'))) {
                        return {
                            url: source.url,
                            headers: { 'Origin': 'https://spencerdevs.xyz' },
                            server: source.server,
                            type: source.type,
                        };
                    }
                }
            }
            throw new Error();
        }));

        const valid = results.find(r => r.status === 'fulfilled');
        if (valid) return valid.value;
    }
    return null;
}

export async function getSources(args) {
    const { id, s, e } = args;
    const results = await Promise.allSettled(SERVERS.map(serverId => fetchServer(serverId, id, s, e)));
    return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value.server);
}

export const VERIFY_HEADERS = { 'Origin': 'https://spencerdevs.xyz' };
export const SKIP_VERIFY = true;
export const MULTI_URL = false;