import http from 'http';
import { SOURCES, SOURCE_MAP, HEALTH_PROBE_ID, CACHE_TTL } from './config.js';

import * as vidzee from './sources/vidzee.js';
import * as vidnest from './sources/vidnest.js';
import * as vidsrc from './sources/vidsrc.js';
import * as vidrock from './sources/vidrock.js';
import * as cinesu from './sources/cinesu.js';
import * as vixsrc from './sources/vixsrc.js';
import * as vidlink from './sources/vidlink.js';
import * as _02movie from './sources/02movie.js';
import * as meowtv from './sources/meowtv.js';
import * as vaplayer from './sources/vaplayer.js';
import * as icefy from './sources/icefy.js';
import * as videasy from './sources/videasy.js';


import { fetchSubtitles, handleSubtitleMovie, handleSubtitleTv, SUBTITLE_BASES } from './routes/subtitles.js';
import { handleDownloadMovie, handleDownloadTv } from './routes/downloads.js';

const ALL_SOURCE_MODULES = { vidzee, vidnest, vidsrc, vidrock, cinesu, vixsrc, vidlink, '02movie': _02movie, meowtv, vaplayer, icefy, videasy };

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

async function fetchUpstream(url, redirects = 0, extraHeaders = {}) {
    if (redirects > 5) throw new Error('redirect loop');
    const httpsUrl = url.replace('http://', 'https://');
    const res = await fetch(httpsUrl, {
        headers: { 'User-Agent': getUA(), ...extraHeaders },
        redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        res.body?.cancel();
        const location = res.headers.get('location');
        const next = new URL(location, httpsUrl).href.replace('http://', 'https://');
        return fetchUpstream(next, redirects + 1, extraHeaders);
    }
    return res;
}

function rewriteM3u8(body, url, extraParam = '', absoluteBase = '') {
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
                return `URI="${absoluteBase}/api?url=${encodeURIComponent(httpsAbs)}${extraParam}"`;
            });
        }
        const abs = t.startsWith('http') ? t : t.startsWith('/') ? originBase + t : dir + t;
        const httpsAbs = abs.replace('http://', 'https://');
        return (absoluteBase || '') + '/api?url=' + encodeURIComponent(httpsAbs) + extraParam;
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
    );
}

function wrapUrl(rawUrl, sourceKey, absoluteBase = '') {
    if (!rawUrl) return null;
    const raw = (typeof rawUrl === 'object' ? rawUrl.url : rawUrl).replace('http://', 'https://');
    const extraHeaders = typeof rawUrl === 'object' && rawUrl.headers ? rawUrl.headers : null;
    const skipProxy = typeof rawUrl === 'object' && rawUrl.skipProxy;
    const cfg = SOURCE_MAP[sourceKey];
    if (!cfg || cfg.skipProxy || skipProxy) return raw;
    const safeBase = absoluteBase.replace('http://', 'https://');
    let wrapped = `${safeBase}/api?url=` + encodeURIComponent(raw) + '&' + cfg.proxyParam + '=1';
    if (extraHeaders) {
        wrapped += '&proxyHeaders=' + encodeURIComponent(JSON.stringify(extraHeaders));
    }
    return wrapped;
}

