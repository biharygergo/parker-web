const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const PARKER_API_URL = "https://parker-proxy.codeandsoda.hu/sensors";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidCoordinate(lat, lng) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function handleSensors(request, response, requestUrl) {
  const parkerAuthorization = process.env.PARKER_AUTHORIZATION;
  const lat = parseNumber(requestUrl.searchParams.get("lat"));
  const lng = parseNumber(requestUrl.searchParams.get("lng"));
  const radiusMeters = parseNumber(requestUrl.searchParams.get("radius_meters"), 360);

  if (!parkerAuthorization) {
    sendJson(response, 500, {
      error: "Missing Parker authorization",
      message: "Set PARKER_AUTHORIZATION in the server environment.",
    });
    return;
  }

  if (!isValidCoordinate(lat, lng)) {
    sendJson(response, 400, {
      error: "Invalid coordinates",
      message: "Provide lat and lng query parameters with valid GPS coordinates.",
    });
    return;
  }

  const upstreamUrl = new URL(PARKER_API_URL);
  upstreamUrl.searchParams.set("lat", String(lat));
  upstreamUrl.searchParams.set("lng", String(lng));
  upstreamUrl.searchParams.set("radius_meters", String(Math.max(1, radiusMeters)));

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        Authorization: parkerAuthorization,
        "Content-Type": "application/json",
        "User-Agent": "Parker/168 CFNetwork/3860.500.112 Darwin/25.4.0",
      },
    });

    const bodyText = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      sendJson(response, upstreamResponse.status, {
        error: "Parker API request failed",
        status: upstreamResponse.status,
        body: bodyText.slice(0, 500),
      });
      return;
    }

    response.writeHead(200, {
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(bodyText);
  } catch (error) {
    sendJson(response, 502, {
      error: "Parker API unavailable",
      message: error instanceof Error ? error.message : "Unknown upstream error",
    });
  }
}

function sendStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/sensors") {
    handleSensors(request, response, requestUrl);
    return;
  }

  sendStatic(response, requestUrl.pathname);
});

server.listen(PORT, () => {
  console.log(`Parker web app running at http://localhost:${PORT}`);
});
