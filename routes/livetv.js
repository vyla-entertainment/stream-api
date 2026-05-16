const IPTV_BASE = 'https://iptv-org.github.io/api';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_TTL = 5 * 60 * 1000;

const _cache = new Map();

async function iptvFetch(path) {
    const hit = _cache.get(path);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.val;
    const res = await fetch(`${IPTV_BASE}${path}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`iptv-org fetch failed: ${res.status} ${path}`);
    const val = await res.json();
    _cache.set(path, { val, ts: Date.now() });
    return val;
}

async function loadAll() {
    const [channels, streams, logos, categories, countries, languages] = await Promise.all([
        iptvFetch('/channels.json'),
        iptvFetch('/streams.json'),
        iptvFetch('/logos.json'),
        iptvFetch('/categories.json'),
        iptvFetch('/countries.json'),
        iptvFetch('/languages.json'),
    ]);
    const countryMap = new Map(countries.map(c => [c.code, c]));
    const langMap = new Map(languages.map(l => [l.code, l]));
    return { channels, streams, logos, categories, countries, languages, countryMap, langMap };
}

function buildMaps(streams, logos) {
    const streamMap = new Map();
    for (const s of streams) {
        if (!s.channel) continue;
        if (!streamMap.has(s.channel)) streamMap.set(s.channel, []);
        streamMap.get(s.channel).push({
            url: s.url,
            quality: s.quality || null,
            label: s.label || null,
            referrer: s.referrer || null,
            user_agent: s.user_agent || null,
            http_referrer: s.http_referrer || null,
            status: s.status || null,
            timeshift: s.timeshift || null,
        });
    }
    const logoMap = new Map();
    for (const l of logos) {
        if (!l.channel || logoMap.has(l.channel)) continue;
        logoMap.set(l.channel, l.url);
    }
    return { streamMap, logoMap };
}

function formatChannel(c, streamMap, logoMap, countryMap, langMap) {
    const streams = streamMap.get(c.id) || [];
    const country = countryMap.get(c.country) || null;
    const languages = (c.languages || []).map(code => langMap.get(code) || { code, name: code });
    return {
        id: c.id,
        name: c.name,
        alt_names: c.alt_names || [],
        network: c.network || null,
        country: {
            code: c.country || null,
            name: country?.name || null,
            flag: country?.flag || null,
            languages: country?.languages || [],
        },
        categories: c.categories || [],
        languages,
        is_nsfw: c.is_nsfw || false,
        launched: c.launched || null,
        closed: c.closed || false,
        replaced_by: c.replaced_by || null,
        website: c.website || null,
        logo: logoMap.get(c.id) || c.logo || null,
        stream_count: streams.length,
        streams: streams.map(s => ({
            url: s.url,
            quality: s.quality || null,
            label: s.label || null,
            referrer: s.referrer || null,
            user_agent: s.user_agent || null,
            http_referrer: s.http_referrer || null,
        })),
    };
}

export async function handleLiveTvChannels(q, corsHeaders) {
    try {
        const { channels, streams, logos, categories, countries, languages, countryMap, langMap } = await loadAll();
        const { streamMap, logoMap } = buildMaps(streams, logos);

        let results = channels;

        if (q.include_closed !== 'true') results = results.filter(c => !c.closed);
        if (q.has_streams !== 'false') results = results.filter(c => streamMap.has(c.id));
        if (q.country) results = results.filter(c => c.country?.toLowerCase() === q.country.toLowerCase());
        if (q.category) results = results.filter(c => c.categories?.includes(q.category.toLowerCase()));
        if (q.nsfw !== 'true') results = results.filter(c => !c.is_nsfw);
        if (q.network) results = results.filter(c => c.network?.toLowerCase().includes(q.network.toLowerCase()));
        if (q.language) results = results.filter(c => c.languages?.includes(q.language.toLowerCase()));
        if (q.launched_after) results = results.filter(c => c.launched && c.launched >= q.launched_after);
        if (q.min_streams) results = results.filter(c => (streamMap.get(c.id) || []).length >= parseInt(q.min_streams));
        if (q.search) {
            const term = q.search.toLowerCase();
            results = results.filter(c =>
                c.name?.toLowerCase().includes(term) ||
                c.alt_names?.some(n => n.toLowerCase().includes(term)) ||
                c.network?.toLowerCase().includes(term) ||
                c.id?.toLowerCase().includes(term)
            );
        }

        const sort = q.sort || 'name';
        if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === 'streams') results.sort((a, b) => (streamMap.get(b.id)?.length || 0) - (streamMap.get(a.id)?.length || 0));
        else if (sort === 'country') results.sort((a, b) => (a.country || '').localeCompare(b.country || ''));
        else if (sort === 'launched') results.sort((a, b) => (b.launched || '').localeCompare(a.launched || ''));
        else if (sort === 'network') results.sort((a, b) => (a.network || '').localeCompare(b.network || ''));

        const page = Math.max(1, parseInt(q.page) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(q.limit) || 50));
        const total = results.length;
        const paginated = results.slice((page - 1) * limit, page * limit);

        const categoryMap = new Map(categories.map(c => [c.id, c]));

        return {
            status: 200,
            body: JSON.stringify({
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
                filters: {
                    country: q.country || null,
                    category: q.category || null,
                    language: q.language || null,
                    network: q.network || null,
                    search: q.search || null,
                    sort,
                    nsfw: q.nsfw === 'true',
                    has_streams: q.has_streams !== 'false',
                    include_closed: q.include_closed === 'true',
                    min_streams: q.min_streams ? parseInt(q.min_streams) : null,
                },
                channels: paginated.map(c => formatChannel(c, streamMap, logoMap, countryMap, langMap)),
            }, null, 2),
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvChannel(id, corsHeaders) {
    try {
        const { channels, streams, logos, countryMap, langMap } = await loadAll();
        const { streamMap, logoMap } = buildMaps(streams, logos);
        const channel = channels.find(c => c.id === id);
        if (!channel) return { status: 404, body: JSON.stringify({ error: 'channel not found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        return {
            status: 200,
            body: JSON.stringify(formatChannel(channel, streamMap, logoMap, countryMap, langMap), null, 2),
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvNetworks(corsHeaders) {
    try {
        const { channels, streams } = await loadAll();
        const streamSet = new Set(streams.map(s => s.channel).filter(Boolean));
        const networkMap = new Map();
        for (const c of channels) {
            if (!c.network || c.closed) continue;
            if (!networkMap.has(c.network)) networkMap.set(c.network, { name: c.network, channel_count: 0, countries: new Set(), has_streams: false });
            const entry = networkMap.get(c.network);
            entry.channel_count++;
            if (c.country) entry.countries.add(c.country);
            if (streamSet.has(c.id)) entry.has_streams = true;
        }
        const result = [...networkMap.values()]
            .map(n => ({ ...n, countries: [...n.countries] }))
            .sort((a, b) => b.channel_count - a.channel_count);
        return { status: 200, body: JSON.stringify(result, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvStats(corsHeaders) {
    try {
        const { channels, streams, categories, countries } = await loadAll();
        const streamSet = new Set(streams.map(s => s.channel).filter(Boolean));
        const active = channels.filter(c => !c.closed);
        const withStreams = active.filter(c => streamSet.has(c.id));
        const byCountry = {};
        const byCategory = {};
        const byNetwork = {};
        for (const c of withStreams) {
            if (c.country) byCountry[c.country] = (byCountry[c.country] || 0) + 1;
            for (const cat of (c.categories || [])) byCategory[cat] = (byCategory[cat] || 0) + 1;
            if (c.network) byNetwork[c.network] = (byNetwork[c.network] || 0) + 1;
        }
        const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([code, count]) => ({ code, count }));
        const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count }));
        const topNetworks = Object.entries(byNetwork).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([name, count]) => ({ name, count }));
        return {
            status: 200,
            body: JSON.stringify({
                total_channels: channels.length,
                active_channels: active.length,
                channels_with_streams: withStreams.length,
                closed_channels: channels.filter(c => c.closed).length,
                nsfw_channels: active.filter(c => c.is_nsfw).length,
                total_streams: streams.length,
                unique_countries: Object.keys(byCountry).length,
                unique_categories: Object.keys(byCategory).length,
                unique_networks: Object.keys(byNetwork).length,
                top_countries: topCountries,
                top_categories: topCategories,
                top_networks: topNetworks,
            }, null, 2),
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvSearch(q, corsHeaders) {
    try {
        const { channels, streams, logos, countryMap, langMap } = await loadAll();
        const { streamMap, logoMap } = buildMaps(streams, logos);
        const term = (q.q || q.search || '').toLowerCase();
        if (!term) return { status: 400, body: JSON.stringify({ error: 'missing search term (q or search param)' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        const results = channels.filter(c =>
            !c.closed &&
            streamMap.has(c.id) &&
            (
                c.name?.toLowerCase().includes(term) ||
                c.alt_names?.some(n => n.toLowerCase().includes(term)) ||
                c.network?.toLowerCase().includes(term) ||
                c.id?.toLowerCase().includes(term)
            )
        ).slice(0, parseInt(q.limit) || 20).map(c => formatChannel(c, streamMap, logoMap, countryMap, langMap));
        return { status: 200, body: JSON.stringify({ total: results.length, results }, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvByCountry(countryCode, q, corsHeaders) {
    try {
        const { channels, streams, logos, countryMap, langMap } = await loadAll();
        const { streamMap, logoMap } = buildMaps(streams, logos);
        const results = channels
            .filter(c => !c.closed && c.country?.toLowerCase() === countryCode.toLowerCase() && streamMap.has(c.id))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => formatChannel(c, streamMap, logoMap, countryMap, langMap));
        const country = countryMap.get(countryCode.toUpperCase()) || null;
        return { status: 200, body: JSON.stringify({ country, total: results.length, channels: results }, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvByCategory(categoryId, q, corsHeaders) {
    try {
        const { channels, streams, logos, categories, countryMap, langMap } = await loadAll();
        const { streamMap, logoMap } = buildMaps(streams, logos);
        const category = categories.find(c => c.id === categoryId.toLowerCase()) || null;
        const results = channels
            .filter(c => !c.closed && c.categories?.includes(categoryId.toLowerCase()) && streamMap.has(c.id))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => formatChannel(c, streamMap, logoMap, countryMap, langMap));
        return { status: 200, body: JSON.stringify({ category, total: results.length, channels: results }, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvCategories(corsHeaders) {
    try {
        const categories = await iptvFetch('/categories.json');
        return { status: 200, body: JSON.stringify(categories, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvCountries(corsHeaders) {
    try {
        const [countries, channels, streams] = await Promise.all([
            iptvFetch('/countries.json'),
            iptvFetch('/channels.json'),
            iptvFetch('/streams.json'),
        ]);
        const streamSet = new Set(streams.map(s => s.channel).filter(Boolean));
        const countMap = new Map();
        for (const c of channels) {
            if (!c.closed && streamSet.has(c.id)) {
                countMap.set(c.country, (countMap.get(c.country) || 0) + 1);
            }
        }
        const result = countries.map(c => ({ ...c, channel_count: countMap.get(c.code) || 0 }))
            .sort((a, b) => b.channel_count - a.channel_count);
        return { status: 200, body: JSON.stringify(result, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleLiveTvLanguages(corsHeaders) {
    try {
        const languages = await iptvFetch('/languages.json');
        return { status: 200, body: JSON.stringify(languages, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}