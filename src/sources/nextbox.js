const NEXTBOX_BASE = 'https://1st.bradar.cloud';
const NEXTBOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const NEXTBOX_SERVERS = [1, 2, 3, 4, 5];

async function fetchStream(params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${NEXTBOX_BASE}/vaplayer?${qs}`, {
        headers: { 'User-Agent': NEXTBOX_UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    try {
        return await res.json();
    } catch {
        return null;
    }
}

function extractUrl(data) {
    if (!data) return null;
    const streamUrl = data.url || data.stream || data.source || data.file
        || (data.data && data.data.url);
    return streamUrl || null;
}

export async function getStream({ id, s, e }) {
    const baseParams = s && e
        ? { type: 'tv', id, season: s, episode: e }
        : { type: 'movie', id };

    for (const server of NEXTBOX_SERVERS) {
        const data = await fetchStream({ ...baseParams, server });
        const url = extractUrl(data);
        if (url) {
            return { url };
        }
    }

    return null;
}