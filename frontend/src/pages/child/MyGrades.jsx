import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { supabase } from '../../lib/supabase';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { buildPeriodConfig, buildBoletim, scoreColor } from '../../lib/gradesHelpers';

const PREDEFINED_SUBJECTS = [
  'Matemática','Português','Ciências','História','Geografia',
  'Educação Física','Artes','Inglês','Espanhol','Física',
  'Química','Biologia','Filosofia','Sociologia','Música',
];

export default function MyGrades() {
  const { childProfile, ensureChildProfile, family } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const location = useLocation();

  const [grades, setGrades] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState(0); // 0 = geral, senão número do período
  
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

    // Carregar configuração do aluno
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

  const filteredSubjects = filterPeriod === 0 
    ? boletim.subjects 
    : boletim.subjects.map(s => ({
        ...s,
        periods: s.periods.filter(p => p.number === filterPeriod)
      })).filter(s => s.periods.length > 0);

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

  const typeLabels = { test:'Prova', homework:'Dever', project:'Projeto', concept:'Conceito', participation:'Participação' };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ minWidth: 0 }}>📚 {t('my_grades')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>+ Cadastrar Nota</button>
      </div>

      {/* Filtro de período */}
      <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${filterPeriod === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterPeriod(0)}>Geral (Ano)</button>
        {pConfig.map((p) => (
          <button key={p.number} className={`btn btn-sm ${filterPeriod === p.number ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterPeriod(p.number)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Dashboard Geral (só aparece se filtro for 0) */}
      {filterPeriod === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: 4 }}>Média Geral</div>
            <div style={{ fontWeight: 800, fontSize: '1.8rem', color: 'var(--primary)' }}>
              {boletim.overall.avg !== null ? boletim.overall.avg.toFixed(1) : '-'}
            </div>
          </div>
          <div className="stat-card" style={{ padding: '16px', borderColor: 'var(--success)', background: 'rgba(34,197,94,0.03)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginBottom: 4 }}>Tudo Certo!</div>
            <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--success)' }}>
              {boletim.overall.approved} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>matéria(s)</span>
            </div>
          </div>
          {boletim.overall.attention > 0 && (
            <div className="stat-card" style={{ padding: '16px', borderColor: '#F59E0B', background: 'rgba(245,158,11,0.03)' }}>
              <div style={{ fontSize: '0.75rem', color: '#D97706', marginBottom: 4 }}>Atenção</div>
              <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#D97706' }}>
                {boletim.overall.attention} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>matéria(s)</span>
              </div>
            </div>
          )}
          {(boletim.overall.risk > 0 || boletim.overall.failed > 0) && (
            <div className="stat-card" style={{ padding: '16px', borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.03)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginBottom: 4 }}>Precisa Estudar</div>
              <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--danger)' }}>
                {boletim.overall.risk + boletim.overall.failed} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>matéria(s)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grid de Matérias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {filteredSubjects.map((subj) => (
          <div key={subj.name} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${scoreColorByStatus(subj.status)}` }}>
            
            {/* Header da Matéria */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div className="flex-between mb-8">
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: 2 }}>{subj.name}</h3>
                </div>
                <div style={statusBadgeStyle(subj.status)}>{subj.statusLabel}</div>
              </div>

              {/* Progresso Anual */}
              {subj.maxEvaluated > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div className="flex-between" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
                    <span style={{ color: 'var(--text-light)' }}>
                      Acumulado: <strong>{subj.obtained.toFixed(1)}</strong> <span style={{fontSize:'0.7rem'}}>/ {subj.maxEvaluated.toFixed(1)} pts</span>
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>Média Atual: {subj.currentAvg?.toFixed(1)}</span>
                  </div>
                  
                  {subj.status === 'approved' && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--success)', padding: '8px 10px', background: 'rgba(34,197,94,0.1)', borderRadius: 6, fontWeight: 500 }}>
                      🎉 Parabéns! Você já garantiu sua aprovação no ano.
                    </div>
                  )}
                  {subj.status !== 'approved' && subj.missing > 0 && subj.remainingAnnualPoints > 0 && (
                    <div style={{ fontSize: '0.8rem', marginTop: 8, padding: '10px', background: 'var(--bg-hover)', borderRadius: 6, lineHeight: 1.4 }}>
                      🎯 <strong>Sua Meta:</strong> Você precisa de <strong>{subj.missing.toFixed(1)}pts</strong> nos {subj.remainingAnnualPoints.toFixed(1)}pts restantes para fechar o ano acima da média. 
                      {subj.requiredRate > 75 ? ' Foco total!' : ' Você consegue!'}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sem notas lançadas ainda.</div>
              )}
            </div>

            {/* Lista de Períodos */}
            <div style={{ padding: '12px 20px' }}>
              {subj.periods.map(p => (
                <div key={p.number} style={{ padding: '12px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div className="flex-between mb-8">
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{p.label}</div>
                    {p.hasData ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: p.passed ? 'var(--success)' : 'var(--danger)' }}>
                          {p.obtained.toFixed(1)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {p.maxEvaluated}pts</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</div>
                    )}
                  </div>
                  
                  {/* Notas individuais no período */}
                  {p.hasData && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.grades.map(g => (
                        <div key={g.id} style={{ background: 'var(--bg-card)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: '0.7rem' }}>
                          <span style={{ color: 'var(--text-light)', marginRight: 4 }}>{typeLabels[g.type] || g.type}:</span>
                          {g.score != null ? (
                            <strong style={{ color: scoreColorByStatus(g.score >= (g.max_score * 0.6) ? 'comfortable' : 'risk') }}>
                              {g.score}/{g.max_score}
                            </strong>
                          ) : (
                            <strong>{g.concept || '-'}</strong>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

          </div>
        ))}
        
        {filteredSubjects.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
            Nenhuma matéria encontrada.
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📚 Cadastrar Nota</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
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
                    <option value="project">Projeto</option>
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
                    {['A','B','C','D','E','F'].map((c) => <option key={c} value={c}>{c}</option>)}
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
