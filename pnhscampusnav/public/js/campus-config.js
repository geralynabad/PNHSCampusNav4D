// ---------------------------------------------------------------
// Campus map settings — edit THIS file to lock the map onto the
// real Palo National High School grounds.
//
// 1. Find the school's center on Google Maps / OpenStreetMap
//    (right-click the middle of the campus -> copy the coordinates).
// 2. Put them in CAMPUS_CENTER below (lat first, then lng).
// 3. Adjust HALF_EXTENT_M so the box covers the whole campus: the map
//    can't be panned or zoomed out beyond this many meters from center.
//
// The values below are PLACEHOLDERS (Palo town center).
// ---------------------------------------------------------------
export const CAMPUS_CENTER = { lat: 11.1583, lng: 124.9917 };
export const HALF_EXTENT_M = 2000;
export const DEFAULT_VIEW = { pitch: 55, bearing: -20, zoom: 18 };
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
