'use strict';

const BASE = 'https://streams.icefy.top';

async function getStream(id, s, e, title) {
    try {
        const url = s && e
            ? `${BASE}/tv/${id}/${s}/${e}`
            : `${BASE}/movie/${id}`;

        const res = await fetch(url, {
            headers: { 'Referer': BASE + '/' }
        });

        if (!res.ok) {
            return null;
        }

        const data = await res.json();

        if (!data?.stream) {
            return null;
        }

        return {
            url: data.stream,
            headers: {
                'Referer': 'https://streams.icefy.top/',
                'Origin': 'https://streams.icefy.top',
            },
        };
    } catch (err) {
        return null;
    }
}

async function getSources(id, s, e, title) {
    const stream = await getStream(id, s, e, title);
    return stream ? [stream.url] : [];
}

async function proxyStream(url, res, { fetchUpstream, rewriteM3u8 }) {
    try {
        const headers = {
            'Referer': 'https://streams.icefy.top/',
            'Origin': 'https://streams.icefy.top',
        };

        const upstream = await fetchUpstream(url, 0, headers);

        if (!upstream) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            return res.end('No upstream');
        }

        const ct = (upstream.headers?.['content-type'] || '').toLowerCase();
        const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(url);

        if (isM3u8) {
            const chunks = [];
            for await (const c of upstream) {
                chunks.push(c);
            }
            const body = Buffer.concat(chunks).toString('utf8');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.end(rewriteM3u8(body, url, '&icefy=1'));
        }

        res.setHeader('Content-Type', ct || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        upstream.pipe(res);
    } catch (err) {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Proxy failed');
        }
    }
}

const VERIFY_HEADERS = {
    'Referer': 'https://streams.icefy.top/',
    'Origin': 'https://streams.icefy.top',
};

export { getStream, getSources, proxyStream, VERIFY_HEADERS };

export const SKIP_VERIFY = false;