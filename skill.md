# skill.md — Settings used to write & deploy this web app

A reusable playbook for building a static **HTML + Tailwind CSS** front end backed by a
**Neon (PostgreSQL)** database through **Netlify serverless functions**, deployed from **GitHub**.

---

## 1. Stack / tooling choices

| Concern        | Choice                                   | Why |
|----------------|------------------------------------------|-----|
| UI             | Plain HTML + Tailwind via CDN (`https://cdn.tailwindcss.com`) | Zero build step; deploys as static files |
| Logic          | Vanilla JS (`fetch`) in each page        | No framework needed for a small form app |
| API            | Netlify Functions (`netlify/functions/*.js`) | Serverless, free tier, same repo |
| DB             | Neon serverless Postgres (`@neondatabase/serverless`) | HTTP driver works in serverless cold starts |
| Hosting / CI   | Netlify, auto-deploy on push to GitHub   | Git-based continuous deployment |
| Bundler        | esbuild (Netlify built-in)               | Bundles the npm dependency for functions |

## 1b. Auth (client-side dummy)

- Users live in the **`app_users` table** (Database 3): `user_id / password / room_number /
  role / heading`. Credentials are verified **server-side** by `POST /api/login`
  (`netlify/functions/login.js`), which returns `{id, room_number, role, heading}` and never
  the password.
- `public/auth.js` is loaded in the `<head>` of every page. `DormAuth.login()` calls
  `/api/login`; on success it stores the session in `localStorage` (`dormAuth`). It also runs
  an **immediate guard** (redirects to `/login.html` when not signed in; sends non-admins away
  from `rooms.html` / `records.html`) and, on `DOMContentLoaded`, sets the role heading
  (`#navHeading`), hides `.nav-admin` links for non-admins, and wires `#logoutBtn`.
- **The page gating is demo-only, not real security** — the data functions (`rooms`,
  `records`) are still open. Passwords are stored plaintext for the demo. For production:
  hash passwords, issue a signed session token from `login`, and verify it inside every
  function. Residents are limited to their own room only in the UI.

## 2. Project layout

```
dorm-rent-app/
├── public/                 # static site root (Netlify `publish`)
│   ├── login.html          # dummy login screen
│   ├── auth.js             # client-side auth guard (loaded by every page)
│   ├── index.html          # payment form (writes Database 2)
│   ├── rooms.html          # manage Database 1 (room config) — admin only
│   ├── records.html        # view Database 2 submissions — admin only
│   └── users.html          # manage Database 3 (login accounts) — admin only
├── netlify/functions/
│   ├── login.js            # verify credentials (Database 3) -> /api/login
│   ├── users.js            # manage app_users (admin) -> /api/users
│   ├── rooms.js            # CRUD for Database 1  -> /api/rooms
│   └── records.js          # list/create Database 2 -> /api/records
├── schema.sql              # run once in Neon SQL editor
├── netlify.toml            # publish dir, functions dir, /api redirects
├── package.json            # @neondatabase/serverless dependency
├── .env.example            # DATABASE_URL template
└── .gitignore
```

## 3. Key configuration settings

### netlify.toml
- `publish = "public"` — serve static files from `/public`.
- `functions = "netlify/functions"` — function source dir.
- `node_bundler = "esbuild"` — required to bundle the Neon driver.
- Redirects map clean `/api/rooms` & `/api/records` → `/.netlify/functions/*`.

### Environment variables (set in Netlify → Site settings → Environment variables)
- `DATABASE_URL` = Neon connection string (`...?sslmode=require`).
  - Also put it in a local `.env` for `netlify dev`.

### Function conventions
- Use the modern Netlify handler signature: `export default async (req) => Response`.
- Always `Math.max(0, curr - prev)` so a meter reset never produces a negative bill.
- Recompute totals **server-side** so stored amounts are authoritative.
- Images are stored as **base64 data URLs** in TEXT columns (fine for a low-volume app;
  switch to object storage if volume grows).

### Business rules baked in
- Electric bill = `(electric_curr - electric_prev) * 8`
- Water bill   = `(water_curr - water_prev) * 20`, with a **minimum charge of 100**
- Previous meter = `electric_curr` / `water_curr` of the most recent record for that room
  whose `bill_month` is **before** the selected Bill Month
  (`GET /api/records?room=X&before=YYYY-MM`); defaults to **0** when none exists.
- Additional bills order: refrigerator, microwave, carpark, **common fee**, then up to
  **4 labeled "other" bills** (each has a `label` describing what it is for). A fixed bill
  shows on the form only when its value in Database 1 is **> 0**; an other-bill shows when
  its amount is **> 0**. Other bills are stored as `JSONB` (`other_bills` = `[{label, amount}]`).
- Other bills are **one-off**: when a payment record is submitted, the room's `other_bills`
  in DB1 are cleared to `[]` (the bill record keeps its own snapshot), so they don't recur.

## 4. Local development

```bash
npm install
npm i -g netlify-cli           # one-time
cp .env.example .env           # paste your Neon DATABASE_URL
netlify dev                    # serves site + functions at http://localhost:8888
```

## 5. Database setup (Neon)

1. Create a project at https://neon.tech and copy the connection string.
2. Open the Neon **SQL Editor** and run the contents of `schema.sql`.

## 6. Deploy (GitHub → Netlify)

1. `git init && git add . && git commit -m "Initial commit"`
2. Create a GitHub repo and push:
   `git remote add origin git@github.com:<you>/dorm-rent-app.git && git push -u origin main`
3. In Netlify: **Add new site → Import from Git → pick the repo.**
   - Build command: *(leave empty)*
   - Publish directory: `public`
   - Functions directory: `netlify/functions` (auto-detected from `netlify.toml`)
4. Add the `DATABASE_URL` environment variable in Netlify.
5. Deploy. Every push to `main` redeploys automatically.
