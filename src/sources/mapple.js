'use strict';

const baseUrl = "https://mapple.club";

const PROXY_HEADERS = {
    Referer: baseUrl + "/",
    Origin: baseUrl,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const W_BUF = new Uint32Array(64);

function sha256Into(msg, out) {
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const l = msg.length;
    const bitLen = l * 8;
    const total = (l + 1 + 8 + 63) & ~63;
    const buf = new Uint8Array(total);
    buf.set(msg);
    buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);

    for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) W_BUF[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const a = W_BUF[i - 15];
            const b = W_BUF[i - 2];
            const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
            const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
            W_BUF[i] = (W_BUF[i - 16] + s0 + W_BUF[i - 7] + s1) | 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[i] + W_BUF[i]) | 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const odv = new DataView(out.buffer, out.byteOffset, 32);
    odv.setUint32(0, h0 >>> 0, false); odv.setUint32(4, h1 >>> 0, false);
    odv.setUint32(8, h2 >>> 0, false); odv.setUint32(12, h3 >>> 0, false);
    odv.setUint32(16, h4 >>> 0, false); odv.setUint32(20, h5 >>> 0, false);
    odv.setUint32(24, h6 >>> 0, false); odv.setUint32(28, h7 >>> 0, false);
}

function hasLeadingZeroBits(hash, bits) {
    const fullBytes = Math.floor(bits / 8);
    const remainingBits = bits % 8;
    for (let i = 0; i < fullBytes; i++) if (hash[i] !== 0) return false;
    if (remainingBits > 0) {
        const mask = 0xff << (8 - remainingBits);
        if ((hash[fullBytes] & mask) !== 0) return false;
    }
    return true;
}

function solvePoW(challenge, difficulty) {
    const encoder = new TextEncoder();
    const hash = new Uint8Array(32);
    let nonce = 0;
    while (nonce < 10000000) {
        const input = encoder.encode(challenge + nonce);
        sha256Into(input, hash);
        if (hasLeadingZeroBits(hash, difficulty)) return { found: true, nonce: nonce.toString() };
        nonce++;
    }
    return { found: false };
}

const SERVER_LIST = [
    { id: "mapple", name: "Mapple 🔥" },
    { id: "s1", name: "Nexus" },
    { id: "s2", name: "Cipher" },
    { id: "s3", name: "Pulse" },
    { id: "s4", name: "Vertex" },
    { id: "s10", name: "Chimp" },
];

export async function getStream(args) {
    const { id, s, e, server: serverParam } = args;
    const isTv = s != null && e != null;
    const mediaType = isTv ? "tv" : "movie";
    const tvSlug = isTv ? `${s}-${e}` : "";
    const pageUrl = isTv
        ? `${baseUrl}/watch/tv/${id}/${s}/${e}`
        : `${baseUrl}/watch/movie/${id}`;

    try {
        const pageRes = await fetch(pageUrl, { headers: PROXY_HEADERS, signal: AbortSignal.timeout(10000) });
        if (!pageRes.ok) return null;
        const html = await pageRes.text();
        const requestToken = html.match(/window\.__REQUEST_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
        if (!requestToken) return null;

        const initRes = await fetch(`${baseUrl}/api/playback-init`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...PROXY_HEADERS, Referer: pageUrl },
            body: JSON.stringify({ mediaId: Number(id), mediaType, requestToken }),
            signal: AbortSignal.timeout(10000)
        });
        const initData = await initRes.json();

        let streamToken = null;
        if (initData.requiresPow && initData.pow) {
            const powResult = solvePoW(initData.pow.challenge, initData.pow.difficulty);
            if (powResult.found) {
                const solveRes = await fetch(`${baseUrl}/api/playback-init`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...PROXY_HEADERS, Referer: pageUrl },
                    body: JSON.stringify({
                        mediaId: Number(id), mediaType, requestToken,
                        pow: { challengeId: initData.pow.challengeId, nonce: powResult.nonce }
                    }),
                    signal: AbortSignal.timeout(10000)
                });
                const solveData = await solveRes.json();
                streamToken = solveData.token;
            }
        } else {
            streamToken = initData.token;
        }

        if (!streamToken) return null;

        let targets = SERVER_LIST;
        if (serverParam && serverParam !== "all") {
            const clean = serverParam.replace("Mapple - ", "");
            targets = SERVER_LIST.filter(sv => sv.name === clean);
            if (!targets.length) targets = SERVER_LIST;
        }

        const allUrls = [];
        for (const srv of targets) {
            try {
                const streamUrl = `${baseUrl}/api/stream?mediaId=${id}&mediaType=${mediaType}&tv_slug=${tvSlug}&source=${srv.id}&apikey=mptv_sk_a8f29c4e7b3d1f&requestToken=${requestToken}&token=${streamToken}`;
                const streamRes = await fetch(streamUrl, { headers: { ...PROXY_HEADERS, Referer: pageUrl }, signal: AbortSignal.timeout(8000) });
                const streamData = await streamRes.json();

                if (streamData.success && streamData.data?.stream_url) {
                    let fileUrl = streamData.data.stream_url;
                    
                    if (fileUrl.includes('omena-puu') || fileUrl.includes('nocach')) {
                        fileUrl += fileUrl.includes('?') ? '&format=.m3u8' : '?format=.m3u8';
                    }

                    allUrls.push({
                        url: fileUrl,
                        server: `Mapple - ${srv.name}`,
                        headers: PROXY_HEADERS,
                        skipProxy: false,
                        skipVerify: true,
                        skipHlsCheck: true
                    });
                }
            } catch (e) {}
        }

        return allUrls.length > 0 ? { allUrls } : null;
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    return SERVER_LIST.map(s => `Mapple - ${s.name}`);
}

export const SKIP_VERIFY = true;
export const MULTI_URL = true;