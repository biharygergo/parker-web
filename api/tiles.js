function sendError(response, status, error) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ error }));
}

module.exports = async function tiles(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendError(response, 405, "Method not allowed");
    return;
  }

  const params = new URL(request.url, "http://localhost").searchParams;
  const values = ["z", "x", "y"].map((name) => params.get(name));
  const [z, x, y] = values.map(Number);
  const style = params.get("style") || "voyager";
  if (values.some((value) => !/^\d+$/.test(value || "")) ||
      ![z, x, y].every(Number.isSafeInteger) || z > 20 ||
      x >= 2 ** z || y >= 2 ** z ||
      !["voyager", "dark_all"].includes(style)) {
    sendError(response, 400, "Invalid tile coordinates or style");
    return;
  }

  const apiKey = process.env.CARTO_API_KEY;
  if (!apiKey) {
    sendError(response, 503, "Map tiles are not configured");
    return;
  }

  const url = new URL(`https://basemaps.cartocdn.com/rastertiles/${style}/${z}/${x}/${y}.png`);
  url.searchParams.set("key", apiKey);
  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/png")) {
      // Never forward upstream errors: they may include the credential-bearing URL.
      sendError(response, 502, "Map tile request failed");
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    response.statusCode = 200;
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    sendError(response, 502, "Map tile service unavailable");
  }
};
