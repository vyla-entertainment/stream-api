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
        BASE: "https://solve.streammafia.to",
        EMBED: "https://solve.streammafia.to",
    },
    icefy: {
        BASE: "https://streams.icefy.top",
    },
    cinesu: {
        BASE: "https://cine.su",
    },
    peachify: {
        BASE: "https://peachify.top",
        MOVIEBOX_URL: "https://uwu.peachify.top",
        API_URL: "https://usa.eat-peach.sbs",
    },
    vidnest: {
        BASE: "https://vidnest.fun",
        API_BASE: "https://new.vidnest.fun",
    },
    videasy: {
        BASE: "https://api.videasy.net",
        PLAYER: "https://player.videasy.net",
        DEC_API: "https://enc-dec.app/api/dec-videasy",
    },
    popr: {
        BASE: "https://popr.ink",
    },
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36";

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
                if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
                if (decoded.includes("://")) return decoded;
                return "https://" + decoded;
            }
        }
    } catch { }
    return url;
}

const ENGLISH_LANG_CODES = new Set(["eng", "en", "en-us", "en-gb", "english"]);

function isEnglishAudio(audioTracks) {
    if (!audioTracks?.length) return true;
    return audioTracks.some((t) => ENGLISH_LANG_CODES.has((t.language ?? t.lang ?? "").toLowerCase()));
}

function filterEnglishSubtitles(subtitles) {
    if (!subtitles?.length) return [];
    return subtitles.filter((s) => {
        const label = (s.label ?? "").toLowerCase();
        const lang = (s.language ?? s.lang ?? "").toLowerCase();
        return label.includes("english") || label.includes("en") || ENGLISH_LANG_CODES.has(lang) || label === "unknown";
    });
}

const QUALITY_PRIORITY = {
    "4k": 9, "2160p": 9, "1440p": 8, "1080p": 7, "720p": 6,
    "480p": 5, "360p": 4, "240p": 3, hd: 2, auto: 1, unknown: 0,
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

function sortAndDeduplicate(sources) {
    return [...sources]
        .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
        .filter((s, i, arr) =>
            i === arr.findIndex(
                (x) => x.quality === s.quality && (x.audioTracks?.[0]?.language ?? "") === (s.audioTracks?.[0]?.language ?? "")
            )
        );
}

async function fetchMovieDownloaderToken(media) {
    const { BASE, VERIFY } = PROVIDERS.moviedownloader;
    const referer = BASE + "/api/download" + (media.type === "movie"
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
    const apiUrl = media.type === "movie"
        ? `${BASE}/api/download/movie/${media.tmdbId}`
        : `${BASE}/api/download/tv/${media.tmdbId}/${media.season}/${media.episode}`;
    const referer = BASE + "/api/download" + (media.type === "movie"
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
    } catch { }
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
        const apiUrl = media.type === "movie"
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
        const plRes = await safeFetch(masterUrl, { headers: { ...headers, Referer: apiUrl } });
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
        const finalAudio = audioTracks.length > 0
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
    } catch { }
    return { sources, subtitles };
}

async function fetchVidSrc(media) {
    const { BASE } = PROVIDERS.vidsrc;
    const sources = [];
    const pageUrl = media.type === "movie"
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
    } catch { }
    return { sources, subtitles: [] };
}

