import { getTmdbInfo, USER_AGENT } from '../utils/helpers.js';

async function extractVoe(voeUrl) {
    try {
        const res = await fetch(voeUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': 'https://anihq.cc/'
            }
        });

        const mirrorUrl = res.url;
        const html = await res.text();

        const scriptMatch = html.match(/<script type="application\/json">\["(.*?)"\]<\/script>/);
        if (!scriptMatch) return null;

        let str = scriptMatch[1];

        str = str.replace(/[a-zA-Z]/g, (c) => {
            return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
        });

        const junk = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
        junk.forEach(j => { str = str.split(j).join(''); });

        str = Buffer.from(str, 'base64').toString('utf-8');

        let shifted = '';
        for (let i = 0; i < str.length; i++) {
            shifted += String.fromCharCode(str.charCodeAt(i) - 3);
        }

        let reversed = shifted.split('').reverse().join('');

        let finalJsonStr = Buffer.from(reversed, 'base64').toString('utf-8');

        const finalData = JSON.parse(finalJsonStr);

        if (finalData.file || finalData.source) {
            return {
                url: finalData.file || finalData.source,
                mirror: mirrorUrl
            };
        }

    } catch (e) {
        return null;
    }
    return null;
}

function cleanSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export async function getStream({ id, s, e, audio }) {
    if (!s) return null;

    const info = await getTmdbInfo(id, 'tv', s);
    if (!info.isAnime) return null;

    const seriesTitle = info.titles.find(t =>
        t.toLowerCase() !== 'east blue' &&
        t.length > 3
    ) || info.titles[0];

    const cleanTitle = cleanSlug(seriesTitle);
    const typeSuffix = audio === 'dub' ? 'english-dubbed' : 'english-subbed';
    const url = `https://anihq.cc/watch/${cleanTitle}-episode-${e}-${typeSuffix}/`;

    try {
        let pageRes = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        let html = await pageRes.text();

        if (!pageRes.ok) {
            const searchUrl = `https://anihq.cc/search?keyword=${encodeURIComponent(seriesTitle)}`;
            const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
            const searchHtml = await searchRes.text();
            const searchRegex = new RegExp(`href="(https://anihq.cc/watch/[^"]+-episode-${e}-${typeSuffix}/)"`, 'i');
            const match = searchHtml.match(searchRegex);
            if (match) {
                const retryRes = await fetch(match[1], { headers: { 'User-Agent': USER_AGENT } });
                html = await retryRes.text();
            } else return null;
        }

        const iframeMatch = html.match(/iframe[^>]+src=["'](https:\/\/(?:[a-z0-9.]+|ellenpoliticalfollow\.com)\/e\/[a-zA-Z0-9]+)["']/i);
        if (!iframeMatch) return null;

        const result = await extractVoe(iframeMatch[1]);

        if (result && result.url) {
            const mirrorOrigin = new URL(result.mirror).origin;
            return {
                url: result.url,
                headers: {
                    'Referer': mirrorOrigin + '/',
                    'User-Agent': USER_AGENT,
                    'Origin': mirrorOrigin
                }
            };
        }
    } catch (err) {
        return null;
    }
    return null;
}