import { fetchJson, USER_AGENT } from '../utils/helpers.js';

const DEC_API = "https://enc-dec.app/api/dec-peachify";
const ORIGIN = "https://peachify.top";
const HEADERS = { "User-Agent": USER_AGENT, "Origin": ORIGIN, "Referer": `${ORIGIN}/` };

const SERVERS = [
    { label: "Wolf", path: "air", api: "https://usa.eat-peach.sbs" },
    { label: "Spider", path: "holly", api: "https://usa.eat-peach.sbs" },
    { label: "Iron", path: "moviebox", api: "https://uwu.eat-peach.sbs" },
    { label: "Multi", path: "multi", api: "https://usa.eat-peach.sbs" },
    { label: "Dark", path: "net", api: "https://uwu.eat-peach.sbs" },
];

export async function getStream({ id, s, e, server }) {
    try {
        const isTv = s != null && e != null;
        const segment = isTv ? `tv/${id}/${s}/${e}` : `movie/${id}`;

        let targets = SERVERS;
        if (server && server !== 'all') {
            const cleanName = server.replace('Peachify - ', '');
            targets = SERVERS.filter(srv => srv.label === cleanName);
            if (!targets.length) targets = SERVERS;
        }

        const settled = await Promise.allSettled(targets.map(async srv => {
            const url = `${srv.api}/${srv.path}/${segment}`;
            const rawData = await fetchJson(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });

            if (!rawData?.data) throw new Error();

            const decJson = await fetchJson(DEC_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: rawData.data }),
                signal: AbortSignal.timeout(10000)
            });

            if (decJson.status !== 200 || !decJson.result) throw new Error();
            const res = decJson.result;

            const sources = Array.isArray(res) ? res : (res.sources || [res]);
            const subs = res.subtitles || [];

            return sources.map(source => {
                const streamUrl = source.url || source.file || source.link;
                if (!streamUrl) return null;

                return {
                    url: streamUrl,
                    server: `Peachify - ${srv.label}`,
                    quality: source.quality || "Auto",
                    type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
                    headers: { ...HEADERS, "Origin": ORIGIN },
                    subtitles: subs.map(sub => ({
                        url: sub.url || sub.file,
                        lang: sub.language || sub.lang || sub.label || 'Unknown'
                    })),
                    skipProxy: false,
                    skipVerify: true,
                    skipHlsCheck: true
                };
            }).filter(Boolean);
        }));

        const allUrls = [];
        for (const r of settled) {
            if (r.status === 'fulfilled' && r.value) allUrls.push(...r.value);
        }

        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources() {
    return SERVERS.map(s => `Peachify - ${s.label}`);
}