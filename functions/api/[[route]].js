import { SOURCES, SOURCE_MAP, ALLOWED_ORIGINS, HEALTH_PROBE_ID, CACHE_TTL } from '../../config.js';
import * as vidzee from '../../sources/vidzee.js';
import * as vidnest from '../../sources/vidnest.js';
import * as vidsrc from '../../sources/vidsrc.js';
import * as vidrock from '../../sources/vidrock.js';
import * as videasy from '../../sources/videasy.js';
import * as cinesu from '../../sources/cinesu.js';

const SOURCE_MODULES = { vidzee, vidnest, vidsrc, vidrock, videasy, cinesu };

const SUBTITLE_BASE = 'https://sub.vdrk.site/v1';

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
    for (let i = 0; i < attempts; i++) {
        try {
            const result = await fn();
            if (result) return result;
        } catch {
            if (i === attempts - 1) return null;
            await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
    }
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
    const res = await fetch(url, {
        headers: { 'User-Agent': getUA(), ...extraHeaders },
        redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), url).href;
        return fetchUpstream(next, redirects + 1, extraHeaders);
    }
    return res;
}

function rewriteM3u8(body, url, extraParam = '', absoluteBase = '') {
    const base = url.split('?')[0];
    const dir = base.slice(0, base.lastIndexOf('/') + 1);
    const origin = new URL(url).origin;
    return body.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
            return t.replace(/URI="([^"]+)"/g, (match, uri) => {
                const abs = uri.startsWith('http') ? uri : uri.startsWith('/') ? origin + uri : dir + uri;
                if (abs.includes('tiktokcdn.com')) return `URI="${abs}"`;
                return `URI="${absoluteBase}/api?url=${encodeURIComponent(abs)}${extraParam}"`;
            });
        }
        const abs = t.startsWith('http') ? t : t.startsWith('/') ? origin + t : dir + t;
        if (abs.includes('tiktokcdn.com') || abs.includes('p16-sg') || abs.includes('p19-sg')) return (absoluteBase || '') + '/api?url=' + encodeURIComponent(abs) + '&tt=1';
        return (absoluteBase || '') + '/api?url=' + encodeURIComponent(abs) + extraParam;
    }).join('\n');
}

function fetchSource(cfg, cacheKey, id, s, e) {
    const mod = SOURCE_MODULES[cfg.key];
    if (cfg.multiBase) {
        return withTimeout(
            jitter(cfg.jitter).then(async () => {
                for (const base of mod.BASES) {
                    const key = `${cfg.key}-${base}-${cacheKey}`;
                    const result = await getCached(key, () => withRetry(() => mod.getStream(id, s, e, base), cfg.retries, 500)).catch(() => null);
                    if (result) return result;
                }
                return null;
            }),
            cfg.timeout
        );
    }
    return withTimeout(
        jitter(cfg.jitter).then(() =>
            getCached(`${cfg.key}-${cacheKey}`, () => withRetry(() => mod.getStream(id, s, e), cfg.retries, 1000)).catch(() => null)
        ),
        cfg.timeout
    );
}

function wrapUrl(rawUrl, sourceKey) {
    if (!rawUrl) return null;
    const raw = typeof rawUrl === 'object' ? rawUrl.url : rawUrl;
    const cfg = SOURCE_MAP[sourceKey];
    if (!cfg || cfg.skipProxy) return raw;
    return '/api?url=' + encodeURIComponent(raw) + '&' + cfg.proxyParam + '=1';
}

