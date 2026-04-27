const PROVIDERS = {
    vidlink: {
        API: "https://jonathangalindo-vyla-player.hf.space/api/?id=",
        PROXY_API: "https://jonathangalindo-vyla-player.hf.space/api/?url=",
    },

    moviedownloader: {
        BASE: "https://02moviedownloader.site",
        VERIFY: "/api/verify-robot",
    },

    vixsrc: {
        BASE: "https://vixsrc.to",
    },

    vidsrc: {
        BASE: "https://vsembed.ru/",
    },

    uembed: {
        UEMBED: "https://uembed.xyz/api/video/tmdb",
        VXR: "https://cdn.madplay.site/vxr",
        HOLLY: "https://api.madplay.site/api/movies/holly",
        ROGFLIX: "https://api.madplay.site/api/rogflix",
        BASE: "https://madplay.site",
    },

    vidrock: {
        BASE: "https://vidrock.net/",
        SUB_BASE: "https://sub.vdrk.site",
        PROXY_PREFIX: "https://proxy.vidrock.store/",
    },

    rgshows: {
        BASE: "https://api.rgshows.ru/main",
        FRONTEND: "https://www.rgshows.ru",
    },

    vidzee: {
        BASE: "https://core.vidzee.wtf",
        PLAYER: "https://player.vidzee.wtf",
    },

    embed02: {
        BASE: "https://02pcembed.site",
    },

    streammafia: {
        BASE: "https://embedmafia.in",
        EMBED: "https://nhd.streammafia.to",
    },

    icefy: {
        BASE: "https://streams.icefy.top",
    },
};

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36";

const THIRD_PARTY_PROXY_PATTERNS = {
    "https://hls1.vid1.site": [/\/proxy\/(.+)$/],
    "https://madplay.site": [/\/api\/[^/]+\/proxy\?url=(.+)$/],
    "https://hlsproxy3.asiaflix.net": [/\/m3u8-proxy\?url=(.+?)(?:&|$)/],
    "https://streams.smashystream.top": [/\/proxy\/m3u8\/(.+?)\/[^/]+$/],
    "*": [
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/|https?%3A%2F%2F).+)$/,
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/)?[^/]+\/file2\/.+)$/,
        /^https:\/\/.+?\.workers\.dev\/((?:https?:\/\/).+)$/,
        /\/proxy\/(.+)$/,
        /\/m3u8-proxy\?url=(.+?)(?:&|$)/,
        /\/api\/[^/]+\/proxy\?url=(.+)$/,
        /\/proxy\?.*url=([^&]+)/,
        /\/stream\/proxy\/(.+)$/,
        /^https:\/\/[^/]+\/((?:https?:\/\/)?[a-zA-Z0-9.-]+\/file2\/.+)$/,
    ],
};

function unwrapThirdPartyProxy(url) {
    try {
        const origin = new URL(url).origin;
        const patternsToTry = [
            ...(THIRD_PARTY_PROXY_PATTERNS[origin] ?? []),
            ...THIRD_PARTY_PROXY_PATTERNS["*"],
        ];

        for (const pattern of patternsToTry) {
            const match = url.match(pattern);
            if (match?.[1]) {
                let decoded = match[1];

                for (let i = 0; i < 3; i++) {
                    try {
                        const next = decodeURIComponent(decoded);
                        if (next === decoded) break;
                        decoded = next;
                    } catch {
                        break;
                    }
                }

                if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
                    return decoded;
                }
                if (decoded.includes("://")) {
                    return decoded;
                }
                return "https://" + decoded;
            }
        }
    } catch { }
    return url;
}

const ENGLISH_LANG_CODES = new Set([
    "eng",
    "en",
    "en-us",
    "en-gb",
    "english",
]);

function isEnglishAudio(audioTracks) {
    if (!audioTracks?.length) return true;

    return audioTracks.some((t) =>
        ENGLISH_LANG_CODES.has((t.language ?? t.lang ?? "").toLowerCase())
    );
}

function filterEnglishSubtitles(subtitles) {
    if (!subtitles?.length) return [];
    return subtitles.filter((s) => {
        const label = (s.label ?? "").toLowerCase();
        const lang = (s.language ?? s.lang ?? "").toLowerCase();
        return (
            label.includes("english") ||
            label.includes("en") ||
            ENGLISH_LANG_CODES.has(lang) ||
            label === "unknown"
        );
    });
}

const QUALITY_PRIORITY = {
    "4k": 9,
    "2160p": 9,
    "1440p": 8,
    "1080p": 7,
    "720p": 6,
    "480p": 5,
    "360p": 4,
    "240p": 3,
    hd: 2,
    auto: 1,
    unknown: 0,
};

function qualityRank(q) {
    return QUALITY_PRIORITY[(q ?? "").toLowerCase()] ?? 0;
}

function sortSources(sources) {
    return [...sources].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
}

