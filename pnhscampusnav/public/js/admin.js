import * as maplibregl from "/vendor/maplibre/maplibre-gl.mjs";
import { CAMPUS_CENTER, DEFAULT_VIEW, MAP_STYLE_URL } from "/js/campus-config.js";
import { configBounds, applyBoundary, setMaskVisible } from "/js/campus-boundary.js";
import { initLegend } from "/js/legend.js";

const token = localStorage.getItem("pnhs_token");
const userRaw = localStorage.getItem("pnhs_user");
const me = userRaw ? JSON.parse(userRaw) : null;

if (!me || me.role !== "admin") {
  window.location.href = "/index.html";
}

document.getElementById("userLabel").textContent = me.full_name;
initLogoutConfirmation(document.getElementById("logoutBtn"), () => {
  localStorage.removeItem("pnhs_token");
  localStorage.removeItem("pnhs_user");
  window.location.href = "/index.html";
});

const $ = (id) => document.getElementById(id);
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}
function makeEl(className, inner) {
  const el = document.createElement("div");
  el.className = className;
  if (inner) el.innerHTML = inner;
  return el;
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { localStorage.clear(); window.location.href = "/index.html"; }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function flash(el, message, ok) {
  el.textContent = message;
  el.className = "form-msg show " + (ok ? "ok" : "err");
  setTimeout(() => el.classList.remove("show"), 4000);
}

// ---------- Campus-only map setup ----------

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

window.addEventListener("resize", () => {
  map.resize();
});

document.getElementById("tiltUp").addEventListener("click", () => map.easeTo({ pitch: Math.min(map.getPitch() + 12, 75), duration: 300 }));
document.getElementById("tiltDown").addEventListener("click", () => map.easeTo({ pitch: Math.max(map.getPitch() - 12, 0), duration: 300 }));
document.getElementById("rotateLeft").addEventListener("click", () => map.easeTo({ bearing: map.getBearing() - 30, duration: 300 }));
document.getElementById("rotateRight").addEventListener("click", () => map.easeTo({ bearing: map.getBearing() + 30, duration: 300 }));
document.getElementById("drawTiltUp").addEventListener("click", () => map.easeTo({ pitch: Math.min(map.getPitch() + 12, 75), duration: 300 }));
document.getElementById("drawTiltDown").addEventListener("click", () => map.easeTo({ pitch: Math.max(map.getPitch() - 12, 0), duration: 300 }));
document.getElementById("drawRotateLeft").addEventListener("click", () => map.easeTo({ bearing: map.getBearing() - 30, duration: 300 }));
document.getElementById("drawRotateRight").addEventListener("click", () => map.easeTo({ bearing: map.getBearing() + 30, duration: 300 }));
let homeBounds = null;
let currentBoundary = null;
function goHome(duration) {
  if (homeBounds) map.fitBounds(homeBounds, { padding: 60, pitch: DEFAULT_VIEW.pitch, bearing: DEFAULT_VIEW.bearing, duration });
  else map.easeTo({ center: [CAMPUS_CENTER.lng, CAMPUS_CENTER.lat], ...DEFAULT_VIEW, duration });
}
document.getElementById("resetView").addEventListener("click", () => goHome(500));

function renderBoundaryStatus() {
  const has = Array.isArray(currentBoundary) && currentBoundary.length >= 3;
  $("boundaryStatus").textContent = has ? `Boundary set (${currentBoundary.length} corners).` : "No boundary yet — the map shows the surrounding area.";
  $("drawBoundary").textContent = has ? "Redraw boundary" : "Draw boundary";
  $("clearBoundary").classList.toggle("hidden-form", !has);
}
async function loadBoundary(fit) {
  const { boundary } = await api("/api/campus/boundary");
  currentBoundary = boundary;
  homeBounds = applyBoundary(map, boundary);
  renderBoundaryStatus();
  if (fit && homeBounds) goHome(0);
}

// ---------- Tabs ----------
let activeTab = "live";
const sidebarToggle = $("sidebarToggle");
const shell = document.querySelector(".app-shell");
const savedSidebarState = localStorage.getItem("pnhs_admin_sidebar");

function setSidebarCollapsed(collapsed) {
  shell.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand admin panel" : "Collapse admin panel");
  sidebarToggle.title = collapsed ? "Expand admin panel" : "Collapse admin panel";
  sidebarToggle.querySelector("span").innerHTML = collapsed ? "&#x203A;" : "&#x2039;";
  localStorage.setItem("pnhs_admin_sidebar", collapsed ? "collapsed" : "expanded");
  window.requestAnimationFrame(() => map.resize());
}

if (savedSidebarState === "collapsed" && window.innerWidth > 760) {
  setSidebarCollapsed(true);
}

sidebarToggle.addEventListener("click", () => {
  setSidebarCollapsed(!shell.classList.contains("sidebar-collapsed"));
});

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === activeTab) return;
    if (isDrawing()) cancelDrawing();
    activeTab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    ["live", "classrooms", "users", "history"].forEach((t) => {
      const panel = $("tab-" + t);
      if (t === activeTab) {
        panel.style.display = "flex";
        panel.classList.remove("panel-enter");
        void panel.offsetWidth;
        panel.classList.add("panel-enter");
      } else {
        panel.style.display = "none";
      }
    });
    if (activeTab === "classrooms") { loadBuildings(); loadBuildingList(); }
    if (activeTab === "users") loadUsers();
    if (activeTab === "history") loadHistoryUsers();
    if (activeTab !== "classrooms" && pickMarker) { pickMarker.remove(); pickMarker = null; }
  });
});

