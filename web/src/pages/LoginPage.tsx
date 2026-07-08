import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import PasswordVisibilityToggle from '../components/PasswordVisibilityToggle.js';
import { useAdmin } from '../context/AdminContext.js';
import { errorMessage } from '../lib/format.js';

const NAME_STORAGE_KEY = 'zow:login-name';

export default function LoginPage() {
  const { login } = useAdmin();
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(password, name.trim());
      localStorage.setItem(NAME_STORAGE_KEY, name.trim());
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <h1 className="page-title">Admin login</h1>
      <div className="card" style={{ maxWidth: 360 }}>
        <form onSubmit={handleSubmit}>
          <div className="field-row" style={{ marginBottom: 14 }}>
            <div className="field" style={{ width: '100%' }}>
              <label htmlFor="name">Name</label>
              <input
                id="name"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="So we know who made a change"
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div className="field-row" style={{ marginBottom: 14 }}>
            <div className="field" style={{ width: '100%' }}>
              <label htmlFor="password">Password</label>
              <div className="password-field-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              </div>
            </div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting || !password || !name.trim()}
            style={{ width: '100%' }}
          >
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}
