export const SOURCES = [
    {
        key: 'icefy',
        label: 'Icefy',
        sourceFile: 'icefy',
        proxyParam: 'iy',
        timeout: 20000,
        sourcesTimeout: 10000,
        jitter: 500,
        retries: 2,
        skipVerify: false,
        verifyHeaders: {
            Referer: 'https://streams.icefy.top/',
            Origin: 'https://streams.icefy.top',
        },
    },

    {
        key: 'vidrock',
        label: 'VidRock',
        sourceFile: 'vidrock',
        proxyParam: 'vr',
        timeout: 20000,
        jitter: 800,
        retries: 3,
        skipVerify: true,
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
        skipVerify: true,
        verifyHeaders: {
            Accept: '/',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://player.vidzee.wtf',
            Origin: 'https://player.vidzee.wtf',
        },
    },

    {
        key: 'vixsrc',
        label: 'VixSrc',
        sourceFile: 'vixsrc',
        proxyParam: 'vx',
        timeout: 35000,
        jitter: 0,
        retries: 2,
        skipVerify: false,
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
        skipVerify: true,
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
        skipVerify: true,
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
        // skipProxy: true,
        skipVerify: true,
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
        skipVerify: true,
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
        key: 'vapor',
        label: 'Vapor',
        sourceFile: 'vapor',
        proxyParam: 'vp',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        disabled: true, // Temporarily disabled due to took too long to respond
        // skipProxy: true,
        skipVerify: true,
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
        skipVerify: true,
        multiUrl: true,
        verifyHeaders: {
            Accept: 'application/json, /; q=0.01',
            Referer: 'https://player.videasy.net/',
            Origin: 'https://player.videasy.net',
        },
    },

    {
        key: 'vidify',
        label: 'Vidify',
        sourceFile: 'vidify',
        proxyParam: 'vdy',
        timeout: 20000,
        jitter: 700,
        retries: 2,
        skipVerify: true,
        disabled: true, // Temporarily disabled due to Connection timed out Error code 522
        multiUrl: true,
        verifyHeaders: {
            Referer: 'https://cloudnestra.com/',
            Origin: 'https://cloudnestra.com',
            Accept: '*/*',
        },
        cdnHeaders: [{
            pattern: /xenialxenogenesis\.website/,
            headers: {
                'Referer': 'https://cloudorchestranova.com/',
                'Origin': 'https://cloudorchestranova.com',
                'Accept': '*/*',
            },
        }],
    },

    {
        key: '123anime',
        label: '123Anime',
        sourceFile: '123anime',
        proxyParam: 'a1',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        skipVerify: true,
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
        // skipProxy: true,
        skipVerify: true,
    },

    {
        key: 'apexmovies',
        label: 'ApexMovies',
        sourceFile: 'apexmovies',
        proxyParam: 'ax',
        timeout: 20000,
        jitter: 400,
        retries: 2,
        skipVerify: true,
        disabled: true, // Temporarily disabled due to the website has been temporarily rate limited
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
    },


    {
        key: 'embedmaster',
        sourceFile: 'embedmaster',
        label: 'EmbedMaster',
        proxyParam: 'em',
        timeout: 30000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'purstream',
        sourceFile: 'purstream',
        label: 'Purstream',
        proxyParam: 'ps',
        timeout: 20000,
        jitter: 500,
        retries: 2
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
        retries: 2
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
        key: 'zxcstream',
        sourceFile: 'zxcstream',
        label: 'ZxcStream',
        proxyParam: 'zs',
        timeout: 15000,
        jitter: 500,
        retries: 2,
        // skipProxy: true,
        skipVerify: true,
    },

    {
        key: 'biavox',
        sourceFile: 'biavox',
        label: 'BiaVox',
        proxyParam: 'bx',
        timeout: 40000,
        jitter: 600,
        retries: 2,
        // skipProxy: true,
        skipVerify: true,
    },

    {
        key: 'aether',
        sourceFile: 'aether',
        label: 'Aether',
        proxyParam: 'ae',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        // skipProxy: true,
        skipVerify: true,
    },

    {
        key: 'peachify',
        sourceFile: 'peachify',
        label: 'Peachify',
        proxyParam: 'py',
        timeout: 30000,
        jitter: 500,
        retries: 2,
        skipVerify: true,
        multiUrl: true,
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
        skipVerify: true,
        skipProxy: true
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
        skipVerify: true,
        skipProxy: true
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
        skipVerify: true,
        skipProxy: true
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

];

export const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]));
export const ALLOWED_ORIGINS = [''];
export const HEALTH_PROBE_ID = '155';
export const CACHE_TTL = 5 * 60 * 1000;