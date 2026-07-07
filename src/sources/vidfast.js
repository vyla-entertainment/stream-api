'use strict';

const API_BASE = 'https://enc-dec.app/api';
const DOMAIN = 'https://vidfast.vc';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Referer': DOMAIN + '/',
    'X-Requested-With': 'XMLHttpRequest'
};

async function getVidfastMeta(id, s, e) {
    try {
        const embedUrl = s != null && e != null
            ? `${DOMAIN}/tv/${id}/${s}/${e}/`
            : `${DOMAIN}/movie/${id}/`;

        const htmlRes = await fetch(embedUrl, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
        if (!htmlRes.ok) return null;
        const html = await htmlRes.text();

        const match = html.match(/\\"en\\":\\"(.*?)\\"/) || html.match(/"en":"(.*?)"/);
        const enText = match ? match[1] : null;
        if (!enText) return null;

        const encRes = await fetch(`${API_BASE}/enc-vidfast?text=${encodeURIComponent(enText)}`);
        if (!encRes.ok) return null;
        const encData = await encRes.json();
        if (encData.status !== 200 || !encData.result) return null;

        const { servers: serversUrl, stream: streamUrl, token } = encData.result;
        const reqHeaders = { ...HEADERS, 'X-CSRF-Token': token };

        const serversEncRes = await fetch(serversUrl, { method: 'POST', headers: reqHeaders });
        if (!serversEncRes.ok) return null;
        const serversEncrypted = await serversEncRes.text();

        const decServersRes = await fetch(`${API_BASE}/dec-vidfast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: serversEncrypted }),
        });
        if (!decServersRes.ok) return null;
        const decServersData = await decServersRes.json();
        if (decServersData.status !== 200 || !decServersData.result) return null;

        return {
            servers: decServersData.result,
            streamUrl,
            reqHeaders
        };
    } catch (err) {
        return null;
    }
}

async function fetchStreamForServer(srv, streamUrl, reqHeaders) {
    try {
        const streamTargetUrl = `${streamUrl}/${srv.data}`;
        const streamEncRes = await fetch(streamTargetUrl, { method: 'POST', headers: reqHeaders });
        if (!streamEncRes.ok) return null;
        const streamEncrypted = await streamEncRes.text();

        const decStreamRes = await fetch(`${API_BASE}/dec-vidfast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: streamEncrypted }),
        });
        if (!decStreamRes.ok) return null;
        const decStreamData = await decStreamRes.json();
        if (decStreamData.status !== 200 || !decStreamData.result?.url) return null;

        return decStreamData.result;
    } catch (err) {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const meta = await getVidfastMeta(id, s, e);
    if (!meta || !meta.servers?.length) return null;

    const { servers, streamUrl, reqHeaders } = meta;

    let targets = servers;
    if (serverName && serverName !== 'all') {
        const cleanName = serverName.replace('VidFast - ', '');
        targets = servers.filter(srv => srv.name === cleanName);
        if (!targets.length) targets = servers;
    }

    const settled = await Promise.allSettled(
        targets.map(srv => fetchStreamForServer(srv, streamUrl, reqHeaders))
    );

    const allUrls = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => {
            const streamData = r.value;
            return {
                url: streamData.url,
                server: `VidFast - ${targets.find(t => t.data === streamData.data)?.name || 'Server'}`,
                type: streamData.url.includes('.m3u8') ? 'hls' : 'mp4',
                subtitles: (streamData.captions || []).map(c => ({
                    url: c.file,
                    lang: c.label || 'Unknown'
                })),
                headers: { ...HEADERS, 'Origin': DOMAIN },
            };
        });

    if (!allUrls.length) return null;

    return { allUrls };
}

export async function getSources(args) {
    const { id, s, e } = args;
    const meta = await getVidfastMeta(id, s, e);
    if (!meta || !meta.servers) return [];
    return meta.servers.map(srv => `VidFast - ${srv.name}`);
}