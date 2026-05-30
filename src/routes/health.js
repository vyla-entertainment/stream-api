import { SOURCES, HEALTH_PROBE_ID } from '../../config.js';

async function probeSource(cfg, mod) {
    const probe = async () => {
        if (cfg.multiBase) {
            for (const base of mod.BASES) {
                for (let i = 0; i < 2; i++) {
                    try { const r = await mod.getStream(HEALTH_PROBE_ID, null, null, base); if (r) return r; } catch { }
                }
            }
        } else {
            for (let i = 0; i < cfg.retries; i++) {
                try { const r = await mod.getStream(HEALTH_PROBE_ID, null, null); if (r) return r; } catch { }
            }
        }
        return null;
    };

    const t = Date.now();
    const url = await Promise.race([probe(), new Promise(r => setTimeout(() => r(null), cfg.timeout))]);
    const raw = typeof url === 'object' ? url?.url : url;
    return { ok: !!(raw?.startsWith('http')), ms: Date.now() - t };
}

export async function handleHealth(SOURCE_MODULES, cache) {
    const active = SOURCES.filter(cfg => !cfg.disabled);

    const results = await Promise.allSettled(
        active.map(cfg => probeSource(cfg, SOURCE_MODULES[cfg.key]))
    );

    const sources = Object.fromEntries(
        active.map((cfg, i) => [
            cfg.key,
            results[i].status === 'fulfilled' ? results[i].value : { ok: false, ms: null },
        ])
    );

    const allOk = Object.values(sources).every(v => v.ok);

    return {
        status: allOk ? 200 : 207,
        body: JSON.stringify({
            note: 'This is a health check endpoint. This is extremely unreliable, be sure to test sources directly.',
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            tmdb: !!process.env.TMDB_API_KEY,
            cache: cache.size,
            probe_id: HEALTH_PROBE_ID,
            sources,
        }, null, 2),
        headers: { 'Content-Type': 'application/json' },
    };
}