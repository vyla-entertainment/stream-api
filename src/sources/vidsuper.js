'use strict';

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function getFp() {
    const t = `${UA}|en-US|en-US|12|0|0|1920x1080x24|-480|no-canvas|no-webgl`;
    let n = 0x811c9dc5;
    for (let e = 0; e < t.length; e++) {
        n ^= t.charCodeAt(e);
        n = Math.imul(n, 0x1000193);
    }
    return (n >>> 0).toString(16).padStart(8, "0");
}

let wasmModule = null;

async function loadWasm() {
    if (wasmModule) return wasmModule;
    const res = await fetch("https://vidsuper.net/module.wasm", { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(buffer, { env: { abort() { } } });
    wasmModule = instance.exports;
    return wasmModule;
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    try {
        const isTV = s != null && e != null;
        const pageUrl = isTV
            ? `https://vidsuper.net/tv/${id}/${s}/${e}`
            : `https://vidsuper.net/movie/${id}`;

        const pageRes = await fetch(pageUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
        if (!pageRes.ok) return null;
        const html = await pageRes.text();

        const tokenMatch = html.match(/accessToken[^a-zA-Z0-9]+(ey[a-zA-Z0-9._\-]+)/);
        if (!tokenMatch) return null;
        const accessToken = tokenMatch[1];

        const wasm = await loadWasm();
        if (!wasm) return null;

        const ts = Math.floor(Date.now() / 1000);
        const sig = BigInt.asUintN(64, wasm.verify(BigInt(ts))).toString();
        const wasmSigHeader = `${ts},${sig}`;
        const fp = getFp();

        const serverList = ["zuri", "oneroom", "insertunit", "vidrock"];
        const serversToTest = serverName && serverName !== 'all'
            ? serverList.filter(srv => srv === serverName)
            : serverList;

        const allUrls = [];

        for (const srv of serversToTest) {
            const apiUrl = isTV
                ? `https://vidsuper.net/api/sources?type=tv&id=${id}&season=${s}&episode=${e}&server=${srv}`
                : `https://vidsuper.net/api/sources?type=movie&id=${id}&server=${srv}`;

            const apiRes = await fetch(apiUrl, {
                headers: {
                    "User-Agent": UA,
                    "Referer": pageUrl,
                    "x-access-token": accessToken,
                    "x-wasm-sig": wasmSigHeader,
                    "x-fp": fp,
                },
                signal: AbortSignal.timeout(8000),
            });

            if (!apiRes.ok) continue;
            const apiJson = await apiRes.json();
            if (!apiJson.enc) continue;

            const encBytes = Buffer.from(apiJson.enc, "base64");
            new Uint8Array(wasm.memory.buffer).set(encBytes, wasm.inPtr());
            const decLen = wasm.dec(encBytes.length);
            const decBytes = new Uint8Array(wasm.memory.buffer).slice(wasm.outPtr(), wasm.outPtr() + decLen);
            const decrypted = JSON.parse(new TextDecoder().decode(decBytes));

            if (decrypted.sources && decrypted.sources.length) {
                for (const source of decrypted.sources) {
                    const streamUrl = source.file || source.url;
                    if (!streamUrl) continue;
                    allUrls.push({
                        url: streamUrl,
                        server: `VidSuper - ${srv}`,
                        type: streamUrl.includes(".m3u8") ? "hls" : "mp4",
                        headers: {
                            "Referer": "https://vidsuper.net/",
                            "Origin": "https://vidsuper.net",
                            "User-Agent": UA
                        },
                        skipProxy: false,
                        skipVerify: true,
                        skipHlsCheck: true
                    });
                }
            }
        }

        return allUrls.length > 0 ? { allUrls } : null;
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    return ["zuri", "oneroom", "insertunit", "vidrock"].map(s => `VidSuper - ${s}`);
}