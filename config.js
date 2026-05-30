export const SOURCES = [
    { key: 'miruro-sub', sourceFile: 'miruro', label: 'Miruro (Sub)', proxyParam: 'mrsub', timeout: 25000, jitter: 500, retries: 2 },
    { key: 'miruro-dub', sourceFile: 'miruro', label: 'Miruro (Dub)', proxyParam: 'mrdub', timeout: 25000, jitter: 500, retries: 2 },
    { key: 'meowtv', sourceFile: 'meowtv', label: 'MeowTV', proxyParam: 'mt', timeout: 15000, jitter: 500, retries: 2 },
    { key: 'flixhq', sourceFile: 'flixhq', label: 'FlixHQ', proxyParam: 'fq', timeout: 20000, jitter: 600, retries: 2 },
    { key: 'cinesu', sourceFile: 'cinesu', label: 'CineSu', proxyParam: 'cs', timeout: 15000, jitter: 500, retries: 2 },
    { key: 'icefy', sourceFile: 'icefy', label: 'Icefy', proxyParam: 'iy', timeout: 20000, jitter: 500, retries: 2, sourcesTimeout: 10000 },
    { key: 'vidrock', sourceFile: 'vidrock', label: 'VidRock', proxyParam: 'vr', timeout: 20000, jitter: 800, retries: 3 },
    { key: 'vidlink', sourceFile: 'vidlink', label: 'VidLink', proxyParam: 'vl', timeout: 15000, jitter: 500, retries: 2 },
    { key: 'vidzee', sourceFile: 'vidzee', label: 'VidZee', proxyParam: 'vz', timeout: 20000, jitter: 400, retries: 3, sourcesTimeout: 10000 },
    { key: 'vixsrc', label: 'VixSrc', sourceFile: 'vixsrc', proxyParam: 'vx', timeout: 35000, retries: 2, jitter: 0 },
    { key: 'nhdapi', sourceFile: 'nhdapi', label: 'nhdapi', proxyParam: 'nhd', timeout: 20000, jitter: 600, retries: 2 },
    { key: '02movie', sourceFile: '02movie', label: '02Movie', proxyParam: 'zm', timeout: 35000, jitter: 600, retries: 1 },
    { key: 'moviebox', sourceFile: 'moviebox', label: 'MovieBox', proxyParam: 'mb', timeout: 20000, jitter: 500, retries: 2, sourcesTimeout: 10000, disabled: true },
    { key: 'vidnest', label: 'VidNest', sourceFile: 'vidnest', proxyParam: 'vdn', timeout: 20000, retries: 1, jitter: 0 },
    { key: 'vidnest-sub', label: 'VidNest (Sub)', sourceFile: 'vidnest', proxyParam: 'vdn', timeout: 20000, retries: 1, jitter: 0 },
    { key: 'vidnest-dub', label: 'VidNest (Dub)', sourceFile: 'vidnest', proxyParam: 'vdn', timeout: 20000, retries: 1, jitter: 0 },
    { key: 'popr', sourceFile: 'popr', label: 'Popr', proxyParam: 'pp', timeout: 20000, jitter: 600, retries: 2, disabled: true },
    { key: 'cinezo', sourceFile: 'cinezo', label: 'Cinezo', proxyParam: 'cz', timeout: 60000, jitter: 500, retries: 2 },
    { key: 'vidfun', sourceFile: 'vidfun', label: 'VidFun', proxyParam: 'vf', timeout: 20000, jitter: 500, retries: 2, disabled: true },
    { key: 'fsharetv', sourceFile: 'fsharetv', label: 'FShareTV', proxyParam: 'fs', timeout: 25000, jitter: 600, retries: 2 },
    { key: 'vidapi', sourceFile: 'vidapi', label: 'VidApi', proxyParam: 'va', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'fsonic', sourceFile: 'fsonic', label: 'Fsonic', proxyParam: 'fn', timeout: 35000, jitter: 600, retries: 1 },
    { key: 'lookmovie', sourceFile: 'lookmovie', label: 'LookMovie', proxyParam: 'lm', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'tryembed-sub', sourceFile: 'tryembed', label: 'TryEmbed (Sub)', proxyParam: 'tesub', timeout: 25000, jitter: 500, retries: 2 },
    { key: 'tryembed-dub', sourceFile: 'tryembed', label: 'TryEmbed (Dub)', proxyParam: 'tedub', timeout: 25000, jitter: 500, retries: 2 },
    { key: 'movsrc', sourceFile: 'movsrc', label: 'MovSrc', proxyParam: 'ms', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'flixtrz', sourceFile: 'flixtrz', label: 'FlixTrz', proxyParam: 'fz', timeout: 30000, jitter: 500, retries: 2 },
    { key: 'toustream', sourceFile: 'toustream', label: 'TouStream', proxyParam: 'ts', timeout: 20000, jitter: 400, retries: 1 },
    { key: 'flaxmovies', sourceFile: 'flaxmovies', label: 'FlaxMovies', proxyParam: 'fx', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'vapor', sourceFile: 'vapor', label: 'Vapor', proxyParam: 'vp', timeout: 20000, jitter: 500, retries: 2 },
    { key: 'vidsrc', sourceFile: 'vidsrc', label: 'VidSrc', proxyParam: 'vs', timeout: 20000, jitter: 700, retries: 2, sourcesTimeout: 10000, disabled: true },
    { key: 'videasy', sourceFile: 'videasy', label: 'Videasy', proxyParam: 'vy', timeout: 40000, jitter: 900, retries: 3, sourcesTimeout: 10000 },

];

export const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]));
export const ALLOWED_ORIGINS = ['*'];
export const HEALTH_PROBE_ID = '155';
export const CACHE_TTL = 5 * 60 * 1000;