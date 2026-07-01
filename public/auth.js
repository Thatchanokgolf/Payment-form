// Client-side auth chrome for the dorm app.
// Credentials are verified server-side against the app_users table (POST /api/login);
// this script only stores the returned session and gates the UI.
// NOTE: the page gating below is front-end-only — it is NOT real security. The other
// Netlify functions remain open; do not rely on this to protect data.
(function () {
  const KEY = 'dormAuth';
  const ADMIN_ONLY = ['rooms.html', 'records.html', 'users.html', 'contracts.html', 'reservations.html'];

  const getSession = () => {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (_) { return null; }
  };
  const setSession = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const clearSession = () => localStorage.removeItem(KEY);

  window.DormAuth = {
    getSession,
    async login(id, password) {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, password }),
        });
        if (!res.ok) return false;
        const u = await res.json();
        setSession({ id: u.id, role: u.role, room_number: u.room_number, heading: u.heading });
        return true;
      } catch (_) {
        return false;
      }
    },
    logout() {
      clearSession();
      location.replace('/login.html');
    },
    isAdmin() {
      const s = getSession();
      return !!s && s.role === 'admin';
    },
  };

  // --- Immediate guard (runs in <head>, before content renders) ---
  const path = location.pathname;
  const onLogin = path.endsWith('/login.html') || path.endsWith('login.html');
  const session = getSession();

  if (onLogin) {
    if (session) location.replace('/menu.html'); // already signed in
    return;
  }
  if (!session) {
    location.replace('/login.html');
    return;
  }
  if (session.role !== 'admin' && ADMIN_ONLY.some((p) => path.endsWith(p))) {
    location.replace('/menu.html'); // users cannot access DB1/DB2/DB3 pages
    return;
  }

  // --- Chrome: heading, admin-only links, logout button ---
  document.addEventListener('DOMContentLoaded', function () {
    const heading = document.getElementById('navHeading');
    if (heading) heading.textContent = session.heading;

    if (session.role !== 'admin') {
      document.querySelectorAll('.nav-admin').forEach((el) => el.classList.add('hidden'));
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => window.DormAuth.logout());
  });
})();
