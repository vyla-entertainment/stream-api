const PROXY_STREAMS = process.env.PROXY_STREAMS === "true";
const EXTERNAL_PROXY_URL = (process.env.PROXY_URL || "").replace(/\/+$/, "");

export function wrapUrl(rawUrl, sourceKey, absoluteBase, SOURCE_MAP) {
    if (!rawUrl) return null;

    const raw = typeof rawUrl === "object" ? rawUrl.url : rawUrl;
    const cfg = SOURCE_MAP?.[sourceKey];

    if (!cfg || cfg.skipProxy || rawUrl?.skipProxy) {
        return raw;
    }

    const headers =
        typeof rawUrl === "object" && rawUrl.headers
            ? rawUrl.headers
            : null;

    const params = new URLSearchParams();
    params.set("url", raw);

    if (cfg?.proxyParam) {
        params.set(cfg.proxyParam, "1");
    }

    if (headers) {
        params.set("proxyHeaders", encodeURIComponent(JSON.stringify(headers)));
    }

    if (PROXY_STREAMS) {
        const isLocal =
            absoluteBase.includes("localhost") ||
            absoluteBase.includes("127.0.0.1");

        const base = isLocal
            ? absoluteBase.replace(/^https:\/\//, "http://")
            : absoluteBase.replace(/^http:\/\//, "https://");

        return `${base}/api?${params.toString()}`;
    }

    if (EXTERNAL_PROXY_URL) {
        return `${EXTERNAL_PROXY_URL}/api?${params.toString()}`;
    }

    return raw;
}