// Database 4 — contracts (one current contract per room).
// GET  /api/contracts                  -> list all (admin)
// GET  /api/contracts?room=101          -> the contract for one room (or null)
// POST /api/contracts                   -> create/update a contract (admin)
// POST /api/contracts {action:'extend', room_number, end_date}
//                                       -> extend the end date (residents)
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// A valid extension date is the end of April (MM-DD = 04-30) or May (05-31).
const isAllowedExtendDate = (s) => /^\d{4}-(04-30|05-31)$/.test(String(s || ''));

export default async (req) => {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const room = url.searchParams.get('room');
      // Dates returned as plain "YYYY-MM-DD" strings to avoid timezone surprises.
      if (room) {
        const rows = await sql`
          SELECT room_number, user_id,
                 to_char(start_date, 'YYYY-MM-DD') AS start_date,
                 to_char(end_date,   'YYYY-MM-DD') AS end_date,
                 contract_pdf_url, furniture_pdf_url
          FROM contracts WHERE room_number = ${room}`;
        return json(rows[0] || null);
      }
      const rows = await sql`
        SELECT room_number, user_id,
               to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date,   'YYYY-MM-DD') AS end_date,
               contract_pdf_url, furniture_pdf_url
        FROM contracts ORDER BY room_number`;
      return json(rows);
    }

    if (req.method === 'POST') {
      const b = await req.json();
      const room = String(b.room_number || '').trim();
      if (!room) return json({ error: 'room_number is required' }, 400);

      // --- Extend: update only the end date, with validation. ---
      if (b.action === 'extend') {
        const newEnd = String(b.end_date || '');
        if (!isAllowedExtendDate(newEnd)) {
          return json({ error: 'Extension must be the end of April or May.' }, 400);
        }
        const cur = await sql`SELECT to_char(end_date,'YYYY-MM-DD') AS end_date FROM contracts WHERE room_number = ${room}`;
        if (!cur.length) return json({ error: 'No contract found for this room.' }, 404);
        // ISO date strings compare correctly lexicographically.
        if (cur[0].end_date && newEnd <= cur[0].end_date) {
          return json({ error: 'New end date must be after the current end date.' }, 400);
        }
        const rows = await sql`
          UPDATE contracts SET end_date = ${newEnd}::date
          WHERE room_number = ${room}
          RETURNING room_number, user_id,
                    to_char(start_date, 'YYYY-MM-DD') AS start_date,
                    to_char(end_date,   'YYYY-MM-DD') AS end_date,
                    contract_pdf_url, furniture_pdf_url`;
        return json(rows[0]);
      }

      // --- Full upsert (admin) ---
      const rows = await sql`
        INSERT INTO contracts
          (room_number, user_id, start_date, end_date, contract_pdf_url, furniture_pdf_url)
        VALUES (
          ${room}, ${b.user_id || null},
          ${b.start_date || null}, ${b.end_date || null},
          ${b.contract_pdf_url || null}, ${b.furniture_pdf_url || null})
        ON CONFLICT (room_number) DO UPDATE SET
          user_id           = EXCLUDED.user_id,
          start_date        = EXCLUDED.start_date,
          end_date          = EXCLUDED.end_date,
          contract_pdf_url  = EXCLUDED.contract_pdf_url,
          furniture_pdf_url = EXCLUDED.furniture_pdf_url
        RETURNING room_number, user_id,
                  to_char(start_date, 'YYYY-MM-DD') AS start_date,
                  to_char(end_date,   'YYYY-MM-DD') AS end_date,
                  contract_pdf_url, furniture_pdf_url`;
      return json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const b = await req.json();
      const room = String(b.room_number || '').trim();
      if (!room) return json({ error: 'room_number is required' }, 400);
      await sql`DELETE FROM contracts WHERE room_number = ${room}`;
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
