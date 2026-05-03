const BASE = 'https://vixsrc.to';

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: BASE,
    Origin: BASE,
};

export async function getStream(id, s = null, e = null) {
    const mediaType = s && e ? 'tv' : 'movie';
    const apiUrl =
        mediaType === 'movie'
            ? `${BASE}/api/movie/${id}`
            : `${BASE}/api/tv/${id}/${s}/${e}`;

    try {
        const apiRes = await fetch(apiUrl, {
            method: 'GET',
            headers: HEADERS,
        });

        const data = await apiRes.json();
        if (!data?.src) return null;

        const embedUrl = BASE + data.src.replace(/\\\//g, '/');

        const embedRes = await fetch(embedUrl, {
            method: 'GET',
            headers: HEADERS,
        });

        const html = await embedRes.text();

        const tokenMatch = html.match(/token["']\s*:\s*["']([^"']+)/);
        const expiresMatch = html.match(/expires["']\s*:\s*["']([^"']+)/);
        const playlistMatch = html.match(/url\s*:\s*["']([^"']+)/);

        if (!tokenMatch || !expiresMatch || !playlistMatch) return null;

        const token = tokenMatch[1];
        const expires = expiresMatch[1];
        const playlist = playlistMatch[1];

        const masterUrl = `${playlist}?token=${token}&expires=${expires}&h=1`;

        const playlistRes = await fetch(masterUrl, {
            method: 'GET',
            headers: {
                ...HEADERS,
                Referer: apiUrl,
            },
        });

        const content = await playlistRes.text();

        const streams = content
            .split('\n')
            .filter(line => line.startsWith('http') && line.includes('type=video'))
            .map(line => line.trim());

        return streams.length > 0 ? streams[0] : null;
    } catch {
        return null;
    }
}