// Database 5 — dormitory reservations.
// GET    /api/reservations   -> list all (admin dashboard)
// POST   /api/reservations   -> create a reservation (public form); 1-year term
// DELETE /api/reservations   -> delete by id (admin)
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
// Second Neon DB holding the `room` availability table (roomno, status).
const roomSql = process.env.ROOM_DATABASE_URL ? neon(process.env.ROOM_DATABASE_URL) : null;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const str = (v) => (v == null ? null : String(v).trim() || null);

// Random 7-letter key (A–Z) for looking up reservation status.
const makeKey = () => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let k = '';
  for (let i = 0; i < 7; i++) k += A[Math.floor(Math.random() * A.length)];
  return k;
};

// A room can be reserved only when its status is one of these.
const RESERVABLE = ['Vacant', 'Leave-Vacant'];

// Read the current status of a room (or null if not found / no room DB).
async function getRoomStatus(roomno) {
  if (!roomSql || !roomno) return null;
  const rows = await roomSql`SELECT roomno, status FROM room WHERE roomno = ${String(roomno)}`;
  return rows[0] || null;
}

export default async (req) => {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const id = url.searchParams.get('id');
      const image = url.searchParams.get('image');

      // Public status lookup by the 7-letter reservation key.
      const key = url.searchParams.get('key');
      if (key) {
        const rows = await sql`
          SELECT branch, room_number, status,
                 to_char(date_of_entry, 'YYYY-MM-DD') AS date_of_entry
          FROM reservations WHERE ref_key = ${String(key).toUpperCase()}`;
        if (!rows.length) return json({ found: false });
        return json({ found: true, ...rows[0] });
      }

      // Availability check against the external room DB.
      if (url.searchParams.get('check')) {
        const roomno = url.searchParams.get('room');
        const r = await getRoomStatus(roomno);
        if (!r) return json({ found: false, reservable: false });
        return json({ found: true, roomno: r.roomno, status: r.status, reservable: RESERVABLE.includes(r.status) });
      }

      // Single bank-slip image, fetched on demand (kept out of the list view).
      if (id && image === 'slip') {
        const rows = await sql`SELECT bank_slip_image AS img FROM reservations WHERE id = ${Number(id)}`;
        return json({ image: rows[0]?.img || null });
      }

      const rows = await sql`
        SELECT id, branch, room_number, name, surname, telephone, home_address, line_id,
               to_char(date_of_entry, 'YYYY-MM-DD') AS date_of_entry,
               to_char(end_date,      'YYYY-MM-DD') AS end_date,
               (bank_slip_image IS NOT NULL) AS has_slip,
               ref_key, status, created_at
        FROM reservations ORDER BY created_at DESC`;
      return json(rows);
    }

    if (req.method === 'POST') {
      const b = await req.json();

      // Admin: mark a reservation as Verified.
      if (b.action === 'verify') {
        const id = Number(b.id);
        if (!Number.isFinite(id)) return json({ error: 'id is required' }, 400);
        const rows = await sql`
          UPDATE reservations SET status = 'Verified' WHERE id = ${id}
          RETURNING id, status`;
        return json(rows[0] || { error: 'not found' });
      }

      // All fields are mandatory (including the bank slip).
      const required = ['branch', 'room_number', 'name', 'surname', 'telephone',
        'home_address', 'line_id', 'date_of_entry', 'bank_slip_image'];
      for (const f of required) {
        if (!str(b[f])) return json({ error: 'All fields are required.', field: f }, 400);
      }
      const entry = str(b.date_of_entry);
      const roomno = str(b.room_number);

      // Re-check + atomically claim the room: the UPDATE only succeeds if the room
      // is still reservable, which prevents a double booking. Vacant -> Occupied,
      // Leave-Vacant -> Leave-Reserve.
      if (roomSql) {
        const claimed = await roomSql`
          UPDATE room
          SET old_status = status,
              status = CASE status
                         WHEN 'Vacant' THEN 'Occupied'
                         WHEN 'Leave-Vacant' THEN 'Leave-Reserve'
                         ELSE status
                       END,
              last_update = now()
          WHERE roomno = ${roomno} AND status IN ('Vacant', 'Leave-Vacant')
          RETURNING roomno, old_status AS previous_status, status AS new_status`;
        if (!claimed.length) {
          // Not found or no longer reservable.
          return json({ ok: false, reserved: false, reason: 'unavailable' }, 409);
        }
      }

      // 1-year term: end_date = date_of_entry + 1 year (computed in the database).
      const refKey = makeKey();
      const rows = await sql`
        INSERT INTO reservations
          (branch, room_number, name, surname, telephone, home_address, line_id,
           date_of_entry, end_date, bank_slip_image, ref_key, status)
        VALUES (
          ${str(b.branch)}, ${str(b.room_number)}, ${str(b.name)}, ${str(b.surname)},
          ${str(b.telephone)}, ${str(b.home_address)}, ${str(b.line_id)},
          ${entry}::date, (${entry}::date + INTERVAL '1 year')::date,
          ${b.bank_slip_image || null}, ${refKey}, 'Unverified')
        RETURNING id, ref_key,
                  to_char(date_of_entry, 'YYYY-MM-DD') AS date_of_entry,
                  to_char(end_date,      'YYYY-MM-DD') AS end_date`;
      return json({ ok: true, reserved: true, ...rows[0] });
    }

    if (req.method === 'DELETE') {
      const b = await req.json();
      const id = Number(b.id);
      if (!Number.isFinite(id)) return json({ error: 'id is required' }, 400);
      await sql`DELETE FROM reservations WHERE id = ${id}`;
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
