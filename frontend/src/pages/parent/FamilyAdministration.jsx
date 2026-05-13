import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import api, { publicAssetUrl } from '../../services/api';
import AvatarPicker, { PRESET_AVATARS } from '../../components/AvatarPicker';
import UserDisplayColorPicker from '../../components/UserDisplayColorPicker';
import {
  pickFirstAvailableUserDisplayColor,
  normalizeHex,
  isUserDisplaySwatchDisabled,
  USER_DISPLAY_COLOR_PALETTE,
} from '../../lib/userDisplayColors';

const COLOR_PRESETS = ['#6C5CE7', '#E84393', '#00B894', '#FDCB6E', '#74B9FF', '#E17055', '#A29BFE', '#55EFC4', '#0984E3', '#FD79A8', '#636E72'];

function imgUrl(path) {
  if (!path) return null;
  return publicAssetUrl(path);
}

const MODULE_ICONS = {
  tasks: '✅',
  routines: '🔄',
  calendar: '📅',
  allowance: '💰',
  family_shop: '🛍️',
  medals: '🏅',
  grades: '📚',
  piggy_bank: '🐷',
  goals: '🎯',
  reports: '📈',
  notifications: '🔔',
  shopping: '🛒',
  health: '❤️',
  mural: '📌',
};

function inferMedalGroup(m) {
  if (m.medal_group) return m.medal_group;
  const c = m.category;
  if (c === 'grades') return 'studies';
  if (c === 'tasks' || c === 'streak') return 'routine';
  if (c === 'allowance') return 'allowance';
  return 'special';
}

function inferCategoryForApi(m) {
  const c = m.category;
  if (c && ['tasks', 'grades', 'streak', 'special', 'allowance'].includes(c)) return c;
  const g = inferMedalGroup(m);
  if (g === 'studies') return 'grades';
  if (g === 'routine' || g === 'organization' || g === 'responsibility' || g === 'behavior') return 'tasks';
  if (g === 'allowance') return 'allowance';
  return 'special';
}

