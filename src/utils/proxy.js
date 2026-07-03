import { issueSessionToken } from '../middleware/auth.js';

const PROXY_STREAMS = process.env.PROXY_STREAMS === "true";
const EXTERNAL_PROXY_URL = (process.env.PROXY_URL || "").replace(/\/+$/, "");
const _nativeFetch = globalThis.fetch;

const RAW_CHECK_TTL = 120_000;
const RAW_CHECK_TIMEOUT = 6_000;
const RAW_CHECK_MAX = 500;
const REAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const rawCheckCache = new Map();
const rawCheckInflight = new Map();

function cacheGet(key) {
    const entry = rawCheckCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > RAW_CHECK_TTL) { rawCheckCache.delete(key); return undefined; }
    return entry.val;
}

function cacheSet(key, val) {
    if (rawCheckCache.size >= RAW_CHECK_MAX && !rawCheckCache.has(key)) {
        rawCheckCache.delete(rawCheckCache.keys().next().value);
    }
    rawCheckCache.set(key, { val, ts: Date.now() });
}

function matchCdnHeaders(cfg, url) {
    if (!cfg?.cdnHeaders) return null;
    for (const rule of cfg.cdnHeaders) {
        if (rule.pattern.test(url)) return rule.headers;
    }
    return null;
}

function buildCheckHeaders(cfg, url, extraHeaders) {
    const headers = { "User-Agent": REAL_UA, Accept: "*/*" };
    if (cfg?.verifyHeaders) Object.assign(headers, cfg.verifyHeaders);
    const cdnMatch = matchCdnHeaders(cfg, url);
    if (cdnMatch) Object.assign(headers, cdnMatch);
    if (extraHeaders) Object.assign(headers, extraHeaders);
    if (!headers.Referer && !headers.Origin) {
        try {
            const origin = new URL(url).origin;
            headers.Referer = `${origin}/`;
            headers.Origin = origin;
        } catch { }
    }
    return headers;
}

function extractFirstSegmentUrl(manifestText, manifestUrl) {
    const lines = manifestText.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        if (line.startsWith("#")) continue;
        try {
            return new URL(line, manifestUrl).href;
        } catch {
            return null;
        }
    }
    return null;
}

async function isRawPlayable(rawUrl, headers) {
    const cacheKey = `${rawUrl}::${headers.Referer ?? ""}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const pending = rawCheckInflight.get(cacheKey);
    if (pending) return pending;

    const check = (async () => {
        try {
            const res = await _nativeFetch(rawUrl, {
                method: "GET",
                headers: { ...headers, Range: "bytes=0-1024" },
                redirect: "follow",
                signal: AbortSignal.timeout(RAW_CHECK_TIMEOUT),
            });

            if (!res.ok && res.status !== 206) {
                res.body?.cancel();
                cacheSet(cacheKey, false);
                return false;
            }

            const ct = (res.headers.get("content-type") || "").toLowerCase();
            if (ct.includes("text/html") || ct.includes("application/json")) {
                res.body?.cancel();
                cacheSet(cacheKey, false);
                return false;
            }

            const isHls = ct.includes("mpegurl") || rawUrl.includes(".m3u8");

            if (isHls) {
                const acao = res.headers.get("access-control-allow-origin");
                if (acao !== "*") {
                    res.body?.cancel();
                    cacheSet(cacheKey, false);
                    return false;
                }

                const text = await res.text().catch(() => "");
                if (!text.trim().startsWith("#EXTM3U")) {
                    cacheSet(cacheKey, false);
                    return false;
                }

                const nextUrl = extractFirstSegmentUrl(text, res.url || rawUrl);
                if (nextUrl && nextUrl !== rawUrl) {
                    const nextRes = await _nativeFetch(nextUrl, {
                        method: "GET",
                        headers: { ...headers, Range: "bytes=0-1024" },
                        redirect: "follow",
                        signal: AbortSignal.timeout(RAW_CHECK_TIMEOUT),
                    });
                    const nextAcao = nextRes.headers.get("access-control-allow-origin");
                    nextRes.body?.cancel();
                    if (nextAcao !== "*") {
                        cacheSet(cacheKey, false);
                        return false;
                    }
                }

                cacheSet(cacheKey, true);
                return true;
            }

            res.body?.cancel();
            cacheSet(cacheKey, true);
            return true;
        } catch {
            cacheSet(cacheKey, false);
            return false;
        }
    })();

    rawCheckInflight.set(cacheKey, check);
    try {
        return await check;
    } finally {
        rawCheckInflight.delete(cacheKey);
    }
}

function buildProxyUrl(base, params) {
    return `${base}?${params.toString()}`;
}

function proxify(raw, sourceKey, absoluteBase, SOURCE_MAP, cfg, extraHeaders) {
    const proxyParam = cfg?.proxyParam || "proxy";

    if (PROXY_STREAMS) {
        const isLocal =
            absoluteBase.includes("localhost") ||
            absoluteBase.includes("127.0.0.1");

        const safeBase = isLocal
            ? absoluteBase.replace(/^https:\/\//, "http://")
            : absoluteBase.replace(/^http:\/\//, "https://");

        const normalized = isLocal
            ? raw
            : raw.replace(/^http:\/\//, "https://");

        const params = new URLSearchParams({
            url: normalized,
            [proxyParam]: "1"
        });

        if (extraHeaders) {
            params.set("proxyHeaders", JSON.stringify(extraHeaders));
        }

        params.set("internal_token", issueSessionToken("internal", sourceKey));

        return buildProxyUrl(`${safeBase}/api`, params);
    }

    if (EXTERNAL_PROXY_URL) {
        const normalized = raw.replace(/^http:\/\//, "https://");

        const params = new URLSearchParams({
            url: normalized,
            [proxyParam]: "1"
        });

        if (extraHeaders) {
            params.set("proxyHeaders", JSON.stringify(extraHeaders));
        }

        return buildProxyUrl(EXTERNAL_PROXY_URL, params);
    }

    return raw;
}

export async function resolveStreamUrl(rawUrl, sourceKey, absoluteBase, SOURCE_MAP) {
    if (!rawUrl) return null;

    const raw = typeof rawUrl === "object" ? rawUrl.url : rawUrl;
    if (!raw) return null;

    const cfg = SOURCE_MAP[sourceKey];
    const extraHeaders = (typeof rawUrl === "object" && rawUrl.headers) ? rawUrl.headers : null;

    if (cfg?.alwaysProxy) {
        return proxify(raw, sourceKey, absoluteBase, SOURCE_MAP, cfg, extraHeaders);
    }

    const checkHeaders = buildCheckHeaders(cfg, raw, extraHeaders);

    if (await isRawPlayable(raw, checkHeaders)) {
        return raw;
    }

    return proxify(raw, sourceKey, absoluteBase, SOURCE_MAP, cfg, extraHeaders);
}

export function wrapUrl(rawUrl, sourceKey, absoluteBase, SOURCE_MAP) {
    if (!rawUrl) return null;

    const raw = typeof rawUrl === "object" ? rawUrl.url : rawUrl;
    const cfg = SOURCE_MAP[sourceKey];
    const extraHeaders = (typeof rawUrl === "object" && rawUrl.headers) ? rawUrl.headers : null;

    return proxify(raw, sourceKey, absoluteBase, SOURCE_MAP, cfg, extraHeaders);
}