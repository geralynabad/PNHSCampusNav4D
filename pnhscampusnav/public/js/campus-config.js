// ---------------------------------------------------------------
// Campus and regional map settings.
// CAMPUS_CENTER is used for the initial location and marker placement.
// EASTERN_VISAYAS_BOUNDS is the jurisdiction used to limit panning.
// ---------------------------------------------------------------
export const CAMPUS_CENTER = { lat: 11.1583, lng: 124.9917 };
// Approximate bounds for Eastern Visayas, used so the map can cover the full
// region instead of being restricted to the Palo National High School area.
export const EASTERN_VISAYAS_BOUNDS = [
  [124.0, 9.5],
  [127.0, 12.8],
];
export const DEFAULT_VIEW = { pitch: 55, bearing: -20, zoom: 18 };
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
