import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { supabase } from '../../lib/supabase';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import {
  buildPeriodConfig,
  buildSubjectBoletim,
  formatGradeChip,
  gradeTypeLabel,
  getSubjectDisplayStatus,
  schoolGoalMessage,
  familyGoalMessage,
  subjectIcon,
} from '../../lib/gradesHelpers';
import './myGrades.css';

const PREDEFINED_SUBJECTS = [
  'Matemática', 'Português', 'Ciências', 'História', 'Geografia',
  'Educação Física', 'Artes', 'Inglês', 'Espanhol', 'Física',
  'Química', 'Biologia', 'Filosofia', 'Sociologia', 'Música',
];

function fmtAvg(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(1).replace('.', ',');
}

function fmtPts(n) {
  if (n == null || Number.isNaN(n)) return '0';
  return n.toFixed(1).replace('.', ',');
}

export default function MyGrades() {
  const { childProfile, ensureChildProfile, family } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const location = useLocation();

  const [grades, setGrades] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedSubjectName, setSelectedSubjectName] = useState(null);
  const [expandedPeriods, setExpandedPeriods] = useState(() => new Set([1]));

  const [settings, setSettings] = useState({ evaluation_model: 'bimonthly', approval_pct: 60 });
  const [periods, setPeriods] = useState([]);

  const [form, setForm] = useState({
    subject: '', type: 'test', score: '', max_score: '10',
    concept: '', observation: '', date: '', period_number: 1,
  });

  const loadBundle = useCallback(async () => {
    try {
      const { data } = await api.get('/grades');
      setGrades(data || []);
    } catch { /* manter estado anterior */ }

    api.get('/grades/subjects')
      .then((r) => {
        const extra = (r.data || []).filter((s) => !PREDEFINED_SUBJECTS.includes(s));
        setSubjectOptions([...PREDEFINED_SUBJECTS, ...extra]);
      })
      .catch(() => setSubjectOptions(PREDEFINED_SUBJECTS));

    const cid = childProfile?.id;
    if (cid && family?.id) {
      const { data: cfg } = await supabase
        .from('school_grade_settings')
        .select('*')
        .eq('family_id', family.id)
        .eq('child_id', cid)
        .maybeSingle();
      if (cfg) setSettings(cfg);

      const { data: sgpRows } = await supabase
        .from('school_grade_periods')
        .select('*')
        .eq('family_id', family.id)
        .eq('child_id', cid)
        .order('period_number', { ascending: true });
      if (sgpRows) setPeriods(sgpRows);
    }
  }, [childProfile?.id, family?.id]);

  useEffect(() => { loadBundle(); }, [loadBundle, location.pathname]);
  useAutoRefresh(loadBundle, 2600);

  const pConfig = buildPeriodConfig(settings, periods);
  const boletim = buildSubjectBoletim(grades, pConfig, settings);
  const subjects = boletim.subjects;
  const subjectNamesKey = subjects.map((s) => s.name).join('\u0001');

  useEffect(() => {
    if (!subjects.length) {
      setSelectedSubjectName(null);
      return;
    }
    setSelectedSubjectName((prev) => {
      if (prev && subjects.some((s) => s.name === prev)) return prev;
      return subjects[0].name;
    });
  }, [subjectNamesKey]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.name === selectedSubjectName) || subjects[0] || null,
    [subjects, selectedSubjectName],
  );

  const selectSubject = (name) => {
    setSelectedSubjectName(name);
    setExpandedPeriods(new Set([pConfig[0]?.number ?? 1]));
  };

  const togglePeriod = (num) => {
    setExpandedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    let row = childProfile;
    if (!row?.id) row = await ensureChildProfile();
    if (!row?.id) { toast.error('Perfil em carregamento. Tente dentro de instantes.'); return; }
    try {
      await api.post('/grades', {
        ...form,
        child_id: row.id,
        score: form.score !== '' ? parseFloat(form.score) : null,
        max_score: parseFloat(form.max_score) || 10,
        period_number: Number(form.period_number),
        period_type: settings.evaluation_model,
      });
      toast.success('Nota cadastrada! 📚');
      setShowModal(false);
      setForm({ subject: '', type: 'test', score: '', max_score: '10', concept: '', observation: '', date: '', period_number: 1 });
      loadBundle();
    } catch (err) { toast.error(err.response?.data?.error || err.message || t('error_occurred')); }
  };

  const displayStatus = selectedSubject ? getSubjectDisplayStatus(selectedSubject) : null;

  return (
    <div className="animate-fade-in my-grades-page">
      <div className="my-grades-section-head">
        <div>
          <h2>Minhas matérias</h2>
          <p>Resumo rápido do desempenho</p>
        </div>
        <button type="button" className="btn btn-primary my-grades-add-btn" onClick={() => setShowModal(true)}>
          + Nota
        </button>
      </div>

      {subjects.length === 0 ? (
        <div className="my-grades-empty">
          <div className="my-grades-empty__icon">📚</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Ainda não há matérias com notas.</p>
          <p style={{ margin: '8px 0 0', fontSize: '0.88rem' }}>Toque em &quot;+ Nota&quot; para começar.</p>
        </div>
      ) : (
        <>
          <div className="my-grades-subjects-scroll" role="tablist" aria-label="Matérias">
            {subjects.map((subj) => {
              const ds = getSubjectDisplayStatus(subj);
              const isSel = selectedSubject?.name === subj.name;
              return (
                <button
                  key={subj.name}
                  type="button"
                  role="tab"
                  aria-selected={isSel}
                  className={`my-grades-subject-chip${isSel ? ' is-selected' : ''}`}
                  style={{ background: isSel ? ds.pastel : '#fff' }}
                  onClick={() => selectSubject(subj.name)}
                >
                  {isSel && <span className="my-grades-subject-chip__check" aria-hidden>✓</span>}
                  <span
                    className="my-grades-subject-chip__icon"
                    style={{ background: ds.pastel, border: `1px solid ${ds.accent}33` }}
                  >
                    {subjectIcon(subj.name)}
                  </span>
                  <span className="my-grades-subject-chip__name">{subj.name}</span>
                  <span className="my-grades-subject-chip__accum">
                    {subj.maxEvaluated > 0 ? fmtPts(subj.obtained) : '—'}
                  </span>
                  <span className="my-grades-subject-chip__pts-total">
                    {subj.maxEvaluated > 0
                      ? `de ${fmtPts(subj.maxEvaluated)} pts`
                      : 'Sem notas lançadas'}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedSubject && displayStatus && (
            <article className="my-grades-detail" aria-live="polite">
              <header className="my-grades-detail__hero">
                <div
                  className="my-grades-detail__hero-icon"
                  style={{ background: displayStatus.pastel, border: `1px solid ${displayStatus.accent}44` }}
                >
                  {subjectIcon(selectedSubject.name)}
                </div>
                <div className="my-grades-detail__hero-text">
                  <h3>{selectedSubject.name}</h3>
                  <span
                    className="my-grades-detail__badge"
                    style={{
                      background: `${displayStatus.accent}22`,
                      color: '#334155',
                      border: `1px solid ${displayStatus.accent}55`,
                    }}
                  >
                    {displayStatus.dot} {displayStatus.label}
                  </span>
                </div>
              </header>

              {selectedSubject.maxEvaluated > 0 ? (
                <>
                  <div className="my-grades-performance">
                    <div className="my-grades-performance__col">
                      <div className="my-grades-performance__label">Nota acumulada</div>
                      <div className="my-grades-performance__value">{fmtPts(selectedSubject.obtained)}</div>
                      <div className="my-grades-performance__sub">
                        de {fmtPts(selectedSubject.maxEvaluated)} pts
                      </div>
                    </div>
                    <div className="my-grades-performance__col">
                      <div className="my-grades-performance__label">Média atual</div>
                      <div className="my-grades-performance__value">{fmtAvg(selectedSubject.currentAvg)}</div>
                      <div className="my-grades-performance__sub">de 10</div>
                    </div>
                  </div>

                  <div className="my-grades-goals">
                    <div className="my-grades-goal-card">
                      <div className="my-grades-goal-card__icon">🎯</div>
                      <div className="my-grades-goal-card__title">Meta da escola</div>
                      <p className="my-grades-goal-card__text">{schoolGoalMessage(selectedSubject)}</p>
                    </div>
                    <div className="my-grades-goal-card">
                      <div className="my-grades-goal-card__icon">⭐</div>
                      <div className="my-grades-goal-card__title">Meta da família</div>
                      <p className="my-grades-goal-card__text">{familyGoalMessage(selectedSubject)}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ padding: '16px 20px', margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
                  Sem notas lançadas nesta matéria ainda.
                </p>
              )}

              <section className="my-grades-evaluations">
                <h4>Avaliações</h4>
                {selectedSubject.periods.map((p) => {
                  const open = expandedPeriods.has(p.number);
                  return (
                    <div key={p.number} className={`my-grades-period${open ? ' is-open' : ''}`}>
                      <button
                        type="button"
                        className="my-grades-period__head"
                        onClick={() => togglePeriod(p.number)}
                        aria-expanded={open}
                      >
                        <span>
                          <span className="my-grades-period__title">{p.label}</span>
                          {p.hasData && (
                            <span className="my-grades-period__summary">
                              {' '}
                              · {fmtPts(p.obtained)} / {fmtPts(p.maxEvaluated)} pts
                            </span>
                          )}
                        </span>
                        <span className="my-grades-period__chevron" aria-hidden>
                          ▼
                        </span>
                      </button>
                      {open && (
                        <div className="my-grades-period__body">
                          {!p.hasData ? (
                            <p className="my-grades-period__empty">Sem avaliações lançadas</p>
                          ) : (
                            <div className="my-grades-grade-chips">
                              {p.grades.map((g) => (
                                <div key={g.id} className="my-grades-grade-chip">
                                  <span className="my-grades-grade-chip__type">{gradeTypeLabel(g.type)}</span>
                                  <span className="my-grades-grade-chip__score">{formatGradeChip(g)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </article>
          )}
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📚 Cadastrar Nota</h2>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Disciplina *</label>
                <input className="form-input" list="subj-c" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} placeholder="Selecione ou digite..." required />
                <datalist id="subj-c">{subjectOptions.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Período</label>
                  <select className="form-select" value={form.period_number} onChange={(e) => setForm((p) => ({ ...p, period_number: e.target.value }))}>
                    {pConfig.map((p) => <option key={p.number} value={p.number}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="test">Prova</option>
                    <option value="homework">Dever de Casa</option>
                    <option value="project">Trabalho</option>
                    <option value="concept">Conceito</option>
                    <option value="participation">Participação</option>
                  </select>
                </div>
              </div>
              {form.type !== 'concept' ? (
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">Nota obtida</label>
                    <input className="form-input" type="number" step="0.1" min="0" value={form.score} onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))} placeholder="Ex: 8.5" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nota máxima</label>
                    <input className="form-input" type="number" step="0.1" min="1" value={form.max_score} onChange={(e) => setForm((p) => ({ ...p, max_score: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Conceito</label>
                  <select className="form-select" value={form.concept} onChange={(e) => setForm((p) => ({ ...p, concept: e.target.value }))}>
                    <option value="">Selecione</option>
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Observação</label>
                <textarea className="form-textarea" value={form.observation} onChange={(e) => setForm((p) => ({ ...p, observation: e.target.value }))} placeholder="Ex: Foi difícil mas me esforcei!" />
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
