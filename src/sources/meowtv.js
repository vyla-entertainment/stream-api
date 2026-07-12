import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchJson, USER_AGENT } from '../utils/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = 'https://api.meowtv.ru';
const REFERER = 'https://meowtv.ru';
const HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Referer': REFERER,
    'Origin': REFERER,
    'Accept-Language': 'en-US,en;q=0.9'
};
const SERVERS = ['v6:Hindi', 'lynx', 'pseudo', 'tik', 'ipcloud'];

export const VERIFY_HEADERS = { 'User-Agent': USER_AGENT, 'Referer': REFERER, 'Origin': REFERER };

async function solveAltcha(challenge, salt, maxNumber) {
    const max = maxNumber || 1000000;
    for (let i = 0; i <= max; i++) {
        if (i > 0 && i % 50000 === 0) await new Promise(r => setTimeout(r, 0));
        if (crypto.createHash('sha256').update(salt + i).digest('hex') === challenge) return i;
    }
    return null;
}

let wasmInstance = null;
async function getDeobfuscator() {
    if (wasmInstance) return wasmInstance;
    try {
        const wasmPath = join(__dirname, '../extensions/meowtv.wasm');
        const wasmBuf = await readFile(wasmPath);
        let exports, mem;
        const pins = new Map();

        const readStr = (ptr) => {
            if (!ptr) return null;
            const end = ptr + new Uint32Array(mem.buffer)[(ptr - 4) >>> 2] >>> 1;
            const u16 = new Uint16Array(mem.buffer);
            let p = ptr >>> 1, str = "";
            while (end - p > 1024) str += String.fromCharCode(...u16.subarray(p, p += 1024));
            return str + String.fromCharCode(...u16.subarray(p, end));
        };

        const writeStr = (str) => {
            if (str == null) return 0;
            const len = str.length;
            const ptr = exports.__new(len << 1, 2) >>> 0;
            const u16 = new Uint16Array(mem.buffer);
            const offset = ptr >>> 1;
            for (let i = 0; i < len; ++i) u16[offset + i] = str.charCodeAt(i);
            return ptr;
        };

        const { instance } = await WebAssembly.instantiate(wasmBuf, { env: { abort() { throw new Error("WASM Abort"); } } });
        exports = instance.exports;
        mem = exports.memory;

        wasmInstance = (n, d) => {
            const p1 = writeStr(n) || exports.__pin(exports.__new(0, 2));
            const p2 = writeStr(d) || exports.__pin(exports.__new(0, 2));
            const c = pins.get(p1);
            c ? pins.set(p1, c + 1) : pins.set(exports.__pin(p1), 1);
            try {
                return readStr(exports.deobfuscate(p1, p2) >>> 0);
            } finally {
                const cnt = pins.get(p1);
                if (cnt === 1) { exports.__unpin(p1); pins.delete(p1); }
                else if (cnt) pins.set(p1, cnt - 1);
            }
        };
        return wasmInstance;
    } catch (e) {
        return null;
    }
}

async function getTicket() {
    try {
        const challenge = await fetchJson(`${API_BASE}/altcha/challenge`, { headers: HEADERS });
        if (!challenge) return null;

        const number = await solveAltcha(challenge.challenge, challenge.salt, challenge.maxnumber);
        if (number === null) return null;

        const altcha = Buffer.from(JSON.stringify({
            algorithm: challenge.algorithm,
            challenge: challenge.challenge,
            number,
            salt: challenge.salt,
            signature: challenge.signature
        })).toString('base64');

        const data = await fetchJson(`${API_BASE}/streams/ticket`, {
            method: 'POST',
            headers: { ...HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ altcha })
        });
        return data?.ticket || null;
    } catch (e) {
        return null;
    }
}

export async function getStream({ id, s, e, server }) {
    try {
        const isTv = !!s;
        let targets = SERVERS;
        if (server && server !== 'all') {
            const cleanName = server.replace('MeowTV - ', '');
            targets = SERVERS.includes(cleanName) ? [cleanName] : [targets[0]];
        }

        const deobfuscate = await getDeobfuscator();
        if (!deobfuscate) return null;

        const results = await Promise.all(targets.map(async srv => {
            try {
                const ticket = await getTicket();
                if (!ticket) return null;

                const path = isTv
                    ? `/streams/tv/${id}/${s}/${e}?s=${encodeURIComponent(srv)}`
                    : `/streams/movie/${id}?s=${encodeURIComponent(srv)}`;

                const payload = await fetchJson(`${API_BASE}${path}`, {
                    headers: { ...HEADERS, 'x-stream-ticket': ticket }
                });

                if (!payload?.n || !payload?.d) {
                    return null;
                }

                const resultJson = deobfuscate(payload.n, payload.d);
                const data = JSON.parse(resultJson);

                const urls = [];
                if (data?.url?.startsWith('http')) {
                    urls.push({
                        url: data.url,
                        server: `MeowTV - ${srv}`,
                    });
                }
                if (Array.isArray(data?.streams)) {
                    for (const stream of data.streams) {
                        if (stream?.url?.startsWith('http')) {
                            urls.push({
                                url: stream.url,
                                server: `MeowTV - ${srv} (${stream.language || 'Unknown'})`,
                            });
                        }
                    }
                }
                return urls;
            } catch (err) {
                return null;
            }
        }));

        const allUrls = results.filter(Boolean).flat();
        return allUrls.length ? { allUrls } : null;
    } catch (e) {
        return null;
    }
}

export async function getSources() {
    return SERVERS.map(s => `MeowTV - ${s}`);
}