async function resolveM3u8(url, headers) {
    try {
        const res = await safeFetch(url, {
            headers: { ...headers, Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" },
        });
        if (!res.ok) return { variants: [{ url, quality: "unknown" }] };
        const text = await res.text();
        if (!text.includes("#EXT-X-STREAM-INF")) return { variants: [{ url, quality: "unknown" }] };
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
                    try { varUrl = new URL(varUrl, url).toString(); } catch { }
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
            if (Array.isArray(data) && data.length > 0) { streams = data; break; }
        } catch { }
    }
    if (!streams) return { sources: [], subtitles: [] };
    const sources = [];
    const validStreams = streams.filter((s) => s?.file && typeof s.file === "string");
    await Promise.all(validStreams.map(async (stream) => {
        const urlOrigin = (() => { try { return new URL(stream.file).origin; } catch { return BASE; } })();
        const streamHeaders = stream.file.includes("xpass.top")
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
    }));
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
        const itemId = media.type === "tv"
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
            const subUrl = media.type === "tv"
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
    const pageUrl = media.type === "movie"
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
            sources: [{
                url: finalUrl,
                quality: "1080p",
                type: finalUrl.includes(".m3u8") ? "hls" : "mp4",
                provider: "RgShows",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: sourceHeaders,
            }],
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
        const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, cipherBytes);
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
            for (let i = 0; i < n; i++) r[i] = t.charCodeAt(i);
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
        let l = await crypto.subtle.digest("SHA-256", encoder.encode("4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c"));
        let o = await crypto.subtle.importKey("raw", l, { name: "AES-GCM" }, false, ["decrypt"]);
        let c = await crypto.subtle.decrypt({ name: "AES-GCM", iv: n, tagLength: 128 }, o, i);
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
            if (media.type === "tv") url += `&ss=${media.season}&ep=${media.episode}`;
            return safeFetch(url, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
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
        const uniqueLinks = [...new Set(allDecryptedLinks)].filter((link) => link && link.startsWith("http"));
        for (const link of uniqueLinks) {
            if (link.includes("phim1280.tv")) continue;
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
        for (const sub of allSubtitles.values()) subtitles.push(sub);
    } catch { }
    return { sources: sources.filter((s) => isEnglishAudio(s.audioTracks)), subtitles };
}

const EMBED02_HLS_PROXY = "https://madvid3.xyz/api/hls-proxy?url=";

function rewrite02Url(url) {
    if (!url) return null;
    if (url.startsWith("/")) url = PROVIDERS.embed02.BASE + url;
    if (url.includes("02pcembed.site/v1/proxy")) return EMBED02_HLS_PROXY + encodeURIComponent(url);
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
    const endpoint = media.type === "movie"
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
            .map((s) => ({ url: rewrite02Url(s.url), label: s.label, format: s.format ?? "vtt" }))
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
        const res = await safeFetch(`${API}${media.tmdbId}`, { headers: { "User-Agent": "Mozilla/5.0" } });
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
            headers: { "User-Agent": "Mozilla/5.0" },
        });
    } catch { }
    return { sources, subtitles };
}

async function streamMafiaGetSessionCookie(headers, BASE) {
    try {
        const res = await safeFetch(BASE + "/api/session", { method: "POST", headers, body: null });
        return res.headers.get("Set-Cookie") || "";
    } catch {
        return "";
    }
}

async function streamMafiaGetToken(headers, BASE) {
    try {
        const res = await safeFetch(`${BASE}/api/token`, { headers });
        if (res.status !== 200) return "";
        const data = await res.json();
        return data.token || "";
    } catch {
        return "";
    }
}

async function streamMafiaDecrypt(payload) {
    try {
        if (!payload?.iv || !payload?.tag || !payload?.data) return null;
        const base64ToBuffer = (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        };
        const iv = base64ToBuffer(payload.iv);
        const tag = base64ToBuffer(payload.tag);
        const data = base64ToBuffer(payload.data);
        const secret = "Z9#rL!v2K*5qP&7mXw";
        const enc = new TextEncoder();
        const rawKey = await crypto.subtle.digest("SHA-256", enc.encode(secret));
        const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
        const combined = new Uint8Array(tag.length + data.length);
        combined.set(tag, 0);
        combined.set(data, tag.length);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, combined);
        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch {
        return null;
    }
}

