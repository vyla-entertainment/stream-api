# vyla-stream-api

A Cloudflare Pages API for streaming movies & TV shows via TMDB ID. Fetches sources concurrently, verifies streams, and proxies content to handle CORS.

---

## Base URL

```
https://vyla-api.pages.dev
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/movie?id=<tmdb_id>` | All working sources for a movie |
| GET | `/api/tv?id=<tmdb_id>&season=<s>&episode=<e>` | All working sources for a TV episode |
| GET | `/api/health` | Service health check |
| GET | `/api/subtitles/movie/<id>` | Subtitles for a movie |
| GET | `/api/subtitles/tv/<id>/<season>/<episode>` | Subtitles for a TV episode |
| GET | `/api/test/<id>?source=<source>` | Test a specific source |
| GET | `/api?url=<encoded_url>` | Proxy endpoint for streams |

---

## Quick Start

```bash
# Fetch all working movie sources
curl https://vyla-api.pages.dev/api/movie?id=27205

# Fetch all working TV episode sources
curl "https://vyla-api.pages.dev/api/tv?id=1396&season=1&episode=1"

# Health check
curl https://vyla-api.pages.dev/api/health

# Movie subtitles
curl https://vyla-api.pages.dev/api/subtitles/movie/27205

# TV episode subtitles
curl "https://vyla-api.pages.dev/api/subtitles/tv/1396/1/1"
```

---

## Response Shape

### `/api/movie` and `/api/tv`

```json
{
  "sources": [
    {
      "source": "source_key",
      "label": "Source Label",
      "url": "/api?url=<encoded>&param=1"
    }
  ],
  "subtitles": [],
  "meta": { ... }
}
```

All sources are fetched concurrently, verified live, and proxied. Only working sources are returned. Subtitles are included when available.

### `/api/health`

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "tmdb": true,
  "cache": 4,
  "probe_id": "550",
  "sources": {
    "source_key": { "ok": true, "ms": 812 }
  }
}
```

---

Sources are fetched concurrently. Each result is verified with a live stream check before being included in the response.

---

## Test a Single Source

```bash
# Test a specific source for a movie
curl "https://vyla-api.pages.dev/api/test/550?source=source_key"

# Test a specific source for a TV episode
curl "https://vyla-api.pages.dev/api/test/1396?season=1&episode=1&source=source_key"
```

Response:

```json
{
  "source": "source_key",
  "id": "550",
  "s": null,
  "e": null,
  "ok": true,
  "url": "/api?url=<encoded>&param=1",
  "raw_url": "https://...",
  "elapsed_ms": 923,
  "error": null
}
```

---

## Deployment

```bash
# Local dev
wrangler pages dev

# Deploy
wrangler pages deploy
```

Set your TMDB API key as a secret (never commit it in `wrangler.toml`):

```bash
wrangler pages secret put TMDB_API_KEY
```

---

## File Structure

```
/
├── functions/
│   ├── index.js           # Root endpoint — lists all endpoints
│   └── api/
│       └── [[route]].js   # All /api/* routes
├── sources/
│   ├── *.js              # Source implementations
├── config.js              # Configuration and source definitions
├── wrangler.toml
└── public/
```