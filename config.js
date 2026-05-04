export const SOURCES = [
    {
        key: 'vidzee',
        label: 'VidZee',
        proxyParam: 'vz',
        timeout: 15000,
        jitter: 400,
        retries: 3,
        sourcesTimeout: 5000,
    },
    {
        key: 'vidnest',
        label: 'VidNest',
        proxyParam: 'vn',
        timeout: 20000,
        jitter: 600,
        retries: 3,
    },
    {
        key: 'vidsrc',
        label: 'VidSrc',
        proxyParam: 'vs',
        timeout: 25000,
        jitter: 700,
        retries: 2,
    },
    {
        key: 'vidrock',
        label: 'VidRock',
        proxyParam: 'vr',
        timeout: 20000,
        jitter: 800,
        retries: 3,
    },
    {
        key: 'videasy',
        label: 'Videasy',
        proxyParam: 'vy',
        timeout: 20000,
        jitter: 900,
        retries: 3,
    },
    {
        key: 'cinesu',
        label: 'CineSu',
        proxyParam: 'cs',
        timeout: 15000,
        jitter: 500,
        retries: 2,
    },
    {
        key: 'peachify',
        label: 'Peachify',
        proxyParam: 'pc',
        timeout: 20000,
        jitter: 500,
        retries: 2,
    },
    {
        key: 'lookmovie',
        label: 'LookMovie',
        proxyParam: 'lm',
        timeout: 20000,
        jitter: 500,
        retries: 2,
    },
    {
        key: 'vidlink',
        label: 'VidLink',
        proxyParam: 'vl',
        timeout: 20000,
        jitter: 500,
        retries: 2,
    },
];
export const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]));
export const ALLOWED_ORIGINS = [
    'https://vyla.pages.dev',
    'http://localhost:7860',
    'http://169.254.162.163:7860',
];
export const HEALTH_PROBE_ID = '550';
export const CACHE_TTL = 5 * 60 * 1000;