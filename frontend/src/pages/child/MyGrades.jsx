import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';

const PREDEFINED_SUBJECTS = [
  'Matemática', 'Português', 'Ciências', 'História', 'Geografia',
  'Educação Física', 'Artes', 'Inglês', 'Espanhol', 'Física',
  'Química', 'Biologia', 'Filosofia', 'Sociologia', 'Música'
];

export default function MyGrades() {
  const { t } = useLanguage();
  const toast = useToast();
  const location = useLocation();
  const [grades, setGrades] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ subject: '', type: 'test', score: '', max_score: '10', concept: '', observation: '', date: '' });

  const loadBundle = useCallback(async () => {
    try {
      const { data } = await api.get('/grades');
      setGrades(data || []);
    } catch {
      /* manter vista anterior até novo sucesso */
    }
    api.get('/grades/subjects')
      .then((r) => {
        const existing = (r.data || []).filter((s) => !PREDEFINED_SUBJECTS.includes(s));
        setSubjectOptions([...PREDEFINED_SUBJECTS, ...existing]);
      })
      .catch(() => setSubjectOptions(PREDEFINED_SUBJECTS));
  }, []);

  useEffect(() => {
    loadBundle();
  }, [loadBundle, location.pathname]);

  useAutoRefresh(loadBundle, 2600, { includeRouteChanges: false });

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/grades', {
        ...form,
        score: form.score !== '' ? parseFloat(form.score) : null,
        max_score: parseFloat(form.max_score) || 10,
      });
      toast.success('Nota cadastrada! 📚');
      setShowModal(false);
      setForm({ subject: '', type: 'test', score: '', max_score: '10', concept: '', observation: '', date: '' });
      loadBundle();
    } catch (err) { toast.error(err.response?.data?.error || t('error_occurred')); }
  };

  const bySubject = {};
  grades.forEach(g => { if (!bySubject[g.subject]) bySubject[g.subject] = []; bySubject[g.subject].push(g); });

  const scoreColor = (score, max) => {
    const pct = score / max;
    if (pct >= 0.7) return 'var(--success)';
    if (pct >= 0.5) return '#E67E22';
    return 'var(--danger)';
  };

  const typeLabels = { test: 'Prova', homework: 'Dever', project: 'Projeto', concept: 'Conceito', participation: 'Participação' };

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ minWidth: 0 }}>📚 {t('my_grades')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>+ Cadastrar Nota</button>
      </div>

      {Object.keys(bySubject).length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">📚</div>
          <h3>{t('no_grades')}</h3>
          <p style={{ color: 'var(--text-light)' }}>Cadastre sua primeira nota!</p>
        </div>
      ) : Object.entries(bySubject).map(([subj, gs]) => {
        const scored = gs.filter(g => g.score != null);
        const avg = scored.length > 0 ? scored.reduce((a, g) => a + g.score, 0) / scored.length : null;
        return (
          <div key={subj} className="card mb-16">
            <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.05rem', minWidth: 0, flex: '1 1 auto', wordBreak: 'break-word' }}>📖 {subj}</h3>
              {avg != null && (
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: scoreColor(avg, 10) }}>
                  Média: {avg.toFixed(1)}
                </span>
              )}
            </div>
            <div
              className="grade-pill-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))',
                gap: 12,
              }}
            >
              {gs.map(g => (
                <div key={g.id} style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border)', minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: 4 }}>{typeLabels[g.type] || g.type}</div>
                  {g.score != null ? (
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: scoreColor(g.score, g.max_score) }}>{g.score}/{g.max_score}</div>
                  ) : (
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--primary)' }}>{g.concept || '-'}</div>
                  )}
                  {g.date && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>{new Date(g.date + 'T12:00:00').toLocaleDateString('pt-BR')}</div>}
                  {g.observation && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: 6, textAlign: 'left', wordBreak: 'break-word', lineHeight: 1.35 }} title={g.observation}>
                      {g.observation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📚 Cadastrar Nota</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Disciplina *</label>
                <div className="flex gap-8">
                  <input className="form-input" list="subject-list-child" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Selecione ou digite..." required />
                  <datalist id="subject-list-child">{subjectOptions.map(s => <option key={s} value={s} />)}</datalist>
                </div>
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="test">Prova</option>
                    <option value="homework">Dever de Casa</option>
                    <option value="project">Projeto</option>
                    <option value="concept">Conceito</option>
                    <option value="participation">Participação</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              {form.type !== 'concept' ? (
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">Nota obtida</label>
                    <input className="form-input" type="number" step="0.1" min="0" value={form.score} onChange={e => setForm(p => ({ ...p, score: e.target.value }))} placeholder="Ex: 8.5" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nota máxima</label>
                    <input className="form-input" type="number" step="0.1" min="1" value={form.max_score} onChange={e => setForm(p => ({ ...p, max_score: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Conceito</label>
                  <select className="form-select" value={form.concept} onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}>
                    <option value="">Selecione</option>
                    {['A', 'B', 'C', 'D', 'E', 'F'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Observação</label>
                <textarea className="form-textarea" value={form.observation} onChange={e => setForm(p => ({ ...p, observation: e.target.value }))} placeholder="Ex: Foi difícil mas me esforcei!" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar Nota</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
