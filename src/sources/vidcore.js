import { fetchJson, fetchText, USER_AGENT } from '../utils/helpers.js';

const API_BASE = 'https://enc-dec.app/api';
const HEADERS = { 'User-Agent': USER_AGENT, 'Referer': 'https://vidcore.net/', 'X-Requested-With': 'XMLHttpRequest' };

async function getDynamicServers(id, s, e) {
    try {
        const html = await fetchText(s != null && e != null ? `https://vidcore.net/tv/${id}/${s}/${e}/` : `https://vidcore.net/movie/${id}/`, { headers: HEADERS });

        const match = html.match(/\\"token\\":\\"(.*?)\\"/) || html.match(/"token":"(.*?)"/);
        if (!match?.[1]) return null;

        const encData = await fetchJson(`${API_BASE}/enc-vidcore?text=${encodeURIComponent(match[1])}`);
        if (!encData?.result) return null;
        const { servers: serversUrl, stream: streamUrl, token } = encData.result;
        const reqHeaders = { ...HEADERS, 'X-CSRF-Token': token };
        const serversEncrypted = await fetchText(serversUrl, { method: 'POST', headers: reqHeaders });
        const decData = await fetchJson(`${API_BASE}/dec-vidcore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: serversEncrypted }) });
        return decData?.result ? { servers: decData.result, streamUrl, reqHeaders } : null;
    } catch { return null; }
}

export async function getStream({ id, s, e }) {
    const data = await getDynamicServers(id, s, e);
    if (!data?.servers?.length) return null;
    for (const srv of data.servers) {
        try {
            const streamEncrypted = await fetchText(`${data.streamUrl}/${srv.data}`, { method: 'POST', headers: data.reqHeaders });
            const decData = await fetchJson(`${API_BASE}/dec-vidcore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: streamEncrypted }) });
            const url = decData?.result?.url;
            if (url) {
                const r = await fetch(url, { headers: { ...HEADERS, 'Range': 'bytes=0-511' }, signal: AbortSignal.timeout(5000) });
                if (r.ok || r.status === 206) return { url, subtitles: (decData.result.captions || []).map(c => ({ url: c.file, lang: c.label || 'Unknown' })), headers: { ...HEADERS, 'Origin': 'https://vidcore.net' }, server: srv.name };
            }
        } catch { }
    }
    return null;
}

export async function getSources(args) {
    const data = await getDynamicServers(args.id, args.s, args.e);
    return data?.servers ? data.servers.map(s => s.name) : [];
}