async function safeFetch(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

async function fetchMovieDownloaderToken(media) {
    const { BASE, VERIFY } = PROVIDERS.moviedownloader;
    const referer =
        BASE +
        "/api/download" +
        (media.type === "movie"
            ? "/movie/" + media.tmdbId
            : "/tv/" + media.tmdbId + (media.season ?? 1) + (media.episode ?? 1));

    try {
        const res = await safeFetch(BASE + VERIFY, {
            method: "POST",
            headers: {
                "User-Agent": UA,
                accept: "*/*",
                "accept-language": "en-US,en;q=0.7",
                "cache-control": "no-cache",
                origin: BASE,
                referer,
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
            },
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.token ?? null;
    } catch {
        return null;
    }
}

async function fetchMovieDownloader(media) {
    const { BASE } = PROVIDERS.moviedownloader;
    const sources = [];
    const subtitles = [];

    const token = await fetchMovieDownloaderToken(media);
    if (!token) return { sources, subtitles };

    const apiUrl =
        media.type === "movie"
            ? `${BASE}/api/download/movie/${media.tmdbId}`
            : `${BASE}/api/download/tv/${media.tmdbId}/${media.season}/${media.episode}`;

    const referer =
        BASE +
        "/api/download" +
        (media.type === "movie"
            ? "/movie/" + media.tmdbId
            : "/tv/" + media.tmdbId + (media.season ?? 1) + (media.episode ?? 1));

    try {
        const res = await safeFetch(apiUrl, {
            headers: {
                "User-Agent": UA,
                accept: "application/json",
                "accept-language": "en-US,en;q=0.1",
                "cache-control": "no-cache",
                "x-session-token": token,
                origin: BASE,
                referer,
            },
        });
        if (!res.ok) return { sources, subtitles };
        const data = await res.json();

        for (const dl of data?.data?.downloadData?.data?.downloads ?? []) {
            if (!dl.url) continue;
            const realUrl = unwrapThirdPartyProxy(dl.url);
            sources.push({
                url: realUrl,
                type: "mp4",
                quality: dl.resolution ? dl.resolution + "p" : "unknown",
                provider: "02MovieDownloader",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: dl.url.includes("hakunaymatata")
                    ? { Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc/" }
                    : { "User-Agent": UA },
            });
        }

        for (const stream of data?.externalStreams ?? []) {
            if (!stream.url) continue;
            if (stream.url.includes("111477.xyz")) continue;

            const realUrl = unwrapThirdPartyProxy(stream.url);
            const qMatch = stream.quality?.match(/(\d+)p/);
            sources.push({
                url: realUrl,
                type: stream.url.includes(".mkv") ? "mkv" : "mp4",
                quality: qMatch ? qMatch[1] + "p" : stream.quality ?? "unknown",
                provider: "02MovieDownloader",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: stream.url.includes("pixeldra") ? {} : { "User-Agent": UA },
            });
        }

        for (const cap of data?.data?.downloadData?.data?.captions ?? []) {
            if (!cap.url) continue;
            const label = (cap.lanName || cap.lan || "").toLowerCase();
            if (label && !label.includes("en")) continue;
            subtitles.push({
                url: cap.url,
                label: cap.lanName || cap.lan,
                format: cap.url.includes(".srt") ? "srt" : "vtt",
            });
        }
    } catch {

    }

    return { sources: sources.filter((s) => isEnglishAudio(s.audioTracks)), subtitles };
}

async function fetchVixSrc(media) {
    const { BASE } = PROVIDERS.vixsrc;
    const sources = [];
    const subtitles = [];

    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: BASE,
        Origin: BASE,
    };

    try {
        const apiUrl =
            media.type === "movie"
                ? `${BASE}/api/movie/${media.tmdbId}`
                : `${BASE}/api/tv/${media.tmdbId}/${media.season}/${media.episode}`;

        const apiRes = await safeFetch(apiUrl, { headers });
        if (!apiRes.ok) return { sources, subtitles };
        const apiData = await apiRes.json();

        if (!apiData?.src) return { sources, subtitles };

        const embedRes = await safeFetch(BASE + apiData.src, { headers });
        if (!embedRes.ok) return { sources, subtitles };
        const html = await embedRes.text();

        const token = html.match(/token[\"']\s*:\s*[\"']([^\"']+)/)?.[1];
        const expires = html.match(/expires[\"']\s*:\s*[\"']([^\"']+)/)?.[1];
        const playlist = html.match(/url\s*:\s*[\"']([^\"']+)/)?.[1];

        if (!token || !expires || !playlist) return { sources, subtitles };
        if (parseInt(expires, 10) * 1000 - 60000 < Date.now()) return { sources, subtitles };

        const sep = playlist.includes("?") ? "&" : "?";
        const masterUrl = `${playlist}${sep}token=${token}&expires=${expires}&h=1`;

        const plRes = await safeFetch(masterUrl, {
            headers: { ...headers, Referer: apiUrl },
        });
        if (!plRes.ok) return { sources, subtitles };
        const content = await plRes.text();

        const variantRx = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x(\d+)[^\n]*\n([^\n]+)/g;
        let match;
        let bestRes = 0;
        while ((match = variantRx.exec(content)) !== null) {
            const res = parseInt(match[1], 10);
            if (res > bestRes) bestRes = res;
        }

        const audioTracks = [];
        const audioRx = /#EXT-X-MEDIA:TYPE=AUDIO[^\n]*/g;
        let am;
        while ((am = audioRx.exec(content)) !== null) {
            const lang = am[0].match(/LANGUAGE="([^"]+)"/)?.[1] ?? "unknown";
            const label = am[0].match(/NAME="([^"]+)"/)?.[1] ?? "Audio";
            audioTracks.push({ language: lang, label });
        }

        const finalAudio =
            audioTracks.length > 0
                ? audioTracks.filter((t) => ENGLISH_LANG_CODES.has(t.language.toLowerCase()))
                : [{ language: "en", label: "English" }];

        if (finalAudio.length === 0) return { sources, subtitles };

        sources.push({
            url: masterUrl,
            type: "hls",
            quality: bestRes ? bestRes + "p" : "HD",
            provider: "VixSrc",
            audioTracks: finalAudio,
            headers: { ...headers, Referer: apiUrl },
        });

        const subRx = /#EXT-X-MEDIA:TYPE=SUBTITLES[^\n]*/g;
        let sm;
        while ((sm = subRx.exec(content)) !== null) {
            const subUrl = sm[0].match(/URI="([^"]+)"/)?.[1];
            if (!subUrl) continue;
            const subLabel = sm[0].match(/NAME="([^"]+)"/)?.[1] ?? "unknown";
            if (subLabel.toLowerCase().includes("en") || subLabel.toLowerCase() === "unknown") {
                subtitles.push({ url: subUrl, label: subLabel, format: "vtt" });
            }
        }
    } catch {

    }

    return { sources, subtitles };
}

async function fetchVidSrc(media) {
    const { BASE } = PROVIDERS.vidsrc;
    const sources = [];

    const pageUrl =
        media.type === "movie"
            ? `${BASE}/embed/movie?tmdb=${media.tmdbId}`
            : `${BASE}/embed/tv?tmdb=${media.tmdbId}&season=${media.season}&episode=${media.episode}`;

    const headers = { "User-Agent": UA, Referer: BASE };

    async function fetchText(url) {
        try {
            if (url.startsWith("//")) url = "https:" + url;
            const res = await safeFetch(url, { headers });
            if (!res.ok) return null;
            return await res.text();
        } catch {
            return null;
        }
    }

    try {
        const html = await fetchText(pageUrl);
        if (!html) return { sources, subtitles: [] };

        const iframeSrc = html.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i)?.[1];
        if (!iframeSrc) return { sources, subtitles: [] };

        const html2 = await fetchText(iframeSrc);
        if (!html2) return { sources, subtitles: [] };

        const relSrc = html2.match(/src:\s*['"]([^'"]+)['"]/i)?.[1];
        if (!relSrc) return { sources, subtitles: [] };

        const base = iframeSrc.startsWith("//") ? "https:" + iframeSrc : iframeSrc;
        const thirdUrl = new URL(relSrc, base).href;

        const html3 = await fetchText(thirdUrl);
        if (!html3) return { sources, subtitles: [] };

        const fileField = html3.match(/file\s*:\s*["']([^"']+)["']/i)?.[1];
        if (!fileField) return { sources, subtitles: [] };

        const domainMap = {
            "{v1}": "neonhorizonworkshops.com",
            "{v2}": "wanderlynest.com",
            "{v3}": "orchidpixelgardens.com",
            "{v4}": "cloudnestra.com",
        };

        const rawUrls = fileField.split(/\s+or\s+/i);
        for (const tmpl of rawUrls) {
            let url = tmpl;
            for (const [ph, domain] of Object.entries(domainMap)) {
                url = url.replace(ph, domain);
            }
            if (url.includes("{") || url.includes("}")) continue;
            sources.push({
                url,
                type: "hls",
                quality: "HD",
                provider: "VidSrc",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: { Referer: "https://cloudnestra.com/", Origin: "https://cloudnestra.com" },
            });
        }
    } catch {

    }

    return { sources, subtitles: [] };
}

async function resolveM3u8(url, headers) {
    try {
        const res = await safeFetch(url, {
            headers: {
                ...headers,
                Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
            },
        });
        if (!res.ok) return { variants: [{ url, quality: "unknown" }] };
        const text = await res.text();

        if (!text.includes("#EXT-X-STREAM-INF")) {
            return { variants: [{ url, quality: "unknown" }] };
        }

        const variants = [];
        const lines = text.split("\n");
        let current = null;
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            if (t.startsWith("#EXT-X-STREAM-INF:")) {
                current = {};
                const bw = t.match(/BANDWIDTH=(\d+)/);
                if (bw) current.bandwidth = parseInt(bw[1]);
                const res2 = t.match(/RESOLUTION=(\d+x\d+)/);
                if (res2) current.resolution = res2[1];
            } else if (current && !t.startsWith("#")) {
                let varUrl = t;
                if (!varUrl.startsWith("http")) {
                    try {
                        varUrl = new URL(varUrl, url).toString();
                    } catch { }
                }
                current.url = varUrl;

                let quality = "unknown";
                if (current.resolution) {
                    const h = parseInt(current.resolution.split("x")[1]);
                    const qMap = { 2160: "2160p", 1440: "1440p", 1080: "1080p", 720: "720p", 480: "480p", 360: "360p", 240: "240p" };
                    quality = qMap[h] ?? "unknown";
                } else if (current.bandwidth) {
                    const mbps = current.bandwidth / 1000000;
                    quality = mbps >= 15 ? "2160p" : mbps >= 8 ? "1440p" : mbps >= 5 ? "1080p" : mbps >= 3 ? "720p" : "480p";
                }
                variants.push({ url: current.url, quality });
                current = null;
            }
        }
        return { variants: variants.length ? variants : [{ url, quality: "unknown" }] };
    } catch {
        return { variants: [{ url, quality: "unknown" }] };
    }
}

async function fetchUembed(media) {
    const { UEMBED, VXR, HOLLY, ROGFLIX, BASE } = PROVIDERS.uembed;
    const headers = { Origin: BASE, Referer: BASE, "User-Agent": UA };

    const apis = [
        `${UEMBED}?id=${media.tmdbId}`,
        ...(media.type === "movie" ? [`${VXR}?id=${media.tmdbId}&type=movie`] : []),
        buildMadplayUrl(HOLLY, media),
        buildMadplayUrl(ROGFLIX, media),
    ];

    let streams = null;
    for (const url of apis) {
        try {
            const res = await safeFetch(url, { headers });
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                streams = data;
                break;
            }
        } catch { }
    }

    if (!streams) return { sources: [], subtitles: [] };

    const sources = [];
    const validStreams = streams.filter((s) => s?.file && typeof s.file === "string");

    await Promise.all(
        validStreams.map(async (stream) => {
            const urlOrigin = (() => { try { return new URL(stream.file).origin; } catch { return BASE; } })();
            const streamHeaders =
                stream.file.includes("xpass.top")
                    ? {}
                    : stream.file.includes("goodstream.cc")
                        ? { ...headers, Referer: "https://flashstream.cc/", Origin: "https://flashstream.cc" }
                        : { ...headers, Referer: `${urlOrigin}/`, Origin: urlOrigin };

            const { variants } = await resolveM3u8(stream.file, streamHeaders);

            for (const v of variants) {
                sources.push({
                    url: unwrapThirdPartyProxy(v.url),
                    type: "hls",
                    quality: v.quality,
                    provider: "Uembed",
                    audioTracks: [{ language: "eng", label: "English" }],
                    headers: streamHeaders,
                });
            }
        })
    );

    return {
        sources: sortAndDeduplicate(sources).filter((s) => isEnglishAudio(s.audioTracks)),
        subtitles: [],
    };
}

function buildMadplayUrl(base, media) {
    const p = new URLSearchParams({ id: String(media.tmdbId), token: "thestupidthings" });
    if (media.type === "movie") {
        p.append("type", "movie");
    } else {
        p.append("type", "series");
        p.append("season", String(media.season ?? 1));
        p.append("episode", String(media.episode ?? 1));
    }
    return `${base}?${p.toString()}`;
}

function sortAndDeduplicate(sources) {
    return [...sources]
        .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
        .filter(
            (s, i, arr) =>
                i === arr.findIndex(
                    (x) =>
                        x.quality === s.quality &&
                        (x.audioTracks?.[0]?.language ?? "") === (s.audioTracks?.[0]?.language ?? "")
                )
        );
}

const VIDROCK_PASSPHRASE = "x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9";

async function encryptVidRockId(itemId) {
    const enc = new TextEncoder();
    const keyData = enc.encode(VIDROCK_PASSPHRASE);
    const iv = enc.encode(VIDROCK_PASSPHRASE.substring(0, 16));
    const key = await crypto.subtle.importKey("raw", keyData, { name: "AES-CBC" }, false, ["encrypt"]);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, enc.encode(itemId));
    const bytes = new Uint8Array(encrypted);
    const binary = String.fromCharCode(...bytes);
    const b64 = btoa(binary);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function fetchVidRock(media) {
    const { BASE, SUB_BASE, PROXY_PREFIX } = PROVIDERS.vidrock;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: BASE,
        Origin: BASE,
    };

    const sources = [];
    const subtitles = [];

    try {
        const itemId =
            media.type === "tv"
                ? `${media.tmdbId}_${media.season}_${media.episode}`
                : String(media.tmdbId);

        const encrypted = await encryptVidRockId(itemId);
        const pageUrl = `${BASE}api/${media.type}/${encrypted}`;

        const res = await safeFetch(pageUrl, { headers });
        if (!res.ok) return { sources, subtitles };
        const data = await res.json();

        for (const [, stream] of Object.entries(data)) {
            if (!stream?.url) continue;

            const lang = (stream.language ?? "").toLowerCase();

            if (lang && !ENGLISH_LANG_CODES.has(lang) && !lang.includes("english")) continue;

            const audioTrack = {
                language: lang === "english" || lang === "" ? "eng" : lang,
                label: stream.language ?? "English",
            };

            if (stream.url.includes("hls2.vdrk.site")) {
                try {
                    const cdnRes = await safeFetch(stream.url, { headers });
                    if (!cdnRes.ok) continue;
                    const cdnData = await cdnRes.json();
                    for (const obj of cdnData) {
                        let finalUrl = obj.url;
                        if (finalUrl.startsWith(PROXY_PREFIX)) {
                            finalUrl = decodeURIComponent(finalUrl.slice(PROXY_PREFIX.length).replace(/^\//, ""));
                        }
                        sources.push({
                            url: unwrapThirdPartyProxy(finalUrl),
                            type: obj.url.includes(".mp4") ? "mp4" : "hls",
                            quality: obj.resolution ? obj.resolution + "p" : "unknown",
                            provider: "VidRock",
                            audioTracks: [audioTrack],
                            headers: { ...headers, Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc/" },
                        });
                    }
                } catch { }
            } else {
                const streamHeaders = stream.url.includes("67streams")
                    ? { referrer: BASE, origin: BASE.replace("net/", "net") }
                    : { ...headers, Referer: pageUrl };

                sources.push({
                    url: unwrapThirdPartyProxy(stream.url),
                    type: "hls",
                    quality: "1080p",
                    provider: "VidRock",
                    audioTracks: [audioTrack],
                    headers: streamHeaders,
                });
            }
        }

        try {
            const subUrl =
                media.type === "tv"
                    ? `${SUB_BASE}/v2/tv/${media.tmdbId}/${media.season}/${media.episode}`
                    : `${SUB_BASE}/v2/movie/${media.tmdbId}`;

            const subRes = await safeFetch(subUrl, { headers: { ...headers, Referer: BASE } });
            if (subRes.ok) {
                const subsData = await subRes.json();
                for (const sub of subsData) {
                    if (!sub.file) continue;
                    const label = (sub.label ?? "").toLowerCase();
                    if (!label.includes("en") && label !== "unknown" && label !== "") continue;
                    subtitles.push({ url: sub.file, label: sub.label, format: "vtt" });
                }
            }
        } catch { }
    } catch { }

    return { sources: sources.filter((s) => isEnglishAudio(s.audioTracks)), subtitles };
}

async function fetchRgShows(media) {
    const { BASE, FRONTEND } = PROVIDERS.rgshows;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: FRONTEND,
        Origin: FRONTEND,
    };

    const pageUrl =
        media.type === "movie"
            ? `${BASE}/movie/${media.tmdbId}`
            : `${BASE}/tv/${media.tmdbId}/${media.season}/${media.episode}`;

    try {
        const res = await safeFetch(pageUrl, { headers });
        if (!res.ok) return { sources: [], subtitles: [] };
        const data = await res.json();
        if (!data?.stream?.url) return { sources: [], subtitles: [] };

        let finalUrl = data.stream.url;
        let sourceHeaders = headers;

        if (finalUrl.includes("02pcembed.site/v1/proxy")) {
            try {
                const proxyUrl = new URL(finalUrl);
                const rawData = proxyUrl.searchParams.get("data");
                if (rawData) {
                    const decoded = JSON.parse(decodeURIComponent(rawData));
                    if (decoded?.url && decoded.url !== "error") {
                        finalUrl = decoded.url;
                        sourceHeaders = {
                            "User-Agent": decoded.headers?.["User-Agent"] ?? UA,
                            Accept: decoded.headers?.["Accept"] ?? "*/*",
                            "Accept-Language": decoded.headers?.["Accept-Language"] ?? "en-US,en;q=0.9",
                            Referer: decoded.headers?.["Referer"] ?? FRONTEND,
                            Origin: decoded.headers?.["Origin"] ?? FRONTEND,
                        };
                    }
                }
            } catch {
                return { sources: [], subtitles: [] };
            }
        }

        return {
            sources: [
                {
                    url: finalUrl,
                    quality: "1080p",
                    type: finalUrl.includes(".m3u8") ? "hls" : "mp4",
                    provider: "RgShows",
                    audioTracks: [{ language: "eng", label: "English" }],
                    headers: sourceHeaders,
                },
            ],
            subtitles: [],
        };
    } catch {
        return { sources: [], subtitles: [] };
    }
}

async function vidzeeDecrypt(encryptedData, decryptionKey) {
    try {
        if (!encryptedData || !decryptionKey) return "";

        const decoded = atob(encryptedData);
        const [ivBase64, cipherBase64] = decoded.split(":");

        if (!ivBase64 || !cipherBase64) return "";

        const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
        const cipherBytes = Uint8Array.from(atob(cipherBase64), (c) => c.charCodeAt(0));

        const encoded = new TextEncoder().encode(decryptionKey);
        const keyBytes = new Uint8Array(32);
        keyBytes.set(encoded.slice(0, 32));

        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyBytes,
            { name: "AES-CBC" },
            false,
            ["decrypt"]
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv },
            cryptoKey,
            cipherBytes
        );

        return new TextDecoder().decode(decrypted);
    } catch {
        return "";
    }
}

async function vidzeesDeriveKey(e) {
    try {
        if (!e) return "";

        const base64ToBytes = (e) => {
            const t = atob(e.replace(/\s+/g, ""));
            const n = t.length;
            const r = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
                r[i] = t.charCodeAt(i);
            }
            return r;
        };

        let t = base64ToBytes(e);
        if (t.length <= 28) return "";

        let n = t.slice(0, 12);
        let r = t.slice(12, 28);
        let a = t.slice(28);

        let i = new Uint8Array(a.length + r.length);
        i.set(a, 0);
        i.set(r, a.length);

        let encoder = new TextEncoder();
        let l = await crypto.subtle.digest(
            "SHA-256",
            encoder.encode("4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c")
        );

        let o = await crypto.subtle.importKey(
            "raw",
            l,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );

        let c = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: n, tagLength: 128 },
            o,
            i
        );

        return new TextDecoder().decode(c);
    } catch {
        return "";
    }
}

