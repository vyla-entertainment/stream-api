import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { SOURCES, SOURCE_MAP, CACHE_TTL } from './config.js';

import { fetchSubtitles, handleSubtitleMovie, handleSubtitleTv, SUBTITLE_BASES } from './routes/subtitles.js';
import { handleDownloadMovie, handleDownloadTv } from './routes/downloads.js';
import { handleHealth } from './routes/health.js';

async function umamiTrack(event, data = {}) {
    try {
        await fetch('https://cloud.umami.is/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                payload: {
                    website: 'fdeaba2a-4820-45ec-9f57-6e0b85758b46',
                    name: event,
                    data,
                    language: 'en-US',
                    title: event,
                    url: `/${event}`,
                    hostname: 'missourimonster-vyla.hf.space',
                    screen: '1920x1080',
                },
                type: 'event',
            }),
            signal: AbortSignal.timeout(3000),
        });
    } catch { }
}

const ALL_SOURCE_MODULES = Object.fromEntries(
    await Promise.all(
        SOURCES.map(async cfg => {
            const mod = await import(`./sources/${cfg.sourceFile}.js`);
            return [cfg.key, mod];
        })
    )
);

const SOURCE_MODULES = Object.fromEntries(
    Object.entries(ALL_SOURCE_MODULES).filter(([key]) => {
        const sourceConfig = SOURCE_MAP[key];
        return sourceConfig && !sourceConfig.disabled;
    })
);

function getAbsoluteBase(host) {
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    return isLocal ? `http://${host}` : `https://${host}`;
}

const UA_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

const getUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

const cache = new Map();

function getCached(key, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.val);
    return fn().then(val => {
        if (val) cache.set(key, { val, ts: Date.now() });
        return val;
    });
}

const jitter = (ms) => new Promise(r => setTimeout(r, Math.random() * ms));

async function withRetry(fn, attempts = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            const result = await fn();
            if (result) return result;
        } catch (err) {
            lastError = err;
            if (i === attempts - 1) throw lastError;
            await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
    }
    if (lastError) throw lastError;
    return null;
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(null), ms))
    ]);
}

async function fetchUpstream(url, redirects = 0, extraHeaders = {}, timeoutMs = 30000) {
    if (redirects > 5) throw new Error('redirect loop');
    const httpsUrl = url.replace('http://', 'https://');
    const res = await fetch(httpsUrl, {
        headers: { 'User-Agent': getUA(), ...extraHeaders },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        res.body?.cancel();
        const location = res.headers.get('location');
        const next = new URL(location, httpsUrl).href.replace('http://', 'https://');
        return fetchUpstream(next, redirects + 1, extraHeaders, timeoutMs);
    }
    return res;
}

function rewriteM3u8(body, url, extraParam = '', absoluteBase = '') {
    const safeBase = absoluteBase.replace('https://localhost', 'http://localhost').replace('https://127.0.0.1', 'http://127.0.0.1');
    const qmark = url.indexOf('?');
    const base = qmark === -1 ? url : url.slice(0, qmark);
    const dir = base.slice(0, base.lastIndexOf('/') + 1);
    const originBase = url.slice(0, url.indexOf('/', url.indexOf('//') + 2));
    return body.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
            return t.replace(/URI="([^"]+)"/g, (match, uri) => {
                const abs = uri.startsWith('http') ? uri : uri.startsWith('/') ? originBase + uri : dir + uri;
                const httpsAbs = abs.replace('http://', 'https://');
                let decoded;
                try { decoded = decodeURIComponent(httpsAbs); } catch { decoded = httpsAbs; }
                const normalized = decoded.startsWith('http') ? decoded : httpsAbs;
                return `URI="${safeBase}/api?url=${encodeURIComponent(normalized)}${extraParam}"`;
            });
        }
        const abs = t.startsWith('http') ? t : t.startsWith('/') ? originBase + t : dir + t;
        const httpsAbs = abs.replace('http://', 'https://');
        let decoded;
        try { decoded = decodeURIComponent(httpsAbs); } catch { decoded = httpsAbs; }
        const normalized = decoded.startsWith('http') ? decoded : httpsAbs;
        return safeBase + '/api?url=' + encodeURIComponent(normalized) + extraParam;
    }).join('\n');
}

