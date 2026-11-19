// Shared helper: draws the campus boundary and keeps navigation within
// the Eastern Visayas regional extent.
import { EASTERN_VISAYAS_BOUNDS } from "/js/campus-config.js";

const MASK_SRC = "campus-mask";
const MASK_LAYER = "campus-mask-fill";
const LINE_SRC = "campus-boundary";
const LINE_LAYER = "campus-boundary-line";

// Fallback box used until a boundary is drawn (set in campus-config.js).
export function configBounds(scale = 1) {
  void scale;
  return EASTERN_VISAYAS_BOUNDS;
}

export function boundsOf(boundary, padM = 0) {
  const lats = boundary.map((p) => p[0]);
  const lngs = boundary.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = padM / 111320;
  const dLng = padM / (111320 * Math.cos((midLat * Math.PI) / 180));
  return [
    [Math.min(...lngs) - dLng, Math.min(...lats) - dLat],
    [Math.max(...lngs) + dLng, Math.max(...lats) + dLat],
  ];
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

export function removeBoundaryLayers(map) {
  [MASK_LAYER, LINE_LAYER].forEach((id) => map.getLayer(id) && map.removeLayer(id));
  [MASK_SRC, LINE_SRC].forEach((id) => map.getSource(id) && map.removeSource(id));
}

export function setMaskVisible(map, visible) {
  if (map.getLayer(MASK_LAYER)) map.setLayoutProperty(MASK_LAYER, "visibility", visible ? "visible" : "none");
}

// boundary: array of [lat, lng] (3+ points) or null.
// Returns the locked bounds ([[w,s],[e,n]]) when a boundary exists, else null.
export function applyBoundary(map, boundary) {
  removeBoundaryLayers(map);
  if (!Array.isArray(boundary) || boundary.length < 3) {
    map.setMaxBounds(configBounds());
    return null;
  }

  let ring = boundary.map(([lat, lng]) => [lng, lat]);
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring = [...ring, first];

  // The "world" ring and the campus ring must wind in opposite directions,
  // otherwise the campus would be filled instead of cut out.
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  if (Math.sign(signedArea(world)) === Math.sign(signedArea(ring))) ring = ring.slice().reverse();

  // Insert under the 3D buildings so they stay on top of the cover.
  const before = map.getLayer("campus-buildings-3d") ? "campus-buildings-3d" : undefined;

  map.addSource(MASK_SRC, {
    type: "geojson",
    data: { type: "Feature", geometry: { type: "Polygon", coordinates: [world, ring] }, properties: {} },
  });
  map.addLayer({ id: MASK_LAYER, type: "fill", source: MASK_SRC, paint: { "fill-color": "#faf9f4", "fill-opacity": 0.94 } }, before);

  map.addSource(LINE_SRC, {
    type: "geojson",
    data: { type: "Feature", geometry: { type: "LineString", coordinates: ring }, properties: {} },
  });
  map.addLayer({ id: LINE_LAYER, type: "line", source: LINE_SRC, paint: { "line-color": "#2b6138", "line-width": 3 } }, before);

  map.setMaxBounds(EASTERN_VISAYAS_BOUNDS);
  return boundsOf(boundary, 0);
}
