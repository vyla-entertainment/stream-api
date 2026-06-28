const PROXY_STREAMS = process.env.PROXY_STREAMS === "true";
const EXTERNAL_PROXY_URL = (process.env.PROXY_URL || "").replace(/\/+$/, "");

export function wrapUrl(rawUrl, sourceKey, absoluteBase, SOURCE_MAP) {
    if (!rawUrl) return null;

    const raw = typeof rawUrl === "object" ? rawUrl.url : rawUrl;
    const cfg = SOURCE_MAP[sourceKey];

    if (!cfg || cfg.skipProxy || rawUrl?.skipProxy) {
        return raw;
    }

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
            [cfg.proxyParam]: "1"
        });

        if (typeof rawUrl === "object" && rawUrl.headers) {
            params.set(
                "proxyHeaders",
                JSON.stringify(rawUrl.headers)
            );
        }

        return `${safeBase}/api?${params.toString()}`;
    }

    if (EXTERNAL_PROXY_URL) {
        const normalized = raw.replace(/^http:\/\//, "https://");

        const params = new URLSearchParams({
            url: normalized,
            [cfg.proxyParam]: "1"
        });

        if (typeof rawUrl === "object" && rawUrl.headers) {
            params.set(
                "proxyHeaders",
                JSON.stringify(rawUrl.headers)
            );
        }

        return `${EXTERNAL_PROXY_URL}/?${params.toString()}`;
    }

    return raw;
}