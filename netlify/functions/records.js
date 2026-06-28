// Database 2 — submitted monthly bill records.
// GET  /api/records                     -> list all records (newest first)
// GET  /api/records?room=101&latest=1   -> latest record for a room (for prev meter)
// POST /api/records                     -> create a record
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

const normOtherBills = (v) =>
  (Array.isArray(v) ? v : [])
    .map((o) => ({ label: String(o?.label ?? '').slice(0, 120), amount: num(o?.amount) }))
    .filter((o) => o.label !== '' || o.amount !== 0)
    .slice(0, 4);

export default async (req) => {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const room = url.searchParams.get('room');
      const before = url.searchParams.get('before'); // a "YYYY-MM" bill month
      const latest = url.searchParams.get('latest');

      // Single image for one record (fetched on demand — kept out of the list view).
      const id = url.searchParams.get('id');
      const image = url.searchParams.get('image'); // 'electric' | 'water' | 'slip'
      if (id && image) {
        const recId = Number(id);
        let rows;
        if (image === 'electric') {
          rows = await sql`SELECT electric_bill_image AS img FROM bill_records WHERE id = ${recId}`;
        } else if (image === 'water') {
          rows = await sql`SELECT water_bill_image AS img FROM bill_records WHERE id = ${recId}`;
        } else if (image === 'slip') {
          rows = await sql`SELECT bank_slip_image AS img FROM bill_records WHERE id = ${recId}`;
        } else {
          return json({ error: 'invalid image type' }, 400);
        }
        return json({ image: rows[0]?.img || null });
      }

      // Previous-month meter readings: the most recent record for this room whose
      // bill_month is strictly before the selected month. bill_month is stored as
      // "YYYY-MM", so lexical comparison matches chronological order.
      if (room && before) {
        const rows = await sql`
          SELECT electric_curr, water_curr, bill_month, created_at
          FROM bill_records
          WHERE room_number = ${room} AND bill_month <> '' AND bill_month < ${before}
          ORDER BY bill_month DESC, created_at DESC
          LIMIT 1`;
        return json(rows[0] || null);
      }

      // Fallback: latest record for a room regardless of month.
      if (room && latest) {
        const rows = await sql`
          SELECT electric_curr, water_curr, bill_month, created_at
          FROM bill_records
          WHERE room_number = ${room}
          ORDER BY created_at DESC
          LIMIT 1`;
        return json(rows[0] || null);
      }

      // Full list, with optional filters: room + month range (bill_month "YYYY-MM").
      // Empty-string params mean "no filter" for that dimension.
      const filterRoom = url.searchParams.get('filterRoom') || '';
      const from = url.searchParams.get('from') || ''; // inclusive, "YYYY-MM"
      const to = url.searchParams.get('to') || '';     // inclusive, "YYYY-MM"
      const rows = await sql`
        SELECT id, room_number, bill_month, rent,
               electric_prev, electric_curr, electric_bill,
               water_prev, water_curr, water_bill,
               refrigerator_bill, microwave_bill, carpark_bill, common_fee, other_bills,
               total, created_at
        FROM bill_records
        WHERE (${filterRoom} = '' OR room_number = ${filterRoom})
          AND (${from} = '' OR bill_month >= ${from})
          AND (${to}   = '' OR bill_month <= ${to})
        ORDER BY created_at DESC`;
      return json(rows);
    }

    if (req.method === 'POST') {
      const b = await req.json();
      if (!b.room_number) return json({ error: 'room_number is required' }, 400);

      const electricPrev = num(b.electric_prev);
      const electricCurr = num(b.electric_curr);
      const waterPrev = num(b.water_prev);
      const waterCurr = num(b.water_curr);

      // Server-side recomputation so the stored totals are authoritative.
      // Water bill has a minimum charge of 100.
      const electricBill = Math.max(0, electricCurr - electricPrev) * 8;
      const waterBill = Math.max(100, Math.max(0, waterCurr - waterPrev) * 20);
      const rent = num(b.rent);
      const refrigerator = num(b.refrigerator_bill);
      const microwave = num(b.microwave_bill);
      const carpark = num(b.carpark_bill);
      const commonFee = num(b.common_fee);
      const otherBills = normOtherBills(b.other_bills);
      const otherTotal = otherBills.reduce((s, o) => s + num(o.amount), 0);
      const total =
        rent + electricBill + waterBill +
        refrigerator + microwave + carpark + commonFee + otherTotal;

      const rows = await sql`
        INSERT INTO bill_records (
          room_number, bill_month, rent,
          electric_bill_image, electric_prev, electric_curr, electric_bill,
          water_bill_image, water_prev, water_curr, water_bill,
          refrigerator_bill, microwave_bill, carpark_bill, common_fee, other_bills,
          bank_slip_image, total
        ) VALUES (
          ${String(b.room_number)}, ${String(b.bill_month || '')}, ${rent},
          ${b.electric_bill_image || null}, ${electricPrev}, ${electricCurr}, ${electricBill},
          ${b.water_bill_image || null}, ${waterPrev}, ${waterCurr}, ${waterBill},
          ${refrigerator}, ${microwave}, ${carpark}, ${commonFee}, ${JSON.stringify(otherBills)}::jsonb,
          ${b.bank_slip_image || null}, ${total}
        )
        RETURNING id, room_number, bill_month, total, created_at`;

      // Other bills are one-off charges: clear them from the room config (DB1) now
      // that they've been captured on this record, so they don't recur next month.
      // The bill record above keeps its own snapshot, so history is preserved.
      await sql`
        UPDATE rooms SET other_bills = '[]'::jsonb
        WHERE room_number = ${String(b.room_number)}`;

      return json(rows[0]);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
