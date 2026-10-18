const fs = require("node:fs");
const path = require("node:path");

// This key is intentionally public. Never include server credentials here.
const config = { cartoApiKey: process.env.CARTO_API_KEY || "" };
if (!config.cartoApiKey) {
  console.warn("CARTO_API_KEY is unset; authenticated map tiles will not load.");
}
fs.writeFileSync(
  path.join(__dirname, "..", "public", "config.js"),
  `window.PARKER_CONFIG = ${JSON.stringify(config)};\n`
);
