# PNHSCampusNav

A web-based classroom navigation system with GPS live tracking for Palo
National High School — interactive campus map, classroom search, real-time
location tracking, and an admin dashboard.

Built to match the approved technology stack:

| Component | Technology |
|---|---|
| Front End | HTML, CSS, JavaScript, MapLibre GL JS (3D map engine — replaces Leaflet.js from the original proposal) |
| Back End | Node.js (Express + Socket.io) |
| Database | MySQL / MariaDB |
| Location API | Browser Geolocation API |
| Real-Time Communication | WebSockets (Socket.io) |

---

## 1. Requirements

- **Node.js** 18 or later ([nodejs.org](https://nodejs.org))
- **MySQL** or **MariaDB** — either a standalone install, or **XAMPP**
  (common for PH capstone setups; its MySQL is actually MariaDB)

## 2. Set up the database

**Option A — XAMPP**
1. Open the XAMPP Control Panel and start **MySQL**.
2. Open phpMyAdmin (`http://localhost/phpmyadmin`).
3. Create a new database named `pnhscampusnav`.
4. Go to the **Import** tab, choose `server/db/schema.sql`, and click **Go**.
   (This just creates the empty tables — the app seeds demo data itself the
   first time it runs.)

**Option B — MySQL/MariaDB command line**
```bash
mysql -u root -p -e "CREATE DATABASE pnhscampusnav CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p pnhscampusnav < server/db/schema.sql
```

If you'd rather not use the `root` account from the app, create a dedicated
user (adjust the password):
```sql
CREATE USER 'pnhs_app'@'localhost' IDENTIFIED BY 'pnhs_app_pw';
GRANT ALL PRIVILEGES ON pnhscampusnav.* TO 'pnhs_app'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Configure the app

```bash
cp .env.example .env
```
Edit `.env` to match your database (host, user, password, database name).
Two flags worth knowing:
- `DB_SSL=true` — turn on if your MySQL host requires an encrypted
  connection (most cloud database hosts do).
- `NODE_ENV=production` — when set, the app refuses to start unless you've
  also set a real `JWT_SECRET` (not the `dev-secret-change-me` default).
  This is a deliberate safety check, not a bug.

## 4. Install and run

```bash
npm install
npm start
```

You should see:
```
Seeding database with default accounts and sample campus data...
Seed complete.
Default accounts -> admin/admin123, staff1/staff123, student1/student123
PNHSCampusNav server running at http://localhost:3000
```

The seed step only runs once, the first time the `users` table is empty.
Open **http://localhost:3000** in a browser.

## 4b. Deploy on Railway

1. Create a Railway project and deploy this repository from GitHub.
2. Set the service root directory to `pnhscampusnav`.
3. Add a Railway MySQL service to the project and make sure the application
   service can reference its variables.
4. In the application service, set `NODE_ENV=production` and a long random
   `JWT_SECRET`. Railway's MySQL variables (`MYSQLHOST`, `MYSQLPORT`,
   `MYSQLUSER`, `MYSQLPASSWORD`, and `MYSQLDATABASE`) are supported
   automatically; the app also supports explicit `DB_*` references for services
   that need them.
5. Generate a Railway domain from the service's **Networking** settings.
   The health check endpoint is `GET /api/health`.

The database schema and demo data are initialized automatically on the first
successful application start. Replace the demo passwords and campus data
before sharing the deployment publicly.

## 5. Demo accounts

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin — live dashboard, classroom/user management |
| `staff1` | `staff123` | Staff — tracked user |
| `student1` | `student123` | Student — tracked user |

Guests can also click **"Continue as guest"** to browse the map without an
account (view-only, no live tracking).

## 6. Setting up the real campus (3D map)

The map is **locked to the Palo National High School grounds** (it can't be
panned or zoomed out to the rest of the world) and buildings appear as flat,
untextured **3D blocks** you can tilt and rotate (▲ ▼ ↺ ↻ buttons, top-right
of the map; ⟲ resets the view). All of the seeded data is a placeholder, so
before your defense:

1. **Draw the campus boundary.** Sign in as `admin` → **Classrooms** tab →
   *Campus boundary* → **Draw boundary**. Click around the edge of the school
   grounds (at least 3 corners), then **Finish & save**. From then on,
   everything outside that outline is covered and hidden for every user, and
   the map can't be dragged away from the campus. Use **Redraw boundary** to
   change it, or **Remove boundary** to show the surroundings again.
   (Before a boundary exists, the map is locked to a starting box set in
   `public/js/campus-config.js` — put the school's real center coordinates
   there so you can find the campus to trace it.)
2. **Draw each building's 3D shape.** Sign in as `admin` → **Classrooms** tab
   → *3D building shapes* → **Draw shape** (or **Redraw**) next to a building.
   Click the map to place the building's corners (at least 3), set its
   height in meters (about 4 m per floor), then **Finish & save**. The seeded
   Main / Annex / Administration blocks are placeholders: redraw or delete them.
3. **Place each classroom.** In the same tab, add classrooms and **click the
   map** where each room is — latitude and longitude fill in automatically.

OpenStreetMap has no height data for this campus, so building heights must be
entered by hand; there is no way to download them.
4. **Trace the walkways.** Still in the **Classrooms** tab, under *Walkways
   (route guide)*, click **Draw walkway** and click along each path people
   really walk: the loop road, covered walks, shortcuts between buildings.
   Click **Finish & save** for each one. Where two walkways meet, click right
   on an existing point and the new point snaps onto it so the paths join.
   The route guide only follows what you trace; with no walkways it falls back
   to a straight line.

## 6b. Admin dashboard tabs

| Tab | What it does |
|---|---|
| **Live** | Real-time map + list of every student/staff member currently sharing their location |
| **Classrooms** | Add / edit / delete classrooms (click the map to set coordinates), add buildings, draw each building's 3D shape, the campus boundary, and the walkways |
| **Users** | Create accounts with any role, change roles, delete accounts |
| **History** | Pick a tracked user and draw their recent movement trail on the map |

## 6c. Route guide ("Navigate here")

On the map page, search for a classroom (or tap its marker) and press
**Navigate here**. The sidebar shows a *Route guide* card with the destination,
the walking distance and an estimated time. A blue line leads from the user's
live position to the destination along the traced walkways, and it shortens
and updates as they move. When they reach the room they press **I've
arrived**: the line, the destination flag and the card all disappear.
**Cancel navigation** ends it early.

- Signed-in students and staff use the route guide while sharing their live
  location (the same sharing the admin dashboard shows).
- **Guests** can use it too, but their location stays on their own device:
  nothing is sent to the server or saved. The button says "Use my location".
- If no walkway connects the user's spot to the room, the line is dashed and
  straight, and the card says so.
- A **Legend** on the map explains every symbol. It is open on large screens,
  closed on phones, and remembers the user's choice.

## 7. Design notes

The interface uses a forest-green identity, deliberately tuned for a screen
read outdoors in daylight rather than a dim indoor dashboard:

- **Palette:** a brighter, warmer paper background (`#faf9f4`) instead of a
  dim gray, and a more saturated primary green (`#2b6138`) instead of a
  muted/pastel tone — both chosen so the chrome holds contrast against
  glare rather than washing out. Classroom and live-user markers carry a
  thick white ring and drop shadow specifically so they stay legible
  against bright map tiles.
- **Gold is reserved for "live."** It only appears on something currently
  broadcasting a real-time position — the live-tracking toggle, the pulsing
  self-marker, your own dot on the map. Everything else stays in the green/
  ink palette, so gold reliably means "this is moving right now."
- **Motion is purposeful, not decorative.** The signature animated moment
  is the live-tracking marker itself: a soft "sonar" ring expands outward
  from your position continuously while you're sharing it, so it's easy to
  spot yourself at a glance. Everything else (tab switches, search results,
  list updates, button states) uses quick, quiet transitions — meant to be
  felt more than noticed. Motion respects `prefers-reduced-motion`.

## 8. Project structure

```
pnhscampusnav/
├── server/
│   ├── server.js          Express + Socket.io entry point
│   ├── socket.js           Real-time location broadcast logic
│   ├── db/
│   │   ├── schema.sql       MySQL table definitions
│   │   ├── pool.js          mysql2 connection pool
│   │   └── init.js          Schema creation + first-run seeding
│   ├── middleware/auth.js  JWT verification + role checks
│   └── routes/
│       ├── auth.js          login / register
│       ├── classrooms.js    campus map data (CRUD, admin-gated writes)
│       ├── users.js         account management (admin only)
│       ├── campus.js        campus boundary + walkways (read: everyone, write: admin)
│       └── locations.js     location history (admin only)
├── public/
│   ├── index.html          Login / register / guest entry
│   ├── map.html             Student / staff / guest map view
│   ├── admin.html           Admin dashboard (Live / Classrooms / Users / History)
│   ├── css/style.css        Design tokens, components, and animations
│   ├── js/{auth,map,admin}.js
│   ├── js/campus-config.js  Starting center / box / map style (edit this)
│   ├── js/campus-boundary.js Draws the campus cover + lock from the saved boundary
│   ├── js/routing.js         Finds the walking route along the traced walkways
│   ├── js/legend.js          Collapsible map legend
│   └── vendor/maplibre/     MapLibre GL JS vendored locally. The map's street
│                             data comes from OpenFreeMap (free, no API key)
│                             and needs an internet connection.
├── .env.example
└── package.json
```

## 9. How live tracking works

1. A logged-in student or staff member clicks **"Share my live location."**
2. The browser's Geolocation API (`watchPosition`) reports the device's
   coordinates every time they change.
3. Each update is sent to the server over a Socket.io WebSocket connection
   (the client waits for an authentication acknowledgment first, so a fast
   GPS fix can't race ahead of login).
4. The server keeps an in-memory table of currently active users, logs the
   point to the `location_logs` table, and broadcasts the updated list to
   every connected **admin** dashboard.
5. When a user stops sharing (or disconnects), they're removed from the
   live dashboard.

Guests and logged-out visitors can view the map and search for classrooms,
but cannot broadcast a location — matching the system proposal's guest
role (view-only, not tracked).

## 10. Known limitations

- The route guide is only as good as the walkways you trace and the phone's GPS (often off by several meters, and worse next to tall buildings or indoors). It does not know about stairs, closed gates, or which floor a room is on.
- Walkways that nearly touch (within about 6 m) are treated as joined; if two paths should NOT connect, keep them farther apart.

- The map background needs an internet connection (it streams from tiles.openfreemap.org); the app itself runs locally.
- "3D street view" means a tilted/rotatable camera over untextured 3D building blocks — there are no photos or 360° imagery.
- The cover hides the surrounding map but does not stop someone physically being outside the boundary: a tracked user outside it still shows up on the admin dashboard if inside the lock area.
- Classroom markers sit at ground level and don't follow the 3D height of a building when tilted.
- No turn-by-turn walking directions — only live position + labeled map.
- Location accuracy depends on the device's GPS and may drift indoors.
- No NFC/QR checkpoints are used — tracking is GPS-only, exactly as scoped.
- Editing or deleting a *building* is not in the UI yet (you can add
  buildings; deleting one is available via `DELETE /api/classrooms/buildings/:id`,
  which also removes its classrooms).
