import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';

const PROFILES = [
  { id: 'pai',   label: 'Pai',   emoji: '👨', hint: 'Gestor principal e responsável financeiro' },
  { id: 'mae',   label: 'Mãe',   emoji: '👩', hint: 'Gestora principal e responsável financeiro' },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [form, setForm] = useState({
    familyName: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    profileType: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.profileType) {
      toast.error('Selecione se entra como Pai ou Mãe (gestor principal).');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (form.password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      await register(form);
      toast.success('Conta criada! Bem-vindo ao seu teste gratuito de 7 dias.');
    } catch (err) {
      toast.error(err?.message || err?.response?.data?.error || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card login-card--wide animate-fade-in">
        <div className="login-card__logo">
          <img src="/logo512.png" alt="Base Familiar" loading="eager" />
        </div>
        <h1 className="login-card__title">Base Familiar</h1>
        <p className="login-subtitle">Crie a sua conta e ganhe 7 dias grátis</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nome da família</label>
            <input
              className="form-input"
              value={form.familyName}
              onChange={(e) => update('familyName', e.target.value)}
              placeholder="Ex: Família Silva"
              required
              autoComplete="organization"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Seu nome completo"
              required
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="email@exemplo.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="pwd-toggle"
                aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar senha</label>
            <input
              className="form-input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              placeholder="Repita a senha"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Qual é o seu perfil?</label>
            <div className="profile-picker">
              {PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`profile-option ${form.profileType === p.id ? 'is-active' : ''}`}
                  onClick={() => update('profileType', p.id)}
                >
                  <span className="profile-option__emoji">{p.emoji}</span>
                  <span className="profile-option__label">{p.label}</span>
                  <span className="profile-option__hint">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="trial-callout">
            <strong>🎁 Teste grátis de 7 dias</strong>
            <span>A família inteira usa o mesmo plano. Contas de crianças são criadas pelo gestor no painel da família.</span>
          </div>

          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? 'A criar conta…' : 'Criar conta'}
          </button>
        </form>

        <div className="login-divider">Já tem conta?</div>
        <Link to="/login" className="btn btn-ghost btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
          Entrar
        </Link>
      </div>
    </div>
  );
}
