// Database 3 — app users management (admin UI backend).
// GET    /api/users           -> list users (NO passwords)
// POST   /api/users           -> create/update a user (blank password keeps existing)
// DELETE /api/users           -> delete a user (cannot remove the last admin)
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async (req) => {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      // An admin sees all residents plus only their OWN admin account — never other admins.
      const me = url.searchParams.get('me') || '';
      const rows = await sql`
        SELECT user_id, room_number, role, heading
        FROM app_users
        WHERE role <> 'admin' OR user_id = ${me}
        ORDER BY role DESC, user_id`;
      return json(rows);
    }

    if (req.method === 'POST') {
      const b = await req.json();
      const id = String(b.user_id || '').trim();
      if (!id) return json({ error: 'User ID is required' }, 400);

      const password = String(b.password || '');
      const role = b.role === 'admin' ? 'admin' : 'user';
      // Admins have no room; residents keep whatever room number was entered.
      const room = role === 'admin' ? null : (String(b.room_number || '').trim() || null);
      const heading = String(b.heading || '').trim();

      const me = String(b.me || '');
      const existingRows = await sql`SELECT role FROM app_users WHERE user_id = ${id}`;
      const exists = existingRows.length > 0;
      const existingRole = exists ? existingRows[0].role : null;

      // An admin may not create or edit another admin account (only their own).
      if ((role === 'admin' || existingRole === 'admin') && id !== me) {
        return json({ error: 'You cannot create or edit another admin account.' }, 403);
      }
      if (!exists && password === '') {
        return json({ error: 'Password is required for a new user' }, 400);
      }

      const rows = await sql`
        INSERT INTO app_users (user_id, password, room_number, role, heading)
        VALUES (${id}, ${password}, ${room}, ${role}, ${heading})
        ON CONFLICT (user_id) DO UPDATE SET
          password    = CASE WHEN ${password} = '' THEN app_users.password ELSE EXCLUDED.password END,
          room_number = EXCLUDED.room_number,
          role        = EXCLUDED.role,
          heading     = EXCLUDED.heading
        RETURNING user_id, room_number, role, heading`;
      return json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const b = await req.json();
      const id = String(b.user_id || '').trim();
      if (!id) return json({ error: 'User ID is required' }, 400);

      const me = String(b.me || '');
      const target = await sql`SELECT role FROM app_users WHERE user_id = ${id}`;
      if (target.length && target[0].role === 'admin') {
        // Cannot delete another admin; can only delete self if not the last admin.
        if (id !== me) {
          return json({ error: 'You cannot delete another admin account.' }, 403);
        }
        const c = await sql`SELECT count(*)::int AS n FROM app_users WHERE role = 'admin'`;
        if (c[0].n <= 1) return json({ error: 'Cannot delete the last admin' }, 400);
      }
      await sql`DELETE FROM app_users WHERE user_id = ${id}`;
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
};
