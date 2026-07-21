import { fetchJson, fetchText, USER_AGENT } from '../utils/helpers.js';

const API_BASE = 'https://enc-dec.app/api';
const DOMAIN = 'https://vidfast.vc';
const HEADERS = { 'User-Agent': USER_AGENT, 'Referer': `${DOMAIN}/`, 'X-Requested-With': 'XMLHttpRequest' };

async function getVidfastMeta(id, s, e) {
    try {
        const embedUrl = s != null && e != null ? `${DOMAIN}/tv/${id}/${s}/${e}/` : `${DOMAIN}/movie/${id}/`;
        const html = await fetchText(embedUrl, { headers: { 'User-Agent': USER_AGENT } });

        const match = html.match(/\\"(?:en|token)\\":\\"(.*?)\\"/) || html.match(/"(?:en|token)":"(.*?)"/);
        if (!match?.[1]) return null;

        const encData = await fetchJson(`${API_BASE}/enc-vidfast?text=${encodeURIComponent(match[1])}`);
        if (encData.status !== 200 || !encData.result) return null;

        const { servers: serversUrl, stream: streamUrl, token } = encData.result;
        const reqHeaders = { ...HEADERS, 'X-CSRF-Token': token };

        const serversEncrypted = await fetchText(serversUrl, { method: 'POST', headers: reqHeaders });
        const decServersData = await fetchJson(`${API_BASE}/dec-vidfast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: serversEncrypted }) });

        if (decServersData.status !== 200 || !decServersData.result) return null;
        return { servers: decServersData.result, streamUrl, reqHeaders };
    } catch { return null; }
}

export async function getStream({ id, s, e, server }) {
    const meta = await getVidfastMeta(id, s, e);
    if (!meta?.servers?.length) return null;
    const { servers, streamUrl, reqHeaders } = meta;
    let targets = servers;
    if (server && server !== 'all') {
        const cleanName = server.replace('VidFast - ', '');
        targets = servers.filter(srv => srv.name === cleanName);
        if (!targets.length) targets = servers;
    }
    const results = await Promise.allSettled(targets.map(async srv => {
        const streamEncrypted = await fetchText(`${streamUrl}/${srv.data}`, { method: 'POST', headers: reqHeaders });
        const decStreamData = await fetchJson(`${API_BASE}/dec-vidfast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: streamEncrypted }) });
        if (decStreamData.status !== 200 || !decStreamData.result?.url) throw new Error();
        return { url: decStreamData.result.url, server: `VidFast - ${srv.name || 'Server'}`, type: decStreamData.result.url.includes('.m3u8') ? 'hls' : 'mp4', subtitles: (decStreamData.result.captions || []).map(c => ({ url: c.file, lang: c.label || 'Unknown' })), headers: { ...HEADERS, 'Origin': DOMAIN } };
    }));
    const allUrls = [];
    for (const r of results) if (r.status === 'fulfilled') allUrls.push(r.value);
    return allUrls.length ? { allUrls } : null;
}

export async function getSources(args) {
    const meta = await getVidfastMeta(args.id, args.s, args.e);
    return meta?.servers ? meta.servers.map(srv => `VidFast - ${srv.name}`) : [];
}