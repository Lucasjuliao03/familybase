import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import useDailyCalendarRefresh from '../../hooks/useDailyCalendarRefresh';

export default function MyTasks() {
  const { childProfile, ensureChildProfile } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const toast = useToast();
  const [occurrences, setOccurrences] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'routine', due_time: '' });

  const fetchTasks = useCallback(async () => {
    try {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const params = { date: todayStr };
      if (filter) params.status = filter;
      if (childProfile?.id) params.child_id = childProfile.id;
      const { data } = await api.get('/tasks/occurrences', { params });
      setOccurrences(data);
    } catch (e) { console.error(e); }
  }, [filter, childProfile?.id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks, location.pathname]);

  useAutoRefresh(fetchTasks, 2600);

  useDailyCalendarRefresh(fetchTasks);

  const handleComplete = async (id) => {
    try {
      const res = await api.put(`/tasks/occurrences/${id}/complete`);
      toast.success(res.data.status === 'waiting_approval' ? 'Tarefa enviada para aprovação! 📤' : 'Tarefa concluída! ✅');
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const handleHealthReminder = async (id, intake) => {
    try {
      await api.put(`/tasks/occurrences/${id}/complete`, { health_intake: intake });
      toast.success(intake === 'taken' ? 'Registado como tomado.' : 'Registado como não tomado.');
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || t('error_occurred'));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    let row = childProfile;
    if (!row?.id) row = await ensureChildProfile();
    if (!row?.id) {
      toast.error(
        'Ainda não conseguimos carregar o teu perfil de criança. Aguarda uns segundos e tenta de novo, ou pede a um gestor para confirmar que a tua conta está ligada ao teu nome na família.',
      );
      return;
    }
    try {
      // Sugestão: gestor define pontos / mesada depois ao editar a tarefa
      await api.post('/tasks', {
        ...form,
        child_id: row.id,
        frequency: 'once',
        requires_approval: true,
        is_recurring: false,
      });
      toast.success('Sugestão de tarefa enviada! 📋');
      setShowModal(false);
      setForm({ title: '', description: '', type: 'routine', due_time: '' });
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('error_occurred'));
    }
  };

  const statusEmoji = { pending: '⏳', in_progress: '🏃', waiting_approval: '📤', approved: '✅', rejected: '❌', delayed: '⚠️', expired: '👻' };
  const statusColor = { pending: 'warning', in_progress: 'info', waiting_approval: 'info', approved: 'success', rejected: 'danger', delayed: 'danger', expired: 'ghost' };
  const statusLabel = { pending: 'Pendente', in_progress: 'Fazendo', waiting_approval: 'Aguardando Pais', approved: 'Aprovada', rejected: 'Reprovada', delayed: 'Atrasada', expired: 'Expirada' };

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <h1 className="page-title" style={{ minWidth: 0, flex: '1 1 auto' }}>✅ {t('my_tasks')}</h1>
        <button type="button" className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => setShowModal(true)}>+ Sugerir Tarefa</button>
      </div>

      <div className="flex gap-8 mb-24" style={{ flexWrap: 'wrap' }}>
        {['', 'pending', 'waiting_approval', 'approved', 'rejected', 'delayed'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(s)}>
            {s ? statusLabel[s] : t('all')}
          </button>
        ))}
      </div>

      <div className="grid grid-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
        {occurrences.length === 0 ? (
          <div className="card empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="empty-icon">🎉</div>
            <h3>{t('no_tasks')}</h3>
            <p style={{color:'var(--text-light)', fontSize:'0.9rem'}}>Tudo limpo por aqui!</p>
          </div>
        ) : occurrences.map(occ => (
          <div key={occ.id} className="card task-card" style={{ 
            borderLeft: `5px solid ${occ.status === 'approved' ? 'var(--success)' : occ.status === 'rejected' || occ.status === 'delayed' ? 'var(--danger)' : 'var(--primary)'}`,
            position: 'relative',
            minWidth: 0,
            maxWidth: '100%',
          }}>
            <div className="flex-between mb-8" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.05rem', minWidth: 0, flex: '1 1 200px', wordBreak: 'break-word' }}>{statusEmoji[occ.status]} {occ.title}</h3>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {Number(occ.is_health_reminder) !== 1 && (
                  <>
                    <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.2rem', display: 'block' }}>⭐ {occ.points}</span>
                    {occ.coins > 0 && <span style={{ fontWeight: 700, color: '#E67E22', fontSize: '1rem' }}>🪙 {occ.coins}</span>}
                  </>
                )}
                {Number(occ.is_health_reminder) === 1 && <span className="badge badge-ghost" style={{ fontSize: '0.75rem' }}>Saúde</span>}
              </div>
            </div>
            
            {occ.description && <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: 12 }}>{occ.description}</p>}
            
            <div className="flex gap-12 mb-12" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {occ.due_time && <span>⏰ Limite: <strong>{occ.due_time}</strong></span>}
              {occ.is_recurring ? <span className="badge badge-info">🔄 {occ.frequency}</span> : <span className="badge badge-ghost">Única</span>}
            </div>

            <div className="flex-between mt-12" style={{borderTop:'1px solid var(--border)', paddingTop: 12}}>
              <div className="flex gap-8">
                <span className="badge badge-primary">{t(occ.type)}</span>
                <span className={`badge badge-${statusColor[occ.status]}`}>{statusLabel[occ.status]}</span>
              </div>
              {['pending', 'in_progress', 'delayed'].includes(occ.status) && Number(occ.is_health_reminder) === 1 && (
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => handleHealthReminder(occ.id, 'taken')}>
                    Tomado
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleHealthReminder(occ.id, 'skipped')}>
                    Não tomado
                  </button>
                </div>
              )}
              {['pending', 'in_progress', 'delayed'].includes(occ.status) && Number(occ.is_health_reminder) !== 1 && (
                <button className="btn btn-secondary" onClick={() => handleComplete(occ.id)} style={{boxShadow:'0 4px 12px var(--secondary-light)40'}}>
                  ✅ Concluir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📋 Sugerir Tarefa</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">O que você vai fazer? *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Lavar meu prato" required />
              </div>
              <div className="form-group">
                <label className="form-label">Detalhes (opcional)</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="school">📚 Escolar</option>
                    <option value="home">🏠 Doméstica</option>
                    <option value="routine">⏰ Rotina</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Horário (opcional)</label>
                  <input className="form-input" type="time" value={form.due_time} onChange={e => setForm(p => ({ ...p, due_time: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Enviar Sugestão</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
