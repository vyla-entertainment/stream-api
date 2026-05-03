# vyla-stream-api

A Cloudflare Pages API for streaming and downloading movies & TV shows via TMDB ID. Fetches sources concurrently, verifies streams, proxies content to handle CORS, and provides direct download links.

---

## Base URL

```
https://vyla-api.pages.dev
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/movie?id=<tmdb_id>` | All working stream sources for a movie |
| GET | `/api/tv?id=<tmdb_id>&season=<s>&episode=<e>` | All working stream sources for a TV episode |
| GET | `/api/downloads/movie/<tmdb_id>` | Download links for a movie |
| GET | `/api/downloads/tv/<tmdb_id>/<season>/<episode>` | Download links for a TV episode |
| GET | `/api/subtitles/movie/<tmdb_id>` | Subtitles for a movie |
| GET | `/api/subtitles/tv/<tmdb_id>/<season>/<episode>` | Subtitles for a TV episode |
| GET | `/api/health` | Service health check |
| GET | `/api/test/<id>?source=<source>` | Test a specific stream source |
| GET | `/api?url=<encoded_url>` | Proxy endpoint for streams |

---

## Quick Start

```bash
# Fetch all working movie stream sources
curl "https://vyla-api.pages.dev/api/movie?id=27205"

# Fetch all working TV episode stream sources
curl "https://vyla-api.pages.dev/api/tv?id=1396&season=1&episode=1"

# Download links for a movie
curl "https://vyla-api.pages.dev/api/downloads/movie/27205"

# Download links for a TV episode
curl "https://vyla-api.pages.dev/api/downloads/tv/1396/1/1"

# Health check
curl "https://vyla-api.pages.dev/api/health"

# Movie subtitles
curl "https://vyla-api.pages.dev/api/subtitles/movie/27205"

# TV episode subtitles
curl "https://vyla-api.pages.dev/api/subtitles/tv/1396/1/1"
```

---

## Response Shapes

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
  "meta": {}
}
```

All sources are fetched concurrently, verified live, and proxied. Only working sources are returned.

### `/api/downloads/movie/<id>` and `/api/downloads/tv/<id>/<season>/<episode>`

```json
{
  "downloads": [
    {
      "url": "https://02movie.com/api/download?url=<encoded>",
      "quality": "360p",
      "size": "347.12 MB",
      "format": "MP4"
    },
    {
      "url": "https://02movie.com/api/download?url=<encoded>",
      "quality": "480p",
      "size": "370.31 MB",
      "format": "MP4"
    },
    {
      "url": "https://02movie.com/api/download?url=<encoded>",
      "quality": "720p",
      "size": "831.69 MB",
      "format": "MP4"
    }
  ]
}
```

Download URLs are signed and time-limited. Fetch them fresh before use.

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

## Test a Single Stream Source

```bash
curl "https://vyla-api.pages.dev/api/test/550?source=vidzee"
curl "https://vyla-api.pages.dev/api/test/1396?season=1&episode=1&source=vidnest"
```

```json
{
  "source": "vidzee",
  "id": "550",
  "s": null,
  "e": null,
  "ok": true,
  "url": "/api?url=<encoded>&vz=1",
  "raw_url": "https://...",
  "elapsed_ms": 923,
  "error": null
}
```

Available source keys: `vidzee`, `vidnest`, `vidsrc`, `vidrock`, `videasy`, `cinesu`

---

## Deployment

```bash
# Local dev
wrangler pages dev

# Deploy
wrangler pages deploy
```

Set your TMDB API key as a secret:

```bash
wrangler pages secret put TMDB_API_KEY
```

---

## File Structure

```
/
├── functions/
│   ├── index.js            # Root endpoint — lists all available endpoints
│   └── api/
│       └── [[route]].js    # All /api/* route handlers
├── sources/
│   ├── vidzee.js
│   ├── vidnest.js
│   ├── vidsrc.js
│   ├── vidrock.js
│   ├── videasy.js
│   ├── cinesu.js
│   └── 02movie.js          # Download links source (decrypts AES-GCM response)
├── config.js               # SOURCES array and SOURCE_MAP
├── wrangler.toml
└── public/
```