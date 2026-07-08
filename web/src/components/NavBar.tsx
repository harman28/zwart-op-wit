import { Link, useLocation, useNavigate } from 'react-router';
import { useAdmin } from '../context/AdminContext.js';
import { useLatestSeason } from '../hooks/useSeason.js';

export default function NavBar() {
  const { isAdmin, logout } = useAdmin();
  const { season } = useLatestSeason();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const linkClass = (path: string) => (pathname === path ? 'link current' : 'link');

  return (
    <div className="app">
      <div className="masthead">
        <Link to="/" className="wordmark">
          Zwart op Wit
          <small>Internal Competition</small>
        </Link>
        <div className="masthead-right">
          {season && <span className="season-pill">{season.name.toUpperCase()}</span>}
          {isAdmin ? (
            <button className="btn btn-ghost masthead-auth" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <Link to="/admin/login" className="btn btn-ghost masthead-auth">
              Admin
            </Link>
          )}
        </div>
      </div>
      <div className="site-nav" style={{ marginBottom: 0, paddingTop: 10 }}>
        <div className="links">
          <Link to="/" className={linkClass('/')}>
            Rounds
          </Link>
          <Link to="/leaderboard" className={linkClass('/leaderboard')}>
            Leaderboard
          </Link>
          {isAdmin && (
            <>
              <Link to="/admin/players" className={linkClass('/admin/players')}>
                Players
              </Link>
              <Link to="/admin/settings" className={linkClass('/admin/settings')}>
                Settings
              </Link>
            </>
          )}
        </div>
        {isAdmin && (
          <Link to="/admin/new-round" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
            + New Round
          </Link>
        )}
      </div>
    </div>
  );
}
