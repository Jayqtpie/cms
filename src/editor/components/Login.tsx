import { useState } from 'react';
import type { BrandConfig } from '../../shared/types.js';

interface Props {
  config: BrandConfig;
  onLogin: (email: string, password: string) => Promise<void>;
}

function renderRich(s: string): string {
  if (typeof s !== 'string') return '';
  return s.replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export function Login({ config, onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onLogin(email, password);
    } catch {
      setError('Incorrect password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="brand-panel" style={{ background: config.brand.bg }}>
        <div className="eyebrow">{config.brand.eyebrow}</div>
        <h1 dangerouslySetInnerHTML={{ __html: renderRich(config.brand.headline) }} />
        <p>{config.brand.tagline}</p>
      </div>
      <div className="form-panel">
        <form onSubmit={submit}>
          <h2>Sign in</h2>
          <input
            type="text"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
