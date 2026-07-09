import { fetchText, USER_AGENT } from '../utils/source_helpers.js';

const BASE_URL = 'https://vixsrc.to';

const HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL
};

function extract(regex, text) {
    const m = text?.match(regex);
    if (!m) return null;
    return m[1].replace(/\\/g, '');
}

export async function getStream({ id, s, e, absoluteBase }) {
    try {
        const apiUrl = s && e
            ? `${BASE_URL}/api/tv/${id}/${s}/${e}`
            : `${BASE_URL}/api/movie/${id}`;

        const apiProxy = absoluteBase
            ? `${absoluteBase.replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1')}/api?url=${encodeURIComponent(apiUrl)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`
            : apiUrl;

        const apiText = await fetchText(apiProxy).catch(() => null);
        const apiData = JSON.parse(apiText || '{}');
        if (!apiData.src) return null;

        const embedUrl = apiData.src.startsWith('http') ? apiData.src : `${BASE_URL}${apiData.src}`;
        const embedProxy = absoluteBase
            ? `${absoluteBase.replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1')}/api?url=${encodeURIComponent(embedUrl)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`
            : embedUrl;

        const html = await fetchText(embedProxy).catch(() => null);
        if (!html) return null;

        const token = extract(/token["']\s*:\s*["']([^"']+)/, html);
        const expires = extract(/expires["']\s*:\s*["']([^"']+)/, html);
        let playlist = extract(/url["']\s*:\s*["']([^"']+)/, html);
        if (!token || !expires || !playlist) return null;

        playlist = playlist.replace(/\\/g, '');
        const lang = extract(/lang(?:uage)?["']\s*:\s*["']([a-z]{2,5})/i, html) || 'en';
        const rawMasterUrl = `${playlist}${playlist.includes('?') ? '&' : '?'}token=${token}&expires=${expires}&h=1&lang=${lang}`;

        const masterProxy = absoluteBase
            ? `${absoluteBase.replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1')}/api?url=${encodeURIComponent(rawMasterUrl)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`
            : rawMasterUrl;

        const playlistText = await fetchText(rawMasterUrl, { headers: HEADERS }).catch(() => null);
        if (!playlistText?.includes('#EXTM3U')) return null;

        let finalUrl = null;
        let bestHeight = 0;
        const lines = playlistText.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
            const height = parseInt(line.match(/RESOLUTION=\d+x(\d+)/)?.[1] || '0', 10);
            let next = lines[i + 1]?.trim();
            if (!next || next.startsWith('#')) continue;

            if (height > bestHeight) {
                bestHeight = height;
                finalUrl = next;
            }
        }

        if (!finalUrl) finalUrl = rawMasterUrl;

        if (!finalUrl.startsWith('http')) {
            const base = rawMasterUrl.split('/playlist/')[0];
            finalUrl = finalUrl.startsWith('/') ? `${base}${finalUrl}` : `${base}/${finalUrl}`;
        }

        const alreadyProxied = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\?url=/.test(finalUrl);

        return {
            allUrls: [
                {
                    url: finalUrl,
                    skipProxy: alreadyProxied,
                    headers: {
                        ...HEADERS,
                        'Referer': `${BASE_URL}/`
                    }
                }
            ]
        };
    } catch (err) {
        return null;
    }
}