function vidzeeInferQuality(link) {
    const patterns = [/(\d{3,4})p/i, /(\d{3,4})k/i, /quality[_-](\d{3,4})/i, /res[_-](\d{3,4})/i];
    for (const p of patterns) {
        const m = link.match(p);
        if (m) {
            const q = parseInt(m[1]);
            if (q >= 240 && q <= 4320) return q + "p";
        }
    }
    return "unknown";
}

async function fetchVidZee(media) {
    const { BASE, PLAYER } = PROVIDERS.vidzee;
    const sources = [];
    const subtitles = [];

    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: PLAYER,
        Origin: PLAYER,
    };

    try {
        const decKeyRes = await safeFetch(`${BASE}/api-key`, { headers });
        if (!decKeyRes.ok) return { sources, subtitles };
        const decKeyRaw = await decKeyRes.text();
        if (!decKeyRaw) return { sources, subtitles };

        const decryptionKey = await vidzeesDeriveKey(decKeyRaw);
        if (!decryptionKey) return { sources, subtitles };

        const serverPromises = Array.from({ length: 14 }, (_, serverId) => {
            let url = `${PLAYER}/api/server?id=${media.tmdbId}&sr=${serverId}`;
            if (media.type === "tv") {
                url += `&ss=${media.season}&ep=${media.episode}`;
            }
            return safeFetch(url, { headers })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null);
        });

        const serverResults = await Promise.allSettled(serverPromises);
        const successfulResponses = serverResults
            .filter((r) => r.status === "fulfilled" && r.value)
            .map((r) => r.value);

        if (successfulResponses.length === 0) return { sources, subtitles };

        const decryptPromises = successfulResponses.map((response) =>
            Promise.all(response.url.map((u) => vidzeeDecrypt(u.link, decryptionKey))).then(
                (decryptedLinks) => ({ response, decryptedLinks })
            )
        );

        const decryptionResults = await Promise.all(decryptPromises);

        const allDecryptedLinks = [];
        const allSubtitles = new Map();

        for (const { response, decryptedLinks } of decryptionResults) {
            allDecryptedLinks.push(...decryptedLinks);

            for (const track of response.tracks) {
                if (track.url && track.lang) {
                    const subKey = `${track.lang}_${response.serverInfo.number}`;
                    if (!allSubtitles.has(subKey)) {
                        allSubtitles.set(subKey, {
                            url: track.url,
                            label: track.lang.replace(/\d+/g, "").trim(),
                            format: "vtt",
                        });
                    }
                }
            }
        }

        const uniqueLinks = [...new Set(allDecryptedLinks)].filter(
            (link) => link && link.startsWith("http")
        );

        for (const link of uniqueLinks) {
            const isVietnamese = link.includes("phim1280.tv");
            if (isVietnamese) continue;

            let linkHeaders;
            if (link.includes("fast33lane")) {
                linkHeaders = { Referer: "https://rapidairmax.site/", Origin: "https://rapidairmax.site" };
            } else if (link.includes("serversicuro.cc")) {
                linkHeaders = {};
            } else {
                linkHeaders = { ...headers, Referer: `${BASE}/` };
            }

            sources.push({
                url: link,
                type: "hls",
                quality: vidzeeInferQuality(link),
                provider: "VidZee",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: linkHeaders,
            });
        }

        for (const sub of allSubtitles.values()) {
            subtitles.push(sub);
        }
    } catch { }

    return { sources: sources.filter((s) => isEnglishAudio(s.audioTracks)), subtitles };
}

