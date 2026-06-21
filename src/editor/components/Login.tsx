import { useState, type CSSProperties, type FormEvent } from 'react';
import type { BrandConfig } from '../../shared/types.js';

interface Props {
  config: BrandConfig;
  onLogin: (email: string, password: string, code?: string) => Promise<void>;
  style?: CSSProperties;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRich(s: string): string {
  if (typeof s !== 'string') return '';
  // Escape first so brand copy can never inject markup, then apply *emphasis*.
  return escapeHtml(s).replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export function Login({ config, onLogin, style }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const b = config.brand;
  const needsCode = config.totp === true;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError('Enter your password to continue.');
      return;
    }
    if (needsCode && !code.trim()) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onLogin(email.trim(), password, needsCode ? code.trim() : undefined);
    } catch {
      setError(
        needsCode
          ? 'Incorrect email, password, or code. Please try again.'
          : 'Incorrect email or password. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login" style={style}>
      <div className="login-brand" style={{ background: b.bg }}>
        <div className="lb-logo">
          <span className="lb-main">{b.name}</span>
          <span className="lb-sub">{b.eyebrow}</span>
        </div>
        <div className="lb-mid">
          <span className="lb-eyebrow">Content Studio</span>
          <h1 dangerouslySetInnerHTML={{ __html: renderRich(b.headline) }} />
          <p>
            Edit your words and photos, preview the change live, then publish when you&rsquo;re happy.
            No code, nothing to break.
          </p>
        </div>
        <div className="lb-foot">{b.tagline}</div>
      </div>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="lf-lede">Welcome back. Let&rsquo;s get your site up to date.</p>
          <label className="lf-label">Email</label>
          <input
            className="lf-input"
            type="email"
            value={email}
            placeholder="you@example.com"
            autoFocus
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
          />
          <label className="lf-label">Password</label>
          <input
            className="lf-input"
            type="password"
            value={password}
            placeholder="••••••••"
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
          {needsCode && (
            <>
              <label className="lf-label">Authenticator code</label>
              <input
                className="lf-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                placeholder="123456"
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ''));
                  setError('');
                }}
              />
            </>
          )}
          {error && <div className="lf-err">{error}</div>}
          <button className="lf-btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in to Content Studio'}
          </button>
          <div className="lf-demo">Use the email and password set for this site.</div>
        </form>
      </div>
    </div>
  );
}
