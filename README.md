# Pride Events Parser

Fetches Stockholm Pride events and adds lat/lng coordinates using Google's Geocoding API.

## Features

- Retrieves events from Stockholm Pride API
- Geocodes addresses to coordinates
- Caches results to minimize API calls
- Rate limiting (1 req/sec)

## Setup

1. Install dependencies: `npm install`
2. Create `.env` file with your Google API key:
   ```env
   GOOGLE_GEOCODING_API_KEY=your_api_key_here
   ```
3. Run: `npm start`

## Output

Creates `eventsWithCoords.json` with events enriched with coordinates:

```json
[
  {
    "id": 4010,
    "title": "Skaparcafé",
    "address": "Sjövikskajen 36–42",
    "lat": 59.3065702,
    "lon": 18.0338796
  }
]
```

## Google API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Geocoding API
3. Create an API key
4. Add the key to your `.env` file

## Notes

- Keep your API key secure
- Free tier: 2,500 requests/day
- Addresses are cached to minimize API usage
