import * as maplibregl from "/vendor/maplibre/maplibre-gl.mjs";
import { CAMPUS_CENTER, DEFAULT_VIEW, MAP_STYLE_URL } from "/js/campus-config.js";
import { configBounds, applyBoundary } from "/js/campus-boundary.js";
import { planRoute, distanceM, walkMinutes } from "/js/routing.js";
import { initLegend } from "/js/legend.js";

const token = localStorage.getItem("pnhs_token");
const userRaw = localStorage.getItem("pnhs_user");
const user = userRaw ? JSON.parse(userRaw) : null;
const isGuest = !user;

const roleChip = document.getElementById("roleChip");
const userLabel = document.getElementById("userLabel");
const logoutBtn = document.getElementById("logoutBtn");
const signInLink = document.getElementById("signInLink");
const trackSection = document.getElementById("trackSection");

if (isGuest) {
  roleChip.textContent = "Guest";
  document.getElementById("mobileRoleChip").textContent = "Guest";
  userLabel.textContent = "Viewing as guest";
  signInLink.classList.remove("hidden-form");
} else {
  roleChip.textContent = user.role;
  roleChip.classList.toggle("admin", user.role === "admin");
  const mobileRoleChip = document.getElementById("mobileRoleChip");
  mobileRoleChip.textContent = user.role;
  mobileRoleChip.classList.toggle("admin", user.role === "admin");
  userLabel.textContent = user.full_name;
  logoutBtn.classList.remove("hidden-form");
  initLogoutConfirmation(logoutBtn, () => {
    localStorage.removeItem("pnhs_token");
    localStorage.removeItem("pnhs_user");
    window.location.href = "/index.html";
  });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

// ---------- Campus-only map setup ----------
// The map is deliberately locked to just the Palo National High School
// grounds — maxBounds stops panning away from campus, minZoom/maxZoom stop
// zooming out to the wider world or in past street level.

const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLE_URL,
  center: [CAMPUS_CENTER.lng, CAMPUS_CENTER.lat],
  zoom: DEFAULT_VIEW.zoom,
  pitch: DEFAULT_VIEW.pitch,
  bearing: DEFAULT_VIEW.bearing,
  maxBounds: configBounds(),
  minZoom: 16.5,
  maxZoom: 20,
  attributionControl: { compact: true },
});

const sidebarToggle = document.getElementById("sidebarToggle");
const shell = document.querySelector(".app-shell");
const savedSidebarState = localStorage.getItem("pnhs_map_sidebar");

function setSidebarCollapsed(collapsed) {
  shell.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand map panel" : "Collapse map panel");
  sidebarToggle.title = collapsed ? "Expand map panel" : "Collapse map panel";
  const mobile = window.innerWidth <= 760;
  sidebarToggle.querySelector("span").innerHTML = mobile
    ? (collapsed ? "&#x25BC;" : "&#x25B2;")
    : (collapsed ? "&#x203A;" : "&#x2039;");
  localStorage.setItem("pnhs_map_sidebar", collapsed ? "collapsed" : "expanded");
  window.requestAnimationFrame(() => map.resize());
  window.setTimeout(() => map.resize(), 260);
}

setSidebarCollapsed(savedSidebarState === "collapsed" && window.innerWidth > 760);

sidebarToggle.addEventListener("click", () => {
  setSidebarCollapsed(!shell.classList.contains("sidebar-collapsed"));
});

window.addEventListener("resize", () => map.resize());

// ---------- Tilt / rotate controls (the "3D street view" camera) ----------
document.getElementById("tiltUp").addEventListener("click", () => map.easeTo({ pitch: Math.min(map.getPitch() + 12, 75), duration: 300 }));
document.getElementById("tiltDown").addEventListener("click", () => map.easeTo({ pitch: Math.max(map.getPitch() - 12, 0), duration: 300 }));
document.getElementById("rotateLeft").addEventListener("click", () => map.easeTo({ bearing: map.getBearing() - 30, duration: 300 }));
document.getElementById("rotateRight").addEventListener("click", () => map.easeTo({ bearing: map.getBearing() + 30, duration: 300 }));
let homeBounds = null; // set once the school boundary has loaded
function goHome(duration) {
  if (homeBounds) map.fitBounds(homeBounds, { padding: 60, pitch: DEFAULT_VIEW.pitch, bearing: DEFAULT_VIEW.bearing, duration });
  else map.easeTo({ center: [CAMPUS_CENTER.lng, CAMPUS_CENTER.lat], ...DEFAULT_VIEW, duration });
}
document.getElementById("resetView").addEventListener("click", () => goHome(500));

