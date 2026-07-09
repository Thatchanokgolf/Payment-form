// Registration — creates an app_users (Database 3) account.
// GET  /api/register?key=XXXXXXX  -> reservation details for auto-fill (or {found:false})
// POST /api/register              -> create the account.
//   If a ref_key is provided and matches a reservation, the personal details are taken
//   from that reservation and `validation` is set to 'yes'. Otherwise the submitted
//   details are used and `validation` is 'no'.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const str = (v) => (v == null ? null : String(v).trim() || null);

// Reservation lookup by ref_key, with the date as a plain YYYY-MM-DD string.
async function reservationByKey(key) {
  const rows = await sql`
    SELECT id, branch, room_number, name, surname, telephone, home_address, line_id,
           to_char(date_of_entry, 'YYYY-MM-DD') AS date_of_entry
    FROM reservations WHERE ref_key = ${String(key).toUpperCase()}`;
  return rows[0] || null;
}

export default async (req) => {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const key = str(url.searchParams.get('key'));
      if (!key) return json({ found: false });
      const r = await reservationByKey(key);
      return r ? json({ found: true, ...r }) : json({ found: false });
    }

    if (req.method === 'POST') {
      const b = await req.json();
      const userId = str(b.user_id);
      const password = str(b.password);
      if (!userId || !password) return json({ error: 'Username and password are required.' }, 400);

      const key = str(b.ref_key);
      let resv = null;
      if (key) {
        resv = await reservationByKey(key);
        if (!resv) return json({ error: 'No reservation found for this reference key.' }, 404);
      }

      // Reservation is the source of truth when a valid key is used.
      const validation = resv ? 'yes' : 'no';
      const branch = resv ? resv.branch : str(b.branch);
      const name = resv ? resv.name : str(b.name);
      const surname = resv ? resv.surname : str(b.surname);
      const telephone = resv ? resv.telephone : str(b.telephone);
      const homeAddress = resv ? resv.home_address : str(b.home_address);
      const lineId = resv ? resv.line_id : str(b.line_id);
      const dateOfEntry = resv ? resv.date_of_entry : str(b.date_of_entry);
      const roomNumber = resv ? resv.room_number : str(b.room_number);
      const reservationId = resv ? resv.id : null;

      const rows = await sql`
        INSERT INTO app_users
          (user_id, password, room_number, role, heading,
           reservation_id, branch, name, surname, telephone, home_address, line_id,
           date_of_entry, ref_key, validation)
        VALUES (
          ${userId}, ${password}, ${roomNumber}, 'user', ${branch || ''},
          ${reservationId}, ${branch}, ${name}, ${surname}, ${telephone}, ${homeAddress}, ${lineId},
          ${dateOfEntry}::date, ${key}, ${validation})
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id`;
      if (!rows.length) return json({ error: 'That username is already taken.', taken: true }, 409);
      return json({ ok: true, user_id: rows[0].user_id });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
