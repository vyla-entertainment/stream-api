var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-q3R7BI/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// ../../.wrangler/tmp/pages-Z2qiqn/functionsWorker-0.5995164624471989.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var urls2 = /* @__PURE__ */ new Set();
function checkURL2(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls2.has(url.toString())) {
      urls2.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL2, "checkURL");
__name2(checkURL2, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL2(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
async function get(url, headers = {}) {
  return fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers }
  });
}
__name(get, "get");
__name2(get, "get");
async function getJson(url, headers = {}) {
  return (await get(url, headers)).json().catch(() => null);
}
__name(getJson, "getJson");
__name2(getJson, "getJson");
async function getText(url, headers = {}) {
  return (await get(url, headers)).text().catch(() => "");
}
__name(getText, "getText");
__name2(getText, "getText");
async function aesCbcDecrypt(keyBytes, ivBytes, cipherBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, key, cipherBytes);
  return new TextDecoder().decode(plain);
}
__name(aesCbcDecrypt, "aesCbcDecrypt");
__name2(aesCbcDecrypt, "aesCbcDecrypt");
async function aesCbcEncrypt(keyBytes, ivBytes, plainBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, key, plainBytes);
  return new Uint8Array(cipher);
}
__name(aesCbcEncrypt, "aesCbcEncrypt");
__name2(aesCbcEncrypt, "aesCbcEncrypt");
function b64ToBytes(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
__name(b64ToBytes, "b64ToBytes");
__name2(b64ToBytes, "b64ToBytes");
function bytesToB64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
__name(bytesToB64, "bytesToB64");
__name2(bytesToB64, "bytesToB64");
function pkcs7Pad(data, blockSize = 16) {
  const pad = blockSize - data.length % blockSize;
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  out.fill(pad, data.length);
  return out;
}
__name(pkcs7Pad, "pkcs7Pad");
__name2(pkcs7Pad, "pkcs7Pad");
function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}
__name(resolveUrl, "resolveUrl");
__name2(resolveUrl, "resolveUrl");
async function provider02Downloader(mediaType, tmdbId, season, episode) {
  const BASE = "https://02moviedownloader.site";
  const sources = [];
  try {
    const ref = mediaType === "movie" ? `${BASE}/api/download/movie/${tmdbId}` : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`;
    const tokRes = await fetch(`${BASE}/api/verify-robot`, {
      method: "POST",
      headers: { "User-Agent": UA, Referer: ref, Origin: BASE }
    });
    const tokData = await tokRes.json().catch(() => ({}));
    const token = tokData?.success && tokData?.token ? tokData.token : null;
    if (!token) return [];
    const apiUrl = mediaType === "movie" ? `${BASE}/api/download/movie/${tmdbId}` : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`;
    const data = await getJson(apiUrl, { "x-session-token": token, Origin: BASE, Referer: BASE });
    if (!data) return [];
    for (const d of data?.data?.downloadData?.data?.downloads ?? []) {
      if (d?.url) sources.push({ url: d.url, quality: `${d.resolution}p`, type: "mp4", provider: "02MovieDownloader" });
    }
    for (const s of data?.externalStreams ?? []) {
      const u = s?.url ?? "";
      if (u && !u.includes("111477.xyz")) {
        sources.push({ url: u, quality: s.quality ?? "Unknown", type: u.includes(".mkv") ? "mkv" : "mp4", provider: "02MovieDownloader" });
      }
    }
  } catch {
  }
  return sources;
}
__name(provider02Downloader, "provider02Downloader");
__name2(provider02Downloader, "provider02Downloader");
async function providerRgShows(mediaType, tmdbId, season, episode) {
  const BASE = "https://api.rgshows.ru/main";
  try {
    const url = mediaType === "movie" ? `${BASE}/movie/${tmdbId}` : `${BASE}/tv/${tmdbId}/${season}/${episode}`;
    const data = await getJson(url, { Origin: "https://www.rgshows.ru", Referer: "https://www.rgshows.ru" });
    if (data?.stream?.url) {
      return [{ url: data.stream.url, quality: "1080p", type: "mp4", provider: "RgShows" }];
    }
  } catch {
  }
  return [];
}
__name(providerRgShows, "providerRgShows");
__name2(providerRgShows, "providerRgShows");
async function providerUembed(mediaType, tmdbId, season, episode) {
  const sources = [];
  const hollyParams = mediaType === "movie" ? `id=${tmdbId}&token=thestupidthings&type=movie` : `id=${tmdbId}&token=thestupidthings&type=series&season=${season}&episode=${episode}`;
  const apis = [
    `https://uembed.xyz/api/video/tmdb?id=${tmdbId}`,
    ...mediaType === "movie" ? [`https://cdn.madplay.site/vxr?id=${tmdbId}&type=movie`] : [],
    `https://api.madplay.site/api/movies/holly?${hollyParams}`,
    `https://api.madplay.site/api/rogflix?${hollyParams}`
  ];
  for (const api of apis) {
    try {
      const data = await getJson(api, { Origin: "https://madplay.site", Referer: "https://madplay.site" });
      if (Array.isArray(data)) {
        for (const stream of data) {
          if (stream?.file) sources.push({ url: stream.file, quality: "Auto", type: "hls", provider: "Uembed" });
        }
        if (sources.length) break;
      }
    } catch {
    }
  }
  return sources;
}
__name(providerUembed, "providerUembed");
__name2(providerUembed, "providerUembed");
async function providerVidRock(mediaType, tmdbId, season, episode) {
  const BASE = "https://vidrock.net/";
  const sources = [];
  try {
    const itemId = mediaType === "movie" ? String(tmdbId) : `${tmdbId}_${season}_${episode}`;
    const passphrase = new TextEncoder().encode("x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9");
    const iv = passphrase.slice(0, 16);
    const padded = pkcs7Pad(new TextEncoder().encode(itemId));
    const encrypted = await aesCbcEncrypt(passphrase, iv, padded);
    const b64 = bytesToB64(encrypted).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const url = `${BASE}api/${mediaType}/${b64}`;
    const data = await getJson(url, { Referer: BASE, Origin: BASE });
    if (!data || typeof data !== "object") return [];
    for (const [, stream] of Object.entries(data)) {
      if (!stream?.url) continue;
      if (stream.url.includes("hls2.vdrk.site")) {
        const list = await getJson(stream.url);
        if (Array.isArray(list)) {
          for (const obj of list) {
            let fUrl = obj.url;
            if (fUrl?.startsWith("https://proxy.vidrock.store/")) {
              fUrl = decodeURIComponent(fUrl.replace("https://proxy.vidrock.store/", "")).replace(/^\//, "");
            }
            if (fUrl) sources.push({ url: fUrl, quality: `${obj.resolution ?? 1080}p`, type: fUrl.includes(".mp4") ? "mp4" : "hls", provider: "VidRock" });
          }
        }
      } else {
        sources.push({ url: stream.url, quality: "1080p", type: "hls", provider: "VidRock" });
      }
    }
  } catch {
  }
  return sources;
}
__name(providerVidRock, "providerVidRock");
__name2(providerVidRock, "providerVidRock");
async function providerVidSrc(mediaType, tmdbId, season, episode) {
  const BASE = "https://vsembed.ru";
  const sources = [];
  try {
    const pageUrl = mediaType === "movie" ? `${BASE}/embed/movie?tmdb=${tmdbId}` : `${BASE}/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`;
    const html1 = await getText(pageUrl);
    const iframeMatch = html1.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i);
    if (!iframeMatch) return [];
    let secUrl = iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1];
    const html2 = await getText(secUrl, { Referer: pageUrl });
    const srcMatch = html2.match(/src:\s*['"]([^'"]+)['"]/i);
    if (!srcMatch) return [];
    const thirdUrl = resolveUrl(secUrl, srcMatch[1]);
    const html3 = await getText(thirdUrl, { Referer: secUrl });
    const fileMatch = html3.match(/file\s*:\s*["']([^"']+)["']/i);
    if (!fileMatch) return [];
    const rawUrls = fileMatch[1].split(/\s+or\s+/i);
    const domains = { "{v1}": "neonhorizonworkshops.com", "{v2}": "wanderlynest.com", "{v3}": "orchidpixelgardens.com", "{v4}": "cloudnestra.com" };
    for (let tpl of rawUrls) {
      for (const [k, v] of Object.entries(domains)) tpl = tpl.replaceAll(k, v);
      if (!tpl.includes("{")) sources.push({ url: tpl, quality: "HD", type: "hls", provider: "VidSrc" });
    }
  } catch {
  }
  return sources;
}
__name(providerVidSrc, "providerVidSrc");
__name2(providerVidSrc, "providerVidSrc");
async function providerVidZee(mediaType, tmdbId, season, episode) {
  const BASE = "https://player.vidzee.wtf";
  const sources = [];
  async function decryptLink(linkB64) {
    try {
      const raw = atob(linkB64);
      const [ivB64, cipherB64] = raw.split(":");
      const iv = b64ToBytes(ivB64);
      const cipher = b64ToBytes(cipherB64);
      const keyStr = atob("YWxvb2tlcGFyYXRoZXdpdGhsYXNzaQ==").padEnd(32, "\0");
      const keyBytes = new TextEncoder().encode(keyStr);
      const decrypted = await aesCbcDecrypt(keyBytes, iv, cipher);
      return decrypted.replace(/\0/g, "").trim();
    } catch {
      return null;
    }
  }
  __name(decryptLink, "decryptLink");
  __name2(decryptLink, "decryptLink");
  async function fetchServer(sr) {
    const url = `${BASE}/api/server?id=${tmdbId}&sr=${sr}` + (mediaType === "tv" ? `&ss=${season}&ep=${episode}` : "");
    try {
      return await getJson(url, { Referer: BASE });
    } catch {
      return null;
    }
  }
  __name(fetchServer, "fetchServer");
  __name2(fetchServer, "fetchServer");
  const results = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => fetchServer(i + 1)));
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value?.url) continue;
    for (const stream of r.value.url) {
      const dec = await decryptLink(stream?.link ?? "");
      if (dec?.startsWith("http")) sources.push({ url: dec, quality: "Auto", type: "hls", provider: "VidZee" });
    }
  }
  return sources;
}
__name(providerVidZee, "providerVidZee");
__name2(providerVidZee, "providerVidZee");
async function providerVixSrc(mediaType, tmdbId, season, episode) {
  const BASE = "https://vixsrc.to";
  try {
    const url = mediaType === "movie" ? `${BASE}/movie/${tmdbId}` : `${BASE}/tv/${tmdbId}/${season}/${episode}`;
    const html = await getText(url, { Referer: BASE });
    const t = html.match(/token['"]\s*:\s*['"]([^'"]+)/)?.[1];
    const e = html.match(/expires['"]\s*:\s*['"]([^'"]+)/)?.[1];
    const p = html.match(/url\s*:\s*['"]([^'"]+)/)?.[1];
    if (t && e && p && parseInt(e) * 1e3 - 6e4 > Date.now()) {
      const sep = p.includes("?") ? "&" : "?";
      return [{ url: `${p}${sep}token=${t}&expires=${e}&h=1`, quality: "1080p", type: "hls", provider: "VixSrc" }];
    }
  } catch {
  }
  return [];
}
__name(providerVixSrc, "providerVixSrc");
__name2(providerVixSrc, "providerVixSrc");
async function encryptUrl(url, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)), { name: "AES-CBC" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(url));
  const combined = new Uint8Array(16 + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), 16);
  return btoa(String.fromCharCode(...combined)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(encryptUrl, "encryptUrl");
__name2(encryptUrl, "encryptUrl");
async function scrapeStream(mediaType, tmdbId, season = "1", episode = "1", origin = "", secret = "", onSource) {
  const seen = /* @__PURE__ */ new Set();
  async function handleSource(s) {
    if (!s?.url || seen.has(s.url)) return;
    seen.add(s.url);
    try {
      const res = await fetch(s.url, {
        method: "HEAD",
        headers: { "User-Agent": UA, Referer: "https://google.com" },
        redirect: "follow"
      });
      if (![200, 206, 302].includes(res.status)) return;
      let out = { ...s };
      if (origin && secret) {
        out.url = `${origin}/proxy?t=${await encryptUrl(s.url, secret)}`;
      }
      await onSource(out);
    } catch {
    }
  }
  __name(handleSource, "handleSource");
  __name2(handleSource, "handleSource");
  const providers = [
    provider02Downloader(mediaType, tmdbId, season, episode),
    providerRgShows(mediaType, tmdbId, season, episode),
    providerUembed(mediaType, tmdbId, season, episode),
    providerVidRock(mediaType, tmdbId, season, episode),
    providerVidSrc(mediaType, tmdbId, season, episode),
    providerVidZee(mediaType, tmdbId, season, episode),
    providerVixSrc(mediaType, tmdbId, season, episode)
  ];
  await Promise.allSettled(
    providers.map(async (p) => {
      const sources = await p;
      await Promise.allSettled(sources.map(handleSource));
    })
  );
}
__name(scrapeStream, "scrapeStream");
__name2(scrapeStream, "scrapeStream");
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};
async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
__name(onRequestOptions, "onRequestOptions");
__name2(onRequestOptions, "onRequestOptions");
async function onRequestGet({ request, env }) {
  const { searchParams, origin } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400, headers: CORS });
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  (async () => {
    await scrapeStream("movie", id, "1", "1", origin, env.PROXY_SECRET ?? "", async (source) => {
      await writer.write(enc.encode(JSON.stringify(source) + "\n"));
    });
    await writer.close();
  })();
  return new Response(readable, {
    headers: {
      ...CORS,
      "Content-Type": "application/x-ndjson",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache"
    }
  });
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
var CORS2 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};
async function onRequestOptions2() {
  return new Response(null, { status: 204, headers: CORS2 });
}
__name(onRequestOptions2, "onRequestOptions2");
__name2(onRequestOptions2, "onRequestOptions");
async function onRequestGet2({ request, env }) {
  const { searchParams, origin } = new URL(request.url);
  const id = searchParams.get("id");
  const season = searchParams.get("season") ?? "1";
  const episode = searchParams.get("episode") ?? "1";
  if (!id) return Response.json({ error: "Missing id" }, { status: 400, headers: CORS2 });
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  (async () => {
    await scrapeStream("tv", id, season, episode, origin, env.PROXY_SECRET ?? "", async (source) => {
      await writer.write(enc.encode(JSON.stringify(source) + "\n"));
    });
    await writer.close();
  })();
  return new Response(readable, {
    headers: {
      ...CORS2,
      "Content-Type": "application/x-ndjson",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache"
    }
  });
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
var UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
async function get2(url, headers = {}) {
  return fetch(url, {
    headers: { "User-Agent": UA2, "Accept-Language": "en-US,en;q=0.9", ...headers }
  });
}
__name(get2, "get2");
__name2(get2, "get");
async function getJson2(url, headers = {}) {
  return (await get2(url, headers)).json().catch(() => null);
}
__name(getJson2, "getJson2");
__name2(getJson2, "getJson");
async function getText2(url, headers = {}) {
  return (await get2(url, headers)).text().catch(() => "");
}
__name(getText2, "getText2");
__name2(getText2, "getText");
async function aesCbcDecrypt2(keyBytes, ivBytes, cipherBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, key, cipherBytes);
  return new TextDecoder().decode(plain);
}
__name(aesCbcDecrypt2, "aesCbcDecrypt2");
__name2(aesCbcDecrypt2, "aesCbcDecrypt");
async function aesCbcEncrypt2(keyBytes, ivBytes, plainBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, key, plainBytes);
  return new Uint8Array(cipher);
}
__name(aesCbcEncrypt2, "aesCbcEncrypt2");
__name2(aesCbcEncrypt2, "aesCbcEncrypt");
function b64ToBytes2(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
__name(b64ToBytes2, "b64ToBytes2");
__name2(b64ToBytes2, "b64ToBytes");
function bytesToB642(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
__name(bytesToB642, "bytesToB642");
__name2(bytesToB642, "bytesToB64");
function pkcs7Pad2(data, blockSize = 16) {
  const pad = blockSize - data.length % blockSize;
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  out.fill(pad, data.length);
  return out;
}
__name(pkcs7Pad2, "pkcs7Pad2");
__name2(pkcs7Pad2, "pkcs7Pad");
function resolveUrl2(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}
__name(resolveUrl2, "resolveUrl2");
__name2(resolveUrl2, "resolveUrl");
async function provider02Downloader2(mediaType, tmdbId, season, episode) {
  const BASE = "https://02moviedownloader.site";
  const sources = [];
  try {
    const ref = mediaType === "movie" ? `${BASE}/api/download/movie/${tmdbId}` : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`;
    const tokRes = await fetch(`${BASE}/api/verify-robot`, {
      method: "POST",
      headers: { "User-Agent": UA2, Referer: ref, Origin: BASE }
    });
    const tokData = await tokRes.json().catch(() => ({}));
    const token = tokData?.success && tokData?.token ? tokData.token : null;
    if (!token) return [];
    const apiUrl = mediaType === "movie" ? `${BASE}/api/download/movie/${tmdbId}` : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`;
    const data = await getJson2(apiUrl, { "x-session-token": token, Origin: BASE, Referer: BASE });
    if (!data) return [];
    for (const d of data?.data?.downloadData?.data?.downloads ?? []) {
      if (d?.url) sources.push({ url: d.url, quality: `${d.resolution}p`, type: "mp4", provider: "02MovieDownloader" });
    }
    for (const s of data?.externalStreams ?? []) {
      const u = s?.url ?? "";
      if (u && !u.includes("111477.xyz")) {
        sources.push({ url: u, quality: s.quality ?? "Unknown", type: u.includes(".mkv") ? "mkv" : "mp4", provider: "02MovieDownloader" });
      }
    }
  } catch {
  }
  return sources;
}
__name(provider02Downloader2, "provider02Downloader2");
__name2(provider02Downloader2, "provider02Downloader");
async function providerRgShows2(mediaType, tmdbId, season, episode) {
  const BASE = "https://api.rgshows.ru/main";
  try {
    const url = mediaType === "movie" ? `${BASE}/movie/${tmdbId}` : `${BASE}/tv/${tmdbId}/${season}/${episode}`;
    const data = await getJson2(url, { Origin: "https://www.rgshows.ru", Referer: "https://www.rgshows.ru" });
    if (data?.stream?.url) {
      return [{ url: data.stream.url, quality: "1080p", type: "mp4", provider: "RgShows" }];
    }
  } catch {
  }
  return [];
}
__name(providerRgShows2, "providerRgShows2");
__name2(providerRgShows2, "providerRgShows");
async function providerUembed2(mediaType, tmdbId, season, episode) {
  const sources = [];
  const hollyParams = mediaType === "movie" ? `id=${tmdbId}&token=thestupidthings&type=movie` : `id=${tmdbId}&token=thestupidthings&type=series&season=${season}&episode=${episode}`;
  const apis = [
    `https://uembed.xyz/api/video/tmdb?id=${tmdbId}`,
    ...mediaType === "movie" ? [`https://cdn.madplay.site/vxr?id=${tmdbId}&type=movie`] : [],
    `https://api.madplay.site/api/movies/holly?${hollyParams}`,
    `https://api.madplay.site/api/rogflix?${hollyParams}`
  ];
  for (const api of apis) {
    try {
      const data = await getJson2(api, { Origin: "https://madplay.site", Referer: "https://madplay.site" });
      if (Array.isArray(data)) {
        for (const stream of data) {
          if (stream?.file) sources.push({ url: stream.file, quality: "Auto", type: "hls", provider: "Uembed" });
        }
        if (sources.length) break;
      }
    } catch {
    }
  }
  return sources;
}
__name(providerUembed2, "providerUembed2");
__name2(providerUembed2, "providerUembed");
async function providerVidRock2(mediaType, tmdbId, season, episode) {
  const BASE = "https://vidrock.net/";
  const sources = [];
  try {
    const itemId = mediaType === "movie" ? String(tmdbId) : `${tmdbId}_${season}_${episode}`;
    const passphrase = new TextEncoder().encode("x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9");
    const iv = passphrase.slice(0, 16);
    const padded = pkcs7Pad2(new TextEncoder().encode(itemId));
    const encrypted = await aesCbcEncrypt2(passphrase, iv, padded);
    const b64 = bytesToB642(encrypted).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const url = `${BASE}api/${mediaType}/${b64}`;
    const data = await getJson2(url, { Referer: BASE, Origin: BASE });
    if (!data || typeof data !== "object") return [];
    for (const [, stream] of Object.entries(data)) {
      if (!stream?.url) continue;
      if (stream.url.includes("hls2.vdrk.site")) {
        const list = await getJson2(stream.url);
        if (Array.isArray(list)) {
          for (const obj of list) {
            let fUrl = obj.url;
            if (fUrl?.startsWith("https://proxy.vidrock.store/")) {
              fUrl = decodeURIComponent(fUrl.replace("https://proxy.vidrock.store/", "")).replace(/^\//, "");
            }
            if (fUrl) sources.push({ url: fUrl, quality: `${obj.resolution ?? 1080}p`, type: fUrl.includes(".mp4") ? "mp4" : "hls", provider: "VidRock" });
          }
        }
      } else {
        sources.push({ url: stream.url, quality: "1080p", type: "hls", provider: "VidRock" });
      }
    }
  } catch {
  }
  return sources;
}
__name(providerVidRock2, "providerVidRock2");
__name2(providerVidRock2, "providerVidRock");
async function providerVidSrc2(mediaType, tmdbId, season, episode) {
  const BASE = "https://vsembed.ru";
  const sources = [];
  try {
    const pageUrl = mediaType === "movie" ? `${BASE}/embed/movie?tmdb=${tmdbId}` : `${BASE}/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`;
    const html1 = await getText2(pageUrl);
    const iframeMatch = html1.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i);
    if (!iframeMatch) return [];
    let secUrl = iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1];
    const html2 = await getText2(secUrl, { Referer: pageUrl });
    const srcMatch = html2.match(/src:\s*['"]([^'"]+)['"]/i);
    if (!srcMatch) return [];
    const thirdUrl = resolveUrl2(secUrl, srcMatch[1]);
    const html3 = await getText2(thirdUrl, { Referer: secUrl });
    const fileMatch = html3.match(/file\s*:\s*["']([^"']+)["']/i);
    if (!fileMatch) return [];
    const rawUrls = fileMatch[1].split(/\s+or\s+/i);
    const domains = { "{v1}": "neonhorizonworkshops.com", "{v2}": "wanderlynest.com", "{v3}": "orchidpixelgardens.com", "{v4}": "cloudnestra.com" };
    for (let tpl of rawUrls) {
      for (const [k, v] of Object.entries(domains)) tpl = tpl.replaceAll(k, v);
      if (!tpl.includes("{")) sources.push({ url: tpl, quality: "HD", type: "hls", provider: "VidSrc" });
    }
  } catch {
  }
  return sources;
}
__name(providerVidSrc2, "providerVidSrc2");
__name2(providerVidSrc2, "providerVidSrc");
async function providerVidZee2(mediaType, tmdbId, season, episode) {
  const BASE = "https://player.vidzee.wtf";
  const sources = [];
  async function decryptLink(linkB64) {
    try {
      const raw = atob(linkB64);
      const [ivB64, cipherB64] = raw.split(":");
      const iv = b64ToBytes2(ivB64);
      const cipher = b64ToBytes2(cipherB64);
      const keyStr = atob("YWxvb2tlcGFyYXRoZXdpdGhsYXNzaQ==").padEnd(32, "\0");
      const keyBytes = new TextEncoder().encode(keyStr);
      const decrypted = await aesCbcDecrypt2(keyBytes, iv, cipher);
      return decrypted.replace(/\0/g, "").trim();
    } catch {
      return null;
    }
  }
  __name(decryptLink, "decryptLink");
  __name2(decryptLink, "decryptLink");
  async function fetchServer(sr) {
    const url = `${BASE}/api/server?id=${tmdbId}&sr=${sr}` + (mediaType === "tv" ? `&ss=${season}&ep=${episode}` : "");
    try {
      return await getJson2(url, { Referer: BASE });
    } catch {
      return null;
    }
  }
  __name(fetchServer, "fetchServer");
  __name2(fetchServer, "fetchServer");
  const results = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => fetchServer(i + 1)));
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value?.url) continue;
    for (const stream of r.value.url) {
      const dec = await decryptLink(stream?.link ?? "");
      if (dec?.startsWith("http")) sources.push({ url: dec, quality: "Auto", type: "hls", provider: "VidZee" });
    }
  }
  return sources;
}
__name(providerVidZee2, "providerVidZee2");
__name2(providerVidZee2, "providerVidZee");
async function providerVixSrc2(mediaType, tmdbId, season, episode) {
  const BASE = "https://vixsrc.to";
  try {
    const url = mediaType === "movie" ? `${BASE}/movie/${tmdbId}` : `${BASE}/tv/${tmdbId}/${season}/${episode}`;
    const html = await getText2(url, { Referer: BASE });
    const t = html.match(/token['"]\s*:\s*['"]([^'"]+)/)?.[1];
    const e = html.match(/expires['"]\s*:\s*['"]([^'"]+)/)?.[1];
    const p = html.match(/url\s*:\s*['"]([^'"]+)/)?.[1];
    if (t && e && p && parseInt(e) * 1e3 - 6e4 > Date.now()) {
      const sep = p.includes("?") ? "&" : "?";
      return [{ url: `${p}${sep}token=${t}&expires=${e}&h=1`, quality: "1080p", type: "hls", provider: "VixSrc" }];
    }
  } catch {
  }
  return [];
}
__name(providerVixSrc2, "providerVixSrc2");
__name2(providerVixSrc2, "providerVixSrc");
async function verifySources(sources) {
  const seen = /* @__PURE__ */ new Set();
  const unique = sources.filter((s) => {
    if (!s?.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  const results = await Promise.allSettled(
    unique.map(async (s) => {
      try {
        const res = await fetch(s.url, {
          method: "HEAD",
          headers: { "User-Agent": UA2, Referer: "https://google.com" },
          redirect: "follow"
        });
        return [200, 206, 302].includes(res.status) ? s : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
}
__name(verifySources, "verifySources");
__name2(verifySources, "verifySources");
async function encryptUrl2(url, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)), { name: "AES-CBC" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(url));
  const combined = new Uint8Array(16 + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), 16);
  return btoa(String.fromCharCode(...combined)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(encryptUrl2, "encryptUrl2");
__name2(encryptUrl2, "encryptUrl");
async function scrape(mediaType, tmdbId, season = "1", episode = "1", origin = "", secret = "") {
  const settled = await Promise.allSettled([
    provider02Downloader2(mediaType, tmdbId, season, episode),
    providerRgShows2(mediaType, tmdbId, season, episode),
    providerUembed2(mediaType, tmdbId, season, episode),
    providerVidRock2(mediaType, tmdbId, season, episode),
    providerVidSrc2(mediaType, tmdbId, season, episode),
    providerVidZee2(mediaType, tmdbId, season, episode),
    providerVixSrc2(mediaType, tmdbId, season, episode)
  ]);
  const all = settled.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  const verified = await verifySources(all);
  if (!origin || !secret) return verified;
  const mapped = await Promise.all(verified.map(async (s) => ({ ...s, url: `${origin}/proxy?t=${await encryptUrl2(s.url, secret)}` })));
  return mapped;
}
__name(scrape, "scrape");
__name2(scrape, "scrape");
var CORS3 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};
async function onRequestOptions3() {
  return new Response(null, { status: 204, headers: CORS3 });
}
__name(onRequestOptions3, "onRequestOptions3");
__name2(onRequestOptions3, "onRequestOptions");
async function onRequestGet3({ request, env }) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ success: false, error: "Missing required query param: id" }, { status: 400, headers: CORS3 });
  const { origin } = new URL(request.url);
  const sources = await scrape("movie", id, "1", "1", origin, env.PROXY_SECRET ?? "");
  return Response.json({ success: sources.length > 0, results_found: sources.length, sources }, { headers: CORS3 });
}
__name(onRequestGet3, "onRequestGet3");
__name2(onRequestGet3, "onRequestGet");
var CORS4 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};
async function onRequestOptions4() {
  return new Response(null, { status: 204, headers: CORS4 });
}
__name(onRequestOptions4, "onRequestOptions4");
__name2(onRequestOptions4, "onRequestOptions");
async function onRequestGet4({ request, env }) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const season = searchParams.get("season") ?? "1";
  const episode = searchParams.get("episode") ?? "1";
  if (!id) return Response.json({ success: false, error: "Missing required query param: id" }, { status: 400, headers: CORS4 });
  const { origin } = new URL(request.url);
  const sources = await scrape("tv", id, season, episode, origin, env.PROXY_SECRET ?? "");
  return Response.json({ success: sources.length > 0, results_found: sources.length, sources }, { headers: CORS4 });
}
__name(onRequestGet4, "onRequestGet4");
__name2(onRequestGet4, "onRequestGet");
var CORS5 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};
async function decryptToken(token, secret) {
  const raw = Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 16);
  const cipher = raw.slice(16);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)),
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}
__name(decryptToken, "decryptToken");
__name2(decryptToken, "decryptToken");
async function encryptUrl3(url, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)),
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(url));
  const combined = new Uint8Array(16 + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), 16);
  return btoa(String.fromCharCode(...combined)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(encryptUrl3, "encryptUrl3");
__name2(encryptUrl3, "encryptUrl");
async function onRequestOptions5() {
  return new Response(null, { status: 204, headers: CORS5 });
}
__name(onRequestOptions5, "onRequestOptions5");
__name2(onRequestOptions5, "onRequestOptions");
async function onRequestGet5({ request, env }) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("t");
  const secret = env.PROXY_SECRET;
  if (!token) return new Response("Bad request", { status: 400, headers: CORS5 });
  if (!secret) return new Response("Server misconfigured", { status: 500, headers: CORS5 });
  let url;
  try {
    url = await decryptToken(token, secret);
  } catch {
    return new Response("Invalid token", { status: 403, headers: CORS5 });
  }
  const upHeaders = { "User-Agent": "Mozilla/5.0", Referer: "https://google.com" };
  const range = request.headers.get("range");
  if (range) upHeaders["Range"] = range;
  try {
    const upstream = await fetch(url, { headers: upHeaders });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (contentType.includes("mpegurl") || url.endsWith(".m3u8")) {
      const text = await upstream.text();
      let rewritten = text.replace(/URI="([^"]+)"/g, async (_, u) => {
        const abs = new URL(u, url).href;
        return `URI="${origin}/proxy?t=${await encryptUrl3(abs, secret)}"`;
      });
      const lines = text.split("\n");
      const rewrittenLines = await Promise.all(
        lines.map(async (line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            const abs = new URL(trimmed, url).href;
            return `${origin}/proxy?t=${await encryptUrl3(abs, secret)}`;
          }
          return line;
        })
      );
      let manifest = rewrittenLines.join("\n");
      manifest = await (async () => {
        const uriMatches = [...manifest.matchAll(/URI="([^"]+)"/g)];
        for (const match2 of uriMatches) {
          const abs = new URL(match2[1], url).href;
          const enc = await encryptUrl3(abs, secret);
          manifest = manifest.replace(match2[0], `URI="${origin}/proxy?t=${enc}"`);
        }
        return manifest;
      })();
      return new Response(manifest, {
        status: upstream.status,
        headers: { ...CORS5, "content-type": contentType }
      });
    }
    const respHeaders = { ...CORS5 };
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const val = upstream.headers.get(key);
      if (val) respHeaders[key] = val;
    }
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502, headers: CORS5 });
  }
}
__name(onRequestGet5, "onRequestGet5");
__name2(onRequestGet5, "onRequestGet");
async function onRequestGet6() {
  return Response.json({
    status: "ok",
    service: "vyla-api",
    endpoints: {
      movie: "/api/movie?id=<tmdb_id>",
      tv: "/api/tv?id=<tmdb_id>&season=<s>&episode=<e>",
      stream_movie: "/api/stream/movie?id=<tmdb_id>",
      stream_tv: "/api/stream/tv?id=<tmdb_id>&season=<s>&episode=<e>",
      proxy: "/proxy?t=<encrypted_token>",
      player: "/player?type=movie&id=<tmdb_id>"
    }
  });
}
__name(onRequestGet6, "onRequestGet6");
__name2(onRequestGet6, "onRequestGet");
var routes = [
  {
    routePath: "/api/stream/movie",
    mountPath: "/api/stream",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/stream/movie",
    mountPath: "/api/stream",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/stream/tv",
    mountPath: "/api/stream",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/stream/tv",
    mountPath: "/api/stream",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/movie",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/movie",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/api/tv",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/tv",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/proxy",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/proxy",
    mountPath: "/",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions5]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../AppData/Local/nvm/v20.19.4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../AppData/Local/nvm/v20.19.4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-q3R7BI/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../AppData/Local/nvm/v20.19.4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-q3R7BI/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.5995164624471989.js.map
