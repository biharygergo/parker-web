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

The browser requests CARTO tiles directly: Voyager in light mode and Dark Matter
in dark mode. `CARTO_API_KEY` is a public browser key and is visible in tile
requests. Use a basemap key intended for browser use, with domain restrictions
where supported. Keep `PARKER_AUTHORIZATION` private; it stays in the sensors API.

Locally, the server reads `CARTO_API_KEY` from `.env` and serves `/config.js`.
On Vercel, `npm run build` generates the ignored `public/config.js` from the
build environment. Set `CARTO_API_KEY` for each deployment environment and
redeploy after changing it. The generated configuration contains only this
public key, never the Parker authorization token.

Vercel is explicitly configured with no framework and `public/` as static
output, with only `api/` files deployed as functions. If an existing Vercel
project has Root Directory set to `public`, change it to the repository root.
The frontend `public/app.js` requires a browser and must not run as a Node entrypoint.
