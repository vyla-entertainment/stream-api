import { SOURCE_MAP } from '../../config.js';
import { resolveStreamUrl, isRawPlayable } from '../utils/proxy.js';

const UA_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

const getUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

export async function handleTestRoute(match, searchParams, clientIP, host, handleTestSource, googleAnalytic) {
    const source = searchParams.get('source');
    if (!source || !SOURCE_MAP[source]) return { status: 400, body: JSON.stringify({ error: 'Invalid or Missing Source' }) };

    const result = await handleTestSource(
        source,
        match[1],
        searchParams.get('season') || searchParams.get('s') || null,
        searchParams.get('episode') || searchParams.get('e') || null,
        clientIP,
        host
    );

    googleAnalytic('source_test', { source, id: match[1], ok: JSON.parse(result.body).ok });
    return { status: result.status, body: result.body };
}

export async function handleDebugRoute(match, searchParams, absoluteBase, _nativeFetch, verifyPlayable, SOURCE_MODULES) {
    const id = match[1];
    const s = searchParams.get('season') || searchParams.get('s') || null;
    const e = searchParams.get('episode') || searchParams.get('e') || null;
    const sourceKey = searchParams.get('source');

    if (!sourceKey) return { status: 400, body: JSON.stringify({ error: 'missing source' }) };

    const mod = SOURCE_MODULES[sourceKey];
    const cfg = SOURCE_MAP[sourceKey];
    if (!mod) return { status: 400, body: JSON.stringify({ error: `unknown source: ${sourceKey}` }) };

    const t0 = Date.now();
    let streamResult = null, streamError = null;
    const fetchTrace = [];

    const tracingFetch = async (url, opts) => {
        const start = Date.now();
        try {
            const r = await _nativeFetch(url, opts);
            fetchTrace.push({ url: String(url).slice(0, 200), status: r.status, ok: r.ok, ms: Date.now() - start });
            return r;
        } catch (err) {
            fetchTrace.push({ url: String(url).slice(0, 200), error: err.message, ms: Date.now() - start });
            throw err;
        }
    };

    const prev = globalThis.fetch;
    globalThis.fetch = tracingFetch;
    try {
        const audio = /dub$/.test(sourceKey) ? 'dub' : 'sub';
        streamResult = await mod.getStream({ id, s, e, clientIP: null, absoluteBase, audio, config: cfg });
    } catch (err) {
        streamError = err.message;
    } finally {
        globalThis.fetch = prev;
    }

    const candidates = streamResult?.allUrls || (streamResult ? [streamResult] : []);

    const checks = await Promise.all(candidates.slice(0, 3).map(async (raw, i) => {
        const rawUrl = typeof raw === 'object' ? raw.url : raw;
        const rawHeaders = (typeof raw === 'object' && raw.headers) ? raw.headers : {};
        const wrappedUrl = await resolveStreamUrl(typeof raw === 'object' ? raw : { url: raw }, sourceKey, absoluteBase, SOURCE_MAP);
        const isDirect = wrappedUrl === rawUrl;

        let m3u8Preview = null, mp4Preview = null, playable_check = null;
        try {
            const fetchUrl = wrappedUrl || rawUrl;
            const fetchHeaders = isDirect ? { 'User-Agent': getUA(), ...rawHeaders } : { 'User-Agent': getUA() };
            const r = await _nativeFetch(fetchUrl, { signal: AbortSignal.timeout(15_000), headers: { ...fetchHeaders, 'Range': 'bytes=0-511' } });
            const ct = (r.headers.get('content-type') || '').toLowerCase();
            const isMp4 = /\.mp4(\?|$)/i.test(fetchUrl) || ct.includes('video/mp4') || ct.includes('video/mp2t') || ct.includes('octet-stream');
            if (isMp4) {
                const bytes = new Uint8Array(await r.arrayBuffer());
                mp4Preview = Array.from(bytes.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                playable_check = { ok: r.ok || r.status === 206, error: (r.ok || r.status === 206) ? null : `mp4 fetch failed: ${r.status}` };
            } else {
                m3u8Preview = (await r.text()).slice(0, 400);
                playable_check = await verifyPlayable(fetchUrl, fetchHeaders, isDirect);
                if (playable_check.ok && isDirect) {
                    const corsOk = await isRawPlayable(rawUrl, fetchHeaders);
                    if (!corsOk) playable_check = { ok: false, error: 'raw url fails browser CORS check' };
                }
            }
        } catch (err) { playable_check = { ok: false, error: err.message }; }

        return { index: i, raw_url: rawUrl, proxy_url: wrappedUrl, playable_check, m3u8_preview: m3u8Preview, mp4_preview: mp4Preview };
    }));

    return {
        status: 200,
        body: JSON.stringify({
            source: sourceKey, id, candidates: candidates.length, checks,
            elapsed_ms: Date.now() - t0, stream_error: streamError, fetch_trace: fetchTrace,
            got_result: streamResult !== null, result_keys: streamResult ? Object.keys(streamResult) : null,
        }, null, 2)
    };
}