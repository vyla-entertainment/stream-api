import { fetchJson, USER_AGENT } from '../utils/helpers.js';

const API_BASE = 'https://api.meowtv.ru';
const REFERER = 'https://meowtv.ru/';
const ENC_DEC_API = 'https://enc-dec.app/api/dec-meowtv';

const HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Referer': REFERER,
    'Origin': 'https://meowtv.ru',
    'Accept-Language': 'en-US,en;q=0.9'
};

const SERVERS = [
    'pseudo',
    'lynx',
    'tik',
    'ipcloud',
    'v4:English',
    'turkce',
    'v5:Hindi',
    'v4:Hindi',
    'v6:Hindi'
];

const TIMEOUT_MS = 15000;

export const VERIFY_HEADERS = { 'User-Agent': USER_AGENT, 'Referer': REFERER, 'Origin': 'https://meowtv.ru' };

async function decryptPayload(payload) {
    try {
        const response = await fetchJson(ENC_DEC_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: payload })
        });

        if (response?.status !== 200 || !response?.result) {
            return null;
        }

        return typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
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

        const results = await Promise.all(targets.map(async srv => {
            try {
                return await Promise.race([
                    (async () => {
                        const path = isTv
                            ? `/streams/tv/${id}/${s}/${e}?s=${encodeURIComponent(srv)}`
                            : `/streams/movie/${id}?s=${encodeURIComponent(srv)}`;

                        const payload = await fetchJson(`${API_BASE}${path}`, {
                            headers: HEADERS
                        });

                        if (!payload) return null;

                        const data = await decryptPayload(payload);
                        if (!data) return null;

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
                    })(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout exceeded')), TIMEOUT_MS))
                ]);
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