async function loadBoundary() {
  const res = await fetch("/api/campus/boundary");
  const { boundary } = await res.json();
  homeBounds = applyBoundary(map, boundary);
  if (homeBounds) goHome(0);
}

// ---------- 3D campus buildings (flat extruded blocks, no texture) ----------
function footprintToGeoJSON(buildings) {
  return {
    type: "FeatureCollection",
    features: buildings
      .filter((b) => Array.isArray(b.footprint) && b.footprint.length >= 3)
      .map((b) => ({
        type: "Feature",
        properties: { id: b.id, name: b.name, height: b.height_m || 9 },
        geometry: {
          type: "Polygon",
          coordinates: [b.footprint.map(([lat, lng]) => [lng, lat])],
        },
      })),
  };
}

async function loadBuildingShapes() {
  const res = await fetch("/api/classrooms/buildings");
  const { buildings } = await res.json();
  const data = footprintToGeoJSON(buildings);
  const src = map.getSource("campus-buildings");
  if (src) {
    src.setData(data);
  } else {
    map.addSource("campus-buildings", { type: "geojson", data });
    map.addLayer({
      id: "campus-buildings-3d",
      type: "fill-extrusion",
      source: "campus-buildings",
      paint: {
        "fill-extrusion-color": "#2b6138",
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.92,
      },
    });
  }
}

// ---------- Classroom markers ----------
const classroomMarkers = new Map();
let selfMarker = null;

function makeEl(className, inner) {
  const el = document.createElement("div");
  el.className = className;
  if (inner) el.innerHTML = inner;
  return el;
}

async function loadClassrooms() {
  const res = await fetch("/api/classrooms");
  const data = await res.json();
  data.classrooms.forEach((c) => {
    const el = makeEl("mk mk-room");
    const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
      `<div class="popup-room">${escapeHtml(c.name || c.room_number)}</div>
       <div class="popup-building">${escapeHtml(c.building_name)} &middot; Room ${escapeHtml(c.room_number)}${c.floor ? " &middot; " + escapeHtml(c.floor) : ""}</div>
       <button type="button" class="popup-nav js-navigate" data-id="${c.id}">Navigate here</button>`
    );
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([c.lng, c.lat])
      .setPopup(popup)
      .addTo(map);
    classroomMarkers.set(c.id, { marker, data: c });
  });
}

// ---------- Classroom search ----------
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

function formatFloor(floor) {
  const value = String(floor || "").trim();
  if (!value) return "";
  const match = value.match(/^(\d+)$/);
  if (!match) return value;
  const number = Number(match[1]);
  const suffix = number % 100 >= 11 && number % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
  return `${number}${suffix} Floor`;
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = "";
  if (!q) return;

  const matches = Array.from(classroomMarkers.values())
    .filter(({ data }) =>
      data.room_number.toLowerCase().includes(q) ||
      (data.name || "").toLowerCase().includes(q) ||
      data.building_name.toLowerCase().includes(q) ||
      (data.floor || "").toLowerCase().includes(q) ||
      formatFloor(data.floor).toLowerCase().includes(q)
    )
    .slice(0, 8);

  matches.forEach(({ data, marker }, i) => {
    const li = document.createElement("li");
    li.style.animationDelay = (i * 22) + "ms";
    const floorBadge = data.floor
      ? `<span class="room-floor">${escapeHtml(formatFloor(data.floor))}</span>`
      : "";
    li.innerHTML = `${escapeHtml(data.name || data.room_number)} ${floorBadge}<div class="room-building">${escapeHtml(data.building_name)} &middot; Room ${escapeHtml(data.room_number)}</div>`;
    li.addEventListener("click", () => {
      map.flyTo({ center: marker.getLngLat(), zoom: 19.3, pitch: 60, duration: 700 });
      marker.togglePopup();
      searchResults.innerHTML = "";
      searchInput.value = "";
    });
    searchResults.appendChild(li);
  });
});

// ---------- Route guide (navigation) ----------
const navPanel = document.getElementById("navPanel");
const navDest = document.getElementById("navDest");
const navInfo = document.getElementById("navInfo");
const navNote = document.getElementById("navNote");
const startNavBtn = document.getElementById("startNavBtn");
const arrivedBtn = document.getElementById("arrivedBtn");
const toastEl = document.getElementById("toast");

let walkways = [];
let navTarget = null; // { id, name, lat, lng }
let destMarker = null;
let lastPos = null;   // { lat, lng, accuracy }
let needFit = false;

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove("show"), 3500);
}

