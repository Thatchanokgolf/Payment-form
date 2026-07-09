# Dormitory Rent — Payment Form

A small web app for collecting monthly dormitory rent payments.

- **Frontend:** HTML + Tailwind CSS (CDN), vanilla JS
- **Backend:** Netlify Functions
- **Database:** Neon (PostgreSQL)
- **Deploy:** GitHub → Netlify (auto-deploy on push)

## Languages
The whole UI supports **Thai (default)** and **English**. Toggle with the **EN/ไทย** button
in the top-right of every page; the choice is remembered in the browser.

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

### Public (no login)
- `/` — **Front page**: dormitory details, reservation form, vacant-room view (external), and a login link.
- `/detail.html` — **Dormitory details** (blank placeholder), split into Charal Prasit Lakeview and Baan Mae Miw.
- `/reserve.html` — **Reservation form** (all fields mandatory, incl. bank slip): branch, room, name, surname,
  telephone, home address, Line ID, date of entry (1-year term). A **Check** button verifies room availability
  against the external room DB before reserving; on success a random **7-letter key** is shown for status lookup.
  Saves to Database 5.
- `/status.html` — **Check reservation status**: enter the 7-letter key to see Verified / Unverified.
- `/register.html` — **Registration**: enter your reservation reference key to auto-fill your details
  (or fill them manually) and create a login account. Writes to `app_users` with `validation='yes'`
  when a valid key was used, else `'no'`.

### Internal (login required)
- `/menu.html` — **Main menu** (post-login landing): Payment form, Repair form (external Google Form),
  Reservation form (external), and Contract form.
- `/contract.html` — **Contract form**: shows the room's start/end dates, links to the contract &
  furniture-check PDFs (if present), dormitory rules, extend form, and the external termination form.
  Admins get an edit panel to create/update contracts per room.
- `/extend.html` — **Extend contract**: extend only to end of April or May of next year; submitting
  saves the new end date to the database.
- `/rules.html` — **Dormitory rules** (bilingual), summarized from the residential rental contract (rev. 24/8/2567).
- `/contracts.html` — **Contract management** (Database 4, admin only): add/edit/delete contracts per room.
- `/payment.html` — **Payment form** (Database 2). Pick a room, auto-loads rent + additional bills,
  pulls previous meter readings from the last record, computes electric/water bills and total,
  upload photos (electric bill, water bill, bank slip), submit.
- `/rooms.html` — **Room configuration** (Database 1): rent + fridge/microwave/carpark/common-fee, plus up to 4 labeled "other" bills.
- `/records.html` — view submitted records, filterable by **room** and an inclusive **from/to month range**.
  Click a **new meter reading** to view its photo, or the **Add.** amount to see the additional-bills breakdown.
- `/users.html` — **User management** (Database 3, admin only): add/edit/delete login accounts (id, password, room, role, heading).
- `/reservations.html` — **Reservation management** (Database 5, admin only): view reservations, view bank slips,
  see the lookup key + status, **Verify** a reservation (Unverified → Verified), and delete.

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
