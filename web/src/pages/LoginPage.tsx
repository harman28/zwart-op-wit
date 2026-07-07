import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAdmin } from '../context/AdminContext.js';
import { errorMessage } from '../lib/format.js';

export default function LoginPage() {
  const { login } = useAdmin();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(password);
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
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={submitting || !password} style={{ width: '100%' }}>
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}
