import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { localToday, maskPhone, normalizeEmail } from '../../lib/familyIdentity';
import { setRegistrationPassword } from '../../lib/familyAuth';
import { resendSignupConfirmation, confirmSignupCode } from '../../lib/legacyFamilyAuth';
import { EMPTY_REGISTRATION, registrationFromUser, restoreRegistrationDraft, safeRegistrationDraft, validateSimulationCode } from '../../lib/familyRegistration';
import { WEB_REGISTRATION_STEPS, webRegistrationErrors, webRegistrationFailure } from '../../lib/webRegistrationFlow';
import CatalogAvatarChoice from '../../components/auth/CatalogAvatarChoice';
import WebAuthIntro from '../../components/web/WebAuthIntro';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import './family-auth.css';

const DRAFT_KEY = 'web-family-registration-draft-v2';
function readDraft() {
  try {
    return restoreRegistrationDraft(JSON.parse(sessionStorage.getItem(DRAFT_KEY) || sessionStorage.getItem('family-registration-draft-v1')))?.form || EMPTY_REGISTRATION;
  } catch { return EMPTY_REGISTRATION; }
}

export default function RegisterPage() {
  const { register, user, fetchMe } = useAuth();
  const { isMobileShell } = useLayoutMode();
  const { state } = useLocation();
  const [form, setForm] = useState(() => ({ ...readDraft(), ...(typeof state?.email === 'string' && state.email ? { email: normalizeEmail(state.email).slice(0, 254) } : {}) }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [resendUntil, setResendUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [legal, setLegal] = useState({ privacy_url: '/privacy.html', terms_url: '/terms.html' });
  const [simulation, setSimulation] = useState(import.meta.env.DEV && new URLSearchParams(window.location.search).get('simular') === '1');
  const [simulationDone, setSimulationDone] = useState(false);
  const submitting = useRef(false);
  const firstInput = useRef(null);
  const emailInput = useRef(null);
  const restoredUser = useRef(null);

  useEffect(() => {
    let active = true;
    supabase.from('app_settings').select('privacy_url,terms_url').limit(1).maybeSingle()
      .then(({ data }) => { if (active && data) setLegal({ privacy_url: data.privacy_url || '/privacy.html', terms_url: data.terms_url || '/terms.html' }); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (simulation || !user?.id || user.family_id || restoredUser.current === user.id) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user?.email_confirmed_at) return;
      restoredUser.current = data.user.id;
      const recovered = registrationFromUser(data.user);
      const hasPassword = !!data.user.user_metadata.registration_password_set || data.user.user_metadata.registration_version === 2 || !!data.user.user_metadata.legacy_registration;
      setForm(previous => normalizeEmail(previous.email) === recovered.email ? { ...recovered, ...previous, email: recovered.email } : recovered);
      setVerified(true);
      setPasswordSet(hasPassword);
      setStep(hasPassword ? 1 : 0);
    });
    return () => { active = false; };
  }, [user?.id, user?.family_id, simulation]);
  useEffect(() => {
    // Passwords, consent and email ownership must be re-established after reloading.
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safeRegistrationDraft(form, 0))); } catch { /* Storage unavailable. */ }
  }, [form]);
  useEffect(() => {
    if (!pendingEmail || !resendUntil) return;
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time >= resendUntil) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [pendingEmail, resendUntil]);
  useEffect(() => { (errors.existingAccount ? emailInput : firstInput).current?.focus({ preventScroll: true }); }, [step, errors.existingAccount]);

  const update = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }));
    if (key === 'email') { setVerified(false); setPasswordSet(false); }
    setErrors({});
  };
  const wait = Math.max(0, Math.ceil((resendUntil - now) / 1000));
  const run = async task => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setErrors({});
    try { await task(); }
    catch (error) {
      const failure = webRegistrationFailure(error);
      if (failure.existingAccount) {
        setErrors({ email: failure.message, existingAccount: true });
        setStep(0);
        setVerified(false);
        setPasswordSet(false);
        setAccepted(false);
        setPendingEmail('');
        setForm(previous => ({ ...previous, password: '', confirmPassword: '' }));
      } else setErrors({ submit: failure.message });
    } finally { submitting.current = false; setBusy(false); }
  };
  const resend = () => run(async () => {
    await resendSignupConfirmation(supabase, pendingEmail, new URL('/login', window.location.origin).href);
    const time = Date.now(); setNow(time); setResendUntil(time + 60000);
  });
  const confirmEmail = event => {
    event.preventDefault();
    run(async () => {
      if (simulation) { validateSimulationCode(confirmationCode); setSimulationDone(true); setPendingEmail(''); }
      else { await confirmSignupCode(supabase, pendingEmail, confirmationCode); await fetchMe(); }
      setConfirmationCode('');
    });
  };
  const next = event => {
    event.preventDefault();
    if (busy || errors.existingAccount) return;
    const invalid = webRegistrationErrors(form, step, verified && passwordSet);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      if (step === 2) setStep(WEB_REGISTRATION_STEPS.findIndex(item => item.fields?.some(key => invalid[key])));
      return;
    }
    setErrors({});
    if (step < 2) { setStep(step + 1); return; }
    if (!accepted) { setErrors({ accepted: 'Aceite os Termos de Uso e a Política de Privacidade.' }); return; }
    run(async () => {
      if (simulation) setPendingEmail(form.email);
      else {
        if (verified && !passwordSet) { await setRegistrationPassword(supabase, form.email, form.password, form.confirmPassword); setPasswordSet(true); }
        const result = await register({ ...form, accepted: true });
        if (result.status === 'confirmation_required') {
          setPendingEmail(result.email || form.email);
          const time = Date.now(); setNow(time); setResendUntil(time + 60000);
        }
      }
      setForm(previous => ({ ...previous, password: '', confirmPassword: '' }));
      try { sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem('family-registration-draft-v1'); } catch { /* Storage unavailable. */ }
    });
  };
  const field = (key, label, props = {}) => <div className="form-group">
    <label htmlFor={key} className="form-label">{label}</label>
    <input ref={key === 'email' ? emailInput : key === 'name' || key === 'familyName' ? firstInput : undefined} id={key} className="form-input" value={form[key]} onChange={event => update(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? key + '-error' : undefined} {...props} />
    {errors[key] && <span id={key + '-error'} role="alert" className="family-field-error">{errors[key]}</span>}
  </div>;
  const loginState = { email: normalizeEmail(form.email) };

  return <div className="login-page family-auth-page auth-page auth-page--register">
    {!isMobileShell && <WebAuthIntro />}
    <div className="login-card auth-card animate-fade-in">
      <header className="auth-heading">
        <div className="auth-brand-row"><Link to="/" className="auth-brand"><img src="/brand/logo.webp" alt="" width="32" height="32" /><span>Tudo de Família</span></Link><span className="auth-caption">10 dias grátis</span></div>
        <h1 className="login-card__title">{pendingEmail ? 'Confirme seu e-mail' : simulationDone ? 'Tudo pronto' : 'Crie sua família'}</h1>
        <p className="login-subtitle">{pendingEmail ? 'Só falta confirmar para começar.' : 'Sua conta, sua família, tudo em um só lugar.'}</p>
      </header>
      {pendingEmail ? <form className="auth-form family-confirmation" onSubmit={confirmEmail}>
        <p>{simulation ? 'Simulação: use qualquer código numérico.' : 'Digite o código enviado para'} <strong>{pendingEmail}</strong>{!simulation && '. Confira também o spam.'}</p>
        <div className="form-group"><label htmlFor="confirmation-code" className="form-label">Código de confirmação</label><input id="confirmation-code" className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={confirmationCode} onChange={event => setConfirmationCode(event.target.value.replace(/\D/g, ''))} disabled={busy} /></div>
        {errors.submit && <p role="alert" className="family-field-error">{errors.submit}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !(simulation ? /^\d{1,10}$/ : /^\d{6,10}$/).test(confirmationCode)}>{busy ? 'Confirmando…' : 'Confirmar e-mail'}</button>
        {!simulation && <><button type="button" className="btn btn-ghost" disabled={busy || wait > 0} onClick={resend}>{wait ? 'Reenviar em ' + wait + 's' : 'Reenviar código'}</button><p className="family-auth-hint">Se recebeu um link, você também pode usá-lo para confirmar o cadastro.</p></>}
      </form> : simulationDone ? <div className="family-confirmation" role="status"><h2>Simulação concluída</h2><p>Nenhuma conta foi criada. O cadastro real usa a confirmação recebida por e-mail.</p><button type="button" className="btn btn-primary" onClick={() => { setSimulationDone(false); setStep(0); setForm(EMPTY_REGISTRATION); setAccepted(false); }}>Testar novamente</button></div> : <>
        <ol className="auth-steps" aria-label="Etapas do cadastro">{WEB_REGISTRATION_STEPS.map((item, index) => <li key={item.title} aria-current={index === step ? 'step' : undefined} className={index <= step ? 'is-current' : ''}><span>{index + 1}</span>{item.title}</li>)}</ol>
        <form className="auth-form" onSubmit={next} noValidate>
          <fieldset disabled={busy}>
            <div className="auth-step-heading"><h2>{WEB_REGISTRATION_STEPS[step].title}</h2><p>{WEB_REGISTRATION_STEPS[step].hint}</p></div>
            {step === 0 && <>
              <div className="form-group auth-owner-profile"><span className="form-label" id="owner-profile-label">Perfil do responsável</span><div className="family-profile-choice auth-profile-options" role="radiogroup" aria-labelledby="owner-profile-label">{['pai', 'mae'].map(id => <button key={id} type="button" role="radio" aria-checked={form.profileType === id} className={form.profileType === id ? 'is-selected' : ''} onClick={() => update('profileType', id)}>{id === 'pai' ? 'Pai' : 'Mãe'}</button>)}</div>{errors.profileType && <span role="alert" className="family-field-error">{errors.profileType}</span>}</div>
              {field('name', 'Nome completo', { autoComplete: 'name', placeholder: 'Seu nome e sobrenome', maxLength: 160 })}
              {field('email', 'E-mail pessoal', { type: 'email', autoComplete: 'email', autoCapitalize: 'none', placeholder: 'seu@email.com', maxLength: 254 })}
              {errors.existingAccount && <div className="auth-existing-account"><p>Acesse a conta que você já possui.</p><Link to="/login" state={loginState} className="auth-text-link">Entrar com este e-mail →</Link></div>}
              {!errors.existingAccount && (verified && passwordSet ? <p className="family-auth-hint">E-mail confirmado e senha já definida.</p> : <><div className="auth-field-row">{field('password', 'Senha', { type: showPassword ? 'text' : 'password', autoComplete: 'new-password', placeholder: 'Mínimo 6 caracteres', minLength: 6 })}{field('confirmPassword', 'Confirmar senha', { type: showPassword ? 'text' : 'password', autoComplete: 'new-password', placeholder: 'Repita a senha', minLength: 6 })}</div><button className="family-password-toggle" type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Ocultar senhas' : 'Mostrar senhas'}</button></>)}
            </>}
            {step === 1 && <>
              {field('familyName', 'Nome da família', { autoComplete: 'organization', placeholder: 'Ex.: Família Silva', maxLength: 80 })}
              <div className="auth-field-row">{field('phone', 'Telefone com DDD', { type: 'tel', autoComplete: 'tel', placeholder: '(11) 99999-9999', onChange: event => update('phone', maskPhone(event.target.value)) })}{field('dateOfBirth', 'Nascimento', { type: 'date', autoComplete: 'bday', min: '1900-01-01', max: localToday() })}</div>
              <div className="form-group"><span className="form-label">Seu avatar</span><CatalogAvatarChoice value={form.avatarPreset} onChange={value => update('avatarPreset', value)} />{errors.avatarPreset && <span role="alert" className="family-field-error">{errors.avatarPreset}</span>}</div>
            </>}
            {step === 2 && <>
              <dl className="auth-review"><div><dt>Família</dt><dd>{form.familyName}</dd></div><div><dt>Responsável</dt><dd>{form.name} · {form.profileType === 'pai' ? 'Pai' : 'Mãe'}</dd></div><div><dt>E-mail de acesso</dt><dd>{form.email}</dd></div><div><dt>Telefone</dt><dd>{form.phone}</dd></div><div><dt>Nascimento</dt><dd>{form.dateOfBirth.split('-').reverse().join('/')}</dd></div></dl>
              <label className="register-terms"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Li e aceito os <a href={legal.terms_url} target="_blank" rel="noopener noreferrer">Termos de Uso</a> e a <a href={legal.privacy_url} target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span></label>
              {errors.accepted && <p role="alert" className="family-field-error">{errors.accepted}</p>}
            </>}
            {errors.submit && <p role="alert" className="family-field-error">{errors.submit}</p>}
            {!errors.existingAccount && <div className="auth-actions">{step > 0 && <button type="button" className="btn btn-ghost" onClick={() => { setErrors({}); setStep(previous => previous - 1); }}>Voltar</button>}<button type="submit" className="btn btn-primary">{busy ? 'Aguarde…' : step === 2 ? 'Criar família' : 'Continuar'}</button></div>}
          </fieldset>
        </form>
      </>}
      <p className="auth-footer">Já tem conta? <Link to="/login" state={loginState}>Entrar</Link></p>
      {import.meta.env.DEV && <div className="auth-dev-tools"><button type="button" disabled={busy} onClick={() => { setSimulation(value => !value); setStep(0); setVerified(false); setPasswordSet(false); setSimulationDone(false); setAccepted(false); setPendingEmail(''); setConfirmationCode(''); setErrors({}); }}>{simulation ? 'Sair da simulação' : 'Simular cadastro'}</button>{simulation && <span role="status">Teste local · nenhuma conta será criada</span>}</div>}
    </div>
  </div>;
}

