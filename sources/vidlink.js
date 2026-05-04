import { Dm } from './script.js';
import wasmModule from './fu.wasm';
import nacl from 'tweetnacl';

const REFERER = 'https://vidlink.pro/';
const ORIGIN = 'https://vidlink.pro';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

let bootPromise = null;

async function bootWasm() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
        try {
            globalThis.sodium = {
                crypto_secretbox_easy: (msg, nonce, key) => nacl.secretbox(msg, nonce, key),
                crypto_secretbox_NONCEBYTES: 24,
                crypto_secretbox_KEYBYTES: 32,
                crypto_secretbox_MACBYTES: 16,
                randombytes_buf: (n) => crypto.getRandomValues(new Uint8Array(n)),
                from_string: (s) => new TextEncoder().encode(s),
                to_string: (b) => new TextDecoder().decode(b),
                from_hex: (h) => new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16))),
                to_hex: (b) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''),
            };

            const go = new Dm();
            const instance = await WebAssembly.instantiate(wasmModule, go.importObject);
            go.run(instance).catch(() => { });
            await new Promise(r => setTimeout(r, 1000));
            if (typeof globalThis.getAdv !== 'function') throw new Error('getAdv not found');
        } catch (err) {
            bootPromise = null;
            throw err;
        }
    })();
    return bootPromise;
}

export async function getStream(id, season, episode) {
    await bootWasm();
    const token = globalThis.getAdv(String(id));
    if (!token) throw new Error('getAdv returned null');

    const apiUrl = season
        ? `https://vidlink.pro/api/b/tv/${token}/${season}/${episode || 1}?multiLang=0`
        : `https://vidlink.pro/api/b/movie/${token}?multiLang=0`;

    const res = await fetch(apiUrl, { headers: { Referer: REFERER, Origin: ORIGIN, 'User-Agent': UA } });
    if (!res.ok) throw new Error(`vidlink API ${res.status}`);
    const data = await res.json();
    const playlist = data?.stream?.playlist;
    if (!playlist) throw new Error('no playlist in response');
    return playlist;
}

export const VERIFY_HEADERS = { Referer: REFERER, Origin: ORIGIN, 'User-Agent': UA };