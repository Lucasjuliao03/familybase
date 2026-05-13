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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{textAlign: 'center', marginBottom: 16}}>
          <img src="/logo.png" alt="FamilyBase" style={{height: 64}} />
        </div>
        <h1 style={{textAlign: 'center', marginBottom: 8}}>FamilyBase</h1>
        <p className="login-subtitle">{t('login_subtitle')}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('email')}</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('password')}</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required />
          </div>
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{width:'100%',justifyContent:'center'}}>
            {loading ? '...' : t('login')}
          </button>
        </form>
        <div className="login-divider">{t('no_account')}</div>
        <Link to="/register" className="btn btn-ghost btn-lg" style={{width:'100%',justifyContent:'center'}}>{t('register')}</Link>
        <div style={{textAlign:'center',marginTop:16}}>
          <div className="lang-switch" style={{display:'inline-flex'}}>
            <button className={`lang-btn ${lang==='pt'?'active':''}`} onClick={() => switchLanguage('pt')}>🇧🇷</button>
            <button className={`lang-btn ${lang==='en'?'active':''}`} onClick={() => switchLanguage('en')}>🇺🇸</button>
          </div>
        </div>
        <div style={{marginTop:20,padding:12,background:'var(--bg)',borderRadius:'var(--radius-sm)',fontSize:'0.78rem',color:'var(--text-light)'}}>
          <strong>Demo:</strong><br/>
          👤 pai@familia.com / 123456<br/>
          👦 lucas@familia.com / 123456
        </div>
      </div>
    </div>
  );
}