// ---------- 3D campus buildings ----------
function footprintToGeoJSON(buildings) {
  return {
    type: "FeatureCollection",
    features: buildings
      .filter((b) => Array.isArray(b.footprint) && b.footprint.length >= 3)
      .map((b) => ({
        type: "Feature",
        properties: { id: b.id, name: b.name, height: b.height_m || 9 },
        geometry: { type: "Polygon", coordinates: [b.footprint.map(([lat, lng]) => [lng, lat])] },
      })),
  };
}
let allBuildings = [];
async function loadBuildingShapes() {
  const { buildings } = await api("/api/classrooms/buildings");
  allBuildings = buildings;
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
  renderBuildingList();
}

// ---------- Classroom markers + search ----------
const classroomMarkers = new Map();
let allClassrooms = [];

async function refreshClassrooms() {
  const data = await api("/api/classrooms");
  allClassrooms = data.classrooms;
  classroomMarkers.forEach(({ marker }) => marker.remove());
  classroomMarkers.clear();
  allClassrooms.forEach((c) => {
    const el = makeEl("mk mk-room");
    const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
      `<div class="popup-room">${escapeHtml(c.name || c.room_number)}</div>
       <div class="popup-building">${escapeHtml(c.building_name)} &middot; Room ${escapeHtml(c.room_number)}${c.floor ? " &middot; " + escapeHtml(c.floor) : ""}</div>`
    );
    const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([c.lng, c.lat]).setPopup(popup).addTo(map);
    classroomMarkers.set(c.id, { marker, data: c });
  });
  renderRoomList();
}

$("searchInput").addEventListener("input", () => {
  const q = $("searchInput").value.trim().toLowerCase();
  const list = $("searchResults");
  list.innerHTML = "";
  if (!q) return;
  Array.from(classroomMarkers.values())
    .filter(({ data }) =>
      data.room_number.toLowerCase().includes(q) ||
      (data.name || "").toLowerCase().includes(q) ||
      data.building_name.toLowerCase().includes(q))
    .slice(0, 8)
    .forEach(({ data, marker }, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = (i * 22) + "ms";
      li.innerHTML = `${escapeHtml(data.name || data.room_number)}<div class="room-building">${escapeHtml(data.building_name)}</div>`;
      li.addEventListener("click", () => {
        map.flyTo({ center: marker.getLngLat(), zoom: 19.3, pitch: 60, duration: 700 });
        marker.togglePopup();
        list.innerHTML = "";
        $("searchInput").value = "";
      });
      list.appendChild(li);
    });
});

