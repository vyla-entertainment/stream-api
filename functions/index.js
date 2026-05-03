export async function onRequest() {
    const body = {
        endpoints: {
            movie: {
                path: '/api/movie?id=<tmdb_id>',
                description: 'Returns all working sources for a movie',
                response: {
                    sources: [
                        { source: 'vixsrc', label: 'vixsrc', url: '<proxied_stream_url>' },
                        { source: 'vidzee', label: 'VidZee', url: '<proxied_stream_url>' },
                    ],
                },
            },
            tv: {
                path: '/api/tv?id=<tmdb_id>&season=<s>&episode=<e>',
                description: 'Returns all working sources for a TV episode',
                response: {
                    sources: [
                        { source: 'vixsrc', label: 'vixsrc', url: '<proxied_stream_url>' },
                        { source: 'vidzee', label: 'VidZee', url: '<proxied_stream_url>' },
                    ],
                },
            },
            health: {
                path: '/api/health',
                description: 'Service health check — status of every source',
            },
        },
        test_endpoints: {
            movie_sample: '/api/movie?id=550',
            tv_sample: '/api/tv?id=1396&season=1&episode=1',
            test_vixsrc_movie: '/api/test/550?source=vixsrc',
            test_vixsrc_tv: '/api/test/1396?season=1&episode=1&source=vixsrc',
            test_icefy_movie: '/api/test/550?source=icefy',
            test_icefy_tv: '/api/test/1396?season=1&episode=1&source=icefy',
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
        },
    };

    return new Response(JSON.stringify(body, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}