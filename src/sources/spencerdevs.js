import { pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { fetchJson, fetchText, USER_AGENT } from '../utils/source_helpers.js';

const HEADERS = { 'Referer': 'https://spencerdevs.xyz/', 'Origin': 'https://spencerdevs.xyz', 'User-Agent': USER_AGENT };
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const eM = {};
for (let i = 0; i < BASE64_CHARS.length; i++) eM[i.toString(2).padStart(8, "0")] = BASE64_CHARS[i];

function decryptSnoopdog(snoopdog) {
    let bStr = "";
    for (const t of snoopdog.trim().split(/\s+/)) bStr += eM[t] ?? "";
    const buf = Buffer.from(bStr, "base64");
    const key = pbkdf2Sync(buf.subarray(0, 32), buf.subarray(32, 48), 100000, 32, "sha512");
    const decipher = createDecipheriv("aes-256-cbc", key, buf.subarray(48, 64));
    return decipher.update(buf.subarray(64), undefined, "utf8") + decipher.final("utf8");
}

const SERVERS = Array.from({ length: 25 }, (_, i) => i + 1);

export async function getStream({ id, s, e, server }) {
    let targets = SERVERS;
    if (server && server !== 'all') { const m = server.match(/\d+/); if (m) targets = [parseInt(m[0], 10)]; }
    for (let i = 0; i < targets.length; i += 5) {
        const url = await Promise.any(targets.slice(i, i + 5).map(async sid => {
            const data = await fetchJson(`https://servers.spencerdevs.xyz/${sid}/${s && e ? `t/${id}/${s}/${e}` : `m/${id}`}`, { headers: HEADERS, signal: AbortSignal.timeout(3500) });
            const streamUrl = decryptSnoopdog(data.snoopdog);
            const r = await fetch(streamUrl, { headers: { ...HEADERS, 'Range': 'bytes=0-511' }, signal: AbortSignal.timeout(3500) });
            if (r.ok || r.status === 206) return { url: streamUrl, headers: { 'Origin': 'https://spencerdevs.xyz' }, server: `Server ${sid}`, type: streamUrl.includes(".m3u8") || streamUrl.includes(".txt") || streamUrl.includes("playlist") ? "hls" : "mp4" };
            throw new Error();
        })).catch(() => null);
        if (url) return { allUrls: [url] };
    }
    return null;
}

export async function getSources() { return SERVERS.map(s => `Server ${s}`); }