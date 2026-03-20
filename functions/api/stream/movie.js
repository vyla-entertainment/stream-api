import { scrapeStream } from "./scraper.js";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "Missing id" }, { status: 400, headers: CORS });

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();

    (async () => {
        await scrapeStream("movie", id, "1", "1", async (source) => {
            await writer.write(enc.encode(JSON.stringify(source) + "\n"));
        });
        await writer.close();
    })();

    return new Response(readable, {
        headers: { ...CORS, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
}