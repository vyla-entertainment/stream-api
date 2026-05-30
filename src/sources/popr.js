export const SKIP_VERIFY = false;
export const MULTI_URL = true;

const BASE_URL = 'https://popr.ink';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    Referer: `${BASE_URL}/`
};

const SERVERS = ['default', 'catflix', 'hexa', 'Gama', 'Liligoon', 'Sigma', 'Prime', 'Alfa', 'Lamda', 'ynx_vidsrc'];

async function isMasterOrVod(url, headers = {}) {
    try {
        const res = await fetch(url, {
            headers: { ...HEADERS, ...headers },
            signal: AbortSignal.timeout(5000),
            redirect: 'follow',
        });
        if (!res.ok) return false;
        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed.startsWith('#EXTM3U')) return false;
        const segmentLines = trimmed.split('\n').filter(l => {
            const t = l.trim();
            return t && !t.startsWith('#');
        });
        return segmentLines.length > 0;
    } catch {
        return false;
    }
}

export async function getStream(id, s, e) {
    const type = s ? 'tv' : 'movie';
    const season = s || 1;
    const ep = e || 1;

    const buildUrl = (server) => {
        if (type === 'tv') {
            return `${BASE_URL}/api/vidnest?id=${id}&type=tv&server=${server}&season=${season}&episode=${ep}`;
        }
        return `${BASE_URL}/api/vidnest?id=${id}&type=movie` + (server !== 'default' ? `&server=${server}` : '');
    };

    const results = await Promise.allSettled(
        SERVERS.map(server =>
            fetch(buildUrl(server), { headers: HEADERS, signal: AbortSignal.timeout(8000) })
                .then(async res => {
                    if (res.status !== 200) return null;
                    const data = await res.json();
                    const stream = data?.results?.[0]?.streams?.[0];
                    if (!stream?.url) return null;
                    return { url: stream.url, headers: stream.headers || {} };
                })
                .catch(() => null)
        )
    );

    const candidates = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

    const validated = await Promise.all(
        candidates.map(async candidate => {
            const ext = (new URL(candidate.url).pathname.match(/\.[^./]+$/) || [''])[0];
            if (ext !== '.m3u8' && ext !== '.m3u') return candidate;
            const ok = await isMasterOrVod(candidate.url, candidate.headers || {});
            return ok ? candidate : null;
        })
    );

    const allUrls = validated.filter(Boolean);
    if (!allUrls.length) return null;

    return { allUrls };
}