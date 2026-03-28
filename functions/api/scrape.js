import {
    fetchVidLink,
    fetchMovieDownloader,
    fetchVixSrc,
    fetchVidSrc,
    fetchUembed,
    fetchVidRock,
    fetchRgShows,
    fetchVidZee,
    fetchEmbed02,
} from "../_lib/scraper.js";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

const PROVIDERS = {
    vidlink: fetchVidLink,
    moviedownloader: fetchMovieDownloader,
    vixsrc: fetchVixSrc,
    vidsrc: fetchVidSrc,
    uembed: fetchUembed,
    vidrock: fetchVidRock,
    rgshows: fetchRgShows,
    vidzee: fetchVidZee,
    embed02: fetchEmbed02,
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const type = searchParams.get("type") || "movie";
    const id = searchParams.get("id");
    const season = searchParams.get("season") ?? "1";
    const episode = searchParams.get("episode") ?? "1";

    if (!id) {
        return Response.json({ success: false, error: "Missing id" }, { status: 400, headers: CORS });
    }

    if (!provider || !PROVIDERS[provider]) {
        return Response.json({ success: false, error: "Invalid or missing provider" }, { status: 400, headers: CORS });
    }

    const media = {
        type: type === "tv" ? "tv" : "movie",
        tmdbId: String(id),
        season: String(season),
        episode: String(episode),
    };

    try {
        const { sources = [], subtitles = [] } = await PROVIDERS[provider](media);
        return Response.json({ success: true, sources, subtitles }, { headers: CORS });
    } catch (e) {
        return Response.json({ success: false, sources: [], subtitles: [], error: e.message }, { headers: CORS });
    }
}