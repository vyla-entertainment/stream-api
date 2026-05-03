const BASE = "https://vixsrc.to";

export const HEADERS = {
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: BASE,
    Origin: BASE,
};

export async function getStream(id, s = null, e = null) {
    const isTV = s != null && e != null;

    const apiUrl = isTV
        ? `${BASE}/api/tv/${id}/${s}/${e}`
        : `${BASE}/api/movie/${id}`;

    try {
        const apiRes = await fetch(apiUrl, { headers: HEADERS });
        if (!apiRes.ok) return null;

        const data = await apiRes.json();
        if (!data?.src) return null;

        const embedUrl = BASE + data.src.replace(/\\\//g, "/");

        const embedRes = await fetch(embedUrl, { headers: HEADERS });
        if (!embedRes.ok) return null;

        const html = await embedRes.text();

        const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
        const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
        const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];

        if (!token || !expires || !playlist) return null;

        const masterUrl = `${playlist}?token=${token}&expires=${expires}&h=1`;

        const playlistRes = await fetch(masterUrl, {
            headers: { ...HEADERS, Referer: apiUrl },
        });

        if (!playlistRes.ok) return null;

        const content = await playlistRes.text();
        if (!content.includes("#EXTM3U")) return null;

        const bestUrl = content
            .split("\n")
            .find(l => l.trim().startsWith("http") && l.includes("type=video"));

        return bestUrl?.trim() ?? null;

    } catch {
        return null;
    }
}