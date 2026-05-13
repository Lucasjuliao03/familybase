import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [form, setForm] = useState({ familyName: '', name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    setLoading(true);
    try {
      await register(form);
    } catch (err) {
      toast.error(err?.message || err.response?.data?.error || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="login-page">
      <div className="login-card animate-fade-in">
        <div className="login-card__logo">
          <img src="/logo512.png" alt="Base Familiar" loading="eager" />
        </div>
        <h1 className="login-card__title">Base Familiar</h1>
        <p className="login-subtitle">{t('register_subtitle')}</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('family_name')}</label>
            <input className="form-input" value={form.familyName}
              onChange={e => update('familyName', e.target.value)}
              placeholder="Ex: Família Silva" required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('name')}</label>
            <input className="form-input" value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="Seu nome completo" required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('email')}</label>
            <input className="form-input" type="email" autoComplete="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="email@exemplo.com" required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('password')}</label>
            <input className="form-input" type="password" autoComplete="new-password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="Mínimo 6 caracteres" required minLength={6} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('confirm_password')}</label>
            <input className="form-input" type="password" autoComplete="new-password"
              value={form.confirmPassword}
              onChange={e => update('confirmPassword', e.target.value)}
              placeholder="Repita a senha" required />
          </div>
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Criando…' : t('register')}
          </button>
        </form>

        <div className="login-divider">{t('has_account')}</div>
        <Link to="/login" className="btn btn-ghost btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
          {t('login')}
        </Link>
      </div>
    </div>
  );
}
