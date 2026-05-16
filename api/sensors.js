const PARKER_API_URL = "https://parker-proxy.codeandsoda.hu/sensors";

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidCoordinate(lat, lng) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

module.exports = async function sensors(request, response) {
  const parkerAuthorization = process.env.PARKER_AUTHORIZATION;
  const requestUrl = new URL(request.url, `https://${request.headers.host || "localhost"}`);
  const lat = parseNumber(requestUrl.searchParams.get("lat"));
  const lng = parseNumber(requestUrl.searchParams.get("lng"));
  const radiusMeters = parseNumber(requestUrl.searchParams.get("radius_meters"), 300);

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

    response.statusCode = 200;
    response.setHeader("Content-Type", upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(bodyText);
  } catch (error) {
    sendJson(response, 502, {
      error: "Parker API unavailable",
      message: error instanceof Error ? error.message : "Unknown upstream error",
    });
  }
};
