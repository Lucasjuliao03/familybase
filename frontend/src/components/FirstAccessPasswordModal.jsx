import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function FirstAccessPasswordModal() {
  const { t } = useLanguage();
  const { mustChangePassword, fetchMe, clearMustChangePassword } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (!mustChangePassword) return null;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 4) {
      setErr(t('fam_admin_password_short'));
      return;
    }
    if (pw !== pw2) {
      setErr(t('fam_admin_password_mismatch'));
      return;
    }
    setLoading(true);
    try {
      await api.put('/auth/password/first-access', { newPassword: pw });
      clearMustChangePassword();
      await fetchMe();
      setPw('');
      setPw2('');
    } catch (ex) {
      setErr(ex?.message || ex.response?.data?.error || t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('fam_admin_first_password_title')}</h2>
        </div>
        <form onSubmit={submit}>
          <p style={{ marginBottom: 16, color: 'var(--text-light)', fontSize: '0.9rem' }}>
            {t('fam_admin_first_password_hint')}
          </p>
          {err && <div style={{ color: 'var(--danger)', marginBottom: 12, fontSize: '0.85rem' }}>{err}</div>}
          <div className="form-group">
            <label className="form-label">{t('fam_admin_new_password')}</label>
            <input
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('confirm_password')}</label>
            <input
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '…' : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
