import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK_BASE = 'https://network.hasta-la-vista.site';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0';

export const SKIP_VERIFY = true;

let wasmExports = null;
let wasmLoading = null;
let timeSynced = false;

async function getWasm() {
    if (wasmExports) return wasmExports;
    if (wasmLoading) return wasmLoading;

    wasmLoading = (async () => {
        const wasmPath = join(__dirname, '../extensions/vidfun.wasm');

        try {
            const wasmBuffer = await readFile(wasmPath);

            const memory = { current: null };

            const imports = {
                js_code: {
                    'kotlin.captureStackTrace': () => Error().stack,

                    'kotlin.wasm.internal.throwJsError': (msg, name, stack) => {
                        const e = new Error();
                        e.message = msg;
                        e.name = name;
                        e.stack = stack;
                        throw e;
                    },

                    'kotlin.wasm.internal.stringLength': s => s.length,
                    'kotlin.wasm.internal.jsExportStringToWasm': (str, start, len, ptr) => {
                        const mem = memory.current?.memory;
                        if (!mem) return;
                        const view = new Uint16Array(mem.buffer, ptr, len);
                        for (let i = 0; i < len; i++) {
                            view[i] = str.charCodeAt(start + i);
                        }
                    },

                    'kotlin.wasm.internal.externrefToString': s => String(s),

                    'kotlin.wasm.internal.importStringFromWasm': (ptr, len, prefix) => {
                        const mem = memory.current?.memory;
                        if (!mem) return '';
                        const view = new Uint16Array(mem.buffer, ptr, len);
                        const s = String.fromCharCode(...view);
                        return prefix == null ? s : prefix + s;
                    },

                    'kotlin.wasm.internal.getJsEmptyString': () => '',

                    'kotlin.wasm.internal.isNullish': v => v == null,

                    'kotlin.wasm.internal.getCachedJsObject_$external_fun': (() => {
                        const cache = new WeakMap();

                        return (obj, id) => {
                            if (
                                (typeof obj !== 'object' &&
                                    typeof obj !== 'function') ||
                                obj == null
                            ) {
                                return id;
                            }

                            const hit = cache.get(obj);

                            if (hit === undefined) {
                                cache.set(obj, id);
                                return id;
                            }

                            return hit;
                        };
                    })(),

                    'kotlin.js.stackPlaceHolder_js_code': () => '',

                    'kotlin.js.message_$external_prop_getter': e => e.message,

                    'kotlin.js.stack_$external_prop_getter': e => e.stack,

                    'kotlin.js.JsError_$external_class_instanceof': e =>
                        e instanceof Error,

                    'kotlin.random.initialSeed': () =>
                        (Math.random() * 2 ** 32) | 0,
                },

                intrinsics: {},
            };

            const { instance } = await WebAssembly.instantiate(
                wasmBuffer,
                imports
            );

            memory.current = instance.exports;

            instance.exports._initialize?.();

            wasmExports = instance.exports;

            return wasmExports;
        } catch (err) {
            wasmLoading = null;
            throw err;
        }
    })();

    return wasmLoading;
}

function randomHex(n) {
    const buf = new Uint8Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

async function syncTime() {
    if (timeSynced) return;
    try {
        const t0 = Date.now();
        const res = await fetch(`${NETWORK_BASE}/time`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(5000),
        });
        const t1 = Date.now();
        if (!res.ok) return;
        const { ts } = await res.json();
        const wasm = await getWasm();
        wasm.tos(String(ts + Math.floor((t1 - t0) / 2)), String(t1));
        timeSynced = true;
    } catch { }
}

async function buildSign(path, paramStr) {
    const wasm = await getWasm();
    const tsn = wasm.tsn(String(Date.now()));
    const rand = randomHex(16);
    const nxr = wasm.nxr(rand);
    const payload = `GET\n${path}\n${paramStr}\n${tsn}\n${nxr}`;
    const sig = wasm.s7k(payload);
    return `${tsn}.${nxr}.${sig}`;
}

async function buildScriptUrl(serverName, type, params) {
    const wasm = await getWasm();
    const path = `/${serverName}/${type}`;
    const sortedRaw = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
    const sign = await buildSign(path, sortedRaw);
    params.set('sign', sign);
    const sortedEnc = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const fullPath = `${path}?${sortedEnc}`;
    const rand = randomHex(16);
    const token = wasm.e9p(rand, fullPath);
    return { url: `${NETWORK_BASE}/${token}/script-4axj2.js`, sign };
}

async function getServers() {
    const res = await fetch(`${NETWORK_BASE}/servers`, {
        headers: { 'User-Agent': UA, 'Origin': 'https://vidfun.xyz', 'Referer': 'https://vidfun.xyz/' },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const { servers } = await res.json();
    return (servers || []).filter(s => s.status === 'ok');
}

async function fetchStream(serverName, type, params) {
    const { url, sign } = await buildScriptUrl(serverName, type, params);
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Origin': 'https://vidfun.xyz', 'Referer': 'https://vidfun.xyz/' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const wasm = await getWasm();
    return JSON.parse(wasm.d4r(text, sign));
}

function extractUrl(data) {
    if (!data) return null;
    const streams = Array.isArray(data.stream) ? data.stream : [];
    for (const s of streams) {
        if (s.type === 'hls' && s.playlist?.startsWith('http')) {
            return {
                url: s.playlist,
                headers: {
                    'Origin': 'https://vidfun.xyz',
                    'Referer': 'https://vidfun.xyz/',
                },
                skipProxy: false,
            };
        }
        if (s.type === 'file' && s.qualities) {
            const sorted = Object.entries(s.qualities).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
            if (sorted.length) return {
                url: sorted[0][1].url,
                headers: {
                    'Origin': 'https://vidfun.xyz',
                    'Referer': 'https://vidfun.xyz/',
                },
                skipProxy: false,
            };
        }
        if (s.playlist?.startsWith('http')) {
            return {
                url: s.playlist,
                headers: {
                    'Origin': 'https://vidfun.xyz',
                    'Referer': 'https://vidfun.xyz/',
                },
                skipProxy: false,
            };
        }
    }
    return null;
}

export async function getStream(id, s, e) {
    try {
        await syncTime();
    } catch (err) {
        return null;
    }
    let servers;
    try {
        servers = await getServers();
    } catch (err) {
        return null;
    }
    if (!servers.length) {
        return null;
    }
    const type = s ? 'series' : 'movie';
    for (const server of servers) {
        try {
            const params = new URLSearchParams({ tmdb: id });
            if (s) { params.set('season', String(s)); params.set('episode', String(e)); }
            const data = await fetchStream(server.name, type, params);
            const result = extractUrl(data);
            if (result) return result;
        } catch (err) { }
    }
    return null;
}