export const SERVERS = [
    { name: "TIK 1" }, { name: "VID 1" }, { name: "VIP 1" },
    { name: "FIL 1" }, { name: "FIL 2" },
    { name: "WIS 1" }, { name: "WIS 2" }, { name: "WIS 3" }, { name: "WIS 4" },
    { name: "LUL 1" }, { name: "LUL 2" }, { name: "LUL 3" }, { name: "LUL 4" },
    { name: "SAF 1" }, { name: "SAF 2" },
    { name: "BIG 1" }, { name: "BIG 2" }, { name: "BIG 3" }, { name: "BIG 4" }, { name: "BIG 5" },
    { name: "MIX 1" }, { name: "MIX 2" }, { name: "MIX 3" }, { name: "MIX 4" },
    { name: "MOL 1" }, { name: "MOL 2" },
    { name: "ZUR 1" }, { name: "MEG 1" }, { name: "VXR 1" }, { name: "VRK 1" }
];

const BASE = "https://play.xpass.top";

const XPASS_HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": '"Chromium";v="148", "Brave";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "sec-gpc": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7378.102 Safari/537.36",
    "Origin": "https://play.xpass.top",
    "Referrer": "https://play.xpass.top/",
    "Cookie": "auth_token=de21073d24bca9b50f189b402ac870734cf945f2085cb7e1a4fc453fcfe4f57e"
};

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const isTv = s && e && s !== 'null' && e !== 'null';
    const type = isTv ? 'tv' : 'movie';
    const headers = { ...XPASS_HEADERS, referer: `${BASE}/e/${type}/${id}?autostart=true` };

    try {
        let sources = [];
        if (!isTv) {
            const url = `${BASE}/e/movie/${id}?autostart=true`;
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
            if (!res.ok) return null;
            const text = await res.text();
            const backupsMatch = text.match(/var backups=(\[[\s\S]*?\])/);
            if (!backupsMatch) return null;
            sources = JSON.parse(backupsMatch[1]);
        } else {
            const url = `${BASE}/data/tv/${id}/${s}/${e}?autostart=true&force=true`;
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
            if (!res.ok) return null;
            sources = await res.json();
        }

        if (!sources || sources.length === 0) return null;

        const serverToFind = serverName?.replace('XPass - ', '');
        if (serverToFind && serverToFind !== 'all') {
            const exactSource = sources.find(src => src.name === serverToFind);
            if (exactSource) sources = [exactSource];
            else return null;
        }

        const allUrls = [];
        for (const source of sources) {
            if (!source.url) continue;
            try {
                const mdataRes = await fetch(`${BASE}${source.url}`, { headers, signal: AbortSignal.timeout(5000) });
                if (!mdataRes.ok) continue;

                const mdata = await mdataRes.json();
                if (!mdata?.playlist?.[0]?.sources) continue;

                const streamSources = mdata.playlist[0].sources;
                const targetStream = streamSources.find(st => st.type === 'hls') || streamSources[0];
                if (!targetStream?.file) continue;

                allUrls.push({
                    server: `XPass - ${source.name}`,
                    type: targetStream.type === 'hls' ? 'hls' : 'mp4',
                    url: targetStream.file,
                    headers: {
                        "Origin": XPASS_HEADERS.Origin,
                        "Referer": XPASS_HEADERS.Referrer,
                        "User-Agent": XPASS_HEADERS["User-Agent"]
                    },
                });
            } catch (e) { }
        }

        return allUrls.length > 0 ? { allUrls } : null;
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const result = await getStream(args);
    if (!result || !result.allUrls) return [];
    return result.allUrls.map(u => u.server);
}