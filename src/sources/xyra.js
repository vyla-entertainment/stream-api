const BASE = "https://api.xyra.stream";

export async function getStream({ id, s, e }) {
    const apiKey = "freekey";
    const url = s
        ? `${BASE}/v1/streamhub/streams?api_key=${apiKey}&tmdb_id=${id}&type=series&season=${s}&episode=${e}`
        : `${BASE}/v1/streamhub/streams?api_key=${apiKey}&tmdb_id=${id}&type=movie`;

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;

        const data = await res.json();
        if (!data.success || !data.streams || !data.streams.length) return null;

        const allUrls = data.streams.map(stream => ({
            url: stream.url,
            type: stream.url.includes('.m3u8') ? 'hls' : 'mp4',
            server: stream.name || 'Xyra',
            skipProxy: true
        }));

        return allUrls.length ? { allUrls } : null;
    } catch {
        return null;
    }
}