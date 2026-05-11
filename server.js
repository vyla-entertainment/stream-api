import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { SOURCES, SOURCE_MAP, CACHE_TTL } from './config.js';

import { fetchSubtitles, handleSubtitleMovie, handleSubtitleTv, SUBTITLE_BASES } from './routes/subtitles.js';
import { handleDownloadMovie, handleDownloadTv } from './routes/downloads.js';
import { handleHealth } from './routes/health.js';

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

const proxyPool = { list: [], fetchedAt: 0 };

async function getProxies() {
    if (proxyPool.list.length && Date.now() - proxyPool.fetchedAt < 10 * 60 * 1000) return proxyPool.list;
    try {
        const res = await fetch('https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc', {
            headers: { 'User-Agent': getUA() }
        });
        const json = await res.json();
        proxyPool.list = (json.data || []).filter(p =>
            p.protocols?.some(pr => pr === 'http' || pr === 'https') &&
            p.upTime >= 80 &&
            p.responseTime < 5000
        ).map(p => ({ ip: p.ip, port: p.port, protocol: p.protocols.find(pr => pr === 'http' || pr === 'https') }));
        proxyPool.fetchedAt = Date.now();
    } catch { }
    return proxyPool.list;
}

function pickProxy(proxies) {
    return proxies[Math.floor(Math.random() * proxies.length)] || null;
}

async function fetchViaProxy(url, proxy, extraHeaders = {}) {
    const { ProxyAgent } = await import('undici');
    const proxyUrl = (proxy.protocol === 'socks4' || proxy.protocol === 'socks5')
        ? null
        : `http://${proxy.ip}:${proxy.port}`;
    if (!proxyUrl) return null;
    const dispatcher = new ProxyAgent(proxyUrl);
    return fetch(url, {
        headers: { 'User-Agent': getUA(), ...extraHeaders },
        redirect: 'manual',
        dispatcher,
    });
}

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

