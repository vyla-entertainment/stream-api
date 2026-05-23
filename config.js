export const SOURCES = [
    { key: 'vidlink', sourceFile: 'vidlink', label: 'VidLink', proxyParam: 'vl', timeout: 15000, jitter: 500, retries: 2 },
    { key: 'vidzee', sourceFile: 'vidzee', label: 'VidZee', proxyParam: 'vz', timeout: 20000, jitter: 400, retries: 3, sourcesTimeout: 10000 },
    { key: 'meowtv', sourceFile: 'meowtv', label: 'MeowTV', proxyParam: 'mt', timeout: 15000, jitter: 500, retries: 2 },
    { key: 'flixhq', sourceFile: 'flixhq', label: 'FlixHQ', proxyParam: 'fq', timeout: 20000, jitter: 600, retries: 2 },
    { key: 'cinesu', sourceFile: 'cinesu', label: 'CineSu', proxyParam: 'cs', timeout: 15000, jitter: 500, retries: 2 },
    { key: 'icefy', sourceFile: 'icefy', label: 'Icefy', proxyParam: 'iy', timeout: 20000, jitter: 500, retries: 2, sourcesTimeout: 10000 },
    { key: 'vidrock', sourceFile: 'vidrock', label: 'VidRock', proxyParam: 'vr', timeout: 20000, jitter: 800, retries: 3 },
    { key: 'vidsrc', sourceFile: 'vidsrc', label: 'VidSrc', proxyParam: 'vs', timeout: 20000, jitter: 700, retries: 2, sourcesTimeout: 10000 },
    { key: 'vixsrc', sourceFile: 'vixsrc', label: 'VixSrc', proxyParam: 'vx', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'videasy', sourceFile: 'videasy', label: 'Videasy', proxyParam: 'vy', timeout: 40000, jitter: 900, retries: 3, sourcesTimeout: 10000 },
    { key: 'streammafia', sourceFile: 'streammafia', label: 'streammafia', proxyParam: 'sm', timeout: 20000, jitter: 600, retries: 2, disabled: true },
    { key: '02movie', sourceFile: '02movie', label: '02Movie', proxyParam: 'zm', timeout: 35000, jitter: 600, retries: 1 },
    { key: 'moviebox', sourceFile: 'moviebox', label: 'MovieBox', proxyParam: 'mb', timeout: 20000, jitter: 500, retries: 2, sourcesTimeout: 10000, disabled: true },
    { key: 'vidnest', sourceFile: 'vidnest', label: 'VidNest', proxyParam: 'vn', timeout: 20000, jitter: 600, retries: 3 },
    { key: 'popr', sourceFile: 'popr', label: 'Popr', proxyParam: 'pp', timeout: 20000, jitter: 600, retries: 2 },
    { key: 'cinezo', sourceFile: 'cinezo', label: 'Cinezo', proxyParam: 'cz', timeout: 60000, jitter: 500, retries: 2 },
    { key: 'vidfun', sourceFile: 'vidfun', label: 'VidFun', proxyParam: 'vf', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'fsharetv', sourceFile: 'fsharetv', label: 'FShareTV', proxyParam: 'fs', timeout: 25000, jitter: 600, retries: 2 },
    { key: 'vidapi', sourceFile: 'vidapi', label: 'VidApi', proxyParam: 'va', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'fsonic', sourceFile: 'fsonic', label: 'Fsonic', proxyParam: 'fn', timeout: 35000, jitter: 600, retries: 1 },
    { key: 'lookmovie', sourceFile: 'lookmovie', label: 'LookMovie', proxyParam: 'lm', timeout: 20000, jitter: 500, retries: 2 },
];

export const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]));
export const ALLOWED_ORIGINS = ['*'];
export const HEALTH_PROBE_ID = '155';
export const CACHE_TTL = 5 * 60 * 1000;