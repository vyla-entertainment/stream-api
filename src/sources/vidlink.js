import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const ORIGIN = 'https://vidlink.pro';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

export const VERIFY_HEADERS = {
    Referer: `${ORIGIN}/`,
    Origin: ORIGIN,
};

export const CDN_HEADERS = [
    {
        pattern: /vodvidl\.site|vidldl\.site|vidldr\.site/i,
        headers: {
            'Referer': 'https://vidlink.pro/',
            'Origin': 'https://vidlink.pro',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'sec-fetch-dest': 'video',
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-site': 'cross-site',
        },
    },
];

export const SKIP_VERIFY = true;

let bootPromise = null;

function bootWasm() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
        globalThis.window = globalThis;
        globalThis.self = globalThis;
        globalThis.document = { createElement: () => ({}), body: { appendChild: () => { } } };

        const sodium = require('libsodium-wrappers');
        await sodium.ready;
        globalThis.sodium = sodium;

        const scriptSrc = readFileSync(join(__dirname, '..', 'extensions', 'script.js'), 'utf8');
        eval(scriptSrc);

        const go = new Dm();
        const wasmBuf = readFileSync(join(__dirname, '..', 'extensions', 'fu.wasm'));
        const { instance } = await WebAssembly.instantiate(wasmBuf, go.importObject);
        go.run(instance);

        await new Promise(r => setTimeout(r, 500));
        if (typeof globalThis.getAdv !== 'function') throw new Error('getAdv not found after WASM boot');
    })();
    return bootPromise;
}

function http1Fetch(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
                'User-Agent': UA,
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                ...extraHeaders,
            },
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, headers: res.headers, buf });
            });
            res.on('error', e => reject(e));
        });
        req.on('error', e => reject(e));
        req.end();
    });
}

async function decompressResponse(buf, encoding) {
    const { createGunzip, createInflate } = await import('zlib');
    const { pipeline } = await import('stream/promises');
    const { Readable, PassThrough } = await import('stream');

    if (!encoding || encoding.trim() === '') return buf.toString('utf8');

    const output = new PassThrough();
    const chunks = [];
    output.on('data', c => chunks.push(c));

    const input = Readable.from(buf);
    let decomp;
    if (encoding === 'gzip') decomp = createGunzip();
    else if (encoding === 'deflate') decomp = createInflate();
    else return buf.toString('utf8');

    try {
        await pipeline(input, decomp, output);
    } catch {
        return buf.toString('utf8');
    }

    return Buffer.concat(chunks).toString('utf8');
}

export async function getStream(id, s, e) {
    await bootWasm();

    const token = globalThis.getAdv(String(id));
    if (!token) throw new Error('getAdv returned null');

    const apiUrl = s
        ? `${ORIGIN}/api/b/tv/${token}/${s}/${e || 1}?multiLang=0`
        : `${ORIGIN}/api/b/movie/${token}?multiLang=0`;

    const pageReferer = s ? `${ORIGIN}/tv/${id}` : `${ORIGIN}/movie/${id}`;

    const { status, ok, headers, buf } = await http1Fetch(apiUrl, {
        'Referer': pageReferer,
        'Origin': ORIGIN,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
    });

    if (!ok) throw new Error(`vidlink API ${status}`);

    const text = await decompressResponse(buf, headers['content-encoding'] || '');
    if (!text || text.trim() === '') throw new Error('vidlink API returned empty body');

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`vidlink JSON parse failed. Body preview: ${text.slice(0, 300)}`);
    }

    const playlist = data?.stream?.playlist;
    const qualities = data?.stream?.qualities;

    if (playlist) {
        const playlistUrl = new URL(playlist);
        playlistUrl.searchParams.delete('headers');
        return {
            url: playlistUrl.toString(),
            headers: {
                'Referer': `${ORIGIN}/`,
                'Origin': ORIGIN,
            },
        };
    }

    if (qualities) {
        const preferred = ['1080', '720', '480', '360'];
        let picked = null;
        for (const q of preferred) {
            if (qualities[q]?.url) { picked = qualities[q].url; break; }
        }
        if (!picked) {
            const first = Object.values(qualities).find(v => v?.url);
            if (first) picked = first.url;
        }

        if (picked) {
            const u = new URL(picked);
            const embeddedHeaders = u.searchParams.get('headers');

            let cdnReferer = 'https://filmboom.top/';
            let cdnOrigin = 'https://filmboom.top';
            if (embeddedHeaders) {
                try {
                    const parsed = JSON.parse(embeddedHeaders);
                    if (parsed.referer) cdnReferer = parsed.referer;
                    if (parsed.origin) cdnOrigin = parsed.origin;
                } catch { }
            }

            return {
                url: u.toString(),
                headers: {
                    'Referer': `${ORIGIN}/`,
                    'Origin': ORIGIN,
                },
            };
        }
    }

    throw new Error(`no playlist or qualities in response. Keys: ${Object.keys(data || {}).join(', ')}`);
}