async function verifyStream(rawUrl, sourceKey) {
    const mod = SOURCE_MODULES[sourceKey];
    if (mod.SKIP_VERIFY) return true;
    const headers = { 'User-Agent': getUA(), ...(mod.VERIFY_HEADERS || {}) };
    try {
        const res = await Promise.race([
            fetchUpstream(rawUrl, 0, headers),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
        if (res.status >= 400) { res.body?.cancel(); return false; }
        const text = await res.text();
        return text.trim().startsWith('#EXTM3U');
    } catch { return false; }
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
                return c.raw.allUrls.map((rawUrl, i) => ({
                    source: c.source,
                    label: `${cfg?.label ?? c.source} ${i + 1}`,
                    url: wrapUrl(rawUrl, c.source, absoluteBase),
                }));
            }

            if (mod.SKIP_VERIFY) {
                return [{
                    source: c.source,
                    label: cfg?.label ?? c.source,
                    url: wrapUrl(c.raw, c.source, absoluteBase),
                }];
            }

            const allUrls = c.raw?.allUrls
                ? c.raw.allUrls.map(u => ({ url: u, headers: c.raw.headers }))
                : [c.raw];
            for (const candidate of allUrls) {
                const raw = typeof candidate === 'object' ? candidate.url : candidate;
                const ok = await verifyStream(raw, c.source);
                if (ok) {
                    return [{
                        source: c.source,
                        label: cfg?.label ?? c.source,
                        url: wrapUrl(candidate, c.source, absoluteBase),
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
        if (!k) return null;
        const url = s
            ? `https://api.themoviedb.org/3/tv/${id}/season/${s}/episode/${e || 1}?api_key=${k}`
            : `https://api.themoviedb.org/3/movie/${id}?api_key=${k}`;
        const res = await fetch(url);
        if (!res.ok) {
            res.body?.cancel();
            return null;
        }
        return await res.json();
    } catch {
        return null;
    }
}

async function handleHealth() {
    const results = await Promise.allSettled(
        SOURCES.filter(cfg => !cfg.disabled).map(cfg => (async () => {
            const t = Date.now();
            const mod = SOURCE_MODULES[cfg.key];
            let url = null;
            if (cfg.multiBase) {
                for (const base of mod.BASES) {
                    url = await withTimeout(withRetry(() => mod.getStream(HEALTH_PROBE_ID, null, null, base), 2, 500), cfg.timeout).catch(() => null);
                    if (url) break;
                }
            } else {
                url = await withTimeout(withRetry(() => mod.getStream(HEALTH_PROBE_ID, null, null), cfg.retries, 1000), cfg.timeout).catch(() => null);
            }
            return { ok: !!url, ms: Date.now() - t };
        })())
    );

    function unwrap(r) {
        return r.status === 'fulfilled' ? r.value : { ok: false, ms: null, error: r.reason?.message };
    }

    const enabledSources = SOURCES.filter(cfg => !cfg.disabled);
    const byKey = Object.fromEntries(enabledSources.map((cfg, i) => [cfg.key, unwrap(results[i])]));
    const allOk = Object.values(byKey).every(v => v.ok);

    return {
        status: allOk ? 200 : 207,
        body: JSON.stringify({
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            tmdb: !!process.env.TMDB_API_KEY,
            cache: cache.size,
            probe_id: HEALTH_PROBE_ID,
            sources: byKey,
        }, null, 2),
        contentType: 'application/json',
    };
}

async function handleTestSource(sourceKey, id, s, e, clientIP = null) {
    const start = Date.now();
    const cacheKey = `${id}-${s || ''}-${e || ''}`;
    const cfg = SOURCE_MAP[sourceKey];

    if (cfg.disabled) {
        return {
            status: 200,
            body: JSON.stringify({ source: sourceKey, id, s: s || null, e: e || null, ok: false, url: null, raw_url: null, elapsed_ms: Date.now() - start, error: 'source disabled' }, null, 2),
            contentType: 'application/json',
        };
    }

    let rawUrl = null;
    let fetchError = null;
    try {
        rawUrl = await fetchSource(cfg, cacheKey, id, s, e, clientIP);
    } catch (err) {
        console.error(err);
        fetchError = err.message;
    }

    const elapsed = Date.now() - start;
    const raw = rawUrl ? (typeof rawUrl === 'object' ? rawUrl.url : rawUrl) : null;

    return {
        status: 200,
        body: JSON.stringify({ source: sourceKey, id, s: s || null, e: e || null, ok: !!raw, url: wrapUrl(raw, sourceKey), raw_url: raw, elapsed_ms: elapsed, error: fetchError }, null, 2),
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
        const result = await handleHealth();
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
            if (!sources.length) return { status: 502, body: JSON.stringify({ error: 'no working sources found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
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
            if (!sources.length) return { status: 502, body: JSON.stringify({ error: 'no working sources found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
            return { status: 200, body: JSON.stringify({ sources, subtitles: subtitles || [], meta }, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        } catch (e) {
            return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        }
    }

    const subtitleMovieMatch = pathname.match(/^\/api\/subtitles\/movie\/([^/]+)$/);
    if (subtitleMovieMatch) return handleSubtitleMovie(subtitleMovieMatch[1], corsHeaders);

    const subtitleTvMatch = pathname.match(/^\/api\/subtitles\/tv\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (subtitleTvMatch) {
        const [, id, season, episode] = subtitleTvMatch;
        return handleSubtitleTv(id, season, episode, corsHeaders);
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
        const result = await handleTestSource(source, id, s, e, clientIP);
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
                    let extraHeaders = { ...(mod.VERIFY_HEADERS || {}) };
                    if (q.proxyHeaders) {
                        try { Object.assign(extraHeaders, JSON.parse(decodeURIComponent(q.proxyHeaders))); } catch { }
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
                    if (/workers\.dev/i.test(cleanUrl)) {
                        delete extraHeaders['Referer'];
                        delete extraHeaders['Origin'];
                        extraHeaders['Accept'] = '*/*';
                        extraHeaders['Accept-Language'] = 'en-US,en;q=0.9';
                        extraHeaders['Accept-Encoding'] = 'gzip, deflate, br';
                        extraHeaders['sec-fetch-dest'] = 'empty';
                        extraHeaders['sec-fetch-mode'] = 'cors';
                        extraHeaders['sec-fetch-site'] = 'cross-site';
                    }
                    const looksLikeM3u8 = /\.m3u8?(\?|$)/i.test(cleanUrl) || cleanUrl.includes('/playlist/');
                    if (looksLikeM3u8) {
                        const upstream = await fetchUpstream(cleanUrl, 0, extraHeaders);
                        const text = await upstream.text();
                        if (text.trim().startsWith('#EXTM3U')) {
                            const absoluteBase = getAbsoluteBase(reqUrl.host);
                            const encodedHeaders = encodeURIComponent(JSON.stringify(extraHeaders));
                            const rewritten = rewriteM3u8(text, cleanUrl, `&${cfg.proxyParam}=1&proxyHeaders=${encodedHeaders}`, absoluteBase);
                            return { status: 200, body: rewritten, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...corsHeaders } };
                        }
                        const ct2 = (upstream.headers.get('content-type') || 'application/octet-stream').toLowerCase();
                        return { status: 200, body: text, headers: { 'Content-Type': ct2, ...corsHeaders } };
                    }
                    const upstream = await fetch(cleanUrl, {
                        headers: { 'User-Agent': getUA(), ...extraHeaders },
                        redirect: 'follow',
                    });
                    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
                    if (!upstream.ok) {
                        const errBody = await upstream.text().catch(() => '');
                        return { status: 502, body: `upstream ${upstream.status} for ${rawUrl.slice(0, 200)}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                    }
                    if (ct.includes('mpegurl') || ct.includes('m3u8')) {
                        const text = await upstream.text();
                        const rewritten = rewriteM3u8(text, cleanUrl, `&${cfg.proxyParam}=1`, `https://${reqUrl.host}`);
                        return { status: 200, body: rewritten, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...corsHeaders } };
                    }
                    const buf = await upstream.arrayBuffer();
                    const full = new Uint8Array(buf);
                    const isTikTok = /tiktokcdn\.com|ibyteimg\.com/i.test(cleanUrl);
                    const stripped = isTikTok && full[0] === 0x89 ? full.slice(120) : full;
                    return { status: 200, body: Buffer.from(stripped), headers: { 'Content-Type': ct || 'video/MP2T', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } };
                }
                const upstream = await fetchUpstream(rawUrl);
                const ct = (upstream.headers.get('content-type') || '').toLowerCase();
                const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(rawUrl);
                if (isM3u8) {
                    const text = await upstream.text();
                    return { status: 200, body: rewriteM3u8(text, rawUrl), headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...corsHeaders } };
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
    if (downloadsMovieMatch) return handleDownloadMovie(downloadsMovieMatch[1], corsHeaders);

    const downloadsTvMatch = pathname.match(/^\/api\/downloads\/tv\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (downloadsTvMatch) {
        const [, id, season, episode] = downloadsTvMatch;
        return handleDownloadTv(id, season, episode, corsHeaders);
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
            Readable.fromWeb(result.stream).pipe(res);
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