async function fetchStreamMafia(media) {
    const { BASE } = PROVIDERS.streammafia;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: BASE + "/",
        Origin: BASE,
        Cookie: "",
        "x-api-token": "",
        "x-content-id": String(media.tmdbId),
    };
    try {
        const cookie = await streamMafiaGetSessionCookie(headers, BASE);
        if (!cookie) return { sources: [], subtitles: [] };
        headers.Cookie = cookie.split(";")[0] || "";
        await new Promise((r) => setTimeout(r, 100));
        const token = await streamMafiaGetToken(headers, BASE);
        if (!token) return { sources: [], subtitles: [] };
        headers["x-api-token"] = token;
        const apiUrl = media.type === "movie"
            ? `${BASE}/api/movie/?id=${media.tmdbId}`
            : `${BASE}/api/?tv=${media.tmdbId}&season=${media.season}&episode=${media.episode}`;
        const res = await safeFetch(apiUrl, { headers });
        if (!res.ok) return { sources: [], subtitles: [] };
        const encrypted = await res.json();
        const api = await streamMafiaDecrypt(encrypted);
        if (!api) return { sources: [], subtitles: [] };
        const sources = [];
        const subtitles = [];
        const fallbackLang = (api.selected?.lang_code ?? api.selected?.lang ?? "unknown").trim().toLowerCase();
        const fallbackLabel = (api.selected?.lang ?? api.selected?.lang_code ?? "Unknown").trim();
        if (!ENGLISH_LANG_CODES.has(fallbackLang) && fallbackLang !== "unknown") return { sources, subtitles };
        const audioTrack = { language: fallbackLang, label: fallbackLabel };

        async function extractSourcesFromApi(apiData, fallback) {
            const out = [];
            if (apiData.stream?.hls_streaming) {
                const hlsUrl = apiData.stream.hls_streaming;
                let quality = "auto";
                try {
                    const plRes = await safeFetch(hlsUrl, { headers: { ...headers, Referer: BASE + "/" } });
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
                                out.push({ url: hlsUrl, type: "hls", quality, provider: "StreamMafia", audioTracks: engAudio, headers: { ...headers, Referer: BASE + "/" } });
                            }
                        } else {
                            out.push({ url: hlsUrl, type: "hls", quality, provider: "StreamMafia", audioTracks: [fallback], headers: { ...headers, Referer: BASE + "/" } });
                        }
                    } else {
                        out.push({ url: hlsUrl, type: "hls", quality, provider: "StreamMafia", audioTracks: [fallback], headers: { ...headers, Referer: BASE + "/" } });
                    }
                } catch {
                    out.push({ url: hlsUrl, type: "hls", quality, provider: "StreamMafia", audioTracks: [fallback], headers: { ...headers, Referer: BASE + "/" } });
                }
            }
            for (const download of apiData.stream?.download ?? []) {
                if (!download.url) continue;
                const qMatch = download.quality?.match(/(\d+)/);
                out.push({
                    url: download.url,
                    type: download.url.endsWith(".mp4") ? "mp4" : "hls",
                    quality: qMatch ? qMatch[1] + "p" : download.quality ?? "unknown",
                    provider: "StreamMafia",
                    audioTracks: [fallback],
                    headers: { ...headers, Referer: BASE + "/" },
                });
            }
            return out;
        }

        const mainSources = await extractSourcesFromApi(api, audioTrack);
        sources.push(...mainSources);

        if (api.switches?.length > 0) {
            const switchResults = await Promise.all(api.switches.map(async (sw) => {
                try {
                    const swUrl = `${BASE}/api/source/${sw.file_code}`;
                    const swRes = await safeFetch(swUrl, { headers });
                    if (!swRes.ok) return [];
                    const swEncrypted = await swRes.json();
                    const swApi = await streamMafiaDecrypt(swEncrypted);
                    if (!swApi) return [];
                    const swFallback = {
                        language: sw.lang_code?.toLowerCase() || "unknown",
                        label: sw.lang || sw.lang_code || "Unknown",
                    };
                    return extractSourcesFromApi(swApi, swFallback);
                } catch {
                    return [];
                }
            }));
            for (const result of switchResults) sources.push(...result);
        }

        const seen = new Set();
        const deduped = [];
        for (const s of sources) {
            if (seen.has(s.url)) continue;
            seen.add(s.url);
            deduped.push(s);
        }
        return { sources: deduped.filter((s) => isEnglishAudio(s.audioTracks)), subtitles };
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
        const apiUrl = media.type === "movie"
            ? `${BASE}/movie/${media.tmdbId}`
            : `${BASE}/tv/${media.tmdbId}/${media.season}/${media.episode}`;
        const res = await safeFetch(apiUrl, { headers });
        if (!res.ok) return { sources: [], subtitles: [] };
        const data = await res.json();
        if (!data?.stream) return { sources: [], subtitles: [] };
        return {
            sources: [{
                url: data.stream,
                quality: "1080p",
                type: "hls",
                provider: "Icefy",
                audioTracks: [{ language: "eng", label: "English" }],
                headers,
            }],
            subtitles: [],
        };
    } catch {
        return { sources: [], subtitles: [] };
    }
}

