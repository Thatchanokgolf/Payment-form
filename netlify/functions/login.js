// Login — verifies credentials against the app_users table (Database 3).
// POST { id, password } -> { id, room_number, role, heading } on success, 401 otherwise.
// The password is never returned to the client.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { id, password } = await req.json();
    if (!id || !password) return json({ error: 'Missing credentials' }, 400);

    const rows = await sql`
      SELECT user_id, room_number, role, heading
      FROM app_users
      WHERE user_id = ${String(id)} AND password = ${String(password)}`;

    if (!rows.length) return json({ error: 'Invalid ID or password' }, 401);

    const u = rows[0];
    return json({
      id: u.user_id,
      room_number: u.room_number,
      role: u.role,
      heading: u.heading,
    });
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
