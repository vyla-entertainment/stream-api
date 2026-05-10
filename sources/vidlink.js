import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const REFERER = 'https://vidlink.pro/';
const ORIGIN = 'https://vidlink.pro';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

export const VERIFY_HEADERS = {
    Referer: REFERER,
    Origin: ORIGIN,
};

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

export async function getStream(id, s, e) {
    await bootWasm();
    const token = globalThis.getAdv(String(id));
    if (!token) throw new Error('getAdv returned null');

    const apiUrl = s
        ? `https://vidlink.pro/api/b/tv/${token}/${s}/${e || 1}?multiLang=0`
        : `https://vidlink.pro/api/b/movie/${token}?multiLang=0`;

    const res = await fetch(apiUrl, {
        headers: { Referer: REFERER, Origin: ORIGIN, 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`vidlink API ${res.status}`);
    const data = await res.json();
    const playlist = data?.stream?.playlist;
    if (!playlist) throw new Error('no playlist in response');

    const playlistUrl = new URL(playlist);
    playlistUrl.searchParams.delete('headers');
    playlistUrl.searchParams.delete('host');
    const cleanPlaylist = playlistUrl.toString();

    return {
        url: cleanPlaylist,
        headers: { Referer: REFERER, Origin: ORIGIN },
    };
}