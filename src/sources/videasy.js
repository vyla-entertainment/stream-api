'use strict';

import { getTmdbInfo } from '../utils/source_helpers.js';

const DEC_API = "https://enc-dec.app/api/dec-videasy";
const WINGS_BASE = "https://api.wingsdatabase.com";

const HEADERS = {
    "Accept": "*/*",
    "Origin": "https://player.videasy.to",
    "Referer": "https://player.videasy.to/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
};

const SERVERS = [
    { id: 'jett', name: 'Jett' },
    { id: 'cdn', name: 'Yoru' },
    { id: 'tejo', name: 'Tejo' },
    { id: 'neon2', name: 'Neon' },
    { id: 'ym', name: 'Sage' },
    { id: 'downloader2', name: 'Cypher' },
    { id: 'm4uhd', name: 'Breach' },
    { id: 'hdmovie', name: 'Vyse' },
    { id: 'meine', name: 'Killjoy' },
    { id: 'lamovie', name: 'Omen' },
    { id: 'superflix', name: 'Raze' }
];

async function fetchServerStream(srv, id, isTv, title, year, imdbId, s, e, seed) {
    try {
        if (srv.id === 'cdn' && isTv) return null;

        const encTitle = encodeURIComponent(encodeURIComponent(title));
        const type = isTv ? 'tv' : 'movie';

        let url = `${WINGS_BASE}/${srv.id}/sources-with-title?title=${encTitle}&mediaType=${type}&year=${year}&tmdbId=${id}&imdbId=${imdbId}&enc=2&seed=${seed}`;
        if (isTv) {
            url += `&episodeId=${e}&seasonId=${s}`;
        }

        const encDataRes = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
        if (!encDataRes.ok) return null;
        const encText = await encDataRes.text();

        const decRes = await fetch(DEC_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: encText, id: id, seed: seed }),
            signal: AbortSignal.timeout(10000)
        });

        if (!decRes.ok) return null;
        const decJson = await decRes.json();
        if (decJson.status !== 200 || !decJson.result) return null;

        const rawResults = Array.isArray(decJson.result) ? decJson.result : [decJson.result];

        return rawResults.map(res => {
            const streamUrl = res.url || res.file || res.link || res.playlist || res.stream;
            if (!streamUrl) return null;

            return {
                url: streamUrl,
                quality: res.quality || "Auto",
                server: `VidEasy - ${srv.name}`,
                type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
                headers: HEADERS,
                skipProxy: false,
                skipVerify: true,
                skipHlsCheck: true
            };
        }).filter(Boolean);
    } catch (err) {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    try {
        const isTv = s != null && e != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        if (!info || !info.titles || !info.titles.length) return null;

        const seedRes = await fetch(`${WINGS_BASE}/seed?mediaId=${id}`, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
        if (!seedRes.ok) return null;
        const { seed } = await seedRes.json();

        const title = info.titles[0];
        const year = info.year;
        const imdbId = info.imdbId || "tt0000000";

        let targetServers = SERVERS;
        if (serverName && serverName !== 'all') {
            const cleanName = serverName.replace('VidEasy - ', '');
            targetServers = SERVERS.filter(sv => sv.name === cleanName);
            if (targetServers.length === 0) targetServers = SERVERS;
        }

        const settled = await Promise.allSettled(
            targetServers.map(srv => fetchServerStream(srv, id, isTv, title, year, imdbId, s, e, seed))
        );

        const allUrls = settled
            .filter(r => r.status === 'fulfilled' && r.value)
            .flatMap(r => r.value);

        if (allUrls.length === 0) return null;

        return { allUrls };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    return SERVERS.map(s => `VidEasy - ${s.name}`);
}