function fetchSource(cfg, cacheKey, id, s, e, clientIP = null) {
    const mod = SOURCE_MODULES[cfg.key];

    if (cfg.multiBase) {
        return withTimeout(
            jitter(cfg.jitter).then(async () => {
                for (const base of mod.BASES) {
                    const key = `${cfg.key}-${base}-${cacheKey}`;
                    const result = await getCached(
                        key,
                        () => withRetry(
                            () => mod.getStream(id, s, e, base, clientIP),
                            cfg.retries,
                            500
                        )
                    );
                    if (result) return result;
                }
                return null;
            }),
            cfg.timeout
        );
    }

    return withTimeout(
        jitter(cfg.jitter).then(() =>
            getCached(
                `${cfg.key}-${cacheKey}`,
                () => withRetry(
                    () => mod.getStream(id, s, e, clientIP),
                    cfg.retries,
                    1000
                )
            )
        ),
        cfg.timeout
    ).then(r => r);
}

function wrapUrl(rawUrl, sourceKey, absoluteBase = '') {
    if (!rawUrl) return null;
    const raw = (typeof rawUrl === 'object' ? rawUrl.url : rawUrl);
    const extraHeaders = typeof rawUrl === 'object' && rawUrl.headers ? rawUrl.headers : null;
    const skipProxy = typeof rawUrl === 'object' && rawUrl.skipProxy;
    const cfg = SOURCE_MAP[sourceKey];
    if (!cfg || cfg.skipProxy || skipProxy) return raw;

    const isLocalHost = absoluteBase.includes('localhost') || absoluteBase.includes('127.0.0.1');
    const normalized = isLocalHost ? raw : raw.replace('http://', 'https://');
    const safeBase = isLocalHost ? absoluteBase : absoluteBase.replace('http://', 'https://');

    let wrapped = `${safeBase}/api?url=` + encodeURIComponent(normalized) + '&' + cfg.proxyParam + '=1';
    if (extraHeaders) {
        wrapped += '&proxyHeaders=' + encodeURIComponent(JSON.stringify(extraHeaders));
    }
    return wrapped;
}

function applyCdnHeaders(cleanUrl, extraHeaders, sourceKey) {
    const mod = SOURCE_MODULES[sourceKey];
    if (!mod?.CDN_HEADERS) return;
    for (const rule of mod.CDN_HEADERS) {
        if (rule.pattern.test(cleanUrl)) {
            Object.assign(extraHeaders, rule.headers);
            return;
        }
    }
}

async function verifyStream(rawUrl, sourceKey) {
    const mod = SOURCE_MODULES[sourceKey];
    if (mod.SKIP_VERIFY) return true;
    const headers = { 'User-Agent': getUA(), ...(mod.VERIFY_HEADERS || {}) };
    try {
        const res = await fetch(rawUrl, {
            method: 'HEAD',
            headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(6000),
        });
        res.body?.cancel();
        return res.status < 400;
    } catch { return false; }
}