async function fetchCineSu(media) {
    const { BASE } = PROVIDERS.cinesu;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: BASE + "/en/watch",
        Origin: BASE,
    };
    try {
        let streamUrl;
        if (media.type === "movie") {
            streamUrl = `${BASE}/v1/stream/master/movie/${media.tmdbId}.m3u8`;
        } else {
            streamUrl = `${BASE}/v1/stream/master/tv/${media.tmdbId}/${media.season}/${media.episode}.m3u8`;
        }
        const verify = await safeFetch(streamUrl, { method: "HEAD", headers });
        if (verify.status !== 200) return { sources: [], subtitles: [] };
        return {
            sources: [{
                url: streamUrl,
                quality: "1080p",
                type: "hls",
                provider: "CineSu",
                audioTracks: [{ language: "eng", label: "English" }],
                headers,
            }],
            subtitles: [],
        };
    } catch {
        return { sources: [], subtitles: [] };
    }
}

const PEACHIFY_KEY = "ZDhmMmExYjVlOWM0NzA4MTRmNmIyYzNhNWQ4ZTdmOTAxYTJiM2M0ZDVlM2Y3YThiOWMwZDFlMmYzYTRiNWM2ZA==";

async function peachifyDecrypt(payload) {
    try {
        const decode = (b64url) => {
            const padded = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
            const binary = atob(padded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        };
        const hexStr = Buffer.from(PEACHIFY_KEY, "base64").toString();
        const raw = new Uint8Array(hexStr.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
        const [ivPart, tagPart, cipherPart] = payload.split(".");
        const iv = decode(ivPart);
        const tag = decode(tagPart);
        const cipher = decode(cipherPart);
        const combined = new Uint8Array(tag.length + cipher.length);
        combined.set(tag, 0);
        combined.set(cipher, tag.length);
        const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined);
        return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
        return null;
    }
}

async function fetchPeachify(media) {
    const { BASE, MOVIEBOX_URL, API_URL } = PROVIDERS.peachify;
    const servers = [
        `${MOVIEBOX_URL}/moviebox`,
        `${API_URL}/holly`,
        `${API_URL}/air`,
        `${API_URL}/multi`,
        `${API_URL}/ice`,
        `${API_URL}/net`,
    ];
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: BASE,
        Origin: BASE,
    };

    const buildUrl = (serverBase) => media.type === "movie"
        ? `${serverBase}/movie/${media.tmdbId}`
        : `${serverBase}/tv/${media.tmdbId}/${media.season}/${media.episode}`;

    const results = await Promise.allSettled(servers.map(async (server) => {
        const res = await safeFetch(buildUrl(server), { headers });
        if (!res.ok) return null;
        let body = await res.json();
        if (body.isEncrypted && body.data) {
            body = await peachifyDecrypt(body.data);
            if (!body) return null;
        }
        const rawSources = Array.isArray(body.sources) ? body.sources : [];
        if (rawSources.length === 0) return null;
        const rawSubtitles = Array.isArray(body.subtitles) ? body.subtitles : [];

        const sources = [];
        for (const s of rawSources) {
            const url = s.url || s.src || s.file || s.stream || s.streamUrl || s.playbackUrl;
            if (!url) continue;
            const rawType = (s.type || s.format || s.container || "").toLowerCase();
            const type = rawType.includes("hls") || rawType.includes("m3u8") || url.toLowerCase().includes(".m3u8") ? "hls" : "mp4";
            const rawDub = s.dub || s.audio || s.audioName || s.audioLang || s.language || s.lang || s.label || s.name || s.title || "";
            const dub = rawDub.trim().toLowerCase() === "dubbed" ? "Dub" : rawDub.trim().toLowerCase() === "subbed" ? "Sub" : rawDub.trim() || "Original";
            const rawQ = s.quality ?? s.resolution ?? s.height ?? s.res;
            let quality = "unknown";
            if (rawQ !== undefined && rawQ !== null) {
                const qStr = String(rawQ);
                const match = qStr.match(/\d{3,4}/);
                if (match) quality = match[0] + "p";
                else if (Number.isFinite(Number(qStr))) quality = Number(qStr) + "p";
            }
            const rawHeaders = s.headers ?? s.header ?? s.requestHeaders ?? s.httpHeaders;
            sources.push({
                url,
                type,
                quality,
                provider: "Peachify",
                audioTracks: [{ language: dub.toLowerCase().substring(0, 2), label: dub }],
                headers: rawHeaders && typeof rawHeaders === "object" ? rawHeaders : headers,
            });
        }

        const subtitles = rawSubtitles.map((s) => {
            const url = s.url ?? s.file ?? s.src;
            if (!url) return null;
            return { url, label: s.label ?? s.name ?? s.language ?? "Auto", format: "vtt" };
        }).filter(Boolean);

        if (sources.length === 0) return null;
        return { sources, subtitles };
    }));

    const allSources = [];
    const allSubtitles = [];
    for (const r of results) {
        if (r.status !== "fulfilled" || !r.value) continue;
        allSources.push(...r.value.sources);
        allSubtitles.push(...r.value.subtitles);
    }
    if (allSources.length === 0) return { sources: [], subtitles: [] };
    return {
        sources: allSources.filter((s) => isEnglishAudio(s.audioTracks)),
        subtitles: allSubtitles,
    };
}

