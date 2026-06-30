const SERVERS = [
    { id: 'nebula', name: 'nebula' },
    { id: 'vidy', name: 'vidy' },
    { id: 'meridian', name: 'meridian' },
    { id: 'fast-4k', name: 'fast' },
    { id: 'tiki', name: 'tiki' },
    { id: 'videasy', name: 'videasy' },
    { id: 'lul', name: 'lul' },
    { id: 'subtitulado', name: 'subtitulado' },
    { id: 'latino', name: 'latino' },
    { id: 'castellano', name: 'castellano' },
    { id: 'cowflix', name: 'cowflix' },
    { id: 'gallic', name: 'gallic' },
    { id: 'kinglink', name: 'kinglink' },
    { id: 't2', name: 't2' },
    { id: 'animetsu', name: 'animetsu' }
];

const BASE_HEADERS = {
    'Origin': 'https://aether.cx',
    'Referer': 'https://aether.cx/'
};

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const isTv = s != null && e != null;
    const path = isTv ? `tv/${id}/${s}/${e}` : `movie/${id}`;

    let targetServers = SERVERS;
    if (serverName && serverName !== 'all') {
        targetServers = SERVERS.filter(sv => sv.name === serverName);
        if (targetServers.length === 0) targetServers = SERVERS;
    }

    const fetchServer = async (server) => {
        const url = `https://${server.id}.aether.cx/${path}`;
        try {
            const res = await fetch(url, { headers: BASE_HEADERS, signal: AbortSignal.timeout(10000) });
            if (!res.ok) return null;

            const data = await res.json();
            const streamRaw = data.stream || data.stream_url;
            if (!streamRaw) return null;

            if (streamRaw.includes('/m3u8-proxy?url=')) {
                try {
                    const parsedUrl = new URL(streamRaw);
                    const actualUrl = parsedUrl.searchParams.get('url');
                    let headersStr = parsedUrl.searchParams.get('headers');
                    let actualHeaders = BASE_HEADERS;

                    if (headersStr) {
                        try {
                            actualHeaders = JSON.parse(headersStr);
                        } catch (e) { }
                    }

                    if (actualUrl) {
                        return {
                            url: actualUrl,
                            type: 'hls',
                            headers: actualHeaders,
                            server: server.name,
                        };
                    }
                } catch (err) { }
            }

            return {
                url: streamRaw,
                type: 'hls',
                headers: BASE_HEADERS,
                server: server.name
            };

        } catch (err) {
            return null;
        }
    };

    const results = await Promise.allSettled(targetServers.map(fetchServer));
    const allUrls = results
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

    if (allUrls.length === 0) return null;

    return {
        ...allUrls[0],
        allUrls: allUrls
    };
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res || !res.allUrls) return [];
    return res.allUrls.map(u => u.server);
}