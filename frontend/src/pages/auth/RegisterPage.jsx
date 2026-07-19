import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  IconCalendar,
  IconEye,
  IconLock,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSpark,
  IconUser,
  IconUsers,
} from '../../components/auth/AuthFieldIcons';

const PROFILES = [
  { id: 'pai', label: 'Pai', hint: 'Gestor principal e responsável financeiro' },
  { id: 'mae', label: 'Mãe', hint: 'Gestora principal e responsável financeiro' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskDate(input) {
  const digits = String(input || '').replace(/\D/g, '').slice(0, 8);
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 4);
  const p3 = digits.slice(4, 8);
  let out = p1;
  if (p2) out += `/${p2}`;
  if (p3) out += `/${p3}`;
  return out;
}

function toISODate(masked) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(masked || '').trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function yearsSince(iso) {
  const dob = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function AuthField({ icon: Icon, children, className = '' }) {
  return (
    <div className={`auth-field ${className}`.trim()}>
      <span className="auth-field__icon" aria-hidden><Icon size={18} /></span>
      {children}
    </div>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    familyName: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    profileType: 'pai',
    phone: '',
    address: '',
    birth: '',
    accepted: false,
  });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const validate = () => {
    if (!form.familyName.trim()) return 'Informe o nome da família.';
    if (!form.name.trim()) return 'Informe o nome do responsável.';
    const em = form.email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return 'Informe um email válido.';
    if (form.password.length < 6) return 'A senha deve ter no mínimo 6 caracteres.';
    if (form.password !== form.confirmPassword) return 'As senhas não coincidem.';
    if (!form.birth.trim()) return 'Informe a data de nascimento do responsável.';
    const iso = toISODate(form.birth);
    if (!iso) return 'Data de nascimento inválida (use DD/MM/AAAA).';
    if (yearsSince(iso) < 18) return 'O responsável principal deve ter pelo menos 18 anos.';
    if (!form.accepted) return 'É necessário aceitar os termos e a política de privacidade.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setLoading(true);
    try {
      await register({
        ...form,
        email: form.email.trim().toLowerCase(),
        dateOfBirth: toISODate(form.birth),
      });
      toast.success('Família criada com sucesso. Bem-vindo ao seu teste gratuito de 7 dias.');
    } catch (error) {
      toast.error(error?.message || error?.response?.data?.error || 'Não foi possível concluir o cadastro.');
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
        <h1 className="login-card__title">Nova família</h1>
        <p className="login-subtitle">Cadastro do responsável principal · 7 dias grátis para toda a família</p>

        <form onSubmit={handleSubmit} className="register-form" autoComplete="on">
          <div className="form-group">
            <label className="form-label">Nome da família</label>
            <AuthField icon={IconUsers}>
              <input
                className="form-input auth-field__input"
                value={form.familyName}
                onChange={(e) => update('familyName', e.target.value)}
                placeholder="Ex: Família Silva"
                required
                autoComplete="organization"
              />
            </AuthField>
          </div>

          <div className="form-group">
            <label className="form-label">Perfil do responsável</label>
            <div className="profile-picker">
              {PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`profile-option ${form.profileType === p.id ? 'is-active' : ''}`}
                  onClick={() => update('profileType', p.id)}
                >
                  <span className="profile-option__icon" aria-hidden>
                    <IconUser size={22} />
                  </span>
                  <span className="profile-option__label">{p.label}</span>
                  <span className="profile-option__hint">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <AuthField icon={IconUser}>
              <input
                className="form-input auth-field__input"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Seu nome completo"
                required
                autoComplete="name"
              />
            </AuthField>
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <AuthField icon={IconMail}>
              <input
                className="form-input auth-field__input"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="seu@email.com"
                required
              />
            </AuthField>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Senha</label>
              <AuthField icon={IconLock}>
                <input
                  className="form-input auth-field__input"
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
                  className="auth-field__toggle"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <IconEye off={showPwd} size={18} />
                </button>
              </AuthField>
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar senha</label>
              <AuthField icon={IconLock}>
                <input
                  className="form-input auth-field__input"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)}
                  placeholder="Repita a senha"
                  required
                />
              </AuthField>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Telefone <span className="form-label__optional">(opcional)</span></label>
              <AuthField icon={IconPhone}>
                <input
                  className="form-input auth-field__input"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="(00) 00000-0000"
                  autoComplete="tel"
                />
              </AuthField>
            </div>
            <div className="form-group">
              <label className="form-label">Data de nascimento</label>
              <AuthField icon={IconCalendar}>
                <input
                  className="form-input auth-field__input"
                  value={form.birth}
                  onChange={(e) => update('birth', maskDate(e.target.value))}
                  placeholder="DD/MM/AAAA"
                  inputMode="numeric"
                  required
                />
              </AuthField>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Endereço <span className="form-label__optional">(opcional)</span></label>
            <AuthField icon={IconMapPin}>
              <input
                className="form-input auth-field__input"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Rua, número, cidade"
                autoComplete="street-address"
              />
            </AuthField>
          </div>

          <label className="register-terms">
            <input
              type="checkbox"
              checked={form.accepted}
              onChange={(e) => update('accepted', e.target.checked)}
            />
            <span>
              Li e aceito os <strong>Termos de Uso</strong> e a <strong>Política de Privacidade</strong>.
            </span>
          </label>

          <div className="trial-callout trial-callout--premium">
            <span className="trial-callout__icon" aria-hidden><IconSpark size={20} /></span>
            <div>
              <strong>Teste grátis de 7 dias</strong>
              <span>Toda a família usa o mesmo plano. Contas de crianças são criadas depois pelo gestor no painel.</span>
            </div>
          </div>

          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? 'A criar família…' : 'Criar família'}
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
