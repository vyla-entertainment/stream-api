import { scrape } from "../lib/scraper.js";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ success: false, error: "Missing required query param: id" }, { status: 400, headers: CORS });
    const { origin } = new URL(request.url);
    const sources = await scrape("movie", id, "1", "1", origin, env.PROXY_SECRET ?? "");
    return Response.json({ success: sources.length > 0, results_found: sources.length, sources }, { headers: CORS });
}