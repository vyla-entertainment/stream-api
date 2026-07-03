'use strict';

import { getTmdbInfo } from "../utils/helpers.js";

const PLATFORM_MAP = {
    netflix: { ott: "nf" },
    primevideo: { ott: "pv" },
    hotstar: { ott: "hs" },
    disney: { ott: "hs" },
};

const NEW_TV_BASE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Requested-With": "NetmirrorNewTV v1.0",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0",
    "Accept": "application/json, text/plain, */*",
};

const NEW_TV_DOMAINS = [
    "aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==",
    "aHR0cHM6Ly9tb2JpbGVkZXRlY3QuYXBw",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==",
];

function safeAtob(encoded) {
    return Buffer.from(encoded, "base64").toString("binary");
}

let resolvedApiUrl = "";

async function resolveApiUrl() {
    if (resolvedApiUrl) return resolvedApiUrl;
    for (const encoded of NEW_TV_DOMAINS) {
        const base = safeAtob(encoded).replace(/\/$/, "");
        try {
            const response = await fetch(`${base}/checknewtv.php`, {
                headers: { ...NEW_TV_BASE_HEADERS, "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(5000),
            });
            const data = await response.json();
            if (data.token_hash) {
                resolvedApiUrl = safeAtob(data.token_hash).replace(/\/$/, "");
                return resolvedApiUrl;
            }
        } catch (e) { }
    }
    return null;
}

async function fetchEpisodesPage(contentId, seasonId, page, seasonNumber, ott, apiBase) {
    const episodes = [];
    let pg = page;
    while (true) {
        const url = `${apiBase}/newtv/episodes.php?id=${seasonId}&page=${pg}`;
        const resp = await fetch(url, {
            headers: { ...NEW_TV_BASE_HEADERS, Ott: ott },
            signal: AbortSignal.timeout(10000),
        });
        const data = await resp.json();
        if (data.episodes) {
            data.episodes.filter(e => e !== null).forEach(ep => {
                const epNum = ep.ep ? parseInt(ep.ep) : ep.epNum ? parseInt(ep.epNum.replace("E", "")) : null;
                episodes.push({ id: ep.id, s: seasonNumber, ep: epNum });
            });
        }
        if (data.nextPageShow !== 1) break;
        pg++;
    }
    return episodes;
}

async function fetchFromPlatform(platformKey, title, isTv, season, episode) {
    const platform = PLATFORM_MAP[platformKey];
    const apiBase = await resolveApiUrl();
    if (!apiBase) return null;

    const searchUrl = `${apiBase}/newtv/search.php?s=${encodeURIComponent(title)}`;
    const searchResp = await fetch(searchUrl, {
        headers: { ...NEW_TV_BASE_HEADERS, Ott: platform.ott },
        signal: AbortSignal.timeout(10000),
    });
    const searchData = await searchResp.json();
    if (!searchData.searchResult?.length) return null;

    const contentId = searchData.searchResult[0].id;
    const postUrl = `${apiBase}/newtv/post.php?id=${contentId}`;
    const postResp = await fetch(postUrl, {
        headers: { ...NEW_TV_BASE_HEADERS, Ott: platform.ott },
        signal: AbortSignal.timeout(10000),
    });
    const postData = await postResp.json();

    let targetId = contentId;
    if (isTv) {
        const episodes = [];
        const selectedSeasonIdx = postData.season ? postData.season.findIndex(s => s.selected === true) : -1;
        const selectedSeasonId = selectedSeasonIdx >= 0 ? postData.season[selectedSeasonIdx].id : postData.nextPageSeason;

        if (postData.episodes) {
            postData.episodes.filter(e => e !== null).forEach(ep => {
                const epNum = ep.ep ? parseInt(ep.ep) : ep.epNum ? parseInt(ep.epNum.replace("E", "")) : null;
                episodes.push({ id: ep.id, s: (selectedSeasonIdx + 1), ep: epNum });
            });
        }

        const targetEp = episodes.find(ep => ep.s == season && ep.ep == episode);
        if (!targetEp) {
            if (postData.season) {
                for (let i = 0; i < postData.season.length; i++) {
                    if (i + 1 == season) {
                        const more = await fetchEpisodesPage(contentId, postData.season[i].id, 1, i + 1, platform.ott, apiBase);
                        const found = more.find(ep => ep.ep == episode);
                        if (found) { targetId = found.id; break; }
                    }
                }
            }
        } else {
            targetId = targetEp.id;
        }
        if (targetId === contentId) return null;
    }

    const playerUrl = `${apiBase}/newtv/player.php?id=${targetId}`;
    const playerResp = await fetch(playerUrl, {
        headers: { ...NEW_TV_BASE_HEADERS, Ott: platform.ott },
        signal: AbortSignal.timeout(10000),
    });
    const response = await playerResp.json();

    if (response.status === "ok" && response.video_link) {
        return {
            server: `NetMirror (${platformKey})`,
            url: response.video_link,
            headers: { "Referer": response.referer || apiBase },
        };
    }
    return null;
}

export async function getStream(args) {
    const { id, s, e, server: serverParam } = args;
    try {
        const isTv = s != null && e != null;
        const tmdbInfo = await getTmdbInfo(id, isTv ? "tv" : "movie");
        if (!tmdbInfo?.titles?.length) return null;

        const title = tmdbInfo.titles[0];
        const ALL_PLATFORMS = ["netflix", "primevideo", "hotstar", "disney"];

        let platforms = ALL_PLATFORMS;
        if (serverParam && serverParam !== 'all') {
            const match = serverParam.match(/NetMirror\s*\(([^)]+)\)/i);
            if (match && ALL_PLATFORMS.includes(match[1].toLowerCase())) {
                platforms = [match[1].toLowerCase()];
            }
        }

        const settled = await Promise.allSettled(platforms.map(p => fetchFromPlatform(p, title, isTv, s, e)));
        const allUrls = settled.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);

        return allUrls.length ? { allUrls } : null;
    } catch (error) {
        return null;
    }
}

export async function getSources(args) {
    return ["netflix", "primevideo", "hotstar", "disney"].map(p => `NetMirror (${p})`);
}