export default function FamilyAdministration() {
  const { t } = useLanguage();
  const toast = useToast();
  const { user, fetchMe, setModules } = useAuth();
  const [tab, setTab] = useState('family');
  const [moduleSettings, setModuleSettings] = useState(null);
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [relatives, setRelatives] = useState([]);
  const [children, setChildren] = useState([]);
  const [medals, setMedals] = useState([]);

  const [familyForm, setFamilyForm] = useState({});
  const [userModal, setUserModal] = useState(null);
  const [childModal, setChildModal] = useState(null);
  const [relModal, setRelModal] = useState(null);
  const [medalModal, setMedalModal] = useState(null);
  const [pwModal, setPwModal] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [famRes, memRes, relRes, medRes] = await Promise.all([
        api.get('/families'),
        api.get('/families/members'),
        api.get('/families/relatives'),
        api.get('/gamification/medals'),
      ]);
      setFamily(famRes.data.family);
      setFamilyForm(famRes.data.family || {});
      setChildren(famRes.data.children || []);
      setMembers(memRes.data || []);
      setRelatives(relRes.data || []);
      setMedals(medRes.data || []);
    } catch (e) {
      toast.error(t('error_occurred'));
    }
  }, [toast, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab !== 'modules') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/families/modules');
        if (!cancelled) setModuleSettings(data);
      } catch (e) {
        toast.error(t('error_occurred'));
      }
    })();
    return () => { cancelled = true; };
  }, [tab, toast, t]);

  const parentsList = useMemo(() => (Array.isArray(members) ? members : []).filter((m) => m.role === 'parent'), [members]);

  const accessProfile = user?.access_profile ?? user?.accessProfile ?? 'gestor';
  const isGestorUser = user?.role === 'parent' && accessProfile === 'gestor';

  const canEditMemberAvatar = (memberId) => {
    if (!user?.id || !memberId) return false;
    if (String(user.id) === String(memberId)) return true;
    return isGestorUser;
  };

  function MemberAvatarCell({ member, onRefresh }) {
    const canEdit = canEditMemberAvatar(member.id);
    if (!canEdit) {
      return (
        <div
          className="user-avatar"
          style={{
            width: 40,
            height: 40,
            background: member.display_color || 'var(--bg)',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {member.avatar_url ? (
            <img src={imgUrl(member.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : member.emoji ? (
            <span>{member.emoji}</span>
          ) : (
            <span>{PRESET_AVATARS.find((a) => a.id === member.avatar_preset)?.emoji || member.name?.[0] || '?'}</span>
          )}
        </div>
      );
    }
    return (
      <AvatarPicker
        currentAvatarUrl={member.avatar_url}
        currentPreset={member.avatar_preset}
        endpoint={`/families/members/${member.id}/avatar`}
        size="md"
        onSave={onRefresh}
      />
    );
  }

  const patchFamilyModule = async (key, nextEnabled) => {
    if (!nextEnabled) {
      const ok = window.confirm(t('fam_module_confirm_disable'));
      if (!ok) return;
    }
    try {
      const { data } = await api.put('/families/modules', { modules: { [key]: nextEnabled } });
      if (data.modules) setModules(data.modules);
      await fetchMe();
      const { data: fresh } = await api.get('/families/modules');
      setModuleSettings(fresh);
      toast.success(t('fam_admin_saved'));
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const openMedalFromTemplate = (m) => {
    setMedalModal({
      name: m.name ? `${m.name} (${t('fam_medal_family_suffix')})` : '',
      name_en: m.name_en || m.name,
      description: m.description || '',
      description_en: m.description_en || '',
      icon: m.icon || '🏅',
      color: m.color || '#6C5CE7',
      category: inferCategoryForApi(m),
      medal_group: inferMedalGroup(m),
      requirement_type: m.requirement_type || 'tasks_completed',
      requirement_value: m.requirement_value ?? 1,
      extra_points: m.extra_points ?? 0,
      rule_description: m.rule_description || '',
      is_active: 1,
    });
  };

  const saveFamily = async (e) => {
    e.preventDefault();
    try {
      await api.put('/families', {
        name: familyForm.name,
        language: familyForm.language,
        contact_email: familyForm.contact_email,
        contact_phone: familyForm.contact_phone,
        emoji: familyForm.emoji,
        primary_color: familyForm.primary_color,
        secondary_color: familyForm.secondary_color,
        status: familyForm.status,
      });
      toast.success(t('fam_admin_saved'));
      loadAll();
      fetchMe();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const { data } = await api.put('/families/logo', fd);
      setFamilyForm((p) => ({ ...p, logo_url: data.logo_url }));
      setFamily((p) => ({ ...p, logo_url: data.logo_url }));
      toast.success(t('fam_admin_saved'));
      await loadAll();
      await fetchMe();
    } catch {
      toast.error(t('error_occurred'));
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const removeLogo = async () => {
    try {
      await api.delete('/families/logo');
      setFamilyForm((p) => ({ ...p, logo_url: null }));
      loadAll();
      toast.success(t('fam_admin_logo_removed'));
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const saveMedal = async (e) => {
    e.preventDefault();
    try {
      if (medalModal.id) {
        await api.put(`/gamification/medals/${medalModal.id}`, medalModal);
      } else {
        const { id: _omit, family_id: _f, ...rest } = medalModal;
        await api.post('/gamification/medals', rest);
      }
      toast.success(t('fam_admin_saved'));
      setMedalModal(null);
      loadAll();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const deleteMedal = async (id) => {
    if (!confirm(t('fam_admin_confirm_delete_medal'))) return;
    try {
      await api.delete(`/gamification/medals/${id}`);
      toast.success(t('fam_admin_deleted'));
      loadAll();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  return (
    <div className="animate-fade-in fam-admin">
      <header className="fam-admin-header">
        <div>
          <h1 className="page-title">{t('fam_admin_title')}</h1>
          <p className="page-subtitle">{t('fam_admin_subtitle')}</p>
        </div>
        {familyForm?.name && (
          <div
            className="fam-admin-badge"
            style={{
              borderColor: familyForm.primary_color || 'var(--border)',
              background: `linear-gradient(135deg, ${familyForm.primary_color || '#6C5CE7'}22, ${familyForm.secondary_color || '#74B9FF'}18)`,
            }}
          >
            <span className="fam-admin-emoji">{familyForm.emoji || '🏠'}</span>
            <span>{familyForm.name}</span>
          </div>
        )}
      </header>

      <nav className="fam-admin-tabs">
        {['family', 'users', 'medals', 'modules'].map((k) => (
          <button key={k} type="button" className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {t(`fam_admin_tab_${k}`)}
          </button>
        ))}
      </nav>

      {tab === 'family' && (
        <form className="card fam-admin-card" onSubmit={saveFamily}>
          <h2 className="card-title mb-16">{t('fam_admin_tab_family')}</h2>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">{t('family_name')}</label>
              <input
                className="form-input"
                value={familyForm.name || ''}
                onChange={(e) => setFamilyForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('fam_admin_family_email')}</label>
              <input
                className="form-input"
                type="email"
                value={familyForm.contact_email || ''}
                onChange={(e) => setFamilyForm((p) => ({ ...p, contact_email: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('fam_admin_phone')}</label>
              <input
                className="form-input"
                value={familyForm.contact_phone || ''}
                onChange={(e) => setFamilyForm((p) => ({ ...p, contact_phone: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('language')}</label>
              <select
                className="form-select"
                value={familyForm.language || 'pt'}
                onChange={(e) => setFamilyForm((p) => ({ ...p, language: e.target.value }))}
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('fam_admin_family_emoji')}</label>
              <input
                className="form-input"
                maxLength={8}
                value={familyForm.emoji || ''}
                onChange={(e) => setFamilyForm((p) => ({ ...p, emoji: e.target.value }))}
                placeholder="🏠"
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('fam_admin_status')}</label>
              <select
                className="form-select"
                value={familyForm.status || 'active'}
                onChange={(e) => setFamilyForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="active">{t('fam_admin_status_active')}</option>
                <option value="inactive">{t('fam_admin_status_inactive')}</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('fam_admin_family_logo')}</label>
            <div className="flex gap-12" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '2px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  background: 'var(--bg)',
                }}
              >
                {familyForm.logo_url ? (
                  <img src={imgUrl(familyForm.logo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>{familyForm.emoji || '🏠'}</span>
                )}
              </div>
              <input type="file" accept="image/*" hidden id="fam-logo-inp" onChange={uploadLogo} />
              <label htmlFor="fam-logo-inp" className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                {logoUploading ? '…' : t('fam_admin_upload_logo')}
              </label>
              {familyForm.logo_url && (
                <button type="button" className="btn btn-ghost" onClick={removeLogo}>
                  {t('fam_admin_remove_logo')}
                </button>
              )}
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            {t('save')}
          </button>
        </form>
      )}

      {tab === 'users' && (
        <div className="fam-admin-section">
          <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: 12 }}>
            <h2 className="card-title">{t('fam_admin_users_heading')}</h2>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRelModal({})}>
                + {t('fam_admin_add_relative')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setUserModal({ kind: 'parent' })}>
                + {t('fam_admin_add_guardian')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setChildModal({})}>
                + {t('add_child')}
              </button>
            </div>
          </div>

          <h3 className="fam-admin-subh">{t('fam_admin_guardians')}</h3>
          <div className="table-container mb-24">
            <table>
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('email')}</th>
                  <th>{t('fam_admin_access_profile')}</th>
                  <th>{t('fam_admin_table_status')}</th>
                  <th>{t('fam_admin_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {parentsList.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="flex gap-8" style={{ alignItems: 'center' }}>
                        <MemberAvatarCell member={m} onRefresh={() => { loadAll(); fetchMe(); }} />
                        {m.name}
                        {m.id === user?.id ? ` (${t('fam_admin_you')})` : ''}
                      </div>
                    </td>
                    <td>{m.email}</td>
                    <td>{t(m.access_profile === 'auxiliar' ? 'fam_prof_aux_short' : 'fam_prof_gestor_short')}</td>
                    <td>
                      <span className={`badge badge-${m.status === 'active' ? 'success' : 'warning'}`}>{m.status}</span>
                    </td>
                    <td>
                      <div className="flex gap-8">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setUserModal({ ...m, kind: 'parent' })}>
                          {t('edit')}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPwModal({ id: m.id, name: m.name, isChildUser: false })}>
                          {t('fam_admin_reset_password')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="fam-admin-subh">{t('fam_admin_relatives')}</h3>
          <div className="table-container mb-24">
            <table>
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('email')}</th>
                  <th>{t('fam_admin_relationship')}</th>
                  <th>{t('fam_admin_access_profile')}</th>
                  <th>{t('fam_admin_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {relatives.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="flex gap-8" style={{ alignItems: 'center' }}>
                        <MemberAvatarCell member={r} onRefresh={() => { loadAll(); fetchMe(); }} />
                        {r.name}
                      </div>
                    </td>
                    <td>{r.email}</td>
                    <td>{r.relationship}</td>
                    <td>{t(r.access_profile === 'auxiliar' ? 'fam_prof_rel_aux_short' : 'fam_prof_parente_short')}</td>
                    <td>
                      <div className="flex gap-8">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRelModal({ ...r, linked_child_ids: (r.linked_child_ids || '').split(',').filter(Boolean) })}>
                          {t('edit')}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPwModal({ id: r.id, name: r.name, isChildUser: false })}>
                          {t('fam_admin_reset_password')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="fam-admin-subh">{t('children')}</h3>
          <div className="grid grid-3">
            {children.map((c) => (
              <div key={c.id} className="card" style={{ borderTop: `4px solid ${c.color}`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, right: 12 }} className="flex gap-6">
                  <button type="button" className="btn-icon btn-ghost" onClick={() => setChildModal(c)}>
                    {t('edit')}
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-ghost"
                    onClick={() => setPwModal({ id: c.user_id, childId: c.id, name: c.name, isChildUser: true })}
                    disabled={!c.user_id}
                    title={t('fam_admin_reset_password')}
                  >
                    🔑
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <AvatarPicker
                    currentAvatarUrl={c.avatar_url}
                    currentPreset={c.avatar_preset}
                    endpoint={`/auth/avatar/child/${c.id}`}
                    size="lg"
                    onSave={loadAll}
                  />
                </div>
                <h3 style={{ textAlign: 'center', fontWeight: 700 }}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</h3>
                <p style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '0.85rem' }}>{c.age != null ? `${c.age} ${t('fam_admin_years')}` : ''}</p>
                {c.user_email ? (
                  <p style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-light)', wordBreak: 'break-all', marginTop: 4 }}>{c.user_email}</p>
                ) : (
                  <p style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--warning)', marginTop: 4 }}>{t('fam_admin_child_no_login')}</p>
                )}
                <div style={{ textAlign: 'center' }}>
                  <span className={`badge badge-${c.status === 'active' ? 'success' : 'warning'}`}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'profiles' && (
        <div className="grid grid-2 fam-admin-profiles">
          {['gestor', 'child', 'parente', 'aux'].map((k) => (
            <div key={k} className="card">
              <h3 className="card-title">{t(`fam_prof_${k}_title`)}</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', lineHeight: 1.55 }}>{t(`fam_prof_${k}_body`)}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'appearance' && (
        <form className="card fam-admin-card" onSubmit={saveFamily}>
          <h2 className="card-title mb-16">{t('fam_admin_appearance')}</h2>
          <p style={{ color: 'var(--text-light)', marginBottom: 20 }}>{t('fam_admin_appearance_hint')}</p>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">{t('fam_admin_primary_color')}</label>
              <div className="flex gap-8 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setFamilyForm((p) => ({ ...p, primary_color: c }))}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: c,
                      border: familyForm.primary_color === c ? '3px solid var(--text)' : 'none',
                      cursor: 'pointer',
                    }}
                  />
                ))}
                <input
                  className="form-input"
                  style={{ maxWidth: 120 }}
                  type="text"
                  value={familyForm.primary_color || ''}
                  onChange={(e) => setFamilyForm((p) => ({ ...p, primary_color: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('fam_admin_secondary_color')}</label>
              <div className="flex gap-8 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFamilyForm((p) => ({ ...p, secondary_color: c }))}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: c,
                      border: familyForm.secondary_color === c ? '3px solid var(--text)' : 'none',
                      cursor: 'pointer',
                    }}
                  />
                ))}
                <input
                  className="form-input"
                  style={{ maxWidth: 120 }}
                  type="text"
                  value={familyForm.secondary_color || ''}
                  onChange={(e) => setFamilyForm((p) => ({ ...p, secondary_color: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('fam_admin_family_emoji')}</label>
              <input
                className="form-input"
                maxLength={8}
                value={familyForm.emoji || ''}
                onChange={(e) => setFamilyForm((p) => ({ ...p, emoji: e.target.value }))}
              />
            </div>
          </div>
          <div
            className="fam-admin-preview"
            style={{
              marginTop: 24,
              padding: 24,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: `linear-gradient(135deg, ${familyForm.primary_color || '#6C5CE7'}18, ${familyForm.secondary_color || '#74B9FF'}14)`,
            }}
          >
            <strong>{t('fam_admin_preview')}</strong>
            <p style={{ marginTop: 8 }}>
              {familyForm.emoji || '🏠'} {familyForm.name}
            </p>
          </div>
          <button type="submit" className="btn btn-primary mt-16">
            {t('save')}
          </button>
        </form>
      )}

      {tab === 'medals' && (
        <div className="fam-admin-section">
          <div className="flex-between mb-16">
            <h2 className="card-title">{t('medals')}</h2>
            <button type="button" className="btn btn-primary" onClick={() => setMedalModal({ icon: '🏅', is_active: 1, requirement_type: 'tasks_completed', requirement_value: 5, medal_group: 'routine' })}>
              + {t('fam_admin_new_medal')}
            </button>
          </div>
          <div className="grid grid-3">
            {medals.map((m) => (
              <div key={m.id} className="card" style={{ textAlign: 'center', borderTop: `4px solid ${m.color || '#6C5CE7'}` }}>
                <div style={{ fontSize: '2.2rem' }}>{m.icon}</div>
                <h3 style={{ fontWeight: 700, marginTop: 8 }}>{m.name}</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>{m.description}</p>
                {m.family_id && (
                  <div className="flex gap-8" style={{ justifyContent: 'center', marginTop: 8 }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMedalModal({ ...m, is_active: m.is_active !== 0 ? 1 : 0 })}>
                      {t('edit')}
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteMedal(m.id)}>
                      {t('delete')}
                    </button>
                  </div>
                )}
                {!m.family_id && (
                  <div className="flex gap-8" style={{ justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-info">{t('fam_admin_medal_global')}</span>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => openMedalFromTemplate(m)}>
                      {t('fam_medal_copy_family')}
                    </button>
                  </div>
                )}
                {(m.is_active === 0 || m.is_active === false) && m.family_id && <span className="badge badge-warning mt-8">{t('fam_admin_inactive')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'modules' && (
        <div className="fam-admin-section">
          <p style={{ color: 'var(--text-light)', marginBottom: 16, maxWidth: 720 }}>{t('fam_module_intro')}</p>
          <p style={{ color: 'var(--text-light)', marginBottom: 24, fontSize: '0.9rem' }}>{t('fam_module_hide_note')}</p>
          {!moduleSettings ? (
            <div className="card fam-admin-card" style={{ textAlign: 'center', padding: 40 }}>…</div>
          ) : (
            <div className="fam-modules-grid">
              {moduleSettings.modules.map((mod) => {
                const titleKey = `fam_module_${mod.module_key}_title`;
                const descKey = `fam_module_${mod.module_key}_desc`;
                const title = t(titleKey);
                const desc = t(descKey);
                const icon = MODULE_ICONS[mod.module_key] || '📦';
                const premiumLabel = mod.is_premium ? t('fam_module_premium') : t('fam_module_free');
                const locked = mod.is_premium && !moduleSettings.planAllowsPremium && !mod.is_enabled;
                const canToggle = mod.is_enabled || mod.can_enable;

                return (
                  <div key={mod.module_key} className={`card fam-module-card ${mod.is_enabled ? 'fam-module-card--on' : ''}`}>
                    <div className="fam-module-card__head">
                      <span className="fam-module-card__icon" aria-hidden>{icon}</span>
                      <div>
                        <h3 className="fam-module-card__title">{title}</h3>
                        <span className={`badge ${mod.is_premium ? 'badge-warning' : 'badge-info'}`} style={{ marginTop: 6 }}>
                          {premiumLabel}
                        </span>
                      </div>
                    </div>
                    <p className="fam-module-card__desc">{desc}</p>
                    <div className="fam-module-card__status">
                      <strong>{t('fam_admin_table_status')}:</strong>{' '}
                      {mod.is_enabled ? (
                        <span style={{ color: 'var(--success)' }}>{t('fam_module_status_on')}</span>
                      ) : (
                        <span style={{ color: 'var(--text-light)' }}>{t('fam_module_status_off')}</span>
                      )}
                    </div>
                    {locked && (
                      <p className="fam-module-card__locked">{t('fam_module_premium_locked')}</p>
                    )}
                    <button
                      type="button"
                      className={`btn btn-sm ${mod.is_enabled ? 'btn-ghost' : 'btn-primary'}`}
                      style={{ marginTop: 12, width: '100%' }}
                      disabled={!canToggle}
                      onClick={() => patchFamilyModule(mod.module_key, !mod.is_enabled)}
                    >
                      {mod.is_enabled ? t('fam_module_disable') : t('fam_module_enable')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'security' && (
        <div className="card fam-admin-card">
          <h2 className="card-title mb-16">{t('fam_admin_security')}</h2>
          <ul className="fam-admin-list">
            <li>{t('fam_admin_sec_1')}</li>
            <li>{t('fam_admin_sec_2')}</li>
            <li>{t('fam_admin_sec_3')}</li>
          </ul>
          <p style={{ marginTop: 16, color: 'var(--text-light)' }}>{t('fam_admin_sec_hint')}</p>
        </div>
      )}

      {/* Modal: guardião */}
      {userModal && (
        <GuardianUserModal
          initial={userModal}
          onClose={() => setUserModal(null)}
          onSaved={() => {
            setUserModal(null);
            loadAll();
            fetchMe();
          }}
          t={t}
          toast={toast}
          familyPrimary={familyForm?.primary_color}
          familySecondary={familyForm?.secondary_color}
          adultMembers={[...parentsList, ...relatives]}
        />
      )}

      {childModal && (
        <ChildModalForm
          initial={childModal}
          childrenList={children}
          t={t}
          toast={toast}
          onClose={() => setChildModal(null)}
          onSaved={() => {
            setChildModal(null);
            loadAll();
          }}
        />
      )}

      {relModal && (
        <RelativeModalForm
          initial={relModal}
          childrenList={children}
          t={t}
          toast={toast}
          onClose={() => setRelModal(null)}
          onSaved={() => {
            setRelModal(null);
            loadAll();
          }}
          familyPrimary={familyForm?.primary_color}
          familySecondary={familyForm?.secondary_color}
          adultMembers={[...parentsList, ...relatives]}
        />
      )}

      {medalModal && (
        <div className="modal-overlay" onClick={() => setMedalModal(null)}>
          <div className="modal fam-admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{medalModal.id ? t('fam_admin_edit_medal') : t('fam_admin_new_medal')}</h2>
              <button type="button" className="modal-close" onClick={() => setMedalModal(null)}>
                ×
              </button>
            </div>
            <form onSubmit={saveMedal}>
              <div className="form-group">
                <label className="form-label">{t('name')} *</label>
                <input className="form-input" value={medalModal.name || ''} onChange={(e) => setMedalModal((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">{t('fam_admin_medal_icon')}</label>
                  <input className="form-input" value={medalModal.icon || '🏅'} onChange={(e) => setMedalModal((p) => ({ ...p, icon: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('fam_admin_medal_color')}</label>
                  <input
                    className="form-input"
                    type="text"
                    value={medalModal.color || ''}
                    onChange={(e) => setMedalModal((p) => ({ ...p, color: e.target.value }))}
                    placeholder="#6C5CE7"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('task_description')}</label>
                <textarea className="form-textarea" value={medalModal.description || ''} onChange={(e) => setMedalModal((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('fam_admin_medal_rule')}</label>
                <textarea className="form-textarea" value={medalModal.rule_description || ''} onChange={(e) => setMedalModal((p) => ({ ...p, rule_description: e.target.value }))} />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">{t('fam_admin_medal_category')}</label>
                  <select
                    className="form-select"
                    value={medalModal.medal_group || 'routine'}
                    onChange={(e) => setMedalModal((p) => ({ ...p, medal_group: e.target.value }))}
                  >
                    {['organization', 'studies', 'routine', 'responsibility', 'behavior', 'allowance', 'rewards', 'special'].map((c) => (
                      <option key={c} value={c}>
                        {t(`fam_medal_cat_${c}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('fam_admin_medal_extra_points')}</label>
                  <input
                    type="number"
                    className="form-input"
                    value={medalModal.extra_points ?? 0}
                    onChange={(e) => setMedalModal((p) => ({ ...p, extra_points: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">{t('fam_admin_medal_req_type')}</label>
                  <select
                    className="form-select"
                    value={medalModal.requirement_type || 'tasks_completed'}
                    onChange={(e) => setMedalModal((p) => ({ ...p, requirement_type: e.target.value }))}
                  >
                    <option value="tasks_completed">{t('fam_rule_tasks')}</option>
                    <option value="streak">{t('fam_rule_streak')}</option>
                    <option value="points_goal">{t('fam_rule_points')}</option>
                    <option value="allowance_goal">{t('fam_rule_allowance')}</option>
                    <option value="first_reward">{t('fam_rule_reward')}</option>
                    <option value="custom">{t('fam_rule_custom')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('fam_admin_medal_req_value')}</label>
                  <input
                    type="number"
                    className="form-input"
                    value={medalModal.requirement_value ?? 1}
                    onChange={(e) => setMedalModal((p) => ({ ...p, requirement_value: e.target.value }))}
                  />
                </div>
              </div>
              {medalModal.id && (
                <div className="form-group">
                  <label className="form-label">{t('fam_admin_table_status')}</label>
                  <select
                    className="form-select"
                    value={medalModal.is_active !== 0 && medalModal.is_active !== false ? 1 : 0}
                    onChange={(e) => setMedalModal((p) => ({ ...p, is_active: Number(e.target.value) }))}
                  >
                    <option value={1}>{t('fam_admin_status_active')}</option>
                    <option value={0}>{t('fam_admin_inactive')}</option>
                  </select>
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setMedalModal(null)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pwModal && (
        <PasswordResetModal
          pwModal={pwModal}
          onClose={() => setPwModal(null)}
          onSaved={() => {
            setPwModal(null);
            toast.success(t('fam_admin_password_updated'));
          }}
          t={t}
        />
      )}

      <style>{`
        .fam-admin-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
        .fam-admin-badge { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: var(--radius); border: 2px solid var(--border); font-weight: 600; }
        .fam-admin-emoji { font-size: 1.4rem; }
        .fam-admin-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .fam-admin-tabs .tab { border-radius: var(--radius) var(--radius) 0 0; }
        .fam-modules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
        .fam-module-card { padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); text-align: left; transition: box-shadow 0.2s; }
        .fam-module-card--on { border-color: color-mix(in srgb, var(--primary) 45%, var(--border)); box-shadow: 0 4px 20px rgba(108, 92, 231, 0.08); }
        .fam-module-card__head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
        .fam-module-card__icon { font-size: 2rem; line-height: 1; }
        .fam-module-card__title { margin: 0; font-size: 1.05rem; font-weight: 700; }
        .fam-module-card__desc { font-size: 0.88rem; color: var(--text-light); margin: 0 0 12px; line-height: 1.45; }
        .fam-module-card__status { font-size: 0.85rem; margin-bottom: 4px; }
        .fam-module-card__locked { font-size: 0.8rem; color: var(--warning); margin: 8px 0 0; }
        .fam-admin-card { padding: 24px; }
        .fam-admin-section { margin-bottom: 32px; }
        .fam-admin-subh { font-size: 1.05rem; font-weight: 700; margin: 16px 0 12px; }
        .fam-admin-modal { max-width: 520px; max-height: 90vh; overflow: auto; }
        .fam-admin-list { padding-left: 1.2rem; line-height: 1.8; color: var(--text-light); }
      `}</style>
    </div>
  );
}

function PasswordResetModal({ pwModal, onClose, onSaved, t }) {
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 4) return;
    try {
      if (pwModal.isChildUser && pwModal.childId) {
        await api.put(`/families/children/${pwModal.childId}/password`, { password, must_change_password: mustChange });
      } else {
        await api.put(`/families/members/${pwModal.id}/password`, { password, must_change_password: mustChange });
      }
      onSaved();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || err.message || 'Erro ao alterar senha.');
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('fam_admin_reset_password')}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <p style={{ marginBottom: 12, color: 'var(--text-light)', fontSize: '0.9rem' }}>
            {pwModal.name}
          </p>
          <div className="form-group">
            <label className="form-label">{t('password')}</label>
            <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 16 }}>
            <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
            <span style={{ fontSize: '0.9rem' }}>{t('fam_admin_must_change_pw')}</span>
          </label>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GuardianUserModal({ initial, onClose, onSaved, t, toast, familyPrimary, familySecondary, adultMembers }) {
  const isEdit = !!initial.id;
  const excludeId = initial.id || null;
  const [form, setForm] = useState(() => {
    let displayColor = initial.display_color;
    if (!isEdit) {
      displayColor = pickFirstAvailableUserDisplayColor({
        primary: familyPrimary,
        secondary: familySecondary,
        excludeUserId: null,
        adultMembers,
      });
    } else {
      const n = normalizeHex(displayColor || '');
      const inPalette = USER_DISPLAY_COLOR_PALETTE.some((c) => normalizeHex(c) === n);
      if (
        !inPalette
        || isUserDisplaySwatchDisabled(n, {
          primary: familyPrimary,
          secondary: familySecondary,
          excludeUserId: excludeId,
          adultMembers,
        })
      ) {
        displayColor = pickFirstAvailableUserDisplayColor({
          primary: familyPrimary,
          secondary: familySecondary,
          excludeUserId: excludeId,
          adultMembers,
        });
      } else {
        displayColor = n;
      }
    }
    return {
      name: initial.name || '',
      email: initial.email || '',
      password: '',
      access_profile: initial.access_profile === 'auxiliar' ? 'auxiliar' : 'gestor',
      phone: initial.phone || '',
      emoji: initial.emoji || '',
      display_color: displayColor,
      must_change_password: false,
    };
  });

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await api.put(`/families/members/${initial.id}`, {
          name: form.name,
          email: form.email,
          phone: form.phone,
          emoji: form.emoji || null,
          display_color: form.display_color,
          access_profile: form.access_profile,
        });
      } else {
        await api.post('/families/members', {
          name: form.name,
          email: form.email,
          password: form.password || '123456',
          access_profile: form.access_profile === 'auxiliar' ? 'auxiliar' : 'gestor',
          phone: form.phone,
          emoji: form.emoji,
          display_color: form.display_color,
          must_change_password: form.must_change_password,
        });
      }
      toast.success(t('fam_admin_saved'));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fam-admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? t('fam_admin_edit_guardian') : t('fam_admin_add_guardian')}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">{t('name')} *</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('email')} *</label>
            <input className="form-input" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          </div>
          {!isEdit && (
            <div className="form-group">
              <label className="form-label">{t('password')}</label>
              <input className="form-input" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t('fam_admin_access_profile')}</label>
            <select className="form-select" value={form.access_profile} onChange={(e) => setForm((p) => ({ ...p, access_profile: e.target.value }))}>
              <option value="gestor">{t('fam_prof_gestor_title')}</option>
              <option value="auxiliar">{t('fam_prof_aux_title')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('fam_admin_phone')}</label>
            <input className="form-input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('fam_admin_user_emoji')}</label>
            <input className="form-input" maxLength={8} value={form.emoji} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} />
          </div>
          <UserDisplayColorPicker
            label={t('fam_admin_user_color')}
            value={form.display_color}
            onChange={(hex) => setForm((p) => ({ ...p, display_color: hex }))}
            primaryColor={familyPrimary}
            secondaryColor={familySecondary}
            excludeUserId={excludeId}
            adultMembers={adultMembers}
          />
          {!isEdit && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 16 }}>
              <input type="checkbox" checked={form.must_change_password} onChange={(e) => setForm((p) => ({ ...p, must_change_password: e.target.checked }))} />
              <span style={{ fontSize: '0.9rem' }}>{t('fam_admin_must_change_pw')}</span>
            </label>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChildModalForm({ initial, t, toast, onClose, onSaved }) {
  const isEdit = !!initial.id;
  const hasLogin = !!(initial.user_id || initial.user_email);
  const [form, setForm] = useState({
    name: initial.name || '',
    nickname: initial.nickname || '',
    age: initial.age ?? '',
    email: initial.user_email || '',
    password: '',
    color: initial.color || '#6C5CE7',
    emoji: initial.emoji || '',
    notes: initial.notes || '',
    must_change_password: false,
  });

  const submit = async (e) => {
    e.preventDefault();
    const emailTrim = String(form.email || '').trim().toLowerCase();
    if (!isEdit || !hasLogin) {
      if (!emailTrim) {
        toast.error(t('fam_admin_child_email_required'));
        return;
      }
      if (!form.password || String(form.password).length < 6) {
        toast.error(t('fam_admin_child_password_rule'));
        return;
      }
    }
    try {
      if (isEdit) {
        await api.put(`/families/children/${initial.id}`, {
          name: form.name,
          nickname: form.nickname,
          age: form.age === '' ? null : Number(form.age),
          email: emailTrim || undefined,
          password: !hasLogin ? form.password : undefined,
          color: form.color,
          emoji: form.emoji,
          notes: form.notes,
          must_change_password: !hasLogin ? form.must_change_password : undefined,
        });
      } else {
        await api.post('/families/children', {
          name: form.name,
          nickname: form.nickname,
          age: form.age === '' ? null : Number(form.age),
          email: emailTrim,
          password: form.password,
          color: form.color,
          emoji: form.emoji,
          notes: form.notes,
          must_change_password: form.must_change_password,
        });
      }
      toast.success(t('fam_admin_saved'));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fam-admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? t('fam_admin_edit_child') : t('add_child')}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">{t('name')} *</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">{t('fam_admin_nickname')}</label>
              <input className="form-input" value={form.nickname} onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('child_age')}</label>
              <input className="form-input" type="number" value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">
              {t('email')}
              {(!isEdit || !hasLogin) ? ` *` : ''}
            </label>
            <input
              className="form-input"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              readOnly={isEdit && hasLogin}
              title={isEdit && hasLogin ? t('fam_admin_child_email_locked_hint') : undefined}
            />
            {(!isEdit || !hasLogin) && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: 6 }}>{t('fam_admin_child_login_hint')}</p>
            )}
          </div>
          {(!isEdit || !hasLogin) && (
            <>
              <div className="form-group">
                <label className="form-label">{t('password')} *</label>
                <input
                  className="form-input"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  minLength={6}
                  required
                />
                <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: 6 }}>{t('fam_admin_child_password_rule')}</p>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 16 }}>
                <input type="checkbox" checked={form.must_change_password} onChange={(e) => setForm((p) => ({ ...p, must_change_password: e.target.checked }))} />
                <span style={{ fontSize: '0.9rem' }}>{t('fam_admin_must_change_pw')}</span>
              </label>
            </>
          )}
          <div className="form-group">
            <label className="form-label">{t('child_color')}</label>
            <div className="flex gap-8 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, color: c }))}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: c,
                    border: form.color === c ? '3px solid var(--text)' : 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('fam_admin_child_emoji')}</label>
            <input className="form-input" maxLength={8} value={form.emoji} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('fam_admin_notes')}</label>
            <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RelativeModalForm({ initial, childrenList, t, toast, onClose, onSaved, familyPrimary, familySecondary, adultMembers }) {
  const isEdit = !!initial.id;
  const excludeId = initial.id || null;
  const [form, setForm] = useState(() => {
    let displayColor = initial.display_color;
    if (!isEdit) {
      displayColor = pickFirstAvailableUserDisplayColor({
        primary: familyPrimary,
        secondary: familySecondary,
        excludeUserId: null,
        adultMembers,
      });
    } else {
      const n = normalizeHex(displayColor || '');
      const inPalette = USER_DISPLAY_COLOR_PALETTE.some((c) => normalizeHex(c) === n);
      if (
        !inPalette
        || isUserDisplaySwatchDisabled(n, {
          primary: familyPrimary,
          secondary: familySecondary,
          excludeUserId: excludeId,
          adultMembers,
        })
      ) {
        displayColor = pickFirstAvailableUserDisplayColor({
          primary: familyPrimary,
          secondary: familySecondary,
          excludeUserId: excludeId,
          adultMembers,
        });
      } else {
        displayColor = n;
      }
    }
    return {
      name: initial.name || '',
      email: initial.email || '',
      password: '',
      relationship: initial.relationship || 'avó',
      access_profile: initial.access_profile === 'auxiliar' ? 'auxiliar' : 'parente',
      linked_child_ids: Array.isArray(initial.linked_child_ids) ? initial.linked_child_ids : [],
      phone: initial.phone || '',
      emoji: initial.emoji || '',
      display_color: displayColor,
      must_change_password: false,
    };
  });

  const relOptions = ['avó', 'avô', 'tio', 'tia', 'babá', 'padrinho', 'madrinha', 'cuidador', 'outro'];

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await api.put(`/families/relatives/${initial.id}`, {
          name: form.name,
          email: form.email,
          phone: form.phone,
          emoji: form.emoji,
          display_color: form.display_color,
          relationship: form.relationship,
          access_profile: form.access_profile,
          linked_child_ids: form.linked_child_ids,
        });
      } else {
        await api.post('/families/relatives', {
          name: form.name,
          email: form.email,
          password: form.password || '123456',
          relationship: form.relationship,
          access_profile: form.access_profile,
          linked_child_ids: form.linked_child_ids,
          phone: form.phone,
          emoji: form.emoji,
          display_color: form.display_color,
          must_change_password: form.must_change_password,
        });
      }
      toast.success(t('fam_admin_saved'));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fam-admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? t('fam_admin_edit_relative') : t('fam_admin_add_relative')}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">{t('name')} *</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">{t('fam_admin_relationship')}</label>
              <select className="form-select" value={form.relationship} onChange={(e) => setForm((p) => ({ ...p, relationship: e.target.value }))}>
                {relOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('email')} *</label>
              <input className="form-input" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
            </div>
          </div>
          {!isEdit && (
            <div className="form-group">
              <label className="form-label">{t('password')}</label>
              <input className="form-input" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t('fam_admin_access_profile')}</label>
            <select className="form-select" value={form.access_profile} onChange={(e) => setForm((p) => ({ ...p, access_profile: e.target.value }))}>
              <option value="parente">{t('fam_prof_parente_title')}</option>
              <option value="auxiliar">{t('fam_prof_rel_aux_option')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('fam_admin_link_children')}</label>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              {childrenList.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.linked_child_ids.includes(c.id)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        linked_child_ids: e.target.checked ? [...p.linked_child_ids, c.id] : p.linked_child_ids.filter((id) => id !== c.id),
                      }))
                    }
                  />
                  <span style={{ fontSize: '0.9rem' }}>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">{t('fam_admin_phone')}</label>
              <input className="form-input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('fam_admin_user_emoji')}</label>
              <input className="form-input" maxLength={8} value={form.emoji} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} />
            </div>
          </div>
          <UserDisplayColorPicker
            label={t('fam_admin_user_color')}
            value={form.display_color}
            onChange={(hex) => setForm((p) => ({ ...p, display_color: hex }))}
            primaryColor={familyPrimary}
            secondaryColor={familySecondary}
            excludeUserId={excludeId}
            adultMembers={adultMembers}
          />
          {!isEdit && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 16 }}>
              <input type="checkbox" checked={form.must_change_password} onChange={(e) => setForm((p) => ({ ...p, must_change_password: e.target.checked }))} />
              <span style={{ fontSize: '0.9rem' }}>{t('fam_admin_must_change_pw')}</span>
            </label>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
