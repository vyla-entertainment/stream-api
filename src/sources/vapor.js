export const SKIP_VERIFY = false;

export async function getStream(id, s, e, clientIP, absoluteBase, audio) {
    try {
        const url = s && e
            ? `https://api.dmvdriverseducation.org/v1/tv/${id}/seasons/${s}/episodes/${e}`
            : `https://api.dmvdriverseducation.org/v1/movies/${id}`;

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        if (!res.ok) return null;

        const data = await res.json();
        let streamUrl = data.url || data.stream || data.source || (data.data && data.data.url) || data.file;

        if (!streamUrl && Array.isArray(data.sources)) {
            streamUrl = data.sources[0]?.url || data.sources[0]?.file;
        }

        if (!streamUrl) return null;

        streamUrl = streamUrl.replace('http://localhost:3030', 'https://api.dmvdriverseducation.org');

        return { url: streamUrl };
    } catch {
        return null;
    }
}