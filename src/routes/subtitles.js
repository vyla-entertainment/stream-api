const SUBTITLE_BASES = [
    'https://sub.vdrk.site/v1',
    'https://sub.vdrk.site/v2',
    'https://fed-subs.pstream.mov'
];

const UA_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

const getUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

const subtitleCache = new Map();
const SUBTITLE_TTL = 15 * 60 * 1000;

export async function fetchSubtitles(paths = []) {
    const cacheKey = paths.map(p => `${p.base}${p.path}`).join('|');
    const hit = subtitleCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < SUBTITLE_TTL) return hit.val;

    try {
        const results = await Promise.all(
            paths.map(async ({ base, path }) => {
                try {
                    const res = await fetch(`${base}${path}`, {
                        headers: { 'User-Agent': getUA() },
                        signal: AbortSignal.timeout(5000),
                    });

                    if (!res.ok) {
                        res.body?.cancel();
                        return [];
                    }

                    const data = await res.json();

                    if (base.includes('/v2')) {
                        return Array.isArray(data)
                            ? data.map(x => ({
                                label: x.label,
                                file: x.file || x.url,
                                type: 'vtt',
                                source: 'v2'
                            }))
                            : [];
                    }

                    if (base.includes('fed-subs.pstream.mov')) {
                        if (!data?.subtitles || typeof data.subtitles !== 'object') return [];

                        return Object.entries(data.subtitles)
                            .map(([language, sub]) => {
                                if (!sub?.subtitle_link) return null;
                                const ext = sub.subtitle_link.split('.').pop()?.toLowerCase();
                                return {
                                    label: sub.subtitle_name || language,
                                    file: sub.subtitle_link,
                                    type: ext === 'vtt' ? 'vtt' : 'srt',
                                    source: 'febbox'
                                };
                            })
                            .filter(Boolean);
                    }

                    const v1 = Array.isArray(data) ? data : [];
                    return v1.map(x => ({
                        label: x.label,
                        file: x.file || x.url,
                        type: 'vtt',
                        source: 'v1'
                    }));
                } catch {
                    return [];
                }
            })
        );

        const val = results.flat();
        if (val.length) subtitleCache.set(cacheKey, { val, ts: Date.now() });
        return val;
    } catch {
        return [];
    }
}

export async function handleSubtitleMovie(id, corsHeaders) {
    try {
        const subtitles = await fetchSubtitles([
            { base: SUBTITLE_BASES[0], path: `/movie/${id}` },
            { base: SUBTITLE_BASES[1], path: `/movie/${id}` },
            { base: SUBTITLE_BASES[2], path: `/movie/tt${id}` }
        ]);
        if (!subtitles.length) return { status: 404, body: JSON.stringify({ error: 'no subtitles found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        return { status: 200, body: JSON.stringify(subtitles, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleSubtitleTv(id, season, episode, corsHeaders) {
    try {
        const subtitles = await fetchSubtitles([
            { base: SUBTITLE_BASES[0], path: `/tv/${id}/${season}/${episode}` },
            { base: SUBTITLE_BASES[1], path: `/tv/${id}/${season}/${episode}` },
            { base: SUBTITLE_BASES[2], path: `/tv/tt${id}/${season}/${episode}` }
        ]);
        if (!subtitles.length) return { status: 404, body: JSON.stringify({ error: 'no subtitles found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        return { status: 200, body: JSON.stringify(subtitles, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export { SUBTITLE_BASES };