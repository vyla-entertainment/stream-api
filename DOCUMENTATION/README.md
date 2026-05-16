## Base URL

```
https://missourimonster-vyla-api.hf.space
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
| GET | `/api/live` | Live TV channels (filterable, paginated) |
| GET | `/api/live/search?q=<term>` | Fast channel search with full metadata |
| GET | `/api/live/stats` | Aggregate stats across all channels |
| GET | `/api/live/<channel_id>` | Single live TV channel with all streams |
| GET | `/api/live/country/<country_code>` | All channels for a specific country |
| GET | `/api/live/category/<category_id>` | All channels for a specific category |
| GET | `/api/live/meta/categories` | All channel categories |
| GET | `/api/live/meta/countries` | All countries with channel counts |
| GET | `/api/live/meta/languages` | All broadcast languages |
| GET | `/api/live/meta/networks` | All networks with channel counts |
| GET | `/api/health` | Service health check |
| GET | `/api/test/<id>?source=<source>` | Test a specific stream source |
| GET | `/api?url=<encoded_url>` | Proxy endpoint for streams |

---

## Quick Start

```bash
# Fetch all working movie stream sources
curl "https://missourimonster-vyla-api.hf.space/api/movie?id=27205"

# Fetch all working TV episode stream sources
curl "https://missourimonster-vyla-api.hf.space/api/tv?id=1396&season=1&episode=1"

# Download links for a movie
curl "https://missourimonster-vyla-api.hf.space/api/downloads/movie/27205"

# Download links for a TV episode
curl "https://missourimonster-vyla-api.hf.space/api/downloads/tv/1396/1/1"

# Health check
curl "https://missourimonster-vyla-api.hf.space/api/health"

# Movie subtitles
curl "https://missourimonster-vyla-api.hf.space/api/subtitles/movie/27205"

# TV episode subtitles
curl "https://missourimonster-vyla-api.hf.space/api/subtitles/tv/1396/1/1"

# Live TV — first 50 channels
curl "https://missourimonster-vyla-api.hf.space/api/live"

# Live TV — search by name
curl "https://missourimonster-vyla-api.hf.space/api/live?search=BBC"

# Live TV — fast search endpoint
curl "https://missourimonster-vyla-api.hf.space/api/live/search?q=BBC&limit=10"

# Live TV — filter by country
curl "https://missourimonster-vyla-api.hf.space/api/live?country=US&limit=100"

# Live TV — filter by category
curl "https://missourimonster-vyla-api.hf.space/api/live?category=news&sort=streams"

# Live TV — filter by language
curl "https://missourimonster-vyla-api.hf.space/api/live?language=eng"

# Live TV — filter by minimum stream count
curl "https://missourimonster-vyla-api.hf.space/api/live?min_streams=2&sort=streams"

# Live TV — include closed channels
curl "https://missourimonster-vyla-api.hf.space/api/live?include_closed=true"

# Live TV — sort by launch date
curl "https://missourimonster-vyla-api.hf.space/api/live?sort=launched&launched_after=2000-01-01"

# Live TV — single channel
curl "https://missourimonster-vyla-api.hf.space/api/live/BBCOne.uk"

# Live TV — all channels for a country
curl "https://missourimonster-vyla-api.hf.space/api/live/country/US"

# Live TV — all channels for a category
curl "https://missourimonster-vyla-api.hf.space/api/live/category/news"

# Live TV — aggregate stats
curl "https://missourimonster-vyla-api.hf.space/api/live/stats"

# Live TV — browse countries
curl "https://missourimonster-vyla-api.hf.space/api/live/meta/countries"

# Live TV — browse categories
curl "https://missourimonster-vyla-api.hf.space/api/live/meta/categories"

# Live TV — browse languages
curl "https://missourimonster-vyla-api.hf.space/api/live/meta/languages"

# Live TV — browse networks
curl "https://missourimonster-vyla-api.hf.space/api/live/meta/networks"
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
      "quality": "720p",
      "size": "831.69 MB",
      "format": "MP4"
    }
  ]
}
```

Download URLs are signed and time-limited. Fetch them fresh before use.

### `/api/live`

```json
{
  "total": 4821,
  "page": 1,
  "limit": 50,
  "pages": 97,
  "filters": {
    "country": null,
    "category": null,
    "language": null,
    "network": null,
    "search": null,
    "sort": "name",
    "nsfw": false,
    "has_streams": true,
    "include_closed": false,
    "min_streams": null
  },
  "channels": [
    {
      "id": "BBCOne.uk",
      "name": "BBC One",
      "alt_names": [],
      "network": "BBC",
      "country": {
        "code": "GB",
        "name": "United Kingdom",
        "flag": "🇬🇧",
        "languages": ["eng"]
      },
      "categories": ["general"],
      "languages": [
        { "code": "eng", "name": "English" }
      ],
      "is_nsfw": false,
      "launched": "1936-11-02",
      "closed": false,
      "replaced_by": null,
      "website": "https://www.bbc.co.uk/bbcone",
      "logo": "https://iptv-org.github.io/iptv/channels/BBCOne.uk.png",
      "stream_count": 3,
      "streams": [
        {
          "url": "https://...",
          "quality": "720p",
          "label": null,
          "referrer": null,
          "user_agent": null,
          "http_referrer": null
        }
      ]
    }
  ]
}
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | — | Search by channel name, alt names, network, or ID |
| `country` | string | — | Filter by ISO 3166-1 alpha-2 country code (e.g. `US`, `GB`, `FR`) |
| `category` | string | — | Filter by category ID (e.g. `news`, `sports`, `movies`) |
| `language` | string | — | Filter by language code (e.g. `eng`, `spa`, `fra`) |
| `network` | string | — | Filter by network name (partial match) |
| `sort` | string | `name` | Sort by `name`, `streams`, `country`, `launched`, or `network` |
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Results per page (max `500`) |
| `has_streams` | boolean | `true` | Set `false` to include channels without any known streams |
| `nsfw` | boolean | `false` | Set `true` to include adult channels |
| `include_closed` | boolean | `false` | Set `true` to include closed/defunct channels |
| `min_streams` | number | — | Only return channels with at least this many streams |
| `launched_after` | string | — | Only return channels launched after this date (e.g. `2000-01-01`) |