async function fetchUpstream(url, redirects = 0, extraHeaders = {}, _proxyAttempt = false) {
    if (redirects > 5) throw new Error('redirect loop');
    const httpsUrl = url.replace('http://', 'https://');
    const res = await fetch(httpsUrl, {
        headers: { 'User-Agent': getUA(), ...extraHeaders },
        redirect: 'manual',
    });
    if ((res.status === 403 || res.status === 429) && !_proxyAttempt) {
        res.body?.cancel();
        const proxies = await getProxies();
        const proxy = pickProxy(proxies);
        if (proxy) {
            try {
                const pRes = await fetchViaProxy(httpsUrl, proxy, extraHeaders);
                if (pRes.status >= 300 && pRes.status < 400 && pRes.headers.get('location')) {
                    pRes.body?.cancel();
                    const location = pRes.headers.get('location');
                    const next = new URL(location, httpsUrl).href.replace('http://', 'https://');
                    return fetchUpstream(next, redirects + 1, extraHeaders, true);
                }
                return pRes;
            } catch { }
        }
    }
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
    const raw = (typeof rawUrl === 'object' ? rawUrl.url : rawUrl);
    const extraHeaders = typeof rawUrl === 'object' && rawUrl.headers ? rawUrl.headers : null;
    const skipProxy = typeof rawUrl === 'object' && rawUrl.skipProxy;
    const cfg = SOURCE_MAP[sourceKey];
    if (!cfg || cfg.skipProxy || skipProxy) return raw;

    const isLocalHost = absoluteBase.includes('localhost') || absoluteBase.includes('127.0.0.1');
    const processedRaw = isLocalHost ? raw : raw.replace('http://', 'https://');
    const safeBase = isLocalHost ? absoluteBase : absoluteBase.replace('http://', 'https://');

    let wrapped = `${safeBase}/api?url=` + encodeURIComponent(processedRaw) + '&' + cfg.proxyParam + '=1';
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
        const text = await Promise.race([
            res.text(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('text timeout')), 5000))
        ]);
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
            if (raw) candidates = [{ url: raw, headers: rawResult?.headers }];
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
        return { status: result.status, body: result.body, headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }

    if (pathname === '/api/debug/vidnest/decrypt') {
        const id = q.id || '666243';
        const s = q.s || null;
        const e = q.e || null;
        const BASE_URL = 'https://vidnest.fun';
        const API_BASE_URL = 'https://new.vidnest.fun';
        const HEADERS = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL,
        };
        const VIDNEST_ALPHABET = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';
        const VIDNEST_REVERSE_MAP = (() => {
            const map = {};
            for (let i = 0; i < VIDNEST_ALPHABET.length; i++) map[VIDNEST_ALPHABET[i]] = i;
            return map;
        })();
        function decodeVidnestBase64(input) {
            let padded = input;
            const mod = padded.length % 4;
            if (mod !== 0) padded += '='.repeat(4 - mod);
            const bytes = [];
            for (let i = 0; i < padded.length; i += 4) {
                const chunk = padded.slice(i, i + 4);
                const c0 = VIDNEST_REVERSE_MAP[chunk[0]] ?? 64;
                const c1 = VIDNEST_REVERSE_MAP[chunk[1]] ?? 64;
                const c2 = chunk[2] === '=' ? 64 : (VIDNEST_REVERSE_MAP[chunk[2]] ?? 64);
                const c3 = chunk[3] === '=' ? 64 : (VIDNEST_REVERSE_MAP[chunk[3]] ?? 64);
                bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
                if (c2 !== 64) bytes.push((((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff);
                if (c3 !== 64) bytes.push((((c2 & 0x03) << 6) | c3) & 0xff);
            }
            return Buffer.from(bytes).toString('utf8');
        }
        const WORKING_SERVERS = [
            { path: 'moviebox', query: '' },
            { path: 'allmovies', query: '' },
            { path: 'hollymoviehd', query: '' },
            { path: 'vidlink', query: '' },
        ];
        const segment = (s && e) ? `tv/${id}/${s}/${e}` : `movie/${id}`;
        const results = await Promise.all(WORKING_SERVERS.map(async ({ path, query }) => {
            const url = `${API_BASE_URL}/${path}/${segment}${query}`;
            try {
                const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
                const json = await res.json();
                if (!json.data) return { server: path, error: 'no data field' };
                let decrypted;
                try {
                    decrypted = JSON.parse(decodeVidnestBase64(json.data));
                } catch (err) {
                    return { server: path, error: `decrypt failed: ${err.message}`, rawSnippet: json.data.slice(0, 100) };
                }
                return { server: path, decrypted };
            } catch (err) {
                return { server: path, error: err.message };
            }
        }));
        return { status: 200, body: JSON.stringify(results, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }

    if (pathname === '/api/debug/vidnest') {
        const id = q.id || '666243';
        const s = q.s || null;
        const e = q.e || null;
        const BASE_URL = 'https://vidnest.fun';
        const API_BASE_URL = 'https://new.vidnest.fun';
        const HEADERS = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL,
        };
        const SERVERS = [
            { path: 'moviebox', query: '' },
            { path: 'allmovies', query: '' },
            { path: 'klikxxi', query: '' },
            { path: 'onehd', query: '?server=upcloud' },
            { path: 'hollymoviehd', query: '' },
            { path: 'vidlink', query: '' },
            { path: 'purstream', query: '' },
            { path: 'delta', query: '' },
        ];
        const segment = (s && e) ? `tv/${id}/${s}/${e}` : `movie/${id}`;
        const results = await Promise.all(SERVERS.map(async ({ path, query }) => {
            const url = `${API_BASE_URL}/${path}/${segment}${query}`;
            try {
                const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
                const text = await res.text();
                let parsed = null;
                try { parsed = JSON.parse(text); } catch { }
                return { server: path, url, status: res.status, hasData: !!parsed?.data, encrypted: parsed?.encrypted, dataSnippet: parsed?.data?.slice(0, 80) ?? null, rawSnippet: text.slice(0, 200) };
            } catch (err) {
                return { server: path, url, status: null, error: err.message };
            }
        }));
        return { status: 200, body: JSON.stringify(results, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
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
        const result = await handleTestSource(source, id, s, e, clientIP, reqUrl.host);
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

    if (pathname === '/api/sources') {
        const list = SOURCES.filter(cfg => !cfg.disabled).map(cfg => cfg.label);
        return { status: 200, body: JSON.stringify(list, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
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