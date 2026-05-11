import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';

function parseIdArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const x = JSON.parse(val);
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

function noticeToForm(n) {
  return {
    id: n.id,
    title: n.title || '',
    description: n.description || '',
    type: n.type || 'notice',
    priority: n.priority || 'normal',
    target_type: n.target_type || 'all',
    target_user_ids: parseIdArray(n.target_user_ids),
    target_child_ids: parseIdArray(n.target_child_ids),
    start_datetime: n.start_datetime || '',
    due_datetime: n.due_datetime || '',
    notice_time: n.notice_time || '',
    is_recurring: !!n.is_recurring,
    recurrence_rule: n.recurrence_rule || '',
    is_pinned: !!n.is_pinned,
    requires_read_confirmation: !!n.requires_read_confirmation,
    status: n.status || 'active',
  };
}

export default function MuralBoard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [notices, setNotices] = useState([]);
  const [filters, setFilters] = useState({ status: '', type: '', priority: '' });
  const [modal, setModal] = useState(null);
  const [familyData, setFamilyData] = useState(null);

  const isGestor = user?.role === 'parent' && (user.access_profile ?? user.accessProfile ?? 'gestor') === 'gestor';
  const canCreate = user?.role === 'parent';

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (filters.status) q.set('status', filters.status);
      if (filters.type) q.set('type', filters.type);
      if (filters.priority) q.set('priority', filters.priority);
      const { data } = await api.get(`/mural/notices?${q}`);
      const sorted = [...(data || [])].sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0));
      setNotices(sorted);
    } catch {
      toast.error(t('error_occurred'));
    }
  }, [filters.status, filters.type, filters.priority, toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user?.role === 'parent') {
      api.get('/families').then((r) => setFamilyData(r.data)).catch(() => {});
    }
  }, [user]);

  const markRead = async (id) => {
    try {
      await api.post(`/mural/notices/${id}/read`);
      load();
    } catch { /* ignore */ }
  };

  const confirmRead = async (id) => {
    try {
      await api.post(`/mural/notices/${id}/confirm`);
      toast.success(t('fam_admin_saved'));
      load();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const complete = async (id) => {
    try {
      await api.post(`/mural/notices/${id}/complete`);
      toast.success(t('fam_admin_saved'));
      load();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const archive = async (id) => {
    if (!confirm(t('mural_confirm_archive'))) return;
    try {
      await api.post(`/mural/notices/${id}/archive`);
      load();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const deleteNotice = async (id) => {
    if (!confirm(t('mural_confirm_delete'))) return;
    try {
      await api.delete(`/mural/notices/${id}`);
      toast.success(t('fam_admin_saved'));
      load();
    } catch {
      toast.error(t('error_occurred'));
    }
  };

  const saveNotice = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        title: modal.title,
        description: modal.description || null,
        type: modal.type,
        priority: modal.priority,
        target_type: modal.target_type,
        target_user_ids: modal.target_user_ids || [],
        target_child_ids: modal.target_child_ids || [],
        start_datetime: modal.start_datetime || null,
        due_datetime: modal.due_datetime || null,
        notice_time: modal.notice_time || null,
        is_recurring: !!modal.is_recurring,
        recurrence_rule: modal.recurrence_rule || null,
        is_pinned: !!modal.is_pinned,
        requires_read_confirmation: !!modal.requires_read_confirmation,
        status: modal.status || 'active',
      };
      if (modal.id) {
        await api.put(`/mural/notices/${modal.id}`, payload);
      } else {
        await api.post('/mural/notices', payload);
      }
      toast.success(t('fam_admin_saved'));
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const canEditNotice = (n) => user?.role === 'parent' && (isGestor || n.created_by === user.id);

  const members = familyData?.members || [];
  const children = familyData?.children || [];
  const relatives = members.filter((m) => m.role === 'relative');
  const parents = members.filter((m) => m.role === 'parent');

  const toggleChild = (cid) => {
    setModal((m) => {
      const set = new Set(m.target_child_ids || []);
      if (set.has(cid)) set.delete(cid);
      else set.add(cid);
      return { ...m, target_child_ids: [...set] };
    });
  };

  const toggleUser = (uid) => {
    setModal((m) => {
      const set = new Set(m.target_user_ids || []);
      if (set.has(uid)) set.delete(uid);
      else set.add(uid);
      return { ...m, target_user_ids: [...set] };
    });
  };

  const openCreate = (defaults = {}) => setModal({
    title: '',
    description: '',
    type: 'notice',
    priority: 'normal',
    target_type: 'all',
    target_user_ids: [],
    target_child_ids: [],
    start_datetime: '',
    due_datetime: '',
    notice_time: '',
    is_recurring: false,
    recurrence_rule: '',
    is_pinned: false,
    requires_read_confirmation: false,
    status: 'active',
    ...defaults,
  });

  const modalTitle = () => {
    if (!modal) return '';
    if (modal.id) return t('mural_edit_notice');
    if (modal.type === 'reminder') return t('mural_new_reminder');
    return t('mural_new_notice');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between flex-wrap gap-16">
        <div>
          <h1 className="page-title">📌 {t('mural_page_title')}</h1>
          <p className="page-subtitle">{t('mural_page_subtitle')}</p>
        </div>
        {canCreate && (
          <div className="flex gap-8 flex-wrap">
            <button type="button" className="btn btn-primary" onClick={() => openCreate({ type: 'notice' })}>
              + {t('mural_new_notice')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => openCreate({ type: 'reminder' })}>
              + {t('mural_new_reminder')}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-12 mb-24 flex-wrap">
        <select className="form-select" style={{ maxWidth: 160 }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">{t('mural_filter_status')}</option>
          <option value="active">{t('mural_status_active')}</option>
          <option value="completed">{t('mural_status_completed')}</option>
          <option value="archived">{t('mural_status_archived')}</option>
        </select>
        <select className="form-select" style={{ maxWidth: 160 }} value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
          <option value="">{t('mural_filter_type')}</option>
          <option value="notice">{t('mural_type_notice')}</option>
          <option value="reminder">{t('mural_type_reminder')}</option>
          <option value="memo">{t('mural_type_memo')}</option>
          <option value="alert">{t('mural_type_alert')}</option>
          <option value="quick_task">{t('mural_type_quick_task')}</option>
        </select>
        <select className="form-select" style={{ maxWidth: 160 }} value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
          <option value="">{t('mural_filter_priority')}</option>
          <option value="low">{t('mural_priority_low')}</option>
          <option value="normal">{t('mural_priority_normal')}</option>
          <option value="high">{t('mural_priority_high')}</option>
          <option value="urgent">{t('mural_priority_urgent')}</option>
        </select>
      </div>

      <div className="grid grid-2">
        {notices.map((n) => (
          <div
            key={n.id}
            className="card mural-card"
            style={{
              borderLeft: `4px solid ${
                n.priority === 'urgent'
                  ? '#E17055'
                  : n.priority === 'high'
                    ? '#FDCB6E'
                    : n.author_color || 'var(--primary)'
              }`,
              opacity: n.status === 'archived' ? 0.65 : 1,
            }}
            onMouseEnter={() => markRead(n.id)}
          >
            <div className="flex-between mb-8 flex-wrap gap-8">
              <div className="flex gap-8 align-center flex-wrap">
                {n.is_pinned ? <span className="badge badge-warning">{t('mural_pinned')}</span> : null}
                <span className="badge badge-info">{t(`mural_type_${n.type}`)}</span>
                <span className="badge badge-primary">{t(`mural_priority_${n.priority}`)}</span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{n.due_datetime ? `${t('mural_due')}: ${n.due_datetime}` : ''}</span>
            </div>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{n.title}</h3>
            <p style={{ color: 'var(--text-light)', whiteSpace: 'pre-wrap' }}>{n.description}</p>
            <div style={{ fontSize: '0.8rem', marginTop: 12 }}>{t('mural_author')}: {n.author_name || '—'}</div>
            {n.requires_read_confirmation && (
              <div className="mt-12">
                {!n.myRead?.confirmed_at ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => confirmRead(n.id)}>{t('mural_confirm_read')}</button>
                ) : (
                  <span className="badge badge-success">{t('mural_read_confirmed')}</span>
                )}
              </div>
            )}
            <div className="flex gap-8 mt-16 flex-wrap">
              {n.status === 'active' && (
                (user?.role === 'child' && n.type === 'quick_task') ||
                user?.role === 'parent'
              ) && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => complete(n.id)}>{t('mural_mark_done')}</button>
              )}
              {canEditNotice(n) && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setModal(noticeToForm(n))}>{t('mural_edit')}</button>
              )}
              {isGestor && (
                <>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => archive(n.id)}>{t('mural_archive')}</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteNotice(n.id)}>{t('mural_delete')}</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{modalTitle()}</h2>
            <form onSubmit={saveNotice}>
              <div className="form-group"><label className="form-label">{t('mural_title')} *</label><input required className="form-input" value={modal.title} onChange={(e) => setModal((m) => ({ ...m, title: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">{t('mural_description')}</label><textarea className="form-textarea" value={modal.description || ''} onChange={(e) => setModal((m) => ({ ...m, description: e.target.value }))} /></div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">{t('mural_field_type')}</label>
                  <select className="form-select" value={modal.type} onChange={(e) => setModal((m) => ({ ...m, type: e.target.value }))}>
                    <option value="notice">{t('mural_type_notice')}</option>
                    <option value="reminder">{t('mural_type_reminder')}</option>
                    <option value="memo">{t('mural_type_memo')}</option>
                    <option value="alert">{t('mural_type_alert')}</option>
                    <option value="quick_task">{t('mural_type_quick_task')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('mural_field_priority')}</label>
                  <select className="form-select" value={modal.priority} onChange={(e) => setModal((m) => ({ ...m, priority: e.target.value }))}>
                    <option value="low">{t('mural_priority_low')}</option>
                    <option value="normal">{t('mural_priority_normal')}</option>
                    <option value="high">{t('mural_priority_high')}</option>
                    <option value="urgent">{t('mural_priority_urgent')}</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('mural_field_audience')}</label>
                <select className="form-select" value={modal.target_type} onChange={(e) => setModal((m) => ({ ...m, target_type: e.target.value }))}>
                  <option value="all">{t('mural_target_all')}</option>
                  <option value="parents">{t('mural_target_parents')}</option>
                  <option value="child">{t('mural_target_child')}</option>
                  <option value="relative">{t('mural_target_relative')}</option>
                  <option value="selected">{t('mural_target_selected')}</option>
                </select>
              </div>

              {modal.target_type === 'child' && (
                <div className="form-group">
                  <label className="form-label">{t('mural_select_children')}</label>
                  <div className="flex gap-12 flex-wrap">
                    {children.map((c) => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={(modal.target_child_ids || []).includes(c.id)}
                          onChange={() => toggleChild(c.id)}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {modal.target_type === 'relative' && (
                <div className="form-group">
                  <label className="form-label">{t('mural_select_users')}</label>
                  <div className="flex gap-12 flex-wrap">
                    {relatives.length === 0 ? <span className="text-muted">{t('health_empty')}</span> : relatives.map((u) => (
                      <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={(modal.target_user_ids || []).includes(u.id)}
                          onChange={() => toggleUser(u.id)}
                        />
                        {u.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {modal.target_type === 'selected' && (
                <div className="form-group">
                  <label className="form-label">{t('mural_select_parents_children')}</label>
                  <div className="flex gap-12 flex-wrap mb-12">
                    <span style={{ fontWeight: 600 }}>{t('parents')}</span>
                    {parents.map((u) => (
                      <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={(modal.target_user_ids || []).includes(u.id)} onChange={() => toggleUser(u.id)} />
                        {u.name}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-12 flex-wrap mb-12">
                    <span style={{ fontWeight: 600 }}>{t('mural_select_users')}</span>
                    {relatives.length === 0 ? <span className="text-muted">—</span> : relatives.map((u) => (
                      <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={(modal.target_user_ids || []).includes(u.id)} onChange={() => toggleUser(u.id)} />
                        {u.name}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-12 flex-wrap">
                    <span style={{ fontWeight: 600 }}>{t('children')}</span>
                    {children.map((c) => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={(modal.target_child_ids || []).includes(c.id)} onChange={() => toggleChild(c.id)} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">{t('mural_start')}</label><input type="datetime-local" className="form-input" value={modal.start_datetime || ''} onChange={(e) => setModal((m) => ({ ...m, start_datetime: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">{t('mural_due')}</label><input type="datetime-local" className="form-input" value={modal.due_datetime || ''} onChange={(e) => setModal((m) => ({ ...m, due_datetime: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label className="form-label">{t('mural_notice_time')}</label><input type="time" className="form-input" value={modal.notice_time || ''} onChange={(e) => setModal((m) => ({ ...m, notice_time: e.target.value }))} /></div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!modal.is_recurring} onChange={(e) => setModal((m) => ({ ...m, is_recurring: e.target.checked }))} />
                  {t('mural_recurring')}
                </label>
                {modal.is_recurring && (
                  <input className="form-input mt-8" value={modal.recurrence_rule || ''} onChange={(e) => setModal((m) => ({ ...m, recurrence_rule: e.target.value }))} placeholder={t('mural_recurrence_rule')} />
                )}
              </div>

              {modal.id && (
                <div className="form-group">
                  <label className="form-label">{t('mural_filter_status')}</label>
                  <select className="form-select" value={modal.status || 'active'} onChange={(e) => setModal((m) => ({ ...m, status: e.target.value }))}>
                    <option value="active">{t('mural_status_active')}</option>
                    <option value="completed">{t('mural_status_completed')}</option>
                  </select>
                </div>
              )}

              <div className="form-group flex gap-16 flex-wrap">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!modal.is_pinned} onChange={(e) => setModal((m) => ({ ...m, is_pinned: e.target.checked }))} disabled={!isGestor} />
                  {t('mural_pin')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!modal.requires_read_confirmation} onChange={(e) => setModal((m) => ({ ...m, requires_read_confirmation: e.target.checked }))} />
                  {t('mural_require_confirm')}
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{modal.id ? t('save') : t('mural_notice_save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
