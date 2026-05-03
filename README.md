![Vyla API](https://github.com/EndOverdosing/Vyla-Player-API/blob/main/images/banner.png?raw=true)

# vyla-stream-api

A Cloudflare Pages API for scraping and streaming movies & TV shows via TMDB ID. Aggregates sources from many providers, proxies streams to handle CORS, and returns all working sources in a single response.

**[https://vyla.mintlify.app](https://vyla.mintlify.app)**

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
| GET | `/api/health` | Service health check — status of every provider |

---

## Quick Start

```bash
# Fetch all working movie sources
curl https://vyla-api.pages.dev/api/movie?id=27205

# Fetch all working TV episode sources
curl "https://vyla-api.pages.dev/api/tv?id=1396&season=1&episode=1"

# Health check
curl https://vyla-api.pages.dev/api/health
```

---

## Response Shape

### `/api/movie` and `/api/tv`

```json
{
  "sources": [
    {
      "source": "source1",
      "label": "source1",
      "url": "/api?url=<encoded>&vl=1"
    },
    {
      "source": "source2",
      "label": "VidZee",
      "url": "/api?url=<encoded>&vz=1"
    }
  ],
  "meta": { ... }
}
```

All sources are fetched concurrently, verified live, and proxied. Only working sources are returned.

### `/api/health`

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "tmdb": true,
  "cache": 4,
  "probe_id": "550",
  "sources": {
    "source1": { "ok": true, "ms": 812 },
    "source2":  { "ok": true, "ms": 340 },
    "source3": { "ok": false, "ms": null }
  }
}
```

---

Sources are fetched from all providers concurrently. Each result is verified with a live stream check before being included in the response.

---

## Test a Single Provider

```bash
# Test source1 for a movie
curl "https://vyla-api.pages.dev/api/test/550?source=source1"

# Test source2 for a TV episode
curl "https://vyla-api.pages.dev/api/test/1396?season=1&episode=1&source=source2"
```

Response:

```json
{
  "source": "source1",
  "id": "550",
  "s": null,
  "e": null,
  "ok": true,
  "url": "/api?url=<encoded>&vl=1",
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
│   ├── source1.js         # This will be changed to the actual provider name
├── config.js
├── wrangler.toml
└── public/
```