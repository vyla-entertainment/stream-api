export async function onRequest() {
    const body = {
        endpoints: {
            movie: {
                path: '/api/movie?id=<tmdb_id>',
            },
            tv: {
                path: '/api/tv?id=<tmdb_id>&season=<s>&episode=<e>',
            },
            subtitles_movie: {
                path: '/api/subtitles/movie/<tmdb_id>',
            },
            subtitles_tv: {
                path: '/api/subtitles/tv/<tmdb_id>/<season>/<episode>',
            },
            health: {
                path: '/api/health',
            },
        },
        test_endpoints: {
            movie_sample: '/api/movie?id=550',
            tv_sample: '/api/tv?id=1396&season=1&episode=1',
            subtitles_movie_sample: '/api/subtitles/movie/550',
            subtitles_tv_sample: '/api/subtitles/tv/76479/1/1',
            test_vidzee_movie: '/api/test/550?source=vidzee',
            test_vidzee_tv: '/api/test/1396?season=1&episode=1&source=vidzee',
            test_vidnest_movie: '/api/test/550?source=vidnest',
            test_vidnest_tv: '/api/test/1396?season=1&episode=1&source=vidnest',
            test_vidsrc_movie: '/api/test/550?source=vidsrc',
            test_vidsrc_tv: '/api/test/1396?season=1&episode=1&source=vidsrc',
            test_vidrock_movie: '/api/test/550?source=vidrock',
            test_vidrock_tv: '/api/test/1396?season=1&episode=1&source=vidrock',
            test_videasy_movie: '/api/test/550?source=videasy',
            test_videasy_tv: '/api/test/1396?season=1&episode=1&source=videasy',
            test_cinesu_movie: '/api/test/550?source=cinesu',
            test_cinesu_tv: '/api/test/1396?season=1&episode=1&source=cinesu',
        },
    };

    return new Response(JSON.stringify(body, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}