function fmtDist(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

async function loadWalkways() {
  try {
    const res = await fetch("/api/campus/walkways");
    const data = await res.json();
    walkways = data.walkways || [];
  } catch (e) { walkways = []; }
}

function initRouteLayers() {
  const empty = { type: "FeatureCollection", features: [] };
  map.addSource("route", { type: "geojson", data: empty });
  const round = { "line-cap": "round", "line-join": "round" };
  map.addLayer({ id: "route-casing", type: "line", source: "route", layout: round,
    paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.95 } });
  map.addLayer({ id: "route-line", type: "line", source: "route", layout: round,
    filter: ["==", ["get", "mode"], "walkway"],
    paint: { "line-color": "#2563c9", "line-width": 6 } });
  map.addLayer({ id: "route-line-direct", type: "line", source: "route", layout: { "line-join": "round" },
    filter: ["==", ["get", "mode"], "direct"],
    paint: { "line-color": "#2563c9", "line-width": 5, "line-dasharray": [1.6, 1.2] } });
}

function setRouteData(route) {
  const src = map.getSource("route");
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features: route
      ? [{ type: "Feature", properties: { mode: route.mode }, geometry: { type: "LineString", coordinates: route.coords } }]
      : [],
  });
}

function updateNavUI() {
  const active = !!navTarget;
  navPanel.classList.toggle("hidden-form", !active);
  if (!active) return;
  const tracking = watchId !== null;
  startNavBtn.classList.toggle("hidden-form", tracking);
  arrivedBtn.classList.toggle("hidden-form", !tracking);
}

function updateRoute() {
  if (!navTarget) return;
  updateNavUI();
  if (watchId === null) {
    navInfo.textContent = "Turn on your location to see the route.";
    navNote.textContent = isGuest
      ? "Your location is only used on this device. Nothing is sent to the school."
      : "Your live position will be visible to the school while you share it.";
    setRouteData(null);
    return;
  }
  if (!lastPos) {
    navInfo.textContent = "Finding your location…";
    navNote.textContent = "";
    setRouteData(null);
    return;
  }

  const route = planRoute(walkways, lastPos, navTarget);
  setRouteData(route);

  const straight = distanceM(lastPos, navTarget);
  const near = straight <= 20;
  arrivedBtn.classList.toggle("near", near);
  navInfo.textContent = near ? "You're almost there" : `${fmtDist(route.distanceM)} · about ${walkMinutes(route.distanceM)} min walk`;

  let note = near ? "Tap “I've arrived” when you get there." : "Follow the blue line.";
  if (route.mode === "direct" && straight > 15) {
    note = walkways.length
      ? "No mapped walkway connects your spot to this room, so this is a straight line. Follow the dashed line."
      : "The walkways haven't been mapped yet, so this is a straight line. Follow the dashed line.";
  }
  if (lastPos.accuracy && lastPos.accuracy > 40) note += ` GPS is rough right now (about ${Math.round(lastPos.accuracy)} m).`;
  navNote.textContent = note;

  if (needFit) {
    needFit = false;
    const lons = route.coords.map((c) => c[0]), lats = route.coords.map((c) => c[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: fitPadding(), maxZoom: 19.3, pitch: 50, duration: 700 });
  }
}

// Leave room around the route so the open legend never covers it.
function fitPadding() {
  const lg = document.getElementById("legend");
  const open = lg && !lg.classList.contains("collapsed") && window.innerWidth > 760;
  return { top: 90, bottom: open ? lg.getBoundingClientRect().height + 60 : 90, left: 70, right: 70 };
}

function startNavigation(id) {
  const entry = classroomMarkers.get(id);
  if (!entry) return;
  const c = entry.data;
  if (destMarker) { destMarker.remove(); destMarker = null; }
  navTarget = { id, name: c.name || `Room ${c.room_number}`, lat: c.lat, lng: c.lng };
  destMarker = new maplibregl.Marker({ element: makeEl("mk-dest-wrap", '<span class="mk-dest"></span>'), anchor: "center" })
    .setLngLat([c.lng, c.lat]).addTo(map);
  entry.marker.getPopup().remove();
  navDest.textContent = "To: " + navTarget.name;
  needFit = true;
  updateNavUI();
  updateRoute();
}

