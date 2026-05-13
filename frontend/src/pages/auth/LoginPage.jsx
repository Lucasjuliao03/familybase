import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, lang, switchLanguage } = useLanguage();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      toast.error(err?.message || err.response?.data?.error || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-fade-in">
        <div className="login-card__logo">
          <img src="/logo512.png" alt="Base Familiar" loading="eager" />
        </div>
        <h1 className="login-card__title">Base Familiar</h1>
        <p className="login-subtitle">{t('login_subtitle')}</p>

        <form onSubmit={handleSubmit} autoComplete="on">
          <div className="form-group">
            <label className="form-label">{t('email')}</label>
            <input
              className="form-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('password')}</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: '1.1rem', color: 'var(--text-light)', padding: 4,
                }}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Entrando…' : t('login')}
          </button>
        </form>

        <div className="login-divider">{t('no_account')}</div>
        <Link to="/register" className="btn btn-ghost btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
          {t('register')}
        </Link>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <div className="lang-switch" style={{ display: 'inline-flex' }}>
            <button type="button" className={`lang-btn ${lang === 'pt' ? 'active' : ''}`} onClick={() => switchLanguage('pt')}>🇧🇷</button>
            <button type="button" className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => switchLanguage('en')}>🇺🇸</button>
          </div>
        </div>
      </div>
    </div>
  );
}
