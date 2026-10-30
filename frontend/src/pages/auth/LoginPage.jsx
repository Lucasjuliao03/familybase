import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import './family-auth.css';
import WebAuthIntro from '../../components/web/WebAuthIntro';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import ParentNavIcon from '../../components/ui/ParentNavIcon';
import { normalizeEmail } from '../../lib/familyIdentity';

export default function LoginPage() {
  const { login } = useAuth();
  const { isMobileShell } = useLayoutMode();
  const { t, lang, switchLanguage } = useLanguage();
  const toast = useToast();
  const { state } = useLocation();
  const [email, setEmail] = useState(() => typeof state?.email === 'string' ? normalizeEmail(state.email).slice(0, 254) : '');
  const [familyMode, setFamilyMode] = useState(false);
  const [familyCode, setFamilyCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    try {
      await login(familyMode ? username : email, password, familyMode ? familyCode : undefined);
    } catch (err) {
      toast.error(err?.message || err.response?.data?.error || t('error_occurred'));
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  return (
    <div className="login-page family-auth-page auth-page auth-page--login">
      {!isMobileShell && <WebAuthIntro/>}
      <div className="login-card auth-card animate-fade-in">
        <header className="auth-heading">
          <div className="auth-brand-row">
            <Link to="/" className="auth-brand"><img src="/brand/logo.webp" alt="" width="32" height="32" /><span>Tudo de Família</span></Link>
            <div className="lang-switch">
              <button type="button" className={`lang-btn ${lang === 'pt' ? 'active' : ''}`} aria-label="Português" onClick={() => switchLanguage('pt')}>{isMobileShell ? '🇧🇷' : 'PT'}</button>
              <button type="button" className={`lang-btn ${lang === 'en' ? 'active' : ''}`} aria-label="English" onClick={() => switchLanguage('en')}>{isMobileShell ? '🇺🇸' : 'EN'}</button>
            </div>
          </div>
        <h1 className="login-card__title">{t('login')}</h1>
        <p className="login-subtitle">{t('login_subtitle')}</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} autoComplete="on">
          <div className="auth-login-tabs" role="group" aria-label="Forma de acesso">{[false,true].map(mode=><button key={String(mode)} type="button" aria-pressed={familyMode===mode} disabled={loading} className={familyMode===mode?'is-selected':''} onClick={()=>{setFamilyMode(mode);setPassword('');}}>{mode?'Código da família':'E-mail'}</button>)}</div>
          {familyMode && <div className="form-group"><label htmlFor="familyCode" className="form-label">Código da família</label><input id="familyCode" className="form-input" autoCapitalize="characters" autoComplete="off" maxLength={20} value={familyCode} onChange={e=>setFamilyCode(e.target.value)} placeholder="FAM-ABCD-EFGH" disabled={loading} required/><p className="family-auth-hint">Use o código recebido do responsável, seu usuário e sua senha.</p></div>}
          <div className="form-group">
            <label htmlFor="loginEmail" className="form-label">{familyMode?'Usuário de acesso':t('email')}</label>
            <input
              id="loginEmail"
              className="form-input"
              type={familyMode?'text':'email'}
              autoComplete="username"
              value={familyMode?username:email}
              onChange={e => familyMode?setUsername(e.target.value):setEmail(e.target.value)}
              placeholder={familyMode?'Ex: ana':'email@exemplo.com'}
              disabled={loading}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="loginPassword" className="form-label">{t('password')}</label>
            <div className="auth-password-field">
              <input
                id="loginPassword"
                className="form-input"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                disabled={loading}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
                required
              />
              <button
                type="button"
                className="auth-password-eye"
                disabled={loading}
                onClick={() => setShowPwd(s => !s)}
                aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {isMobileShell ? (showPwd ? '🙈' : '👁️') : <ParentNavIcon name="eye" size={18}/>}
              </button>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : t('login')}
          </button>
        </form>

        <p className="auth-footer">{t('no_account')} <Link to="/register" state={{ email }}>{t('register')}</Link></p>
      </div>
    </div>
  );
}
