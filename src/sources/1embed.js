'use strict';

const BASE = "https://1embed.cc";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0";

const PROVIDERS = [
    { id: "sdev", name: "1Embed - SDev" },
    { id: "xpa", name: "1Embed - XPass" },
    { id: "vnes", name: "1Embed - VidNest" },
    { id: "pro", name: "1Embed - Pro" },
    { id: "pur", name: "1Embed - Purstream" },
    { id: "czo", name: "1Embed - Cinezo" },
    { id: "fas", name: "1Embed - VidFast" }
];

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && tokenExpiresAt > now + 10) return cachedToken;

    try {
        const res = await fetch(`${BASE}/api/token`, {
            headers: {
                "Referer": `${BASE}/`,
                "User-Agent": UA,
                "Accept": "application/json"
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        cachedToken = data.token;
        tokenExpiresAt = data.expiresAt;
        return cachedToken;
    } catch {
        return null;
    }
}

async function fetchProviderStream(provider, type, id, s, e, token) {
    try {
        const referer = type === "movie"
            ? `${BASE}/embed/movie/${id}`
            : `${BASE}/embed/tv/${id}/${s}/${e}`;

        const payload = {
            type,
            id: id.toString(),
            provider: provider.id
        };

        if (type === "tv") {
            payload.season = parseInt(s);
            payload.episode = parseInt(e);
        }

        const res = await fetch(`${BASE}/api/sources`, {
            method: "POST",
            headers: {
                "User-Agent": UA,
                "Referer": referer,
                "Origin": BASE,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "x-bcine-key": token,
                "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Microsoft Edge";v="150"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-ch-ua-arch": '"x86"',
                "sec-ch-ua-bitness": '"64"',
                "sec-ch-ua-full-version": '"150.0.4078.48"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) return null;
        const data = await res.json();

        let rawSources = data.sources || [];
        if (data.providerResults && data.providerResults[provider.id]) {
            const pRes = data.providerResults[provider.id];
            if (pRes.sources) rawSources = [...rawSources, ...pRes.sources];
            if (Array.isArray(pRes)) rawSources = [...rawSources, ...pRes];
        }

        if (!rawSources || rawSources.length === 0) return null;

        return rawSources.map(src => {
            let streamUrl = src.file || src.url || src.link;
            if (!streamUrl) return null;

            const isWorker = streamUrl.includes('omena-puu') || streamUrl.includes('nocach') || streamUrl.includes('?p=');
            const isHls = src.type === 'hls' || streamUrl.includes('m3u8') || isWorker;

            if (isHls && !streamUrl.includes('m3u8')) {
                streamUrl += streamUrl.includes('?') ? '&format=.m3u8' : '?format=.m3u8';
            }

            return {
                url: streamUrl,
                server: provider.name,
                quality: src.label || src.quality || "Auto",
                type: isHls ? "hls" : "mp4",
                headers: {
                    "User-Agent": UA,
                    "Referer": referer,
                    "Origin": BASE
                },
                skipProxy: false,
                skipVerify: true,
                skipHlsCheck: true
            };
        }).filter(Boolean);
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const type = s != null && e != null ? "tv" : "movie";

    const token = await getToken();
    if (!token) return null;

    let targets = PROVIDERS;
    if (serverName && serverName !== 'all') {
        const cleanName = serverName.replace('1Embed - ', '');
        targets = PROVIDERS.filter(p => p.id === cleanName.toLowerCase() || p.name.includes(cleanName));
        if (!targets.length) targets = PROVIDERS;
    }

    const settled = await Promise.allSettled(
        targets.map(p => fetchProviderStream(p, type, id, s, e, token))
    );

    const allUrls = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .flatMap(r => r.value);

    if (allUrls.length === 0) return null;

    return { allUrls };
}

export async function getSources(args) {
    return PROVIDERS.map(p => p.name);
}

export const SKIP_VERIFY = true;
export const MULTI_URL = true;