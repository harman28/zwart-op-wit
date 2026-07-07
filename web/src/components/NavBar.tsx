import { Link, useNavigate } from 'react-router';
import { useAdmin } from '../context/AdminContext.js';
import { useLatestSeason } from '../hooks/useSeason.js';

export default function NavBar() {
  const { isAdmin, logout } = useAdmin();
  const { season } = useLatestSeason();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="app">
      <div className="masthead">
        <Link to="/" className="wordmark">
          Zwart op Wit
          <small>Internal Competition</small>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {season && <span className="season-pill">{season.name.toUpperCase()}</span>}
          {isAdmin ? (
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <Link to="/admin/login" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}>
              Admin
            </Link>
          )}
        </div>
      </div>
      {isAdmin && (
        <div className="site-nav" style={{ marginBottom: 0, paddingTop: 10 }}>
          <div className="links">
            <Link to="/admin/new-round" className="link">
              New round
            </Link>
            <Link to="/admin/players" className="link">
              Players
            </Link>
            <Link to="/admin/settings" className="link">
              Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
