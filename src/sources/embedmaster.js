export const SKIP_VERIFY = true;
export const MULTI_URL = true;

export const SERVERS = [
    { name: 'Premium Nepu 🔥' },
    { name: 'Premium Movies4U' },
    { name: 'Premium YesMovies' },
    { name: 'Premium Prime' },
    { name: 'Premium MovieLand' },
    { name: 'Premium SuperFlix' },
    { name: 'Premium Rido' }
];

const streamCache = new Map();

async function resolveIframe(source, watchUrl, cookies) {
    try {
        const srcRes = await fetch('https://embdmstrplayer.com/play/' + source.source_url, {
            headers: { 'Referer': watchUrl, 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const srcHtml = await srcRes.text();

        const iframeMatch = srcHtml.match(/<iframe[^>]+src=['"]([^'"]*player_directplayer\.php[^'"]*)['"]/i);
        if (!iframeMatch) return null;

        let iframeSrc = iframeMatch[1];
        if (iframeSrc.startsWith('/')) iframeSrc = 'https://embdmstrplayer.com' + iframeSrc;

        const dpRes = await fetch(iframeSrc, {
            headers: { 'Referer': 'https://embdmstrplayer.com/play/' + source.source_url, 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const dpHtml = await dpRes.text();
        const fileMatch = dpHtml.match(/file:\s*(['"])(.*?\.m3u8.*?)\1/);

        if (fileMatch) {
            return {
                url: fileMatch[2],
                headers: {
                    'Referer': 'https://embdmstrplayer.com/',
                    'Origin': 'https://embdmstrplayer.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
                }
            };
        }
    } catch (e) { }
    return null;
}

async function getEmbedMasterData(tmdbId, season, episode) {
    const cacheKey = `${tmdbId}_${season || ''}_${episode || ''}`;
    if (streamCache.has(cacheKey)) return streamCache.get(cacheKey);

    try {
        const mediaType = season ? 'tv' : 'movie';
        let url = `https://embedmaster.link/${mediaType}/${tmdbId}`;
        if (season) url += `/${season}/${episode}`;

        let res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        const rawCookies = res.headers.get('set-cookie') || '';
        const cookies = rawCookies.split(',').map(c => c.split(';')[0]).join('; ');
        const finalUrl = res.url;
        let html = await res.text();

        const watchId = html.match(/action="\/watch\/([^"]+)"/)?.[1];
        if (!watchId) return null;

        const bodyParams = new URLSearchParams();
        const inputRegex = /<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g;
        let match;
        while ((match = inputRegex.exec(html)) !== null) {
            bodyParams.append(match[1], match[2]);
        }

        const watchUrl = 'https://embdmstrplayer.com/watch/' + watchId;
        let watchRes = await fetch(watchUrl, {
            method: 'POST',
            headers: {
                'Referer': finalUrl,
                'Cookie': cookies,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://embdmstrplayer.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            body: bodyParams.toString()
        });

        let watchHtml = await watchRes.text();
        const token = watchHtml.match(/var\s+token\s*=\s*'([^']+)'/)?.[1];
        if (!token) return null;

        const apiUrl = 'https://embdmstr.scrapemaster.net/api/sources/' + token;
        const apiRes = await fetch(apiUrl, {
            headers: { 'Referer': watchUrl, 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const reader = apiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const sources = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.source_name && obj.source_name.includes('Premium')) {
                        sources.push(obj);
                    }
                } catch (e) { }
            }
        }

        if (sources.length > 0) {
            const data = { watchUrl, cookies, sources };
            streamCache.set(cacheKey, data);
            return data;
        }
    } catch (err) { }
    return null;
}

export async function getSources(args) {
    const { id, s, e } = args;
    const data = await getEmbedMasterData(id, s, e);
    if (!data || !data.sources) return [];

    const names = data.sources.map(src => src.source_name);
    const formattedNames = [];
    if (names.includes('Premium Nepu')) formattedNames.push('Premium Nepu 🔥');

    for (const name of names) {
        if (name !== 'Premium Nepu') formattedNames.push(name);
    }
    return formattedNames;
}

export async function getStream(args) {
    const { id, s, e, server: serverParam } = args;
    const data = await getEmbedMasterData(id, s, e);
    if (!data || !data.sources) return null;

    let targetSource;
    if (serverParam && serverParam !== 'all') {
        const cleanServerParam = serverParam.replace(' 🔥', '').toLowerCase();
        targetSource = data.sources.find(s => s.source_name.toLowerCase() === cleanServerParam);
        if (!targetSource) return null;
    } else {
        targetSource = data.sources[0];
    }

    const resolved = await resolveIframe(targetSource, data.watchUrl, data.cookies);
    if (resolved) {
        let serverName = targetSource.source_name;
        if (serverName === 'Premium Nepu') serverName = 'Premium Nepu 🔥';

        return {
            url: resolved.url,
            headers: resolved.headers,
            server: serverName,
        };
    }

    return null;
}