async function verifyStream(rawUrl, sourceKey) {
    const mod = SOURCE_MODULES[sourceKey];
    if (!mod.VERIFY_HEADERS) return true;
    try {
        const res = await Promise.race([
            fetchUpstream(rawUrl, 0, { 'User-Agent': getUA(), ...mod.VERIFY_HEADERS }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
        if (res.status >= 400) return false;
        const text = await res.text();
        return text.trim().startsWith('#EXTM3U');
    } catch {
        return false;
    }
}

async function getAllWorkingSources(id, s, e) {
    const cacheKey = `${id}-${s || ''}-${e || ''}`;
    const fetched = await Promise.all(
        SOURCES.map(cfg =>
            fetchSource(cfg, cacheKey, id, s, e).then(r => ({ raw: r, source: cfg.key })).catch(() => ({ raw: null, source: cfg.key }))
        )
    );
    const candidates = fetched.filter(c => c.raw);
    const verified = await Promise.all(
        candidates.map(async c => {
            const raw = typeof c.raw === 'object' ? c.raw.url : c.raw;
            const ok = await verifyStream(raw, c.source);
            if (!ok) return null;
            const cfg = SOURCE_MAP[c.source];
            return {
                source: c.source,
                label: cfg?.label ?? c.source,
                url: wrapUrl(c.raw, c.source),
            };
        })
    );
    return verified.filter(Boolean);
}

async function getMetadata(id, s, e, env) {
    try {
        const k = env.TMDB_API_KEY;
        if (!k) return null;
        const url = s
            ? `https://api.themoviedb.org/3/tv/${id}/season/${s}/episode/${e || 1}?api_key=${k}`
            : `https://api.themoviedb.org/3/movie/${id}?api_key=${k}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchSubtitles(subtitleUrl) {
    try {
        const res = await fetch(subtitleUrl, { headers: { 'User-Agent': getUA() } });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function handleHealth(env) {
    const results = await Promise.allSettled(
        SOURCES.map(cfg => (async () => {
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

    const byKey = Object.fromEntries(SOURCES.map((cfg, i) => [cfg.key, unwrap(results[i])]));
    const allOk = Object.values(byKey).every(v => v.ok);

    return new Response(JSON.stringify({
        status: allOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        tmdb: !!env.TMDB_API_KEY,
        cache: cache.size,
        probe_id: HEALTH_PROBE_ID,
        sources: byKey,
    }, null, 2), {
        status: allOk ? 200 : 207,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
}

async function handleTestSource(sourceKey, id, s, e) {
    const start = Date.now();
    const cacheKey = `${id}-${s || ''}-${e || ''}`;
    const cfg = SOURCE_MAP[sourceKey];
    let rawUrl = null;
    let error = null;
    try {
        rawUrl = await fetchSource(cfg, cacheKey, id, s, e);
    } catch (err) {
        error = err.message;
    }
    const elapsed = Date.now() - start;
    const raw = rawUrl ? (typeof rawUrl === 'object' ? rawUrl.url : rawUrl) : null;
    return new Response(JSON.stringify({
        source: sourceKey,
        id,
        s: s || null,
        e: e || null,
        ok: !!raw,
        url: wrapUrl(raw, sourceKey),
        raw_url: raw,
        elapsed_ms: elapsed,
        error: error || (raw ? null : 'no stream returned'),
    }, null, 2), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}

export async function onRequest({ request, env }) {
    const origin = request.headers.get('origin') || '';
    const corsHeaders = ALLOWED_ORIGINS.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
        : { 'Access-Control-Allow-Origin': '*' };
    corsHeaders['Content-Security-Policy'] = `frame-ancestors 'self' ${ALLOWED_ORIGINS.join(' ')}`;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    const reqUrl = new URL(request.url);
    const { pathname, searchParams } = reqUrl;
    const q = Object.fromEntries(searchParams);

    if (pathname === '/api/health') {
        return handleHealth(env);
    }

    if (pathname === '/api/movie') {
        const { id } = q;
        if (!id) return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        try {
            const [sources, meta, subtitles] = await Promise.all([
                getAllWorkingSources(id, null, null),
                getMetadata(id, null, null, env),
                fetchSubtitles(`${SUBTITLE_BASE}/movie/${id}`),
            ]);
            if (!sources.length) return new Response(JSON.stringify({ error: 'no working sources found' }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            return new Response(JSON.stringify({ sources, subtitles: subtitles || [], meta }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }

    if (pathname === '/api/tv') {
        const { id, season: s, episode: e } = q;
        if (!id || !s || !e) return new Response(JSON.stringify({ error: 'missing id, season, or episode' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        try {
            const [sources, meta, subtitles] = await Promise.all([
                getAllWorkingSources(id, s, e),
                getMetadata(id, s, e, env),
                fetchSubtitles(`${SUBTITLE_BASE}/tv/${id}/${s}/${e}`),
            ]);
            if (!sources.length) return new Response(JSON.stringify({ error: 'no working sources found' }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            return new Response(JSON.stringify({ sources, subtitles: subtitles || [], meta }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }

    const subtitleMovieMatch = pathname.match(/^\/api\/subtitles\/movie\/([^/]+)$/);
    if (subtitleMovieMatch) {
        const id = subtitleMovieMatch[1];
        try {
            const subtitles = await fetchSubtitles(`${SUBTITLE_BASE}/movie/${id}`);
            if (!subtitles) return new Response(JSON.stringify({ error: 'no subtitles found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            return new Response(JSON.stringify(subtitles, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }

    const subtitleTvMatch = pathname.match(/^\/api\/subtitles\/tv\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (subtitleTvMatch) {
        const [, id, season, episode] = subtitleTvMatch;
        try {
            const subtitles = await fetchSubtitles(`${SUBTITLE_BASE}/tv/${id}/${season}/${episode}`);
            if (!subtitles) return new Response(JSON.stringify({ error: 'no subtitles found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            return new Response(JSON.stringify(subtitles, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }

    const testMatch = pathname.match(/^\/api\/test\/([^/]+)$/);
    if (testMatch) {
        const id = testMatch[1];
        const source = q.source;
        const s = q.season || q.s || null;
        const e = q.episode || q.e || null;
        if (!source || !SOURCE_MAP[source]) {
            return new Response(JSON.stringify({ error: 'invalid or missing source' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
        return handleTestSource(source, id, s, e);
    }

    if (pathname === '/api' || pathname === '/api/') {
        if (q.url || q.proxy) {
            try {
                const rawUrl = decodeURIComponent(q.url || q.proxy);
                if (q.tt) {
                    const upstream = await fetchUpstream(rawUrl);
                    const buf = await upstream.arrayBuffer();
                    const full = new Uint8Array(buf);
                    const stripped = full[0] === 0x89 ? full.slice(120) : full;
                    return new Response(stripped, { headers: { 'Content-Type': 'video/MP2T', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } });
                }
                const matchedSource = SOURCES.find(cfg => q[cfg.proxyParam]);
                if (matchedSource) {
                    const mod = SOURCE_MODULES[matchedSource.key];
                    const cfg = SOURCE_MAP[matchedSource.key];
                    const extraHeaders = mod.VERIFY_HEADERS || {};
                    const looksLikeM3u8 = /\.m3u8?(\?|$)/i.test(rawUrl) || rawUrl.includes('/playlist/');
                    if (looksLikeM3u8) {
                        const upstream = await fetchUpstream(rawUrl, 0, extraHeaders);
                        const text = await upstream.text();
                        if (text.trim().startsWith('#EXTM3U')) {
                            const rewritten = rewriteM3u8(text, rawUrl, `&${cfg.proxyParam}=1`, reqUrl.origin);
                            return new Response(rewritten, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*' } });
                        }
                        const ct2 = (upstream.headers.get('content-type') || 'application/octet-stream').toLowerCase();
                        return new Response(text, { headers: { 'Content-Type': ct2, 'Access-Control-Allow-Origin': '*' } });
                    }

                    const upstream = await fetch(rawUrl, {
                        headers: { 'User-Agent': getUA(), ...extraHeaders },
                        redirect: 'follow',
                    });
                    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
                    if (ct.includes('mpegurl') || ct.includes('m3u8')) {
                        const text = await upstream.text();
                        const rewritten = rewriteM3u8(text, rawUrl, `&${cfg.proxyParam}=1`, reqUrl.origin);
                        return new Response(rewritten, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*' } });
                    }
                    return new Response(upstream.body, { headers: { 'Content-Type': ct || 'video/MP2T', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } });
                }
                const upstream = await fetchUpstream(rawUrl);
                const ct = (upstream.headers.get('content-type') || '').toLowerCase();
                const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(rawUrl);
                if (isM3u8) {
                    const text = await upstream.text();
                    return new Response(rewriteM3u8(text, rawUrl), { headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*' } });
                }
                return new Response(upstream.body, { headers: { 'Content-Type': ct || 'video/MP2T', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } });
            } catch (e) {
                return new Response(e.message, { status: 502, headers: corsHeaders });
            }
        }

        if (q.sources_meta) {
            return new Response(JSON.stringify({ sources: SOURCES.map(cfg => ({ key: cfg.key, label: cfg.label, timeout: cfg.timeout })) }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        if (q.tmdb_movie || q.tmdb_tv || q.tmdb_show || q.tmdb_season) {
            try {
                const k = env.TMDB_API_KEY;
                if (!k) return new Response(JSON.stringify({ error: 'no key' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                let tmdbUrl;
                if (q.tmdb_season) tmdbUrl = `https://api.themoviedb.org/3/tv/${q.id}/season/${q.s}?api_key=${k}`;
                else if (q.tmdb_movie) {
                    const append = q.append_to_response ? `&append_to_response=${q.append_to_response}` : '';
                    tmdbUrl = `https://api.themoviedb.org/3/movie/${q.id}?api_key=${k}${append}`;
                } else tmdbUrl = `https://api.themoviedb.org/3/tv/${q.id}?api_key=${k}`;
                const r = await fetch(tmdbUrl);
                const d = await r.json();
                return new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        return new Response(JSON.stringify({ error: 'missing parameters' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}