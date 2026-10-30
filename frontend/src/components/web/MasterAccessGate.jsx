import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { webAdmin } from '../../services/webAdmin';
async function readAccess() {
  const access = await webAdmin();
  if (!access.mfa_required) return { access, factor:null };
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return { access, factor:data.totp.find(f => f.status === 'verified') || null };
}

export default function MasterAccessGate({ children }) {
  const { logout } = useAuth();
  const [state, setState] = useState({ checking: true });
  const [factor, setFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verifyAccess = useCallback(async () => {
    const {access,factor:found} = await readAccess();
    setState({ checking: false, ready: access.authorized && !access.mfa_required });
    setFactor(found);
  }, []);
  useEffect(() => {
    let active = true;
    readAccess().then(({access,factor:found}) => { if(active) {setState({checking:false,ready:access.authorized&&!access.mfa_required});setFactor(found);} }).catch(e => { if (active) { setError(e.message); setState({checking:false}); } });
    return () => { active = false; };
  }, []);
  const enroll = async () => {
    setBusy(true); setError('');
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Master web ${Date.now()}`, issuer: 'Tudo de Família' });
      if (err) throw err;
      setEnrollment(data); setFactor({ id: data.id });
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const confirm = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (err) throw err;
      setCode(''); setEnrollment(null); await verifyAccess();
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  if (state.ready) return children;
  return <div className="web-billing"><div className="web-billing-card">
    <img src="/brand/logo.webp" width="72" height="72" alt="Tudo de Família" />
    <p className="web-kicker">ADMINISTRADOR MASTER</p><h1>Proteja o acesso à plataforma.</h1>
    {state.checking ? <p role="status">Verificando sua autorização…</p> : <>
      <p>Confirme o segundo fator com seu aplicativo autenticador para acessar dados e operações administrativas.</p>
      {!factor && <button className="btn btn-primary" disabled={busy} onClick={enroll}>Configurar autenticador</button>}
      {enrollment && <div className="web-mfa-qr"><img src={enrollment.totp.qr_code} width="220" height="220" alt="Código QR para cadastrar o segundo fator no seu autenticador" /><p>Escaneie este QR com seu autenticador. Ele contém uma chave privada de acesso; mantenha-o protegido.</p></div>}
      {factor && <form onSubmit={confirm}><label className="form-label" htmlFor="master-code">Código de seis dígitos</label><input id="master-code" className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))} required pattern="[0-9]{6}" /><button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Confirmar acesso'}</button></form>}
      {error && <p role="alert" className="web-inline-message">{error}</p>}
      <div className="web-action-row"><button className="btn btn-ghost" onClick={() => verifyAccess().catch(e => setError(e.message))}>Verificar novamente</button><button className="btn btn-ghost" onClick={logout}>Sair</button></div>
    </>}
  </div></div>;
}
