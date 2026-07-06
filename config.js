// Currently active sources reported on  11:04:55 PM PST 6/29/2026
// Tested ID for all non anime: 936075
// Tested ID for anime: 37854

// fsharetv/fsonic tested: 155 ( they don't have Michael )

export const SOURCES = [
    {
        key: 'vidrock',
        label: 'VidRock',
        sourceFile: 'vidrock',
        proxyParam: 'vr',
        timeout: 20000,
        jitter: 800,
        retries: 3,
        multiUrl: true,
        cdnHeaders: [{
            pattern: /./,
            headers: {
                Accept: '/',
                'Accept-Language': 'en-US,en;q=0.9',
                Referer: 'https://vidrock.ru/',
                Origin: 'https://vidrock.ru',
            },
        },],
    },

    {
        key: 'vidzee',
        label: 'VidZee',
        sourceFile: 'vidzee',
        proxyParam: 'vz',
        timeout: 20000,
        sourcesTimeout: 10000,
        jitter: 400,
        retries: 3,
        disabled: true, // Temporarily disabled due to their site being down, all streams are returning 403's
        verifyHeaders: {
            Accept: '/',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://player.vidzee.wtf',
            Origin: 'https://player.vidzee.wtf',
        },
    },

    {
        key: 'vidlink',
        label: 'Vidlink',
        sourceFile: 'vidlink',
        proxyParam: 'vl',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
    },

    {
        key: 'vidfast',
        label: 'Vidfast',
        sourceFile: 'vidfast',
        proxyParam: 'vf',
        timeout: 35000,
        jitter: 500,
        retries: 1,
    },

    {
        key: 'vixsrc',
        label: 'VixSrc',
        sourceFile: 'vixsrc',
        proxyParam: 'vx',
        timeout: 35000,
        jitter: 0,
        retries: 2,
        multiUrl: false,
        verifyHeaders: {
            Accept: 'application/json, text/javascript, /; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://vixsrc.to/',
            Origin: 'https://vixsrc.to',
        },
    },

    {
        key: 'fsharetv',
        label: 'FShareTV',
        sourceFile: 'fsharetv',
        proxyParam: 'fs',
        timeout: 25000,
        jitter: 600,
        retries: 2,
        multiUrl: false,
        verifyHeaders: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://fsharetv.cc',
        },
    },

    {
        key: 'fsonic',
        label: 'Fsonic',
        sourceFile: 'fsonic',
        proxyParam: 'fn',
        timeout: 35000,
        jitter: 600,
        retries: 1,
        multiUrl: true,
    },

    {
        key: 'lookmovie',
        label: 'LookMovie',
        sourceFile: 'lookmovie',
        proxyParam: 'lm',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        multiUrl: true,
        verifyHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        },
    },

    {
        key: 'flaxmovies',
        label: 'FlaxMovies',
        sourceFile: 'flaxmovies',
        proxyParam: 'fx',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        cdnHeaders: [{
            pattern: /flix2watch\.pro/i,
            headers: {
                Referer: 'https://flaxmovies.xyz/',
                Origin: 'https://flaxmovies.xyz',
            },
        },],
    },

    {
        key: 'videasy',
        label: 'Videasy',
        sourceFile: 'videasy',
        proxyParam: 'vy',
        timeout: 40000,
        sourcesTimeout: 10000,
        jitter: 900,
        retries: 3,
        multiUrl: true,
        verifyHeaders: {
            Accept: 'application/json, /; q=0.01',
            Referer: 'https://player.videasy.net/',
            Origin: 'https://player.videasy.net',
        },
        disabled: true,  // Temporarily disabled because their seed fetcher rate limit is too strict
    },

    {
        key: '123anime',
        label: '123Anime',
        sourceFile: '123anime',
        proxyParam: 'a1',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: false,
        cdnHeaders: [{
            pattern: /hlsx\d+cdn\.|burntburst\d+\.store|echovideo\.ru/i,
            headers: {
                Referer: 'https://play2.echovideo.ru/',
                Origin: 'https://play2.echovideo.ru',
            },
        },],
    },

    {
        key: 'streamguide',
        label: 'StreamGuide',
        sourceFile: 'streamguide',
        proxyParam: 'sg',
        timeout: 20000,
        jitter: 400,
        retries: 2,
        skipProxy: true,
    },

    {
        key: 'vidcore',
        sourceFile: 'vidcore',
        label: 'Vidcore',
        proxyParam: 'vc',
        timeout: 30000,
        jitter: 500,
        retries: 2,
        sourcesTimeout: 10000,
        disabled: true,  // Temporarily disabled because their site is down, all streams are returning 403's
    },

    {
        key: 'purstream',
        sourceFile: 'purstream',
        label: 'Purstream',
        proxyParam: 'ps',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
    },

    {
        key: 'xpass',
        sourceFile: 'xpass',
        label: 'XPass',
        proxyParam: 'xp',
        timeout: 20000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'spencerdevs',
        sourceFile: 'spencerdevs',
        label: 'SpencerDevs',
        proxyParam: 'sd',
        timeout: 30000,
        jitter: 500,
        retries: 2,
        disabled: true, // Temporarily disabled due to website being down
    },

    {
        key: 'anineko-sub',
        sourceFile: 'anineko',
        label: 'AniNeko (Sub)',
        proxyParam: 'anksub',
        timeout: 25000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'anineko-dub',
        sourceFile: 'anineko',
        label: 'AniNeko (Dub)',
        proxyParam: 'ankdub',
        timeout: 25000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'nekowatch-sub',
        sourceFile: 'nekowatch',
        label: 'NekoWatch (Sub)',
        proxyParam: 'nwsub',
        timeout: 30000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'nekowatch-dub',
        sourceFile: 'nekowatch',
        label: 'NekoWatch (Dub)',
        proxyParam: 'nwdub',
        timeout: 30000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'anipm-sub',
        sourceFile: 'anipm',
        label: 'AniPM (Sub)',
        proxyParam: 'apsub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        skipVerify: true,
        multiUrl: true,
        verifyHeaders: {
            Referer: 'https://ani.pm/',
            Origin: 'https://ani.pm',
        },
    },

    {
        key: 'anipm-dub',
        sourceFile: 'anipm',
        label: 'AniPM (Dub)',
        proxyParam: 'apdub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        skipVerify: true,
        multiUrl: true,
        verifyHeaders: {
            Referer: 'https://ani.pm/',
            Origin: 'https://ani.pm',
        },
    },

    {
        key: 'biavox',
        sourceFile: 'biavox',
        label: 'BiaVox',
        proxyParam: 'bx',
        timeout: 40000,
        jitter: 600,
        retries: 2,
        skipProxy: true,
    },

    {
        key: 'vidnest',
        label: 'VidNest',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidnest-sub',
        label: 'VidNest (Sub)',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidnest-dub',
        label: 'VidNest (Dub)',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidsync',
        label: 'VidSync',
        sourceFile: 'vidsync',
        proxyParam: 'vs',
        timeout: 20000,
        retries: 2,
        multiUrl: true,
        disabled: true, // Temporarily disabled due to enc dec issues
    },

    {
        key: 'dulo',
        label: 'Dulo',
        sourceFile: 'dulo',
        proxyParam: 'dl',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        disabled: true, // Disabled due to owner asking me to do so
    },

    {
        key: 'lordflix',
        label: 'Lordflix',
        sourceFile: 'lordflix',
        proxyParam: 'lf',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
    },

    {
        key: 'fsonline',
        label: 'FSOnline',
        sourceFile: 'fsonline',
        proxyParam: 'fo',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },


    {
        key: 'kisskh',
        label: 'KissKH',
        sourceFile: 'kisskh',
        proxyParam: 'kk',
        timeout: 30000,
        jitter: 500,
        retries: 1,
    },

    {
        key: 'hexa',
        label: 'Hexa',
        sourceFile: 'hexa',
        proxyParam: 'hx',
        timeout: 20000,
        jitter: 500,
        retries: 2,
    },

    {
        key: 'notorrent',
        label: 'NoTorrent',
        sourceFile: 'notorrent',
        proxyParam: 'nt',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
    },

    {
        key: 'streamvault',
        label: 'StreamVault',
        sourceFile: 'streamvault',
        proxyParam: 'sv',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
        disabled: true, // Temporarily disabled due to them being too slow
    },

    {
        key: 'goated',
        label: 'Goated',
        sourceFile: 'goated',
        proxyParam: 'gt',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: false,
        skipVerify: true,
        skipProxy: true,
    },

    {
        key: 'netmirror',
        label: 'NetMirror',
        sourceFile: 'netmirror',
        proxyParam: 'nm',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        disabled: true, // Temporarily disabled due to their site being down, all streams are not working
    },

    {
        key: 'aether',
        label: 'aether',
        sourceFile: 'aether',
        proxyParam: 'ae',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: false,
        skipVerify: true,
        skipProxy: true,
    },

    {
        key: 'nextbox',
        label: 'NextBox',
        sourceFile: 'nextbox',
        proxyParam: 'nx',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: false,
        disabled: true, // Temporarily disabled due to them adding cloudflare turnstile to all streams.
    },

];

export const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]));
export const ALLOWED_ORIGINS = [''];
export const HEALTH_PROBE_ID = '155';
export const CACHE_TTL = 5 * 60 * 1000;