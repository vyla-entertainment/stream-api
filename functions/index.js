export async function onRequestGet() {
    return Response.json({
        status: "ok",
        service: "vyla-api",
        endpoints: {
            movie: "/api/movie?id=<tmdb_id>",
            tv: "/api/tv?id=<tmdb_id>&season=<s>&episode=<e>",
            stream_movie: "/api/stream/movie?id=<tmdb_id>",
            stream_tv: "/api/stream/tv?id=<tmdb_id>&season=<s>&episode=<e>",
            proxy: "/proxy?t=<encrypted_token>",
            player: "/player?type=movie&id=<tmdb_id>",
        },
    });
}