### `/api/live/search`

```json
{
  "total": 4,
  "results": [
    {
      "id": "BBCOne.uk",
      "name": "BBC One",
      "logo": "https://iptv-org.github.io/iptv/channels/BBCOne.uk.png",
      "country": {
        "code": "GB",
        "name": "United Kingdom",
        "flag": "🇬🇧",
        "languages": ["eng"]
      },
      "stream_count": 3,
      "streams": [...]
    }
  ]
}
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — | Search term (required) |
| `limit` | number | `20` | Max results to return |

### `/api/live/<channel_id>`

Full channel object with all streams and expanded country/language metadata.

```json
{
  "id": "BBCOne.uk",
  "name": "BBC One",
  "alt_names": [],
  "network": "BBC",
  "country": {
    "code": "GB",
    "name": "United Kingdom",
    "flag": "🇬🇧",
    "languages": ["eng"]
  },
  "categories": ["general"],
  "languages": [
    { "code": "eng", "name": "English" }
  ],
  "is_nsfw": false,
  "launched": "1936-11-02",
  "closed": false,
  "replaced_by": null,
  "website": "https://www.bbc.co.uk/bbcone",
  "logo": "https://iptv-org.github.io/iptv/channels/BBCOne.uk.png",
  "stream_count": 3,
  "streams": [
    {
      "url": "https://...",
      "quality": "720p",
      "label": null,
      "referrer": null,
      "user_agent": null,
      "http_referrer": null
    }
  ]
}
```

### `/api/live/country/<country_code>`

```json
{
  "country": {
    "code": "US",
    "name": "United States",
    "flag": "🇺🇸",
    "languages": ["eng"]
  },
  "total": 812,
  "channels": [...]
}
```

### `/api/live/category/<category_id>`

```json
{
  "category": {
    "id": "news",
    "name": "News",
    "description": "News channels"
  },
  "total": 634,
  "channels": [...]
}
```

### `/api/live/stats`

```json
{
  "total_channels": 11200,
  "active_channels": 9800,
  "channels_with_streams": 4821,
  "closed_channels": 1400,
  "nsfw_channels": 312,
  "total_streams": 8903,
  "unique_countries": 147,
  "unique_categories": 22,
  "unique_networks": 1840,
  "top_countries": [
    { "code": "US", "count": 812 },
    { "code": "GB", "count": 341 }
  ],
  "top_categories": [
    { "id": "general", "count": 1200 },
    { "id": "news", "count": 634 }
  ],
  "top_networks": [
    { "name": "BBC", "count": 18 },
    { "name": "CNN", "count": 12 }
  ]
}
```

### `/api/live/meta/countries`

```json
[
  { "name": "United States", "code": "US", "languages": ["eng"], "flag": "🇺🇸", "channel_count": 812 },
  { "name": "United Kingdom", "code": "GB", "languages": ["eng"], "flag": "🇬🇧", "channel_count": 341 }
]
```

Sorted by `channel_count` descending.

### `/api/live/meta/categories`

```json
[
  { "id": "news", "name": "News", "description": "News channels" },
  { "id": "sports", "name": "Sports", "description": "Sports channels" }
]
```

### `/api/live/meta/languages`

```json
[
  { "code": "eng", "name": "English" },
  { "code": "spa", "name": "Spanish" }
]
```

### `/api/live/meta/networks`

```json
[
  { "name": "BBC", "channel_count": 18, "countries": ["GB"], "has_streams": true },
  { "name": "CNN", "channel_count": 12, "countries": ["US"], "has_streams": true }
]
```

Sorted by `channel_count` descending.

### `/api/health`

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "tmdb": true,
  "cache": 4,
  "probe_id": "155",
  "sources": {
    "source_key": { "ok": true, "ms": 812 }
  }
}
```

---

## Test a Single Stream Source

```bash
curl "https://missourimonster-vyla-api.hf.space/api/test/155?source=vidzee"
curl "https://missourimonster-vyla-api.hf.space/api/test/1396?season=1&episode=1&source=vidnest"
```

```json
{
  "source": "vidzee",
  "id": "155",
  "s": null,
  "e": null,
  "ok": true,
  "url": "/api?url=<encoded>&vz=1",
  "raw_url": "https://...",
  "elapsed_ms": 923,
  "error": null
}
```

---

## Deployment

```bash
# Local dev
node server.js

# Set your TMDB API key
echo "TMDB_API_KEY=your_key_here" >> .env
```