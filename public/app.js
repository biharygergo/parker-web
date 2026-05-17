const BUDAPEST_CENTER = { lat: 47.51551463432745, lng: 19.050964125951115 };
const SEARCH_DIAMETER_METERS = 300;
const SEARCH_RADIUS_METERS = SEARCH_DIAMETER_METERS / 2;
const AUTO_REFRESH_MS = 60 * 1000;
const LOCATION_REFRESH_MS = 10 * 1000;
const MIN_REFRESH_LOADING_MS = 1000;
const MIN_REFETCH_DISTANCE_METERS = 35;
const MIN_SEARCH_MOVE_METERS = 15;
const DEBUG_MOVE_METERS = 20;
const PARKING_MARKER_TRANSITION_MS = 500;
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
  searchHere: document.querySelector("#searchHereButton"),
  modeButtons: document.querySelectorAll(".mode-button"),
  info: document.querySelector("#infoButton"),
  infoPanel: document.querySelector("#infoPanel"),
  filters: document.querySelectorAll(".filter-button"),
  debugDrive: document.querySelector("#debugDriveControl"),
  debugMoveButtons: document.querySelectorAll("[data-debug-move]"),
};

const map = L.map("map", { zoomControl: false }).setView([BUDAPEST_CENTER.lat, BUDAPEST_CENTER.lng], 17);
const themeMedia = window.matchMedia(THEME_QUERY);
let tileLayer = L.tileLayer(TILE_LAYERS[themeMedia.matches ? "dark" : "light"], TILE_OPTIONS).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

let markerLayer = L.layerGroup().addTo(map);
let overlayLayer = L.layerGroup().addTo(map);
let parkingMarkers = new Map();
let userMarker;
let searchMarker;
let searchCircle;
let currentCenter = BUDAPEST_CENTER;
let currentLocation;
let pendingSearchCenter = BUDAPEST_CENTER;
let isUsingFallbackLocation = true;
let isLoading = false;
let lastFetchCenter;
let currentSpaces = [];
let activeFilter = "all";
let searchMode = "location";
let needsForegroundRefresh = false;
let hasFitInitialLocationBounds = false;
let isDebugLocationActive = false;

function setStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
  elements.status.dataset.updated = "false";
  requestAnimationFrame(() => {
    elements.status.dataset.updated = "true";
  });
}

function setRefreshLoading(loading) {
  isLoading = loading;
  elements.refresh.disabled = loading;
  elements.searchHere.disabled = loading;
  elements.status.dataset.refreshing = String(loading);
  elements.refresh.setAttribute("aria-busy", String(loading));
  elements.searchHere.setAttribute("aria-busy", String(loading));
}

function updateTileTheme(event) {
  tileLayer.remove();
  tileLayer = L.tileLayer(TILE_LAYERS[event.matches ? "dark" : "light"], TILE_OPTIONS).addTo(map);
}

