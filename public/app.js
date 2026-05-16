const BUDAPEST_CENTER = { lat: 47.51551463432745, lng: 19.050964125951115 };
const SEARCH_RADIUS_METERS = 300;
const AUTO_REFRESH_MS = 60 * 1000;
const LOCATION_REFRESH_MS = 10 * 1000;
const MIN_REFETCH_DISTANCE_METERS = 35;
const THEME_QUERY = "(prefers-color-scheme: dark)";
const TILE_LAYERS = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const TILE_OPTIONS = {
  maxZoom: 20,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

const fallbackSpaces = [
  {
    gpsCoordinates: { latitude: 47.514056, longitude: 19.049984 },
    parkingPlaceId: "GM_6862",
    state: "Occupied",
    category: "Normal",
    isElectricCharger: false,
    isOnlyElectric: false,
    residentialLocationId: null,
  },
  {
    gpsCoordinates: { latitude: 47.51438271, longitude: 19.05124193 },
    parkingPlaceId: "GM_9914",
    state: "Occupied",
    category: "Normal",
    isElectricCharger: false,
    isOnlyElectric: false,
    residentialLocationId: null,
  },
  {
    gpsCoordinates: { latitude: 47.515277, longitude: 19.050774 },
    parkingPlaceId: "GM_6970",
    state: "Free",
    category: "Normal",
    isElectricCharger: false,
    isOnlyElectric: false,
    residentialLocationId: null,
  },
  {
    gpsCoordinates: { latitude: 47.516794, longitude: 19.050575 },
    parkingPlaceId: "GM_7138",
    state: "Occupied",
    category: "Normal",
    isElectricCharger: false,
    isOnlyElectric: false,
    residentialLocationId: null,
  },
  {
    gpsCoordinates: { latitude: 47.514205, longitude: 19.050981 },
    parkingPlaceId: "GM_7472",
    state: "Free",
    category: "Residential",
    isElectricCharger: false,
    isOnlyElectric: false,
    residentialLocationId: 3,
  },
  {
    gpsCoordinates: { latitude: 47.515233, longitude: 19.050743 },
    parkingPlaceId: "GM_7021",
    state: "Free",
    category: "Normal",
    isElectricCharger: false,
    isOnlyElectric: false,
    residentialLocationId: null,
  },
];

const elements = {
  status: document.querySelector("#status"),
  refresh: document.querySelector("#refreshButton"),
};

const map = L.map("map", { zoomControl: false }).setView([BUDAPEST_CENTER.lat, BUDAPEST_CENTER.lng], 17);
const themeMedia = window.matchMedia(THEME_QUERY);
let tileLayer = L.tileLayer(TILE_LAYERS[themeMedia.matches ? "dark" : "light"], TILE_OPTIONS).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

let markerLayer = L.layerGroup().addTo(map);
let userMarker;
let currentCenter = BUDAPEST_CENTER;
let isUsingFallbackLocation = true;
let isLoading = false;
let lastFetchCenter;

function setStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function setRefreshLoading(loading) {
  isLoading = loading;
  elements.refresh.disabled = loading;
  elements.refresh.setAttribute("aria-busy", String(loading));
}

function updateTileTheme(event) {
  tileLayer.remove();
  tileLayer = L.tileLayer(TILE_LAYERS[event.matches ? "dark" : "light"], TILE_OPTIONS).addTo(map);
}

function createParkingIcon() {
  return L.divIcon({
    className: "parking-marker",
    html: "<span></span>",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function createUserIcon() {
  return L.divIcon({
    className: "user-marker",
    html: '<span><i aria-hidden="true"></i></span>',
    iconSize: [88, 88],
    iconAnchor: [44, 44],
  });
}

function distanceMeters(from, to) {
  const earthRadius = 6371000;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeSpaces(spaces, center) {
  return spaces
    .filter((space) => space.state === "Free" && space.gpsCoordinates?.latitude && space.gpsCoordinates?.longitude)
    .map((space) => ({
      ...space,
      distance: distanceMeters(center, {
        lat: space.gpsCoordinates.latitude,
        lng: space.gpsCoordinates.longitude,
      }),
    }))
    .sort((a, b) => a.distance - b.distance);
}

function renderMap(center, spaces) {
  markerLayer.clearLayers();
  renderUserMarker(center);

  spaces.forEach((space) => {
    L.marker([space.gpsCoordinates.latitude, space.gpsCoordinates.longitude], {
      icon: createParkingIcon(),
    })
      .bindPopup(
        `<strong>${space.parkingPlaceId || "Available parking"}</strong><br>${
          space.category || "Uncategorized"
        }<br>${Math.round(space.distance)} m away`
      )
      .addTo(markerLayer);
  });

  const bounds = L.latLngBounds([[center.lat, center.lng]]);
  spaces.forEach((space) => bounds.extend([space.gpsCoordinates.latitude, space.gpsCoordinates.longitude]));
  map.fitBounds(bounds, { padding: [72, 72], maxZoom: 18 });
}

function renderUserMarker(center) {
  if (userMarker) {
    userMarker.setLatLng([center.lat, center.lng]);
    return;
  }

  userMarker = L.marker([center.lat, center.lng], { icon: createUserIcon(), zIndexOffset: 1000 }).addTo(map);
}

async function loadParkingSpaces(center, usingFallbackLocation = false) {
  if (isLoading) {
    return;
  }

  currentCenter = center;
  isUsingFallbackLocation = usingFallbackLocation;
  lastFetchCenter = center;
  setRefreshLoading(true);
  setStatus("Refreshing...");

  try {
    const response = await fetch(
      `/api/sensors?lat=${encodeURIComponent(center.lat)}&lng=${encodeURIComponent(
        center.lng
      )}&radius_meters=${SEARCH_RADIUS_METERS}`
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const spaces = normalizeSpaces(await response.json(), center);
    renderMap(center, spaces);
    setStatus(`${spaces.length} free spots ${usingFallbackLocation ? "nearby" : "near you"}`, "success");
  } catch (error) {
    const spaces = normalizeSpaces(fallbackSpaces, center);
    renderMap(center, spaces);
    setStatus(`${spaces.length} demo spots nearby`, "warning");
  } finally {
    setRefreshLoading(false);
  }
}

function updateCurrentLocation(center) {
  currentCenter = center;
  isUsingFallbackLocation = false;
  renderUserMarker(center);
  map.panTo([center.lat, center.lng], { animate: true, duration: 0.8 });

  if (!lastFetchCenter || distanceMeters(lastFetchCenter, center) >= MIN_REFETCH_DISTANCE_METERS) {
    loadParkingSpaces(center);
  }
}

function useFallbackLocation(message) {
  setStatus(`${message} Showing default area.`, "warning");
  loadParkingSpaces(BUDAPEST_CENTER, true);
}

function start() {
  if (!navigator.geolocation) {
    useFallbackLocation("Location unavailable.");
    return;
  }

  const handlePosition = (position) => {
    updateCurrentLocation({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
  };

  const handleError = (error) => {
    if (!lastFetchCenter) {
      useFallbackLocation(error.message || "Could not read your location.");
    }
  };

  navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
  });

  if (navigator.geolocation.watchPosition) {
    navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: LOCATION_REFRESH_MS,
      maximumAge: LOCATION_REFRESH_MS,
    });
    return;
  }

  setInterval(() => {
    navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: LOCATION_REFRESH_MS,
    });
  }, LOCATION_REFRESH_MS);
}

elements.refresh.addEventListener("click", () => {
  loadParkingSpaces(currentCenter, isUsingFallbackLocation);
});

if (themeMedia.addEventListener) {
  themeMedia.addEventListener("change", updateTileTheme);
} else {
  themeMedia.addListener(updateTileTheme);
}

start();
setInterval(() => {
  loadParkingSpaces(currentCenter, isUsingFallbackLocation);
}, AUTO_REFRESH_MS);
