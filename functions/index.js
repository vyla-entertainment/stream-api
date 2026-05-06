import { SOURCES } from '../config.js';

export async function onRequest() {
    const enabledSources = SOURCES.filter(source => !source.disabled);

    const testEndpoints = enabledSources.reduce((acc, source) => {
        acc[`test_${source.key}_movie`] = `/api/test/550?source=${source.key}`;
        acc[`test_${source.key}_tv`] = `/api/test/1396?season=1&episode=1&source=${source.key}`;
        return acc;
    }, {
        movie_sample: '/api/movie?id=550',
        tv_sample: '/api/tv?id=1396&season=1&episode=1',

        downloads_movie_sample: '/api/downloads/movie/550',
        downloads_tv_sample: '/api/downloads/tv/1396/1/1',

        subtitles_movie_sample: '/api/subtitles/movie/550',
        subtitles_tv_sample: '/api/subtitles/tv/76479/1/1',
    });

    const body = {
        endpoints: {
            movie: { path: '/api/movie?id=<tmdb_id>', genre: 'stream' },
            tv: { path: '/api/tv?id=<tmdb_id>&season=<s>&episode=<e>', genre: 'stream' },

            downloads: {
                movie: {
                    path: '/api/downloads/movie/<tmdb_id>',
                    genre: 'downloads'
                },
                tv: {
                    path: '/api/downloads/tv/<tmdb_id>/<season>/<episode>',
                    genre: 'downloads'
                }
            },

            subtitles: {
                movie: {
                    path: '/api/subtitles/movie/<tmdb_id>',
                    genre: 'subtitles'
                },
                tv: {
                    path: '/api/subtitles/tv/<tmdb_id>/<season>/<episode>',
                    genre: 'subtitles'
                }
            },

            health: { path: '/api/health', genre: 'system' }
        },
        test_endpoints: testEndpoints,
    };

    return new Response(JSON.stringify(body, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}