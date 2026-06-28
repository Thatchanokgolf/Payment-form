// Database 1 — room configuration (rent + additional bills).
// CRUD over the `rooms` table.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Up to 4 "other" bills, each annotated with a label describing what it is for.
const normOtherBills = (v) =>
  (Array.isArray(v) ? v : [])
    .map((o) => ({ label: String(o?.label ?? '').slice(0, 120), amount: num(o?.amount) }))
    .filter((o) => o.label !== '' || o.amount !== 0)
    .slice(0, 4);

export default async (req) => {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const room = url.searchParams.get('room');
      if (room) {
        const rows = await sql`SELECT * FROM rooms WHERE room_number = ${room}`;
        return json(rows[0] || null);
      }
      const rows = await sql`SELECT * FROM rooms ORDER BY room_number`;
      return json(rows);
    }

    if (req.method === 'POST') {
      const b = await req.json();
      if (!b.room_number) return json({ error: 'room_number is required' }, 400);
      const otherBills = normOtherBills(b.other_bills);
      const rows = await sql`
        INSERT INTO rooms
          (room_number, rent, refrigerator_bill, microwave_bill, carpark_bill, common_fee, other_bills)
        VALUES
          (${String(b.room_number)}, ${num(b.rent)}, ${num(b.refrigerator_bill)},
           ${num(b.microwave_bill)}, ${num(b.carpark_bill)}, ${num(b.common_fee)},
           ${JSON.stringify(otherBills)}::jsonb)
        ON CONFLICT (room_number) DO UPDATE SET
          rent              = EXCLUDED.rent,
          refrigerator_bill = EXCLUDED.refrigerator_bill,
          microwave_bill    = EXCLUDED.microwave_bill,
          carpark_bill      = EXCLUDED.carpark_bill,
          common_fee        = EXCLUDED.common_fee,
          other_bills       = EXCLUDED.other_bills
        RETURNING *`;
      return json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const b = await req.json();
      if (!b.room_number) return json({ error: 'room_number is required' }, 400);
      await sql`DELETE FROM rooms WHERE room_number = ${String(b.room_number)}`;
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