async function verifyHlsPlayable(proxiedUrl, absoluteBase, extraHeaders = {}) {
    try {
        const m3u8Res = await fetch(proxiedUrl, {
            signal: AbortSignal.timeout(20000),
            headers: { 'User-Agent': getUA(), ...extraHeaders },
        });
        if (!m3u8Res.ok) return { ok: false, error: `m3u8 fetch failed: ${m3u8Res.status}` };
        const text = await m3u8Res.text();
        if (!text.trim().startsWith('#EXTM3U')) return { ok: false, error: 'response is not a valid m3u8' };
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const isMaster = lines.some(l => l.includes('#EXT-X-STREAM-INF'));
        if (isMaster) {
            const variantLine = lines.find(l => !l.startsWith('#'));
            if (!variantLine) return { ok: false, error: 'no variant playlist found in master' };
            const safeBase = absoluteBase.replace('https://localhost', 'http://localhost').replace('https://127.0.0.1', 'http://127.0.0.1');
            const variantUrl = variantLine.startsWith('http') ? variantLine : safeBase + (variantLine.startsWith('/') ? variantLine : '/' + variantLine);
            const variantRes = await fetch(variantUrl, {
                signal: AbortSignal.timeout(20000),
                headers: { 'User-Agent': getUA(), ...extraHeaders },
            });
            if (!variantRes.ok) return { ok: false, error: `variant playlist fetch failed: ${variantRes.status}` };
            const variantText = await variantRes.text();
            if (!variantText.trim().startsWith('#EXTM3U')) return { ok: false, error: 'variant response is not valid m3u8' };
            const vLines = variantText.split('\n').map(l => l.trim()).filter(Boolean);
            const seg = vLines.find(l => !l.startsWith('#'));
            if (!seg) return { ok: false, error: 'no segments in variant playlist' };
            return { ok: true, error: null };
        } else {
            const seg = lines.find(l => !l.startsWith('#'));
            if (!seg) return { ok: false, error: 'no segments in playlist' };
            return { ok: true, error: null };
        }
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function getAllWorkingSources(id, s, e, clientIP = null, absoluteBase = '') {
    const cacheKey = `${id}-${s || ''}-${e || ''}`;
    const fetched = await Promise.all(
        SOURCES.filter(cfg => !cfg.disabled).map(cfg =>
            fetchSource(cfg, cacheKey, id, s, e, clientIP)
                .then(r => ({ raw: r, source: cfg.key }))
                .catch(() => ({ raw: null, source: cfg.key }))
        )
    );
    const candidates = fetched.filter(c => c.raw);
    const verified = await Promise.all(
        candidates.map(async c => {
            const cfg = SOURCE_MAP[c.source];
            const mod = SOURCE_MODULES[c.source];

            if (mod.SKIP_VERIFY && mod.MULTI_URL && c.raw?.allUrls?.length) {
                const results = await Promise.all(c.raw.allUrls.map(async (rawUrl, i) => {
                    const wrapped = wrapUrl(rawUrl, c.source, absoluteBase);
                    if (!wrapped) return null;
                    const hlsCheck = await verifyHlsPlayable(wrapped, absoluteBase);
                    if (!hlsCheck.ok) return null;
                    return {
                        source: c.source,
                        label: `${cfg?.label ?? c.source} ${i + 1}`,
                        url: wrapped,
                    };
                }));
                return results.filter(Boolean);
            }

            if (mod.SKIP_VERIFY) {
                const wrapped = wrapUrl(c.raw, c.source, absoluteBase);
                if (!wrapped) return [null];
                const hlsCheck = await verifyHlsPlayable(wrapped, absoluteBase);
                if (!hlsCheck.ok) return [null];
                return [{
                    source: c.source,
                    label: cfg?.label ?? c.source,
                    url: wrapped,
                }];
            }

            const allUrls = c.raw?.allUrls
                ? c.raw.allUrls.map(u => (typeof u === 'object' ? u : { url: u, headers: {} }))
                : [c.raw];
            for (const candidate of allUrls) {
                const raw = typeof candidate === 'object' ? candidate.url : candidate;
                const ok = await verifyStream(raw, c.source);
                if (ok) {
                    const wrapped = wrapUrl(candidate, c.source, absoluteBase);
                    if (!wrapped) continue;
                    const hlsCheck = await verifyHlsPlayable(wrapped, absoluteBase);
                    if (!hlsCheck.ok) continue;
                    return [{
                        source: c.source,
                        label: cfg?.label ?? c.source,
                        url: wrapped,
                    }];
                }
            }
            return [null];
        })
    );
    return verified.flat().filter(Boolean);
}

async function getMetadata(id, s, e) {
    try {
        const k = process.env.TMDB_API_KEY;
        if (!k || k === 'demo_key_12345ab45d9e64e67088f910f93') {
            return { error: 'TMDB API key not configured', note: 'Set TMDB_API_KEY in .env file' };
        }
        const url = s
            ? `https://api.themoviedb.org/3/tv/${id}/season/${s}/episode/${e || 1}?api_key=${k}`
            : `https://api.themoviedb.org/3/movie/${id}?api_key=${k}`;

        const res = await Promise.race([
            fetch(url),
            new Promise((_, rej) => setTimeout(() => rej(new Error('metadata timeout')), 5000))
        ]);

        if (!res.ok) {
            res.body?.cancel();
            return { error: `TMDB API error: ${res.status}` };
        }
        return await res.json();
    } catch (error) {
        return { error: 'Metadata fetch failed', details: error.message };
    }
}

async function handleTestSource(sourceKey, id, s, e, clientIP = null, host = null) {
    const start = Date.now();
    const cacheKey = `${id}-${s || ''}-${e || ''}`;
    const cfg = SOURCE_MAP[sourceKey];
    const absoluteBase = getAbsoluteBase(host);

    if (cfg.disabled) {
        return {
            status: 200,
            body: JSON.stringify({ source: sourceKey, id, s: s || null, e: e || null, ok: false, url: null, raw_url: null, elapsed_ms: Date.now() - start, error: 'source disabled' }, null, 2),
            contentType: 'application/json',
        };
    }

    let rawResult = null;
    let fetchError = null;
    try {
        rawResult = await fetchSource(cfg, cacheKey, id, s, e, clientIP);
    } catch (err) {
        fetchError = err.message;
    }

    const mod = SOURCE_MODULES[sourceKey];

    let candidates = [];
    if (rawResult) {
        if (mod.MULTI_URL && rawResult?.allUrls?.length) {
            candidates = rawResult.allUrls.map(u => typeof u === 'object' ? u : { url: u });
        } else {
            const raw = typeof rawResult === 'object' ? rawResult.url : rawResult;
            if (raw) candidates = [{ url: raw, headers: rawResult?.headers, skipProxy: rawResult?.skipProxy }];
        }
    }

    let bestRaw = null;
    for (const candidate of candidates) {
        if (mod.SKIP_VERIFY) {
            bestRaw = candidate;
            break;
        }
        const ok = await verifyStream(candidate.url, sourceKey);
        if (ok) {
            bestRaw = candidate;
            break;
        }
    }

    const elapsed = Date.now() - start;
    const wrappedUrl = bestRaw ? wrapUrl(bestRaw, sourceKey, absoluteBase) : null;
    const rawUrl = bestRaw?.url ?? null;

    if (wrappedUrl && !mod.SKIP_VERIFY) {
        const rawHeaders = bestRaw?.headers || {};
        const proxiedBody = await fetch(wrappedUrl, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': getUA() } })
            .then(r => r.text()).then(t => t.slice(0, 200)).catch(e => e.message);
        const [proxiedCheck, rawCheck] = await Promise.all([
            verifyHlsPlayable(wrappedUrl, absoluteBase),
            rawUrl ? verifyHlsPlayable(rawUrl, absoluteBase, rawHeaders) : Promise.resolve({ ok: null, error: 'no raw url' }),
        ]);
        if (!proxiedCheck.ok) {
            return {
                status: 200,
                body: JSON.stringify({
                    source: sourceKey, id, s: s || null, e: e || null,
                    ok: false, url: null, raw_url: rawUrl, elapsed_ms: Date.now() - start,
                    error: proxiedCheck.error,
                    debug: {
                        proxy_failed: true,
                        proxy_error: proxiedCheck.error,
                        proxy_body_preview: proxiedBody,
                        raw_reachable: rawCheck.ok,
                        raw_error: rawCheck.error,
                        raw_headers_used: rawHeaders,
                        proxied_url: wrappedUrl,
                    },
                }, null, 2),
                contentType: 'application/json',
            };
        }
    }

    return {
        status: 200,
        body: JSON.stringify({ source: sourceKey, id, s: s || null, e: e || null, ok: !!wrappedUrl, url: wrappedUrl, raw_url: rawUrl, elapsed_ms: elapsed, error: fetchError }, null, 2),
        contentType: 'application/json',
    };
}

function getIndexBody() {
    const enabledSources = SOURCES.filter(s => !s.disabled);

    const samples = {
        movie: {
            stream: '/api/movie?id=155',
            downloads: '/api/downloads/movie/155',
            subtitles: '/api/subtitles/movie/155',
        },
        tv: {
            stream: '/api/tv?id=1396&season=1&episode=1',
            downloads: '/api/downloads/tv/1396/1/1',
            subtitles: '/api/subtitles/tv/76479/1/1',
        }
    };

    const bySource = Object.fromEntries(
        enabledSources.map(({ key }) => [
            key,
            {
                movie: `/api/test/155?source=${key}`,
                tv: `/api/test/1396?season=1&episode=1&source=${key}`,
            }
        ])
    );

    return JSON.stringify(
        {
            endpoints: {
                movie: '/api/movie?id=<tmdb_id>',
                tv: '/api/tv?id=<tmdb_id>&season=<s>&episode=<e>',
                downloads: {
                    movie: '/api/downloads/movie/<tmdb_id>',
                    tv: '/api/downloads/tv/<tmdb_id>/<season>/<episode>',
                },
                subtitles: {
                    movie: '/api/subtitles/movie/<tmdb_id>',
                    tv: '/api/subtitles/tv/<tmdb_id>/<season>/<episode>',
                },
                health: '/api/health',
            },
            tests: {
                samples,
                bySource
            }
        },
        null,
        2
    );
}

async function handleRequest(req) {
    const baseUrl = `http://${req.headers.host || 'localhost'}`;
    const reqUrl = new URL(req.url, baseUrl);
    const { pathname } = reqUrl;
    const q = Object.fromEntries(reqUrl.searchParams);
    const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Origin, Accept, Access-Control-Request-Method, Access-Control-Request-Headers',
        'Access-Control-Allow-Credentials': 'false',
        'Access-Control-Max-Age': '86400'
    };

    if (req.method === 'OPTIONS') {
        return { status: 204, body: '', headers: corsHeaders };
    }

    if (pathname === '/' || pathname === '') {
        return { status: 200, body: getIndexBody(), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }

    if (pathname === '/api/health') {
        const result = await handleHealth(SOURCE_MODULES, cache, verifyStream);
        const parsed = JSON.parse(result.body);
        umamiTrack('health', { status: parsed.status, cache: parsed.cache });
        return { status: result.status, body: result.body, headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }

    if (pathname === '/api/movie') {
        const { id } = q;
        if (!id) return { status: 400, body: JSON.stringify({ error: 'missing id' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        try {
            const absoluteBase = getAbsoluteBase(reqUrl.host);
            const [sources, meta, subtitles] = await Promise.all([
                getAllWorkingSources(id, null, null, clientIP, absoluteBase),
                getMetadata(id, null, null),
                fetchSubtitles([
                    { base: SUBTITLE_BASES[0], path: `/movie/${id}` },
                    { base: SUBTITLE_BASES[1], path: `/movie/${id}` },
                    { base: SUBTITLE_BASES[2], path: `/movie/tt${id}` }
                ])
            ]);
            umamiTrack('movie', { id, sources: sources.length, found: sources.length > 0 });
            if (!sources.length) return { status: 200, body: JSON.stringify({ sources: [], subtitles: subtitles || [], meta, noSources: true }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
            return { status: 200, body: JSON.stringify({ sources, subtitles: subtitles || [], meta }, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        } catch (e) {
            return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }
    }

    if (pathname === '/api/tv') {
        const { id, season: s, episode: e } = q;
        if (!id || !s || !e) return { status: 400, body: JSON.stringify({ error: 'missing id, season, or episode' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        try {
            const absoluteBase = getAbsoluteBase(reqUrl.host);
            const [sources, meta, subtitles] = await Promise.all([
                getAllWorkingSources(id, s, e, clientIP, absoluteBase),
                getMetadata(id, s, e),
                fetchSubtitles([
                    { base: SUBTITLE_BASES[0], path: `/tv/${id}/${s}/${e}` },
                    { base: SUBTITLE_BASES[1], path: `/tv/${id}/${s}/${e}` },
                    { base: SUBTITLE_BASES[2], path: `/tv/tt${id}/${s}/${e}` }
                ])
            ]);
            umamiTrack('tv', { id, season: s, episode: e, sources: sources.length, found: sources.length > 0 });
            if (!sources.length) return { status: 200, body: JSON.stringify({ sources: [], subtitles: subtitles || [], meta, noSources: true }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
            return { status: 200, body: JSON.stringify({ sources, subtitles: subtitles || [], meta }, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        } catch (e) {
            return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }
    }

    const subtitleMovieMatch = pathname.match(/^\/api\/subtitles\/movie\/([^/]+)$/);
    if (subtitleMovieMatch) {
        umamiTrack('subtitles-movie', { id: subtitleMovieMatch[1] });
        return handleSubtitleMovie(subtitleMovieMatch[1], corsHeaders);
    }

    const subtitleTvMatch = pathname.match(/^\/api\/subtitles\/tv\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (subtitleTvMatch) {
        const [, id, season, episode] = subtitleTvMatch;
        umamiTrack('subtitles-tv', { id, season, episode });
        return handleSubtitleTv(id, season, episode, corsHeaders);
    }

    const debugMatch = pathname.match(/^\/api\/debug\/([^/]+)$/);
    if (debugMatch) {
        const id = debugMatch[1];
        const s = q.season || q.s || null;
        const e = q.episode || q.e || null;
        const sourceKey = q.source || 'vidrock';
        const mod = SOURCE_MODULES[sourceKey];
        if (!mod) return { status: 400, body: JSON.stringify({ error: `unknown source: ${sourceKey}` }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        const absoluteBase = getAbsoluteBase(reqUrl.host);
        const t0 = Date.now();
        try {
            let streamResult = null;
            let streamError = null;
            let fetchTrace = [];

            const originalFetch = globalThis.fetch;
            globalThis.fetch = async (url, opts) => {
                const start = Date.now();
                try {
                    const res = await originalFetch(url, opts);
                    fetchTrace.push({
                        url: typeof url === 'string' ? url.slice(0, 200) : String(url).slice(0, 200),
                        status: res.status,
                        ok: res.ok,
                        ms: Date.now() - start,
                    });
                    return res;
                } catch (err) {
                    fetchTrace.push({
                        url: typeof url === 'string' ? url.slice(0, 200) : String(url).slice(0, 200),
                        error: err.message,
                        ms: Date.now() - start,
                    });
                    throw err;
                }
            };

            try {
                streamResult = await mod.getStream(id, s, e);
            } catch (err) {
                streamError = err.message;
            } finally {
                globalThis.fetch = originalFetch;
            }

            const candidates = streamResult?.allUrls || (streamResult ? [streamResult] : []);
            const checks = await Promise.all(candidates.slice(0, 3).map(async (raw, i) => {
                const wrapped = wrapUrl(raw, sourceKey, absoluteBase);
                let m3u8Preview = null;
                let hlsCheck = null;
                try {
                    const r = await fetch(wrapped, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': getUA() } });
                    const txt = await r.text();
                    m3u8Preview = txt.slice(0, 400);
                    hlsCheck = await verifyHlsPlayable(wrapped, absoluteBase);
                } catch (err) {
                    hlsCheck = { ok: false, error: err.message };
                }
                return { index: i, raw_url: typeof raw === 'object' ? raw.url : raw, proxy_url: wrapped, hls_check: hlsCheck, m3u8_preview: m3u8Preview };
            }));

            return {
                status: 200,
                body: JSON.stringify({
                    source: sourceKey,
                    id,
                    candidates: candidates.length,
                    checks,
                    elapsed_ms: Date.now() - t0,
                    stream_error: streamError,
                    fetch_trace: fetchTrace,
                    got_result: streamResult !== null,
                    result_keys: streamResult ? Object.keys(streamResult) : null,
                }, null, 2),
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            };
        } catch (err) {
            return { status: 200, body: JSON.stringify({ error: err.message, elapsed_ms: Date.now() - t0 }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }
    }

    const testMatch = pathname.match(/^\/api\/test\/([^/]+)$/);
    if (testMatch) {
        const id = testMatch[1];
        const source = q.source;
        const s = q.season || q.s || null;
        const e = q.episode || q.e || null;
        if (!source || !SOURCE_MAP[source]) {
            return { status: 400, body: JSON.stringify({ error: 'invalid or missing source' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }
        const result = await handleTestSource(source, id, s, e, clientIP, reqUrl.host);
        const parsed = JSON.parse(result.body);
        umamiTrack('test', { source, id, s, e, ok: parsed.ok, elapsed_ms: parsed.elapsed_ms });
        return { status: result.status, body: result.body, headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }

    if (pathname === '/api' || pathname === '/api/') {
        if (q.url || q.proxy) {
            try {
                const rawUrl = q.url || q.proxy;
                try { new URL(rawUrl); } catch (e) { throw new Error('invalid url'); }
                if (q.tt) {
                    const upstream = await fetchUpstream(rawUrl);
                    const buf = await upstream.arrayBuffer();
                    const full = new Uint8Array(buf);
                    const stripped = full[0] === 0x89 ? full.slice(120) : full;
                    return { status: 200, body: Buffer.from(stripped), headers: { 'Content-Type': 'video/MP2T', ...corsHeaders, 'Cache-Control': 'public, max-age=3600' } };
                }
                const matchedSource = SOURCES.find(cfg => q[cfg.proxyParam]);
                if (matchedSource) {
                    const mod = SOURCE_MODULES[matchedSource.key];
                    const cfg = SOURCE_MAP[matchedSource.key];
                    let extraHeaders = {};
                    if (q.proxyHeaders) {
                        try { Object.assign(extraHeaders, JSON.parse(decodeURIComponent(q.proxyHeaders))); } catch { }
                    }
                    if (!extraHeaders['User-Agent'] && !extraHeaders['user-agent']) {
                        extraHeaders['User-Agent'] = getUA();
                    }
                    let cleanUrl = rawUrl;
                    try {
                        const qIndex = rawUrl.indexOf('?');
                        if (qIndex !== -1) {
                            const pathPart = rawUrl.slice(0, qIndex);
                            const searchPart = rawUrl.slice(qIndex + 1);
                            const params = new URLSearchParams(searchPart);
                            params.delete('headers');
                            params.delete('host');
                            const remaining = params.toString();
                            cleanUrl = remaining ? `${pathPart}?${remaining}` : pathPart;
                        }
                    } catch { }
                    delete extraHeaders['Host'];
                    delete extraHeaders['host'];
                    applyCdnHeaders(cleanUrl, extraHeaders, matchedSource.key);
                    const upstream = await fetchUpstream(cleanUrl, 0, extraHeaders, 30000);
                    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
                    const looksLikeM3u8 = /\.m3u8?(\?|$)/i.test(cleanUrl) || cleanUrl.includes('/playlist/') || cleanUrl.includes('/streamsvr/') || ct.includes('mpegurl') || ct.includes('m3u8');
                    if (looksLikeM3u8) {
                        const text = await upstream.text();
                        if (text.trim().startsWith('#EXTM3U')) {
                            const absoluteBase = getAbsoluteBase(reqUrl.host);
                            const encodedHeaders = encodeURIComponent(JSON.stringify(extraHeaders));
                            const rewritten = rewriteM3u8(text, cleanUrl, `&${cfg.proxyParam}=1&proxyHeaders=${encodedHeaders}`, absoluteBase);
                            return { status: 200, body: rewritten, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...corsHeaders } };
                        }
                        return { status: 502, body: `expected m3u8 but got: ${text.slice(0, 100)}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                    }
                    const isTikTok = /tiktokcdn\.com|ibyteimg\.com/i.test(cleanUrl);
                    const isMkv = cleanUrl.includes('.mkv') || ct.includes('matroska') || ct.includes('x-matroska');
                    const isPngMasked = ct === 'image/png' || ct === 'image/jpeg' || /\.png(\?|$)/i.test(cleanUrl);
                    if (isTikTok || isPngMasked) {
                        if (!upstream.ok) {
                            return { status: 502, body: `upstream ${upstream.status} for ${cleanUrl.slice(0, 200)}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                        }
                        const buf = await upstream.arrayBuffer();
                        const full = new Uint8Array(buf);
                        const stripped = full[0] === 0x89 || full[0] === 0xFF ? full.slice(120) : full;
                        return { status: 200, body: Buffer.from(stripped), headers: { 'Content-Type': 'video/MP2T', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } };
                    }
                    if (!upstream.ok) {
                        return { status: 502, body: `upstream ${upstream.status} for ${rawUrl.slice(0, 200)}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                    }
                    const finalCt = isMkv ? 'video/mp4' : (ct === 'application/octet-stream' ? 'video/mp4' : (ct || 'video/mp4'));
                    const rangeHeader = req.headers['range'];
                    const streamUpstream = rangeHeader ? await fetch(cleanUrl, {
                        headers: { 'User-Agent': getUA(), ...extraHeaders, 'Range': rangeHeader },
                        redirect: 'follow',
                    }) : upstream;
                    const streamStatus = rangeHeader && streamUpstream.status === 206 ? 206 : 200;
                    const responseHeaders = {
                        'Content-Type': finalCt,
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store',
                    };
                    if (streamUpstream.headers.get('content-length')) responseHeaders['Content-Length'] = streamUpstream.headers.get('content-length');
                    if (streamUpstream.headers.get('content-range')) responseHeaders['Content-Range'] = streamUpstream.headers.get('content-range');
                    return { status: streamStatus, stream: streamUpstream.body, headers: responseHeaders };
                }
                const upstream = await fetchUpstream(rawUrl);
                const ct = (upstream.headers.get('content-type') || '').toLowerCase();
                const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(rawUrl) || rawUrl.includes('/streamsvr/');
                if (isM3u8) {
                    const text = await upstream.text();
                    if (!text.trim().startsWith('#EXTM3U')) {
                        return { status: 502, body: `expected m3u8 but got: ${text.slice(0, 100)}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                    }
                    const absoluteBase = getAbsoluteBase(reqUrl.host);
                    const extraParam = matchedSource
                        ? `&${SOURCE_MAP[matchedSource.key].proxyParam}=1&proxyHeaders=${encodeURIComponent(q.proxyHeaders || '{}')}&tt=1`
                        : (q.proxyHeaders ? `&vn=1&proxyHeaders=${encodeURIComponent(q.proxyHeaders)}&tt=1` : '&vn=1&tt=1');
                    return { status: 200, body: rewriteM3u8(text, rawUrl, extraParam, absoluteBase), headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...corsHeaders } };
                }
                const buf = await upstream.arrayBuffer();
                const full = new Uint8Array(buf);
                const isTikTok = /tiktokcdn\.com|ibyteimg\.com/i.test(rawUrl);
                const stripped = isTikTok && full[0] === 0x89 ? full.slice(120) : full;
                return { status: 200, body: Buffer.from(stripped), headers: { 'Content-Type': ct || 'video/MP2T', ...corsHeaders, 'Cache-Control': 'public, max-age=3600' } };
            } catch (e) {
                return { status: 502, body: e.message, headers: corsHeaders };
            }
        }

        if (q.sources_meta) {
            return { status: 200, body: JSON.stringify({ sources: SOURCES.map(cfg => ({ key: cfg.key, label: cfg.label, timeout: cfg.timeout })) }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }

        if (q.tmdb_movie || q.tmdb_tv || q.tmdb_show || q.tmdb_season) {
            try {
                const k = process.env.TMDB_API_KEY;
                if (!k) return { status: 500, body: JSON.stringify({ error: 'no key' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
                let tmdbUrl;
                if (q.tmdb_season) tmdbUrl = `https://api.themoviedb.org/3/tv/${q.id}/season/${q.s}?api_key=${k}`;
                else if (q.tmdb_movie) {
                    const append = q.append_to_response ? `&append_to_response=${q.append_to_response}` : '';
                    tmdbUrl = `https://api.themoviedb.org/3/movie/${q.id}?api_key=${k}${append}`;
                } else tmdbUrl = `https://api.themoviedb.org/3/tv/${q.id}?api_key=${k}`;
                const r = await fetch(tmdbUrl);
                const d = await r.json();
                return { status: 200, body: JSON.stringify(d), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
            } catch (err) {
                return { status: 500, body: JSON.stringify({ error: err.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
            }
        }

        return { status: 400, body: JSON.stringify({ error: 'missing parameters' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }

    const downloadsMovieMatch = pathname.match(/^\/api\/downloads\/movie\/([^/]+)$/);
    if (downloadsMovieMatch) {
        umamiTrack('downloads-movie', { id: downloadsMovieMatch[1] });
        return handleDownloadMovie(downloadsMovieMatch[1], corsHeaders);
    }

    const downloadsTvMatch = pathname.match(/^\/api\/downloads\/tv\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (downloadsTvMatch) {
        const [, id, season, episode] = downloadsTvMatch;
        umamiTrack('downloads-tv', { id, season, episode });
        return handleDownloadTv(id, season, episode, corsHeaders);
    }

    if (pathname === '/api/sources') {
        const list = SOURCES.filter(cfg => !cfg.disabled).map(cfg => cfg.label);
        return { status: 200, body: JSON.stringify(list, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }

    const proxyDebugMatch = pathname.match(/^\/api\/proxydebug$/);
    if (proxyDebugMatch) {
        const targetUrl = q.url;
        if (!targetUrl) return { status: 400, body: 'missing url', headers: corsHeaders };
        const extraHeaders = q.proxyHeaders ? JSON.parse(decodeURIComponent(q.proxyHeaders)) : {};
        try {
            const r1 = await fetchUpstream(targetUrl, 0, extraHeaders);
            const body1 = await r1.text();
            const lines = body1.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            let segResult = null;
            if (lines.length > 0) {
                const segUrl = lines[0].startsWith('http') ? lines[0] : new URL(lines[0], targetUrl).href;
                try {
                    const r2 = await fetch(segUrl, { method: 'HEAD', headers: extraHeaders, signal: AbortSignal.timeout(5000) });
                    r2.body?.cancel();
                    segResult = { url: segUrl, status: r2.status, headers: Object.fromEntries(r2.headers.entries()) };
                } catch (err) {
                    segResult = { url: segUrl, error: err.message };
                }
            }
            return {
                status: 200,
                body: JSON.stringify({ status: r1.status, content_type: r1.headers.get('content-type'), body_preview: body1.slice(0, 800), first_segment: segResult }, null, 2),
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            };
        } catch (err) {
            return { status: 200, body: JSON.stringify({ error: err.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }
    }

    const segDebugMatch = pathname.match(/^\/api\/segdebug$/);
    if (segDebugMatch) {
        const targetUrl = q.url;
        if (!targetUrl) return { status: 400, body: 'missing url', headers: corsHeaders };
        let extraHeaders = {};
        if (q.proxyHeaders) {
            try { Object.assign(extraHeaders, JSON.parse(decodeURIComponent(q.proxyHeaders))); } catch { }
        }
        delete extraHeaders['Host'];
        delete extraHeaders['host'];
        try {
            const res = await fetch(targetUrl, {
                headers: { 'User-Agent': getUA(), ...extraHeaders },
                redirect: 'manual',
                signal: AbortSignal.timeout(10000),
            });
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf);
            const first32 = Array.from(bytes.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const redirectLocation = res.headers.get('location');
            return {
                status: 200,
                body: JSON.stringify({
                    upstream_status: res.status,
                    upstream_ct: res.headers.get('content-type'),
                    redirect_location: redirectLocation,
                    body_length: bytes.length,
                    first_32_bytes_hex: first32,
                    first_byte: bytes[0],
                    request_headers_sent: extraHeaders,
                }, null, 2),
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            };
        } catch (err) {
            return { status: 200, body: JSON.stringify({ error: err.message, request_headers_sent: extraHeaders }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }
    }

    return { status: 404, body: JSON.stringify({ error: 'not found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
}

const PORT = process.env.PORT || 7860;

const server = http.createServer(async (req, res) => {
    try {
        const result = await handleRequest(req);
        const headers = result.headers || {};
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        res.writeHead(result.status, headers);
        if (result.stream) {
            const { Readable } = await import('stream');
            const readable = Readable.fromWeb(result.stream);
            readable.on('error', () => { try { res.destroy(); } catch { } });
            res.on('error', () => { try { readable.destroy(); } catch { } });
            readable.pipe(res);
        } else {
            res.end(result.body ?? '');
        }
    } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal server error' }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`http://localhost:${PORT}`);
});