const VIDNEST_ALPHABET = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
const VIDNEST_REVERSE_MAP = (() => {
    const map = {};
    for (let i = 0; i < VIDNEST_ALPHABET.length; i++) map[VIDNEST_ALPHABET[i]] = i;
    return map;
})();

function decodeVidnestBase64(input) {
    if (!input || typeof input !== "string") throw new Error("VidNest: invalid payload");
    let padded = input;
    const mod = padded.length % 4;
    if (mod !== 0) padded += "=".repeat(4 - mod);
    const bytes = [];
    for (let i = 0; i < padded.length; i += 4) {
        const chunk = padded.slice(i, i + 4);
        const c0 = VIDNEST_REVERSE_MAP[chunk[0]] ?? 64;
        const c1 = VIDNEST_REVERSE_MAP[chunk[1]] ?? 64;
        const c2 = chunk[2] === "=" ? 64 : (VIDNEST_REVERSE_MAP[chunk[2]] ?? 64);
        const c3 = chunk[3] === "=" ? 64 : (VIDNEST_REVERSE_MAP[chunk[3]] ?? 64);
        bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
        if (c2 !== 64) bytes.push((((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff);
        if (c3 !== 64) bytes.push((((c2 & 0x03) << 6) | c3) & 0xff);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
}

function vidnestDecrypt(payload) {
    try {
        return JSON.parse(decodeVidnestBase64(payload));
    } catch {
        return null;
    }
}

function inferSourceType(type, url) {
    const t = (type ?? "").toLowerCase();
    if (t === "hls" || url.includes(".m3u8")) return "hls";
    if (t === "dash" || url.includes(".mpd")) return "dash";
    if (t === "mp4" || url.includes(".mp4")) return "mp4";
    if (t === "mkv" || url.includes(".mkv")) return "mkv";
    if (t === "webm" || url.includes(".webm")) return "webm";
    return "hls";
}

function inferSubtitleFormat(url) {
    const u = url.toLowerCase();
    if (u.includes(".vtt")) return "vtt";
    if (u.includes(".srt")) return "srt";
    if (u.includes(".ass")) return "ass";
    if (u.includes(".ssa")) return "ssa";
    if (u.includes(".ttml")) return "ttml";
    return "vtt";
}

async function fetchVidNest(media) {
    const { BASE, API_BASE } = PROVIDERS.vidnest;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${BASE}/`,
        Origin: BASE,
    };

    const SERVERS = [
        { path: "moviebox", query: "" },
        { path: "allmovies", query: "" },
        { path: "catflix", query: "" },
        { path: "purstream", query: "" },
        { path: "hollymoviehd", query: "" },
        { path: "lamda", query: "" },
        { path: "flixhq", query: "" },
        { path: "vidlink", query: "" },
        { path: "onehd", query: "?server=upcloud" },
        { path: "klikxxi", query: "" },
    ];

    const handlers = {
        klikxxi: {
            mapSources: (root) => (root.sources ?? []).map((s) => ({
                url: s.url,
                type: inferSourceType(s.type, s.url),
                quality: s.quality ?? "auto",
                provider: "VidNest",
                audioTracks: [],
                headers,
            })),
            mapSubtitles: () => [],
        },
        allmovies: {
            mapSources: (root) => (root.streams ?? []).map((s) => ({
                url: s.url,
                type: inferSourceType(s.type, s.url),
                quality: "Auto",
                provider: "VidNest",
                audioTracks: [{ language: s.language, label: s.language }],
                headers: s.headers ?? headers,
            })),
            mapSubtitles: () => [],
        },
        onehd: {
            mapSources: (root) => [{
                url: root.url,
                type: inferSourceType("", root.url),
                quality: "Auto",
                provider: "VidNest",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: root.headers ?? headers,
            }],
            mapSubtitles: (root) => (root.subtitles ?? []).map((s) => ({
                url: s.url,
                label: s.lang,
                format: inferSubtitleFormat(s.url),
            })),
        },
        hollymoviehd: {
            mapSources: (root) => (root.sources ?? []).map((s) => ({
                url: s.file,
                type: inferSourceType(s.type, s.file),
                quality: s.label ?? "auto",
                provider: "VidNest",
                audioTracks: [{ language: "eng", label: "English" }],
                headers,
            })),
            mapSubtitles: () => [],
        },
        vidlink: {
            mapSources: (root) => [{
                url: root.data?.stream?.playlist,
                type: inferSourceType(root.data?.stream?.type, root.data?.stream?.playlist ?? ""),
                quality: "auto",
                provider: "VidNest",
                audioTracks: [{ language: "eng", label: "English" }],
                headers: root.headers ?? headers,
            }].filter((s) => s.url),
            mapSubtitles: (root) => (root.data?.stream?.captions ?? []).map((c) => ({
                url: c.url,
                label: c.language,
                format: inferSubtitleFormat(c.url),
            })),
        },
        purstream: {
            mapSources: (root) => (root.sources ?? []).map((s) => ({
                url: s.url,
                type: inferSourceType(s.format, s.url),
                quality: s.name ?? "auto",
                provider: "VidNest",
                audioTracks: [{ language: "fr", label: "French" }],
                headers,
            })),
            mapSubtitles: () => [],
        },
    };

    const promises = SERVERS.map((server) => {
        const url = media.type === "movie"
            ? `${API_BASE}/${server.path}/movie/${media.tmdbId}${server.query}`
            : `${API_BASE}/${server.path}/tv/${media.tmdbId}/${media.season}/${media.episode}${server.query}`;
        return safeFetch(url, { headers })
            .then((res) => {
                if (!res.ok) return null;
                return res.json();
            })
            .then((data) => {
                if (!data) return null;
                return { server: server.path, data };
            })
            .catch(() => null);
    });

    const results = await Promise.allSettled(promises);
    const sources = [];
    const subtitles = [];

    for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const { server, data } = result.value;
        const handler = handlers[server];
        if (!handler) continue;
        try {
            const parsed = vidnestDecrypt(data.data);
            if (!parsed) continue;
            sources.push(...handler.mapSources(parsed).filter((s) => s.url));
            subtitles.push(...handler.mapSubtitles(parsed));
        } catch { }
    }

    return {
        sources: sources.filter((s) => isEnglishAudio(s.audioTracks)),
        subtitles,
    };
}

const videasyDecryptCache = new Map();

async function videasyDecryptBlob(blob, tmdbId) {
    if (!blob || blob.length < 10) return null;
    const cacheKey = `${tmdbId}:${blob.slice(0, 32)}`;
    if (videasyDecryptCache.has(cacheKey)) return videasyDecryptCache.get(cacheKey);
    try {
        const res = await safeFetch(PROVIDERS.videasy.DEC_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: blob, id: tmdbId }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (json.status !== 200 || !json.result?.sources) return null;
        const payload = { sources: json.result.sources ?? [], subtitles: json.result.subtitles ?? [] };
        videasyDecryptCache.set(cacheKey, payload);
        return payload;
    } catch {
        return null;
    }
}

async function fetchVideasy(media) {
    const { BASE, PLAYER } = PROVIDERS.videasy;
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, */*; q=0.01",
        Referer: PLAYER + "/",
        Origin: PLAYER,
    };

    const SERVERS = [
        { name: "cuevana", url: "https://api2.videasy.net/cuevana/sources-with-title", language: "english" },
        { name: "mb-flix", url: "https://api.videasy.net/mb-flix/sources-with-title", language: "english" },
        { name: "1movies", url: "https://api.videasy.net/1movies/sources-with-title", language: "english" },
        { name: "cdn", url: "https://api.videasy.net/cdn/sources-with-title", language: "english" },
        { name: "superflix", url: "https://api.videasy.net/superflix/sources-with-title", language: "english" },
        { name: "lamovie", url: "https://api.videasy.net/lamovie/sources-with-title", language: "english" },
    ];

    const buildParams = (server) => {
        const p = {
            title: media.title ?? "",
            mediaType: media.type === "movie" ? "movie" : "tv",
            tmdbId: String(media.tmdbId),
            imdbId: media.imdbId ?? "",
            episodeId: String(media.type === "tv" ? (media.episode ?? 1) : 1),
            seasonId: String(media.type === "tv" ? (media.season ?? 1) : 1),
        };
        if (media.type === "movie") p.year = String(media.releaseYear ?? "");
        if (server.language) p.language = server.language;
        return p;
    };

    const detectType = (url, hint) => {
        const lower = (hint ?? "").toLowerCase();
        if (lower.includes("hls") || lower.includes("m3u8") || url.toLowerCase().includes(".m3u8")) return "hls";
        return "mp4";
    };

    const normalizeQuality = (raw) => {
        if (!raw) return "unknown";
        return /^\d{3,4}p$|^4K$|^8K$|^HD$|^SD$/i.test(raw.trim()) ? raw.trim() : "unknown";
    };

    const resolveLanguage = (server) => {
        if (!server.language) return "en";
        const map = { german: "de", italian: "it", french: "fr" };
        return map[server.language] ?? "en";
    };

    const resolveLanguageLabel = (server) => {
        if (!server.language) return "English";
        const map = { german: "German", italian: "Italian", french: "French" };
        return map[server.language] ?? "English";
    };

    const results = await Promise.allSettled(SERVERS.map(async (server) => {
        const params = buildParams(server);
        const url = `${server.url}?${new URLSearchParams(params)}`;
        const res = await safeFetch(url, { headers });
        if (!res.ok) return null;
        const blob = await res.text();
        if (!blob || blob.length < 10) return null;
        const decrypted = await videasyDecryptBlob(blob, String(media.tmdbId));
        if (!decrypted || decrypted.sources.length === 0) return null;
        const sources = decrypted.sources
            .filter((s) => !!s?.url)
            .map((s) => ({
                url: s.url,
                type: detectType(s.url, s.type),
                quality: normalizeQuality(s.quality),
                provider: "Videasy",
                audioTracks: [{ language: resolveLanguage(server), label: resolveLanguageLabel(server) }],
                headers,
            }));
        const subtitles = decrypted.subtitles
            .filter((s) => !!s?.url)
            .map((s) => ({ url: s.url, label: s.lang ?? s.language ?? "Unknown", format: "vtt" }));
        return { sources, subtitles };
    }));

    const allSources = [];
    const allSubtitles = [];
    for (const r of results) {
        if (r.status !== "fulfilled" || !r.value) continue;
        allSources.push(...r.value.sources);
        allSubtitles.push(...r.value.subtitles);
    }
    if (allSources.length === 0) return { sources: [], subtitles: [] };
    return {
        sources: allSources.filter((s) => isEnglishAudio(s.audioTracks)),
        subtitles: allSubtitles,
    };
}

async function fetchPopr(media) {
    const { BASE } = PROVIDERS.popr;
    const headers = { "User-Agent": UA, Referer: `${BASE}/` };
    const servers = ["default", "catflix", "hexa", "Gama", "Liligoon", "Sigma", "Prime", "Alfa", "Lamda", "ynx_vidsrc"];
    const ep = media.episode ?? 1;
    const season = media.season ?? 1;

    const buildUrl = (server) => {
        if (media.type === "tv") {
            return `${BASE}/api/vidnest?id=${media.tmdbId}&type=tv&server=${server}&season=${season}&episode=${ep}`;
        }
        return `${BASE}/api/vidnest?id=${media.tmdbId}&type=movie` + (server !== "default" ? `&server=${server}` : "");
    };

    const requests = servers.map((server) =>
        safeFetch(buildUrl(server), { headers })
            .then(async (res) => {
                if (res.status !== 200) return null;
                const data = await res.json();
                const stream = data?.results?.[0]?.streams?.[0];
                if (!stream?.url) return null;
                const ext = (new URL(stream.url).pathname.match(/\.[^./]+$/) || [""])[0];
                const quality = stream.quality;
                const INVALID_QUALITIES = ["Hindi", "English", "MAIN"];
                const LANGUAGE_QUALITIES = ["Hindi", "English"];
                const isLang = LANGUAGE_QUALITIES.includes(quality);
                return {
                    source: {
                        url: stream.url,
                        type: ext === ".m3u8" ? "hls" : "mp4",
                        quality: INVALID_QUALITIES.includes(quality) ? "auto" : quality || "auto",
                        provider: "Popr",
                        audioTracks: [{
                            language: isLang ? quality.toLowerCase().slice(0, 3) : "eng",
                            label: isLang ? quality : "English",
                        }],
                        headers: stream.headers ?? headers,
                    },
                    subtitles: data.results?.[0]?.subtitles || [],
                };
            })
            .catch(() => null)
    );

    const results = await Promise.allSettled(requests);
    const sources = [];
    const subtitlesMap = new Map();

    for (const res of results) {
        if (res.status !== "fulfilled" || !res.value) continue;
        sources.push(res.value.source);
        for (const sub of res.value.subtitles) {
            if (!sub?.url) continue;
            if (!subtitlesMap.has(sub.url)) {
                subtitlesMap.set(sub.url, { url: sub.url, format: "vtt", label: sub.lang || "Unknown" });
            }
        }
    }

    return {
        sources: sources.filter((s) => isEnglishAudio(s.audioTracks)),
        subtitles: Array.from(subtitlesMap.values()),
    };
}

export async function scrape(mediaType, tmdbId, season = "1", episode = "1", options = {}) {
    const media = {
        type: mediaType === "tv" ? "tv" : "movie",
        tmdbId: String(tmdbId),
        season: String(season),
        episode: String(episode),
        title: options.title ?? "",
        imdbId: options.imdbId ?? "",
        releaseYear: options.releaseYear ?? "",
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
        fetchCineSu,
        fetchPeachify,
        fetchVidNest,
        fetchVideasy,
        fetchPopr,
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

    const finalSources = sortSources(allSources.filter((s) => s.url && isEnglishAudio(s.audioTracks)));
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
    fetchCineSu,
    fetchPeachify,
    fetchVidNest,
    fetchVideasy,
    fetchPopr,
    sortSources,
    filterEnglishSubtitles,
    isEnglishAudio,
};