// ---------- LIVE: active users ----------
const userMarkers = new Map();
let previousActiveIds = new Set();

function userEl(role) {
  const cls = role === "staff" ? "mk-staff" : "mk-user-live";
  return makeEl(`mk-self ${cls}`, '<span class="mk-self-ring"></span><span class="mk-self-core"></span>');
}

function renderActiveUsers(list) {
  $("activeCount").textContent = list.length;
  const seen = new Set();
  list.forEach((u) => {
    seen.add(u.id);
    if (userMarkers.has(u.id)) {
      userMarkers.get(u.id).setLngLat([u.lng, u.lat]);
    } else {
      const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div class="popup-room">${escapeHtml(u.full_name)}</div><div class="popup-building">${escapeHtml(u.role)}</div>`
      );
      const marker = new maplibregl.Marker({ element: userEl(u.role), anchor: "center" })
        .setLngLat([u.lng, u.lat]).setPopup(popup).addTo(map);
      userMarkers.set(u.id, marker);
    }
  });
  for (const [id, marker] of userMarkers.entries()) {
    if (!seen.has(id)) { marker.remove(); userMarkers.delete(id); }
  }

  const ul = $("activeList");
  ul.innerHTML = "";
  if (list.length === 0) {
    ul.innerHTML = '<li class="empty-note">No one is currently sharing their location.</li>';
    previousActiveIds = seen;
    return;
  }
  list.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)).forEach((u) => {
    const li = document.createElement("li");
    const isNew = !previousActiveIds.has(u.id);
    if (isNew) li.classList.add("just-joined");
    li.innerHTML = `<div class="active-name">${escapeHtml(u.full_name)}</div><div class="active-meta">${escapeHtml(u.role)} &middot; updated ${new Date(u.updated_at).toLocaleTimeString()}</div>`;
    li.addEventListener("click", () => {
      map.flyTo({ center: [u.lng, u.lat], zoom: 19.3, pitch: 60, duration: 700 });
      userMarkers.get(u.id)?.togglePopup();
    });
    ul.appendChild(li);
  });
  previousActiveIds = seen;
}

const socket = window.io();
socket.on("connect", () => socket.emit("authenticate", token));
socket.on("active-users", renderActiveUsers);
socket.on("auth-error", (msg) => { alert(msg); window.location.href = "/index.html"; });

// ---------- CLASSROOMS: manage ----------
let editingId = null;
let pickMarker = null;
let drawMode = null; // null | { kind: "building", id } | { kind: "boundary" } | { kind: "walkway" }
const isDrawing = () => drawMode !== null;
let drawPoints = []; // [{lat,lng}, ...] while drawing
let drawVertexMarkers = [];

map.on("click", (e) => {
  if (isDrawing()) {
    addDrawPoint(e.lngLat.lat, e.lngLat.lng);
    return;
  }
  if (activeTab !== "classrooms") return;
  $("roomLat").value = e.lngLat.lat.toFixed(6);
  $("roomLng").value = e.lngLat.lng.toFixed(6);
  if (pickMarker) pickMarker.setLngLat(e.lngLat);
  else pickMarker = new maplibregl.Marker({ element: makeEl("mk mk-pick"), anchor: "center" }).setLngLat(e.lngLat).addTo(map);
});

async function loadBuildings() {
  const { buildings } = await api("/api/classrooms/buildings");
  const sel = $("roomBuilding");
  const current = sel.value;
  sel.innerHTML = buildings.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  if (current) sel.value = current;
}

function resetRoomForm() {
  editingId = null;
  ["roomNumber", "roomFloor", "roomName", "roomLat", "roomLng"].forEach((id) => ($(id).value = ""));
  $("roomFormTitle").textContent = "Add a classroom";
  $("saveRoom").querySelector(".btn-label").textContent = "Save classroom";
  $("cancelEdit").classList.add("hidden-form");
  if (pickMarker) { pickMarker.remove(); pickMarker = null; }
}
$("cancelEdit").addEventListener("click", resetRoomForm);

$("saveRoom").addEventListener("click", async () => {
  const payload = {
    building_id: Number($("roomBuilding").value),
    room_number: $("roomNumber").value.trim(),
    floor: $("roomFloor").value.trim(),
    name: $("roomName").value.trim(),
    lat: parseFloat($("roomLat").value),
    lng: parseFloat($("roomLng").value),
  };
  if (!payload.building_id || !payload.room_number || Number.isNaN(payload.lat) || Number.isNaN(payload.lng)) {
    return flash($("formMsg"), "Building, room number, and a map location are required.", false);
  }
  try {
    if (editingId) await api("/api/classrooms/" + editingId, "PUT", payload);
    else await api("/api/classrooms", "POST", payload);
    flash($("formMsg"), editingId ? "Classroom updated." : "Classroom added.", true);
    resetRoomForm();
    await refreshClassrooms();
  } catch (err) {
    flash($("formMsg"), err.message, false);
  }
});

$("addBuilding").addEventListener("click", async () => {
  const name = $("buildingName").value.trim();
  if (!name) return;
  try {
    await api("/api/classrooms/buildings", "POST", { name });
    $("buildingName").value = "";
    await loadBuildings();
    await loadBuildingList();
    flash($("formMsg"), "Building added. Now draw its 3D shape below.", true);
  } catch (err) {
    flash($("formMsg"), err.message, false);
  }
});

function renderRoomList() {
  $("roomCount").textContent = allClassrooms.length;
  const ul = $("roomList");
  ul.innerHTML = "";
  allClassrooms.forEach((c) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="item-main"><div class="item-title">${escapeHtml(c.name || c.room_number)}</div>
      <div class="item-sub">${escapeHtml(c.building_name)} &middot; Room ${escapeHtml(c.room_number)}</div></div>
      <div class="item-actions"><button class="link-btn" data-act="edit">Edit</button><button class="link-btn danger" data-act="del">Delete</button></div>`;
    li.querySelector('[data-act="edit"]').addEventListener("click", () => {
      editingId = c.id;
      $("roomBuilding").value = c.building_id;
      $("roomNumber").value = c.room_number;
      $("roomFloor").value = c.floor || "";
      $("roomName").value = c.name || "";
      $("roomLat").value = c.lat;
      $("roomLng").value = c.lng;
      $("roomFormTitle").textContent = "Edit classroom";
      $("saveRoom").querySelector(".btn-label").textContent = "Update classroom";
      $("cancelEdit").classList.remove("hidden-form");
      map.flyTo({ center: [c.lng, c.lat], zoom: 19.3, duration: 600 });
      if (pickMarker) pickMarker.setLngLat([c.lng, c.lat]);
      else pickMarker = new maplibregl.Marker({ element: makeEl("mk mk-pick"), anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map);
    });
    li.querySelector('[data-act="del"]').addEventListener("click", async () => {
      if (!confirm(`Delete ${c.name || c.room_number}?`)) return;
      try { await api("/api/classrooms/" + c.id, "DELETE"); await refreshClassrooms(); }
      catch (err) { flash($("formMsg"), err.message, false); }
    });
    ul.appendChild(li);
  });
}

// ---------- Drawing tool (building shapes, campus boundary, walkways) ----------
const drawToolbar = $("drawToolbar");
const drawStatus = $("drawStatus");
const drawHeight = $("drawHeight");
const drawFinish = $("drawFinish");

const minPoints = () => (drawMode && drawMode.kind === "walkway" ? 2 : 3);
function refreshDrawUI() {
  const hints = {
    building: "Click the map to place corners",
    boundary: "Click the map to trace the school's outline",
    walkway: "Click along the path to trace it",
  };
  drawStatus.textContent = `${hints[drawMode.kind]} (${drawPoints.length} points)`;
  drawFinish.disabled = drawPoints.length < minPoints();
}

function clearDrawVertices() {
  drawVertexMarkers.forEach((m) => m.remove());
  drawVertexMarkers = [];
  if (map.getLayer("draw-preview-fill")) map.removeLayer("draw-preview-fill");
  if (map.getLayer("draw-preview-line")) map.removeLayer("draw-preview-line");
  if (map.getSource("draw-preview")) map.removeSource("draw-preview");
}

function renderDrawPreview() {
  const coords = drawPoints.map((p) => [p.lng, p.lat]);
  drawVertexMarkers.forEach((m) => m.remove());
  drawVertexMarkers = drawPoints.map(
    (p) => new maplibregl.Marker({ element: makeEl("mk mk-vertex"), anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(map)
  );

  const asLine = drawMode && drawMode.kind === "walkway";
  const geojson = !asLine && coords.length >= 3
    ? { type: "Feature", geometry: { type: "Polygon", coordinates: [[...coords, coords[0]]] } }
    : { type: "Feature", geometry: { type: "LineString", coordinates: coords } };

  if (map.getSource("draw-preview")) {
    map.getSource("draw-preview").setData(geojson);
  } else if (coords.length > 0) {
    map.addSource("draw-preview", { type: "geojson", data: geojson });
    map.addLayer({
      id: "draw-preview-fill",
      type: "fill",
      source: "draw-preview",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#a6392a", "fill-opacity": 0.25 },
    });
    map.addLayer({
      id: "draw-preview-line",
      type: "line",
      source: "draw-preview",
      paint: { "line-color": "#a6392a", "line-width": 2, "line-dasharray": [2, 1] },
    });
  }
}

// Walkways should join cleanly: a new point near an existing walkway point
// (or an earlier point in this drawing) snaps onto it.
function snapToWalkwayPoint(lngLat) {
  const here = map.project(lngLat);
  let best = null;
  const candidates = [...walkways.flat().map(([lat, lng]) => ({ lat, lng })), ...drawPoints];
  candidates.forEach((c) => {
    const px = map.project([c.lng, c.lat]);
    const d = Math.hypot(px.x - here.x, px.y - here.y);
    if (d <= 12 && (!best || d < best.d)) best = { d, c };
  });
  return best ? best.c : null;
}

function addDrawPoint(lat, lng) {
  if (drawMode && drawMode.kind === "walkway") {
    const snap = snapToWalkwayPoint([lng, lat]);
    if (snap) { lat = snap.lat; lng = snap.lng; }
  }
  drawPoints.push({ lat, lng });
  refreshDrawUI();
  renderDrawPreview();
}

function startDrawing(buildingId, existingFootprint, existingHeight) {
  if (isDrawing()) cancelDrawing();
  drawMode = { kind: "building", id: buildingId };
  drawPoints = (existingFootprint || []).map(([lat, lng]) => ({ lat, lng }));
  drawHeight.value = existingHeight || 9;
  $("drawHeightLabel").classList.remove("hidden-form");
  drawToolbar.classList.remove("hidden-form");
  refreshDrawUI();
  renderDrawPreview();
  map.flyTo({ center: [CAMPUS_CENTER.lng, CAMPUS_CENTER.lat], zoom: 18.5, pitch: 30, duration: 500 });
}

function endDrawing() {
  const was = drawMode;
  drawMode = null;
  $("drawHeightLabel").classList.remove("hidden-form");
  if (was && was.kind === "boundary") applyBoundary(map, currentBoundary); // restore the cover + lock
  drawPoints = [];
  clearDrawVertices();
  drawToolbar.classList.add("hidden-form");
}

function cancelDrawing() {
  endDrawing();
}

$("drawUndo").addEventListener("click", () => {
  if (!isDrawing()) return;
  drawPoints.pop();
  refreshDrawUI();
  renderDrawPreview();
});
$("drawCancel").addEventListener("click", cancelDrawing);

function startBoundaryDrawing() {
  if (isDrawing()) cancelDrawing();
  drawMode = { kind: "boundary" };
  drawPoints = [];
  $("drawHeightLabel").classList.add("hidden-form");
  drawToolbar.classList.remove("hidden-form");
  refreshDrawUI();
  setMaskVisible(map, false);            // show the surroundings while tracing
  map.setMaxBounds(configBounds(4));     // allow room to trace a wider area
  renderDrawPreview();
}
$("drawBoundary").addEventListener("click", startBoundaryDrawing);
$("clearBoundary").addEventListener("click", async () => {
  if (!confirm("Remove the campus boundary? The map will show the surroundings again.")) return;
  try {
    await api("/api/campus/boundary", "PUT", { boundary: null });
    await loadBoundary(false);
  } catch (err) { flash($("formMsg"), err.message, false); }
});

function startWalkwayDrawing() {
  if (isDrawing()) cancelDrawing();
  drawMode = { kind: "walkway" };
  drawPoints = [];
  $("drawHeightLabel").classList.add("hidden-form");
  drawToolbar.classList.remove("hidden-form");
  refreshDrawUI();
  renderDrawPreview();
}
$("drawWalkway").addEventListener("click", startWalkwayDrawing);

$("drawFinish").addEventListener("click", async () => {
  if (!isDrawing() || drawPoints.length < minPoints()) return;
  const mode = drawMode;
  const pts = drawPoints.map((p) => [p.lat, p.lng]);
  try {
    if (mode.kind === "boundary") {
      await api("/api/campus/boundary", "PUT", { boundary: pts });
      flash($("formMsg"), "Campus boundary saved.", true);
      endDrawing();
      await loadBoundary(true);
    } else if (mode.kind === "walkway") {
      await api("/api/campus/walkways", "PUT", { walkways: [...walkways, pts] });
      flash($("formMsg"), "Walkway saved.", true);
      endDrawing();
      await loadWalkways();
    } else {
      const height_m = Number(drawHeight.value) || 9;
      await api(`/api/classrooms/buildings/${mode.id}`, "PUT", { footprint: pts, height_m });
      flash($("formMsg"), "Building shape saved.", true);
      endDrawing();
      await loadBuildingShapes();
    }
  } catch (err) {
    flash($("formMsg"), err.message, false);
  }
});

// ---------- Walkways (the paths the route guide follows) ----------
let walkways = [];

function walkwaysGeoJSON() {
  return {
    type: "FeatureCollection",
    features: walkways.map((w, i) => ({
      type: "Feature",
      properties: { i },
      geometry: { type: "LineString", coordinates: w.map(([lat, lng]) => [lng, lat]) },
    })),
  };
}

function renderWalkways() {
  const data = walkwaysGeoJSON();
  const src = map.getSource("walkways");
  if (src) {
    src.setData(data);
  } else {
    const before = map.getLayer("campus-buildings-3d") ? "campus-buildings-3d" : undefined;
    map.addSource("walkways", { type: "geojson", data });
    map.addLayer({ id: "walkways-casing", type: "line", source: "walkways",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 } }, before);
    map.addLayer({ id: "walkways-line", type: "line", source: "walkways",
      layout: { "line-join": "round" },
      paint: { "line-color": "#4a5547", "line-width": 3, "line-dasharray": [2, 1.2] } }, before);
  }
  renderWalkwayList();
}

async function loadWalkways() {
  const data = await api("/api/campus/walkways");
  walkways = data.walkways || [];
  renderWalkways();
}

function renderWalkwayList() {
  const ul = $("walkwayList");
  if (!ul) return;
  ul.innerHTML = "";
  if (walkways.length === 0) {
    ul.innerHTML = '<li class="empty-note">No walkways yet — students will get a straight line instead of a route along the paths.</li>';
    return;
  }
  walkways.forEach((w, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="item-main"><div class="item-title">Walkway ${i + 1}</div>
      <div class="item-sub">${w.length} points</div></div>
      <div class="item-actions"><button class="link-btn" data-act="show">Show</button><button class="link-btn danger" data-act="del">Delete</button></div>`;
    li.querySelector('[data-act="show"]').addEventListener("click", () => {
      const lons = w.map((p) => p[1]), lats = w.map((p) => p[0]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 90, maxZoom: 19.5, duration: 500 });
    });
    li.querySelector('[data-act="del"]').addEventListener("click", async () => {
      if (!confirm(`Delete walkway ${i + 1}?`)) return;
      try {
        await api("/api/campus/walkways", "PUT", { walkways: walkways.filter((_, k) => k !== i) });
        await loadWalkways();
      } catch (err) { flash($("formMsg"), err.message, false); }
    });
    ul.appendChild(li);
  });
}

async function loadBuildingList() {
  const { buildings } = await api("/api/classrooms/buildings");
  allBuildings = buildings;
  renderBuildingList();
}

function renderBuildingList() {
  const ul = $("buildingList");
  if (!ul) return;
  ul.innerHTML = "";
  allBuildings.forEach((b) => {
    const hasShape = Array.isArray(b.footprint) && b.footprint.length >= 3;
    const li = document.createElement("li");
    li.innerHTML = `<div class="item-main"><div class="item-title">${escapeHtml(b.name)}</div>
      <div class="item-sub">${hasShape ? `${b.height_m}m tall &middot; shape set` : "No 3D shape yet"}</div></div>
      <div class="item-actions">
        <button class="link-btn" data-act="draw">${hasShape ? "Redraw" : "Draw shape"}</button>
        <button class="link-btn danger" data-act="del">Delete</button>
      </div>`;
    li.querySelector('[data-act="draw"]').addEventListener("click", () => startDrawing(b.id, b.footprint, b.height_m));
    li.querySelector('[data-act="del"]').addEventListener("click", async () => {
      if (!confirm(`Delete ${b.name}? This also deletes its classrooms.`)) return;
      try {
        await api("/api/classrooms/buildings/" + b.id, "DELETE");
        await loadBuildings();
        await loadBuildingList();
        await loadBuildingShapes();
        await refreshClassrooms();
      } catch (err) {
        flash($("formMsg"), err.message, false);
      }
    });
    ul.appendChild(li);
  });
}

// ---------- USERS ----------
async function loadUsers() {
  const { users } = await api("/api/users");
  $("userCount").textContent = users.length;
  const ul = $("userList");
  ul.innerHTML = "";
  users.forEach((u) => {
    const isMe = u.id === me.id;
    const pending = u.approval_status === "pending";
    const status = u.approval_status || "approved";
    const li = document.createElement("li");
    li.innerHTML = `<div class="item-main"><div class="item-title">${escapeHtml(u.full_name)}${isMe ? " (you)" : ""}</div>
      <div class="item-sub">@${escapeHtml(u.username)} · ${escapeHtml(u.id_number || "No ID")} · <strong>${escapeHtml(status)}</strong></div></div>
      <div class="item-actions">
        ${pending ? `<button class="link-btn" data-act="approve">Approve</button><button class="link-btn danger" data-act="reject">Reject</button>` : ""}
        <select ${isMe ? "disabled" : ""}>
          ${["admin", "staff", "student"].map((r) => `<option value="${r}" ${r === u.role ? "selected" : ""}>${r}</option>`).join("")}
        </select>
        ${isMe ? "" : '<button class="link-btn danger">Delete</button>'}
      </div>`;
    li.querySelector('[data-act="approve"]')?.addEventListener("click", async () => {
      try { await api(`/api/users/${u.id}/approval`, "PUT", { status: "approved" }); flash($("userMsg"), "Account approved.", true); loadUsers(); }
      catch (err) { flash($("userMsg"), err.message, false); }
    });
    li.querySelector('[data-act="reject"]')?.addEventListener("click", async () => {
      try { await api(`/api/users/${u.id}/approval`, "PUT", { status: "rejected" }); flash($("userMsg"), "Account rejected.", true); loadUsers(); }
      catch (err) { flash($("userMsg"), err.message, false); }
    });
    li.querySelector("select").addEventListener("change", async (e) => {
      try { await api(`/api/users/${u.id}/role`, "PUT", { role: e.target.value }); flash($("userMsg"), "Role updated.", true); }
      catch (err) { flash($("userMsg"), err.message, false); loadUsers(); }
    });
    const del = li.querySelector(".danger");
    if (del) del.addEventListener("click", async () => {
      if (!confirm(`Delete account @${u.username}? Their location history is deleted too.`)) return;
      try { await api("/api/users/" + u.id, "DELETE"); loadUsers(); }
      catch (err) { flash($("userMsg"), err.message, false); }
    });
    ul.appendChild(li);
  });
}

$("createUser").addEventListener("click", async () => {
  const payload = {
    full_name: $("newFullName").value.trim(),
    username: $("newUsername").value.trim(),
    password: $("newPassword").value,
    role: $("newRole").value,
  };
  try {
    await api("/api/users", "POST", payload);
    ["newFullName", "newUsername", "newPassword"].forEach((id) => ($(id).value = ""));
    flash($("userMsg"), "Account created.", true);
    loadUsers();
  } catch (err) {
    flash($("userMsg"), err.message, false);
  }
});

// ---------- HISTORY ----------
let trailLineId = null;
async function loadHistoryUsers() {
  const { users } = await api("/api/users");
  $("historyUser").innerHTML = users
    .filter((u) => u.role !== "admin")
    .map((u) => `<option value="${u.id}">${escapeHtml(u.full_name)} (${u.role})</option>`)
    .join("");
}
function clearTrail() {
  if (map.getLayer("trail-line")) map.removeLayer("trail-line");
  if (map.getLayer("trail-points")) map.removeLayer("trail-points");
  if (map.getSource("trail")) map.removeSource("trail");
  $("historySummary").textContent = "";
}
$("clearTrail").addEventListener("click", clearTrail);
$("showTrail").addEventListener("click", async () => {
  const id = $("historyUser").value;
  if (!id) return;
  clearTrail();
  try {
    const { history } = await api("/api/locations/history/" + id);
    if (history.length === 0) {
      $("historySummary").textContent = "No location history recorded for this user yet.";
      return;
    }
    const points = history.slice().reverse().map((h) => [h.lng, h.lat]);
    map.addSource("trail", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: {} },
          ...points.map((c, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { end: i === points.length - 1 ? 1 : 0, start: i === 0 ? 1 : 0 } })),
        ],
      },
    });
    map.addLayer({ id: "trail-line", type: "line", source: "trail", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#b8791a", "line-width": 4, "line-opacity": 0.85 } });
    map.addLayer({
      id: "trail-points", type: "circle", source: "trail", filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 7,
        "circle-color": ["case", ["==", ["get", "start"], 1], "#245e30", ["==", ["get", "end"], 1], "#9c3b2c", "#b8791a"],
        "circle-stroke-width": 2, "circle-stroke-color": "#fff",
      },
    });
    const lons = points.map((p) => p[0]), lats = points.map((p) => p[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 19.5, duration: 600 });
    $("historySummary").textContent =
      `${history.length} point(s), from ${history[history.length - 1].logged_at} to ${history[0].logged_at}.`;
  } catch (err) {
    $("historySummary").textContent = err.message;
  }
});

initLegend();

map.on("load", async () => {
  await loadBuildingShapes();
  await loadBoundary(true);
  await loadWalkways();
  refreshClassrooms();
});
