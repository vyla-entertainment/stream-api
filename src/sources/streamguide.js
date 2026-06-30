import { getTmdbInfo, tmdbToAnilist } from '../utils/helpers.js';

const BASE_URL = 'https://streamguide.cfd';
const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
};

const HONEYPOT_HOSTS = ['nomorflix.icu', 'www.nomorflix.icu'];
const QUALITY_RANK = ['4k', '2160p', '1080p', '720p', '480p', '360p'];

const MOVIE_TV_SOURCES = [
    'Crius', 'Theia', 'Persephone', 'Leto', 'Hemera', 'Helios', 'Selene', 'Apollo',
    'Astraeus', 'Zeus', 'Boreas', 'Hecate', 'Hera', 'Nike', 'Tyche', 'Poseidon',
    'Hades', 'Mnemosyne', 'Cronus', 'Ares', 'Iris', 'Athena', 'Hermes',
];

const ANIME_SOURCES = [
    'Crius', 'Theia', 'Persephone', 'Leto', 'Hemera', 'Helios', 'Selene', 'Apollo',
    'Astraeus', 'Zeus', 'Boreas', 'Hecate', 'Hera', 'Nike', 'Tyche', 'Poseidon',
    'Hades', 'Mnemosyne', 'Cronus', 'Ares', 'Iris', 'Athena', 'Hermes',
];

function isHoneypot(url) {
    if (!url) return true;
    try {
        return HONEYPOT_HOSTS.includes(new URL(url).hostname);
    } catch {
        return true;
    }
}

function extractHls(data) {
    const sources = data?.providers?.flatMap(p => p.sources ?? []) ?? [];
    const hlsSources = sources.filter(s =>
        s.url &&
        !isHoneypot(s.url) &&
        (s.type === 'hls' || s.url.includes('.m3u8') || s.url.includes('/x/') || s.url.includes('/Cffi-stream/'))
    );
    if (!hlsSources.length) return null;
    return hlsSources.sort((a, b) => {
        const ai = QUALITY_RANK.indexOf((a.quality || '').toLowerCase());
        const bi = QUALITY_RANK.indexOf((b.quality || '').toLowerCase());
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })[0].url;
}

async function trySource(url, signal) {
    const res = await fetch(url, { headers: REQUEST_HEADERS, signal });
    if (!res.ok) { res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    const json = await res.json();
    const file = extractHls(json);
    if (!file) throw new Error('no valid hls');
    return file;
}

export async function getStream({ id, s, e }) {
    const ep = e ? parseInt(e, 10) : 1;

    if (s) {
        const info = await getTmdbInfo(id, 'tv', s);
        if (info.isAnime) {
            const anilistId = await tmdbToAnilist(id, 'tv', s, info.titles, info.year);
            if (anilistId) {
                const results = await Promise.allSettled(
                    ANIME_SOURCES.map(src => {
                        const url = `${BASE_URL}/${src}/anime/${anilistId}/${ep}?mal=${anilistId}&verify=false`;
                        return trySource(url, AbortSignal.timeout(10000));
                    })
                );
                const file = results
                    .filter(r => r.status === 'fulfilled')
                    .map(r => r.value)
                    .find(url => !isHoneypot(url));
                if (file) return { url: file, headers: REQUEST_HEADERS };
            }
        }
    }

    const results = await Promise.allSettled(
        MOVIE_TV_SOURCES.map(src => {
            const url = s
                ? `${BASE_URL}/${src}/tv/${id}/${s}/${ep}?verify=false`
                : `${BASE_URL}/${src}/movie/${id}?verify=false`;
            return trySource(url, AbortSignal.timeout(10000));
        })
    );

    const file = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .find(url => !isHoneypot(url));

    if (!file) return null;
    return { url: file, headers: REQUEST_HEADERS };
}