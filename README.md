# Parker Web

A simple map-based application for viewing Parker on-street parking sensor data.

## Why

Parker is useful while driving, but using a phone in the car is awkward and distracting. Parker Web is a dashboard-friendly version that can run on a car display, such as a Tesla browser, so nearby free street parking is visible at a glance without fumbling with a phone.

## Run

```sh
cp .env.example .env
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## API proxy

The browser calls the local `/api/sensors` endpoint:

```text
/api/sensors?lat=47.51551463432745&lng=19.050964125951115&radius_meters=300
```

The local server forwards that request to:

```text
https://parker-proxy.codeandsoda.hu/sensors
```

It sends the Parker authorization header server-side so the token is not exposed in browser code. Set the token in `.env` before running locally:

```sh
PARKER_AUTHORIZATION=your-token
```

If the live API is unavailable, the UI displays demo data from the sample response shape so the map remains usable during local development.

## Deploy to Vercel

This repo is Vercel-ready:

- `public/` is the static output directory.
- `api/sensors.js` is the Vercel Function that proxies Parker API requests.
- `vercel.json` tells Vercel to serve `public/` as the deployment output.

Set `PARKER_AUTHORIZATION` and `CARTO_API_KEY` in Vercel Project Settings → Environment Variables for the environments you deploy to, then redeploy.

## Map tiles

The map uses CARTO Voyager in light mode and Dark Matter in dark mode. Set
`CARTO_API_KEY` in your local `.env` to enable map tiles locally.
The browser requests `/api/tiles`; the local server and Vercel Function forward
tile requests to CARTO with the key server-side. The key is never embedded in
static assets or returned in errors. Missing configuration returns HTTP 503;
there is no unauthenticated tile fallback. Successful tiles are cached in the
browser for one hour and on Vercel's CDN for one day.

The tile endpoint is public, so requests can still consume your CARTO quota.
Ensure your CARTO plan permits this server-side use and caching. Tile proxy
requests also count toward Vercel function usage on cache misses.
