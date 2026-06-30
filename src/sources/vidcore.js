'use strict';

const API_BASE = 'https://enc-dec.app/api';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Referer': 'https://vidcore.net/',
    'X-Requested-With': 'XMLHttpRequest',
};

async function getDynamicServers(id, s, e) {
    try {
        let embedUrl;
        if (s != null && e != null) {
            embedUrl = `https://vidcore.net/tv/${id}/${s}/${e}/`;
        } else {
            embedUrl = `https://vidcore.net/movie/${id}/`;
        }

        const htmlRes = await fetch(embedUrl, { headers: { 'User-Agent': HEADERS['User-Agent'], 'Referer': 'https://vidcore.net/' } });
        if (!htmlRes.ok) return null;
        const html = await htmlRes.text();

        const match = html.match(/\\"en\\":\\"(.*?)\\"/) || html.match(/"en":"(.*?)"/);
        const enToken = match ? match[1] : null;
        if (!enToken) return null;

        const encRes = await fetch(`${API_BASE}/enc-vidcore?text=${encodeURIComponent(enToken)}`, { method: 'GET' });
        if (!encRes.ok) return null;
        const encData = await encRes.json();
        if (!encData?.result) return null;

        const { servers: serversUrl, stream: streamUrl, token } = encData.result;
        const reqHeaders = { ...HEADERS, 'X-CSRF-Token': token };

        const serversEncryptedRes = await fetch(serversUrl, { method: 'POST', headers: reqHeaders });
        if (!serversEncryptedRes.ok) return null;
        const serversEncrypted = await serversEncryptedRes.text();

        const decServersRes = await fetch(`${API_BASE}/dec-vidcore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: serversEncrypted }),
        });
        if (!decServersRes.ok) return null;
        const decServersData = await decServersRes.json();
        if (!decServersData?.result) return null;

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
        const streamEncryptedRes = await fetch(streamTargetUrl, { method: 'POST', headers: reqHeaders });
        if (!streamEncryptedRes.ok) return null;
        const streamEncrypted = await streamEncryptedRes.text();

        const decStreamRes = await fetch(`${API_BASE}/dec-vidcore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: streamEncrypted }),
        });
        if (!decStreamRes.ok) return null;
        const decStreamData = await decStreamRes.json();
        if (!decStreamData?.result?.url) return null;

        return decStreamData.result;
    } catch (err) {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e } = args;
    const data = await getDynamicServers(id, s, e);
    if (!data || !data.servers || !data.servers.length) return null;

    const { servers, streamUrl, reqHeaders } = data;

    for (const srv of servers) {
        const streamData = await fetchStreamForServer(srv, streamUrl, reqHeaders);
        if (streamData && streamData.url) {
            const url = streamData.url;
            try {
                const r = await fetch(url, { headers: { ...HEADERS, 'Range': 'bytes=0-511' }, signal: AbortSignal.timeout(5000) });
                if (r.ok || r.status === 206) {
                    const text = (await r.text()).trim();
                    if (text.length > 0 && (!url.includes('.m3u8') || text.startsWith('#EXT'))) {
                        const subtitles = (streamData.captions || []).map(c => ({
                            url: c.file,
                            lang: c.label || 'Unknown'
                        }));
                        return {
                            url,
                            subtitles,
                            headers: { ...HEADERS, 'Origin': 'https://vidcore.net' },
                            server: srv.name,
                        };
                    }
                }
            } catch { }
        }
    }

    return null;
}

export async function getSources(args) {
    const { id, s, e } = args;
    const data = await getDynamicServers(id, s, e);
    if (!data || !data.servers || !data.servers.length) return [];

    const { servers, streamUrl, reqHeaders } = data;
    const results = await Promise.all(servers.map(srv => fetchStreamForServer(srv, streamUrl, reqHeaders)));

    const urls = [];
    for (const r of results) {
        if (r && r.url) urls.push(r.url);
    }
    return [...new Set(urls)];
}

export const VERIFY_HEADERS = { ...HEADERS };
export const SKIP_VERIFY = true;
export const MULTI_URL = false;