function endNavigation(arrived) {
  if (!navTarget) return;
  const name = navTarget.name;
  navTarget = null;
  needFit = false;
  if (destMarker) { destMarker.remove(); destMarker = null; }
  setRouteData(null);
  arrivedBtn.classList.remove("near");
  navPanel.classList.add("hidden-form");
  if (arrived) toast(`You've arrived at ${name}`);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".js-navigate");
  if (btn) startNavigation(Number(btn.dataset.id));
});
arrivedBtn.addEventListener("click", () => endNavigation(true));
document.getElementById("cancelNavBtn").addEventListener("click", () => endNavigation(false));
startNavBtn.addEventListener("click", () => { if (watchId === null) startTracking(); });

// ---------- Live location ----------
// Signed-in students/staff broadcast their position to the school (admins see it).
// Guests can use their own location for the route guide, but it never leaves
// their device.
let watchId = null;
let socket = null;
let authReady = false;
let pendingPosition = null;
const toggleBtn = document.getElementById("toggleTrack");
const trackDot = document.getElementById("trackDot");
const trackStatusText = document.getElementById("trackStatusText");
const trackCard = document.querySelector(".track-card");
const trackTitle = document.getElementById("trackTitle");

const TXT = isGuest
  ? { title: "Your location", on: "Hide my location", off: "Show my location",
      statusOn: "Showing your location — only on this device", statusOff: "Location is off" }
  : { title: "Live location", on: "Stop sharing my location", off: "Share my live location",
      statusOn: "Broadcasting your live position", statusOff: "Not sharing your location" };
trackTitle.textContent = TXT.title;
startNavBtn.querySelector(".btn-label").textContent = isGuest ? "Use my location & start" : "Share my location & start";

function setTrackingUI(isOn) {
  trackDot.classList.toggle("live", isOn);
  toggleBtn.classList.toggle("on", isOn);
  trackCard.classList.toggle("is-live", isOn);
  toggleBtn.querySelector(".btn-label").textContent = isOn ? TXT.on : TXT.off;
  trackStatusText.textContent = isOn ? TXT.statusOn : TXT.statusOff;
}

function sendLocation(lat, lng, accuracy) {
  if (isGuest) return; // guests are never sent to the server
  if (!authReady) { pendingPosition = { lat, lng, accuracy }; return; }
  socket.emit("location-update", { lat, lng, accuracy });
}

function ensureSocket() {
  if (isGuest || socket) return socket;
  authReady = false;
  socket = window.io();
  socket.on("connect", () => {
    socket.emit("authenticate", token, (res) => {
      if (res && res.ok) {
        authReady = true;
        if (pendingPosition) {
          sendLocation(pendingPosition.lat, pendingPosition.lng, pendingPosition.accuracy);
          pendingPosition = null;
        }
      }
    });
  });
  socket.on("auth-error", (msg) => {
    trackStatusText.textContent = msg;
    stopTracking();
  });
  return socket;
}

function startTracking() {
  if (!navigator.geolocation) {
    trackStatusText.textContent = "Geolocation is not supported on this device/browser.";
    return;
  }
  ensureSocket();
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      lastPos = { lat: latitude, lng: longitude, accuracy };
      trackStatusText.textContent = TXT.statusOn;
      sendLocation(latitude, longitude, accuracy);
      if (!selfMarker) {
        const el = makeEl("mk-self", '<span class="mk-self-ring"></span><span class="mk-self-core"></span>');
        selfMarker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([longitude, latitude])
          .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText("You are here"))
          .addTo(map);
        if (!navTarget) map.flyTo({ center: [longitude, latitude], zoom: 19.3, pitch: 60, duration: 800 });
      } else {
        selfMarker.setLngLat([longitude, latitude]);
      }
      updateRoute();
    },
    (err) => {
      if (err.code === 1) {
        // Permission denied: stop for real.
        if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        setTrackingUI(false);
        trackStatusText.textContent = "Location permission was denied. Allow it in your browser settings to continue.";
        updateRoute();
        return;
      }
      // Signal lost or timed out (for example, walking indoors): keep the watch and wait.
      trackStatusText.textContent = "Waiting for a GPS signal…";
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
  setTrackingUI(true);
  updateRoute();
}

function stopTracking() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (socket && authReady) socket.emit("location-stop");
  pendingPosition = null;
  lastPos = null;
  if (selfMarker) { selfMarker.remove(); selfMarker = null; }
  setTrackingUI(false);
  updateRoute(); // keeps the destination, asks the user to turn location back on
}

toggleBtn.addEventListener("click", () => {
  if (watchId === null) startTracking();
  else stopTracking();
});

// Popup button: add "Navigate here" to every classroom popup.
initLegend();
setTrackingUI(false);

map.on("load", async () => {
  await loadBuildingShapes();
  await loadBoundary();
  await loadWalkways();
  initRouteLayers();
  loadClassrooms();
});