function createParkingIcon() {
  return L.divIcon({
    className: "parking-marker parking-marker--entering",
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

function createSearchIcon() {
  return L.divIcon({
    className: "search-marker",
    html: "<span></span>",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
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

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isLocalDebugMode() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function offsetLocation(center, direction) {
  const latDelta = DEBUG_MOVE_METERS / 111320;
  const lngDelta = DEBUG_MOVE_METERS / (111320 * Math.cos((center.lat * Math.PI) / 180));

  if (direction === "north") {
    return { lat: center.lat + latDelta, lng: center.lng };
  }

  if (direction === "south") {
    return { lat: center.lat - latDelta, lng: center.lng };
  }

  if (direction === "east") {
    return { lat: center.lat, lng: center.lng + lngDelta };
  }

  if (direction === "west") {
    return { lat: center.lat, lng: center.lng - lngDelta };
  }

  return center;
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
    .filter((space) => space.distance <= SEARCH_RADIUS_METERS)
    .sort((a, b) => a.distance - b.distance);
}

function isResidentialSpace(space) {
  return space.category === "Residential" || space.residentialLocationId !== null;
}

function categoryLabel(space) {
  if (isResidentialSpace(space)) {
    return "Lakossági";
  }

  if (space.category === "Normal") {
    return "Normál";
  }

  return space.category || "Nincs kategória";
}

function filterSpaces(spaces) {
  if (activeFilter === "residential") {
    return spaces.filter(isResidentialSpace);
  }

  if (activeFilter === "nonResidential") {
    return spaces.filter((space) => !isResidentialSpace(space));
  }

  return spaces;
}

function statusLabel(count, usingFallbackLocation) {
  const location = searchMode === "map" ? "a kijelölt körben" : usingFallbackLocation ? "a közelben" : "körülötted";

  if (activeFilter === "residential") {
    return `${count} lakossági hely ${location}`;
  }

  if (activeFilter === "nonResidential") {
    return `${count} nem lakossági hely ${location}`;
  }

  return `${count} szabad hely ${location}`;
}

function renderFilteredSpaces(center, usingFallbackLocation, tone = "success") {
  const spaces = filterSpaces(currentSpaces);
  renderMap(center, spaces);
  setStatus(statusLabel(spaces.length, usingFallbackLocation), tone);
}

function parkingMarkerKey(space) {
  return (
    space.parkingPlaceId ||
    `${space.gpsCoordinates.latitude.toFixed(7)},${space.gpsCoordinates.longitude.toFixed(7)}`
  );
}

function popupContent(space) {
  return `<strong>${space.parkingPlaceId || "Szabad parkolóhely"}</strong><br>${categoryLabel(space)}<br>${Math.round(
    space.distance
  )} m távolságra`;
}

function setParkingMarkerState(marker, stateClass) {
  const element = marker.getElement();

  if (!element) {
    return;
  }

  if (element.classList.contains(stateClass)) {
    return;
  }

  element.classList.remove("parking-marker--entering", "parking-marker--visible", "parking-marker--leaving");
  element.classList.add(stateClass);
}

function renderParkingMarkers(spaces) {
  const visibleKeys = new Set();

  spaces.forEach((space) => {
    const key = parkingMarkerKey(space);
    const latLng = [space.gpsCoordinates.latitude, space.gpsCoordinates.longitude];
    let marker = parkingMarkers.get(key);
    visibleKeys.add(key);

    if (marker) {
      marker.setLatLng(latLng);
      marker.setPopupContent(popupContent(space));
      setParkingMarkerState(marker, "parking-marker--visible");
      return;
    }

    marker = L.marker(latLng, {
      icon: createParkingIcon(),
    })
      .bindPopup(popupContent(space))
      .addTo(markerLayer);

    parkingMarkers.set(key, marker);
    requestAnimationFrame(() => {
      setParkingMarkerState(marker, "parking-marker--visible");
    });
  });

  parkingMarkers.forEach((marker, key) => {
    if (visibleKeys.has(key)) {
      return;
    }

    parkingMarkers.delete(key);
    setParkingMarkerState(marker, "parking-marker--leaving");
    window.setTimeout(() => {
      markerLayer.removeLayer(marker);
    }, PARKING_MARKER_TRANSITION_MS);
  });
}

function renderMap(center, spaces) {
  renderLocationMarker();
  renderSearchOverlay(center, { showMarker: searchMode === "map" });
  renderParkingMarkers(spaces);

  const bounds = L.latLngBounds([[center.lat, center.lng]]);
  spaces.forEach((space) => bounds.extend([space.gpsCoordinates.latitude, space.gpsCoordinates.longitude]));
  if (searchMode === "location" && !hasFitInitialLocationBounds) {
    hasFitInitialLocationBounds = true;
    map.fitBounds(bounds, { padding: [72, 72], maxZoom: 18, animate: true, duration: 0.8 });
  }
}

function renderLocationMarker() {
  if (!currentLocation) {
    return;
  }

  if (userMarker) {
    userMarker.setLatLng([currentLocation.lat, currentLocation.lng]);
    return;
  }

  userMarker = L.marker([currentLocation.lat, currentLocation.lng], { icon: createUserIcon(), zIndexOffset: 1000 }).addTo(map);
}

function renderSearchOverlay(center, options = {}) {
  const { showMarker = true } = options;
  const radiusClass = showMarker ? "search-radius search-radius--active" : "search-radius search-radius--passive";
  overlayLayer.clearLayers();
  searchMarker = null;
  searchCircle = null;

  if (!center) {
    return;
  }

  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0b84ff";
  searchCircle = L.circle([center.lat, center.lng], {
    radius: SEARCH_RADIUS_METERS,
    interactive: false,
    color: accent,
    fillColor: accent,
    fillOpacity: showMarker ? 0.11 : 0.045,
    opacity: showMarker ? 0.9 : 0.42,
    weight: 3,
    dashArray: "10 8",
    className: radiusClass,
  }).addTo(overlayLayer);

  if (!showMarker) {
    return;
  }

  searchMarker = L.marker([center.lat, center.lng], {
    icon: createSearchIcon(),
    interactive: false,
    zIndexOffset: 900,
  }).addTo(overlayLayer);
}

function updateSearchOverlay(center) {
  if (!searchCircle) {
    renderSearchOverlay(center, { showMarker: searchMode === "map" });
    return;
  }

  searchCircle.setLatLng([center.lat, center.lng]);

  if (searchMarker) {
    searchMarker.setLatLng([center.lat, center.lng]);
  }
}

function mapCenter() {
  const center = map.getCenter();
  return { lat: center.lat, lng: center.lng };
}

function updateSearchHereButton() {
  const hasMoved = distanceMeters(currentCenter, pendingSearchCenter) >= MIN_SEARCH_MOVE_METERS;
  elements.searchHere.hidden = searchMode !== "map" || !hasMoved;
}

function updateModeButtons() {
  elements.modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === searchMode));
  });
}

function setSearchMode(nextMode) {
  if (searchMode === nextMode) {
    return;
  }

  searchMode = nextMode;
  updateModeButtons();

  if (searchMode === "map") {
    pendingSearchCenter = mapCenter();
    renderSearchOverlay(pendingSearchCenter);
    setStatus("Mozgasd a térképet a keresési kör kijelöléséhez.");
    updateSearchHereButton();
    return;
  }

  renderSearchOverlay(currentLocation || currentCenter, { showMarker: false });
  elements.searchHere.hidden = true;

  if (currentLocation) {
    updateCurrentLocation(currentLocation, { forceFetch: false });
  }
}

async function loadParkingSpaces(center, usingFallbackLocation = false) {
  if (isLoading) {
    return;
  }

  currentCenter = center;
  isUsingFallbackLocation = usingFallbackLocation;
  lastFetchCenter = center;
  const loadingStartedAt = Date.now();
  setRefreshLoading(true);

  try {
    const response = await fetch(
      `/api/sensors?lat=${encodeURIComponent(center.lat)}&lng=${encodeURIComponent(
        center.lng
      )}&radius_meters=${SEARCH_DIAMETER_METERS}`
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    currentSpaces = normalizeSpaces(await response.json(), center);
    renderFilteredSpaces(center, usingFallbackLocation);
  } catch (error) {
    currentSpaces = normalizeSpaces(fallbackSpaces, center);
    renderFilteredSpaces(center, true, "warning");
  } finally {
    const remainingLoadingMs = MIN_REFRESH_LOADING_MS - (Date.now() - loadingStartedAt);
    if (remainingLoadingMs > 0) {
      await delay(remainingLoadingMs);
    }

    setRefreshLoading(false);
    updateSearchHereButton();
  }
}

function isForegroundTab() {
  return document.visibilityState !== "hidden";
}

function loadParkingSpacesWhenForeground(center, usingFallbackLocation = false) {
  if (!isForegroundTab()) {
    needsForegroundRefresh = true;
    return;
  }

  loadParkingSpaces(center, usingFallbackLocation);
}

function updateCurrentLocation(center) {
  currentLocation = center;
  isUsingFallbackLocation = false;
  renderLocationMarker();

  if (searchMode === "map") {
    return;
  }

  currentCenter = center;
  updateSearchOverlay(center);
  map.panTo([center.lat, center.lng], { animate: true, duration: 0.8 });

  if (!lastFetchCenter || distanceMeters(lastFetchCenter, center) >= MIN_REFETCH_DISTANCE_METERS) {
    loadParkingSpacesWhenForeground(center);
  }
}

function useFallbackLocation(message) {
  setStatus(`${message} Az alapértelmezett környéket mutatom.`, "warning");
  loadParkingSpacesWhenForeground(BUDAPEST_CENTER, true);
}

function refreshAfterReturningToForeground() {
  if (!isForegroundTab() || !needsForegroundRefresh) {
    return;
  }

  needsForegroundRefresh = false;
  loadParkingSpaces(searchMode === "map" ? currentCenter : currentLocation || currentCenter, isUsingFallbackLocation);
}

function moveDebugLocation(direction) {
  isDebugLocationActive = true;
  updateCurrentLocation(offsetLocation(currentLocation || currentCenter || BUDAPEST_CENTER, direction));
}

function setupDebugDriveControls() {
  if (!isLocalDebugMode() || !elements.debugDrive) {
    return;
  }

  elements.debugDrive.hidden = false;
  elements.debugMoveButtons.forEach((button) => {
    button.addEventListener("click", () => {
      moveDebugLocation(button.dataset.debugMove);
    });
  });
}

function start() {
  if (!navigator.geolocation) {
    useFallbackLocation("A helyzet nem elérhető.");
    return;
  }

  const handlePosition = (position) => {
    if (isDebugLocationActive) {
      return;
    }

    updateCurrentLocation({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
  };

  const handleError = (error) => {
    if (!lastFetchCenter) {
      useFallbackLocation(error.message || "Nem sikerült lekérni a helyzeted.");
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
  loadParkingSpaces(searchMode === "map" ? pendingSearchCenter : currentCenter, isUsingFallbackLocation);
  elements.searchHere.hidden = true;
});

elements.searchHere.addEventListener("click", () => {
  pendingSearchCenter = mapCenter();
  loadParkingSpaces(pendingSearchCenter, false);
  elements.searchHere.hidden = true;
});

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setSearchMode(button.dataset.mode);
  });
});

elements.filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    elements.filters.forEach((filterButton) => {
      filterButton.setAttribute("aria-pressed", String(filterButton === button));
    });
    renderFilteredSpaces(currentCenter, isUsingFallbackLocation);
  });
});