const EMBED02_HLS_PROXY = "https://madvid3.xyz/api/hls-proxy?url=";

function rewrite02Url(url) {
    if (!url) return null;
    if (url.startsWith("/")) url = PROVIDERS.embed02.BASE + url;
    if (url.includes("02pcembed.site/v1/proxy")) {
        return EMBED02_HLS_PROXY + encodeURIComponent(url);
    }
    return url;
}

function isErrorEmbed02(url) {
    try {
        let clean = url.replace(EMBED02_HLS_PROXY, "");
        clean = decodeURIComponent(clean);
        const obj = new URL(clean);
        const d = obj.searchParams.get("data");
        if (d) {
            const inner = JSON.parse(decodeURIComponent(d));
            return inner?.url === "error";
        }
        return false;
    } catch {
        return false;
    }
}

async function fetchEmbed02(media) {
    const { BASE } = PROVIDERS.embed02;
    const endpoint =
        media.type === "movie"
            ? `/v1/movies/${media.tmdbId}`
            : `/v1/tv/${media.tmdbId}/seasons/${media.season}/episodes/${media.episode}`;

    try {
        const res = await safeFetch(`${BASE}${endpoint}`, {
            headers: {
                "User-Agent": UA,
                Referer: "https://madvid3.xyz/",
                Origin: "https://madvid3.xyz",
                Accept: "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });
        if (!res.ok) return { sources: [], subtitles: [] };
        const data = await res.json();

        const seen = new Set();
        const sources = [];

        for (const source of data.sources ?? []) {
            const url = rewrite02Url(source.url);
            if (!url || seen.has(url) || isErrorEmbed02(url)) continue;
            seen.add(url);
            sources.push({
                url,
                quality: source.quality ?? "Auto",
                type: source.type ?? "hls",
                provider: "02Embed",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: { Referer: "https://madvid3.xyz/", Origin: "https://madvid3.xyz" },
            });
        }

        const subtitles = (data.subtitles ?? [])
            .map((s) => ({
                url: rewrite02Url(s.url),
                label: s.label,
                format: s.format ?? "vtt",
            }))
            .filter((s) => s.url && ((s.label ?? "").toLowerCase().includes("en") || !s.label));

        return { sources, subtitles };
    } catch {
        return { sources: [], subtitles: [] };
    }
}

async function fetchVidLink(media) {
    const { API, PROXY_API } = PROVIDERS.vidlink;
    const sources = [];
    const subtitles = [];

    try {
        const res = await safeFetch(`${API}${media.tmdbId}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        if (!res.ok) return { sources, subtitles };

        const data = await res.json().catch(() => null);
        if (!data?.url) return { sources, subtitles };

        const playable = `${PROXY_API}${encodeURIComponent(data.url.split("?")[0])}`;

        sources.push({
            url: playable,
            type: "hls",
            quality: "1080p",
            provider: "VidLink",
            audioTracks: [{ language: "eng", label: "English" }],
            headers: { "User-Agent": "Mozilla/5.0" }
        });
    } catch {
    }

    return { sources, subtitles };
}

async function fetchStreamMafia(media) {
    const { BASE, EMBED } = PROVIDERS.streammafia;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: EMBED + "/",
        Origin: EMBED,
    };

    const apiUrl =
        media.type === "movie"
            ? `${BASE}/api/movie/?id=${media.tmdbId}`
            : `${BASE}/api/?tv=${media.tmdbId}&season=${media.season}&episode=${media.episode}`;

    try {
        const res = await safeFetch(apiUrl, { headers });
        if (!res.ok) return { sources: [], subtitles: [] };

        const encrypted = await res.json();
        if (!encrypted?.iv || !encrypted?.tag || !encrypted?.data) {
            return { sources: [], subtitles: [] };
        }

        const { createHash, createDecipheriv } = await import("crypto");

        function base64ToBuffer(b64) {
            return Buffer.from(b64, "base64");
        }

        const iv = base64ToBuffer(encrypted.iv);
        const tag = base64ToBuffer(encrypted.tag);
        const data = base64ToBuffer(encrypted.data);

        const key = createHash("sha256").update("Z9#rL!v2K*5qP&7mXw").digest();
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        const api = JSON.parse(decrypted.toString("utf-8"));

        const sources = [];
        const subtitles = [];

        const fallbackLang = (api.selected?.lang_code ?? api.selected?.lang ?? "unknown").trim().toLowerCase();
        const fallbackLabel = (api.selected?.lang ?? api.selected?.lang_code ?? "Unknown").trim();

        if (!ENGLISH_LANG_CODES.has(fallbackLang) && fallbackLang !== "unknown") {
            return { sources, subtitles };
        }

        const audioTrack = { language: fallbackLang, label: fallbackLabel };

        if (api.stream?.hls_streaming) {
            const hlsUrl = api.stream.hls_streaming;
            let quality = "auto";

            try {
                const plRes = await safeFetch(hlsUrl, {
                    headers: { ...headers, Referer: EMBED + "/" },
                });
                if (plRes.ok) {
                    const content = await plRes.text();
                    const variantRx = /RESOLUTION=\d+x(\d+)[^\n]*\n([^\n]+)/g;
                    let best = 0;
                    let m;
                    while ((m = variantRx.exec(content)) !== null) {
                        const h = parseInt(m[1], 10);
                        if (h > best) best = h;
                    }
                    if (best > 0) quality = best + "p";

                    const audioRx = /TYPE=AUDIO[^\n]*/g;
                    const parsedAudio = [];
                    let am;
                    while ((am = audioRx.exec(content)) !== null) {
                        const lang = (am[0].match(/LANGUAGE="([^"]+)"/)?.[1] ?? "unknown").toLowerCase();
                        const label = am[0].match(/NAME="([^"]+)"/)?.[1] ?? "Audio";
                        parsedAudio.push({ language: lang, label });
                    }
                    if (parsedAudio.length > 0) {
                        const engAudio = parsedAudio.filter((t) => ENGLISH_LANG_CODES.has(t.language));
                        if (engAudio.length > 0) {
                            sources.push({
                                url: hlsUrl,
                                type: "hls",
                                quality,
                                provider: "StreamMafia",
                                audioTracks: engAudio,
                                headers: { ...headers, Referer: EMBED + "/" },
                            });
                        } else {
                            return { sources: [], subtitles: [] };
                        }
                    } else {
                        sources.push({
                            url: hlsUrl,
                            type: "hls",
                            quality,
                            provider: "StreamMafia",
                            audioTracks: [audioTrack],
                            headers: { ...headers, Referer: EMBED + "/" },
                        });
                    }
                } else {
                    sources.push({
                        url: hlsUrl,
                        type: "hls",
                        quality,
                        provider: "StreamMafia",
                        audioTracks: [audioTrack],
                        headers: { ...headers, Referer: EMBED + "/" },
                    });
                }
            } catch {
                sources.push({
                    url: hlsUrl,
                    type: "hls",
                    quality,
                    provider: "StreamMafia",
                    audioTracks: [audioTrack],
                    headers: { ...headers, Referer: EMBED + "/" },
                });
            }
        }

        for (const download of api.stream?.download ?? []) {
            if (!download.url) continue;
            const qMatch = download.quality?.match(/(\d+)/);
            sources.push({
                url: download.url,
                type: download.url.endsWith(".mp4") ? "mp4" : "hls",
                quality: qMatch ? qMatch[1] + "p" : download.quality ?? "unknown",
                provider: "StreamMafia",
                audioTracks: [audioTrack],
                headers: { ...headers, Referer: EMBED + "/" },
            });
        }

        return { sources: sources.filter((s) => isEnglishAudio(s.audioTracks)), subtitles };
    } catch {
        return { sources: [], subtitles: [] };
    }
}

async function fetchIcefy(media) {
    const { BASE } = PROVIDERS.icefy;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: BASE,
        Origin: BASE,
    };

    try {
        let apiUrl;
        if (media.type === "movie") {
            apiUrl = `${BASE}/movie/${media.tmdbId}`;
        } else {
            apiUrl = `${BASE}/tv/${media.tmdbId}/${media.season}/${media.episode}`;
        }

        const res = await safeFetch(apiUrl, { headers });
        if (!res.ok) return { sources: [], subtitles: [] };

        const data = await res.json();
        if (!data?.stream) return { sources: [], subtitles: [] };

        return {
            sources: [
                {
                    url: data.stream,
                    quality: "1080p",
                    type: "hls",
                    provider: "Icefy",
                    audioTracks: [{ language: "eng", label: "English" }],
                    headers,
                },
            ],
            subtitles: [],
        };
    } catch {
        return { sources: [], subtitles: [] };
    }
}

export async function scrape(mediaType, tmdbId, season = "1", episode = "1") {
    const media = {
        type: mediaType === "tv" ? "tv" : "movie",
        tmdbId: String(tmdbId),
        season: String(season),
        episode: String(episode),
    };

    const providerFns = [
        fetchVidLink,
        fetchMovieDownloader,
        fetchVixSrc,
        fetchVidSrc,
        fetchUembed,
        fetchVidRock,
        fetchRgShows,
        fetchVidZee,
        fetchEmbed02,
        fetchStreamMafia,
        fetchIcefy,
    ];

    const results = await Promise.allSettled(providerFns.map((fn) => fn(media)));

    const allSources = [];
    const allSubtitles = [];
    const seenSourceUrls = new Set();
    const seenSubUrls = new Set();

    for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { sources = [], subtitles = [] } = result.value;

        for (const s of sources) {
            if (!s.url || seenSourceUrls.has(s.url)) continue;
            seenSourceUrls.add(s.url);
            allSources.push(s);
        }

        for (const s of subtitles) {
            if (!s.url || seenSubUrls.has(s.url)) continue;
            seenSubUrls.add(s.url);
            allSubtitles.push(s);
        }
    }

    const finalSources = sortSources(
        allSources.filter(
            (s) => s.url && isEnglishAudio(s.audioTracks)
        )
    );

    const finalSubtitles = filterEnglishSubtitles(allSubtitles);

    return { sources: finalSources, subtitles: finalSubtitles };
}

export {
    fetchVidLink,
    fetchMovieDownloader,
    fetchVixSrc,
    fetchVidSrc,
    fetchUembed,
    fetchVidRock,
    fetchRgShows,
    fetchVidZee,
    fetchEmbed02,
    fetchStreamMafia,
    fetchIcefy,
    sortSources,
    filterEnglishSubtitles,
    isEnglishAudio,
};