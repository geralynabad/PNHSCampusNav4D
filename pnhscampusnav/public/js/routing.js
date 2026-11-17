// Walking-route finder for the campus.
//
// Input: the walkways an admin traced (each a list of [lat, lng] points),
// where the user is, and where they want to go. Output: a line that follows
// the walkways, like a ride-hailing app follows roads. If no walkway network
// is available (or the two places aren't connected by one), it falls back to
// a straight line and says so.

const JOIN_M = 6;            // walkways closer than this are treated as joined
const WALK_SPEED_MPS = 1.3;  // average walking speed for the time estimate
const NEAR_M = 15;           // closer than this to the destination: just draw a direct line

export function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function walkMinutes(meters) {
  return Math.max(1, Math.round(meters / WALK_SPEED_MPS / 60));
}

// Local flat projection (meters) around an origin — accurate enough at campus scale.
function makeProjector(origin) {
  const kx = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  const ky = 111320;
  return {
    toXY: (p) => ({ x: (p.lng - origin.lng) * kx, y: (p.lat - origin.lat) * ky }),
    toLL: (q) => ({ lat: origin.lat + q.y / ky, lng: origin.lng + q.x / kx }),
  };
}

// Closest point to p on segment a-b (all in meters). Returns { point, t, dist }.
function projectOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, dist: Math.hypot(p.x - point.x, p.y - point.y) };
}

function buildGraph(walkways, proj) {
  const nodes = [];       // { x, y }
  const adj = [];         // adj[i] = [{ to, w }]
  const segments = [];    // { a, b, path } — node indices
  const pathVertices = []; // pathVertices[pathIndex] = [node indices]

  const addNode = (xy) => { nodes.push({ x: xy.x, y: xy.y }); adj.push([]); return nodes.length - 1; };
  const link = (i, j) => {
    const w = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
    adj[i].push({ to: j, w });
    adj[j].push({ to: i, w });
  };

  walkways.forEach((path, pi) => {
    const ids = path.map(([lat, lng]) => addNode(proj.toXY({ lat, lng })));
    pathVertices.push(ids);
    for (let k = 0; k < ids.length - 1; k++) {
      link(ids[k], ids[k + 1]);
      segments.push({ a: ids[k], b: ids[k + 1], path: pi });
    }
  });

  // Join walkways that meet: vertex-to-vertex, and a vertex touching the
  // middle of another walkway (a T-junction).
  walkways.forEach((_, pi) => {
    pathVertices[pi].forEach((v) => {
      for (let pj = 0; pj < walkways.length; pj++) {
        if (pj === pi) continue;
        pathVertices[pj].forEach((u) => {
          if (Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y) <= JOIN_M) link(v, u);
        });
      }
      segments.slice().forEach((s) => {
        if (s.path === pi) return;
        const pr = projectOnSegment(nodes[v], nodes[s.a], nodes[s.b]);
        if (pr.dist <= JOIN_M && pr.t > 0.02 && pr.t < 0.98) {
          const j = addNode(pr.point);
          link(j, s.a); link(j, s.b); link(v, j);
        }
      });
    });
  });

  return { nodes, adj, segments, addNode, link };
}

// Attach a free point to the nearest walkway. Returns { node, off, seg } or null.
function attach(graph, xy) {
  let best = null;
  graph.segments.forEach((s, idx) => {
    const pr = projectOnSegment(xy, graph.nodes[s.a], graph.nodes[s.b]);
    if (!best || pr.dist < best.dist) best = { ...pr, seg: idx, s };
  });
  if (!best) return null;
  const node = graph.addNode(best.point);
  graph.link(node, best.s.a);
  graph.link(node, best.s.b);
  return { node, off: best.dist, seg: best.seg, xy: best.point };
}

function dijkstra(graph, from, to) {
  const n = graph.nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || dist[u] === Infinity) break;
    if (u === to) break;
    done[u] = true;
    graph.adj[u].forEach(({ to: v, w }) => {
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    });
  }
  if (dist[to] === Infinity) return null;
  const order = [];
  for (let c = to; c !== -1; c = prev[c]) order.push(c);
  return { order: order.reverse(), length: dist[to] };
}

// from, to: { lat, lng }.  walkways: [[ [lat,lng], ... ], ...]
// Returns { coords: [[lng,lat], ...], distanceM, mode: "walkway" | "direct" }
export function planRoute(walkways, from, to) {
  const direct = distanceM(from, to);
  const straight = { coords: [[from.lng, from.lat], [to.lng, to.lat]], distanceM: direct, mode: "direct" };

  const usable = (walkways || []).filter((w) => Array.isArray(w) && w.length >= 2);
  if (usable.length === 0 || direct <= NEAR_M) return straight;

  const proj = makeProjector(from);
  const graph = buildGraph(usable, proj);
  const a = attach(graph, proj.toXY(from));
  const b = attach(graph, proj.toXY(to));
  if (!a || !b) return straight;

  // Both points sit on the same stretch of walkway: connect them directly.
  if (a.seg === b.seg) graph.link(a.node, b.node);

  const found = dijkstra(graph, a.node, b.node);
  if (!found) return straight;

  const total = a.off + found.length + b.off;
  // If following walkways is a huge detour compared with just walking there, don't.
  if (total > direct * 4 && direct < 40) return straight;

  const coords = [[from.lng, from.lat]];
  found.order.forEach((i) => {
    const ll = proj.toLL(graph.nodes[i]);
    coords.push([ll.lng, ll.lat]);
  });
  coords.push([to.lng, to.lat]);
  return { coords, distanceM: total, mode: "walkway" };
}