elements.info.addEventListener("click", () => {
  const isOpen = elements.info.getAttribute("aria-expanded") === "true";
  elements.info.setAttribute("aria-expanded", String(!isOpen));
  elements.infoPanel.hidden = isOpen;
});

document.addEventListener("click", (event) => {
  if (elements.infoPanel.hidden || event.target.closest(".info-control")) {
    return;
  }

  elements.info.setAttribute("aria-expanded", "false");
  elements.infoPanel.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || elements.infoPanel.hidden) {
    return;
  }

  elements.info.setAttribute("aria-expanded", "false");
  elements.infoPanel.hidden = true;
  elements.info.focus();
});

document.addEventListener("visibilitychange", refreshAfterReturningToForeground);
window.addEventListener("focus", refreshAfterReturningToForeground);

map.on("move", () => {
  if (searchMode !== "map") {
    return;
  }

  pendingSearchCenter = mapCenter();
  updateSearchOverlay(pendingSearchCenter);
  updateSearchHereButton();
});

if (themeMedia.addEventListener) {
  themeMedia.addEventListener("change", updateTileTheme);
} else {
  themeMedia.addListener(updateTileTheme);
}

setupDebugDriveControls();
start();
setInterval(() => {
  loadParkingSpacesWhenForeground(currentCenter, isUsingFallbackLocation);
}, AUTO_REFRESH_MS);
