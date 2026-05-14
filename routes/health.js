import { SOURCES, HEALTH_PROBE_ID } from '../config.js';

export async function handleHealth(SOURCE_MODULES, cache) {
    const results = await Promise.allSettled(
        SOURCES.filter(cfg => !cfg.disabled).map(cfg => (async () => {
            const t = Date.now();
            const mod = SOURCE_MODULES[cfg.key];
            try {
                let url = null;
                if (cfg.multiBase) {
                    for (const base of mod.BASES) {
                        url = await Promise.race([
                            (async () => {
                                for (let i = 0; i < 2; i++) {
                                    try { const r = await mod.getStream(HEALTH_PROBE_ID, null, null, base); if (r) return r; } catch { }
                                }
                                return null;
                            })(),
                            new Promise(r => setTimeout(() => r(null), cfg.timeout))
                        ]);
                        if (url) break;
                    }
                } else {
                    url = await Promise.race([
                        (async () => {
                            for (let i = 0; i < cfg.retries; i++) {
                                try { const r = await mod.getStream(HEALTH_PROBE_ID, null, null); if (r) return r; } catch { }
                            }
                            return null;
                        })(),
                        new Promise(r => setTimeout(() => r(null), cfg.timeout))
                    ]);
                }
                const raw = typeof url === 'object' ? url?.url : url;
                return { ok: !!(raw && raw.startsWith('http')), ms: Date.now() - t };
            } catch {
                return { ok: false, ms: Date.now() - t };
            }
        })())
    );

    const enabledSources = SOURCES.filter(cfg => !cfg.disabled);
    const byKey = Object.fromEntries(
        enabledSources.map((cfg, i) => [
            cfg.key,
            results[i].status === 'fulfilled' ? results[i].value : { ok: false, ms: null }
        ])
    );
    const allOk = Object.values(byKey).every(v => v.ok);

    return {
        status: allOk ? 200 : 207,
        body: JSON.stringify({
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            tmdb: !!process.env.TMDB_API_KEY,
            cache: cache.size,
            probe_id: HEALTH_PROBE_ID,
            sources: byKey,
        }, null, 2),
        contentType: 'application/json',
    };
}