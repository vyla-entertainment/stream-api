![Vyla API](https://github.com/EndOverdosing/Vyla-Player-API/blob/main/images/banner.png?raw=true)

# vyla-api

Media stream scraper API running entirely on Cloudflare Pages Functions. No backend, no Python — just deploy and use.

---

## How it works

Sources are scraped from 02pcembed.site and proxied through madvid3.xyz's HLS proxy so they're playable directly in any video player. Error sources are automatically filtered out before returning results.

```
Client
  │
  ▼
Cloudflare Pages (vyla-api)
  ├── GET /api/movie → scrape movie sources
  └── GET /api/tv    → scrape TV episode sources
```

---

## Repo layout

```
├── functions/
│   ├── api/
│   │   ├── movie.js     ← /api/movie
│   │   └── tv.js        ← /api/tv
│   └── lib/
│       └── scraper.js   ← source scraping + HLS proxy rewriting
├── public/
│   └── .gitkeep
├── wrangler.toml
├── .gitignore
└── README.md
```

---

## Local dev

```bash
wrangler pages dev
```

Test:

```
GET http://127.0.0.1:8788/api/movie?id=550
GET http://127.0.0.1:8788/api/tv?id=456&season=1&episode=1
```

---

## Deploy to Cloudflare Pages

### Option A — Git (recommended)

1. Push this repo to GitHub
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
3. Select your repo, set build output directory to `public`, leave build command blank
4. Deploy

Every push to `main` redeploys automatically.

### Option B — CLI

```bash
wrangler pages deploy ./public --project-name=vyla-api
```

---

## API reference

All endpoints return `Access-Control-Allow-Origin: *` and support `OPTIONS` preflight — works from any origin.

---

### `GET /api/movie`

| Param | Required | Description |
|---|---|---|
| `id` | ✅ | TMDB movie ID |

```
GET /api/movie?id=550
```

```json
{
  "success": true,
  "results_found": 6,
  "sources": [
    {
      "url": "https://madvid3.xyz/api/hls-proxy?url=...",
      "quality": "1080p",
      "type": "hls"
    }
  ],
  "subtitles": [
    {
      "url": "https://...",
      "label": "English",
      "format": "vtt"
    }
  ]
}
```

`success` is `false` if no valid sources were found. `results_found` reflects the number of sources after deduplication and error filtering.

---

### `GET /api/tv`

| Param | Required | Default | Description |
|---|---|---|---|
| `id` | ✅ | — | TMDB series ID |
| `season` | ❌ | `1` | Season number |
| `episode` | ❌ | `1` | Episode number |

```
GET /api/tv?id=456&season=1&episode=1
```

Response shape is identical to `/api/movie`. TV responses are cached for 5 minutes on the client and 15 minutes at the edge.

---

## Usage from any frontend

```js
const res = await fetch("https://vyla-api.pages.dev/api/movie?id=550");
const { sources, subtitles } = await res.json();
```

---

## TMDB IDs

```
https://www.themoviedb.org/movie/550-fight-club   →  id=550
https://www.themoviedb.org/tv/456-the-simpsons    →  id=456
```

---

## License

MIT
