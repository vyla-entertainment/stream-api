import { issueSessionToken } from '../middleware/auth.js';

const isLocal = process.env.NODE_ENV === 'local' || (!process.env.NODE_ENV && process.env.SPACE_ID == null);
const PROXY_STREAMS = process.env.PROXY_STREAMS === "true" || isLocal;
const EXTERNAL_PROXY_URL = (process.env.PROXY_URL || "").replace(/\/+$/, "");

function buildProxyUrl(base, params) {
    return `${base}?${params.toString()}`;
}

export function wrapUrl(rawUrl, sourceKey, absoluteBase, SOURCE_MAP) {
    if (!rawUrl) return null;

    const raw = typeof rawUrl === "object" ? rawUrl.url : rawUrl;
    const cfg = SOURCE_MAP[sourceKey];

    if (!cfg || (!isLocal && (cfg.skipProxy || rawUrl?.skipProxy))) {
        return raw;
    }

    const proxyParam = cfg.proxyParam || "proxy";

    if (PROXY_STREAMS) {
        const isLocalHost =
            absoluteBase.includes("localhost") ||
            absoluteBase.includes("127.0.0.1");

        const safeBase = isLocalHost
            ? absoluteBase.replace(/^https:\/\//, "http://")
            : absoluteBase.replace(/^http:\/\//, "https://");

        const normalized = isLocalHost
            ? raw
            : raw.replace(/^http:\/\//, "https://");

        const params = new URLSearchParams({
            url: normalized,
            [proxyParam]: "1"
        });

        if (typeof rawUrl === "object" && rawUrl.headers) {
            params.set("proxyHeaders", JSON.stringify(rawUrl.headers));
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

        if (typeof rawUrl === "object" && rawUrl.headers) {
            params.set("proxyHeaders", JSON.stringify(rawUrl.headers));
        }

        return buildProxyUrl(EXTERNAL_PROXY_URL, params);
    }

    return raw;
}