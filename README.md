# Dormitory Rent — Payment Form

A small web app for collecting monthly dormitory rent payments.

- **Frontend:** HTML + Tailwind CSS (CDN), vanilla JS
- **Backend:** Netlify Functions
- **Database:** Neon (PostgreSQL)
- **Deploy:** GitHub → Netlify (auto-deploy on push)

## Sign in
Login (`/login.html`) verifies credentials server-side against the `app_users` table in
Neon via `POST /api/login`. **Page gating is still client-side (demo, not real security).**
Seeded accounts (see `schema.sql`):

| ID | Password | Role | Heading shown |
|----|----------|------|----------------|
| `Admin` | `1234` | admin | Charal Prasit Management Dashboard |
| `201` | `1234` | user | Charal Prasit Lakeview |
| `2201` | `1234` | user | Baan Mae Miw |

Admins see all pages; users only see the payment form (Rooms/Records are hidden and
direct access redirects them back). Log out via the button at the top right.

## Pages
- `/` — **Payment form** (Database 2). Pick a room, auto-loads rent + additional bills,
  pulls previous meter readings from the last record, computes electric/water bills and total,
  upload photos (electric bill, water bill, bank slip), submit.
- `/rooms.html` — **Room configuration** (Database 1): rent + fridge/microwave/carpark/common-fee, plus up to 4 labeled "other" bills.
- `/records.html` — view submitted records, filterable by **room** and an inclusive **from/to month range**.
  Click a **new meter reading** to view its photo, or the **Add.** amount to see the additional-bills breakdown.
- `/users.html` — **User management** (Database 3, admin only): add/edit/delete login accounts (id, password, room, role, heading).

## Calculation rules
- Electric bill = (this-month meter − previous meter) × **8**
- Water bill = (this-month meter − previous meter) × **20**
- Previous meter = latest record's reading for that room, else **0**
- Additional bills appear only when configured > 0 for the room.

## Quick start
See **[skill.md](skill.md)** for full setup, database schema (`schema.sql`), local dev,
and deployment steps.

```bash
npm install
cp .env.example .env   # add your Neon DATABASE_URL
netlify dev            # http://localhost:8888
```
