import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { PRESET_AVATARS } from '../../components/AvatarPicker';

const PREDEFINED_SUBJECTS = [
  'Matemática', 'Português', 'Ciências', 'História', 'Geografia',
  'Educação Física', 'Artes', 'Inglês', 'Espanhol', 'Física',
  'Química', 'Biologia', 'Filosofia', 'Sociologia', 'Música'
];

export default function GradeTracker() {
  const { t } = useLanguage();
  const toast = useToast();
  const [grades, setGrades] = useState([]);
  const [children, setChildren] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [filterChild, setFilterChild] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ subject: '', type: 'test', score: '', max_score: 10, concept: '', observation: '', date: '', child_id: '' });

  const fetchGrades = async () => {
    const params = {}; if (filterChild) params.child_id = filterChild;
    try { const { data } = await api.get('/grades', { params }); setGrades(data); } catch {}
  };

  useEffect(() => {
    fetchGrades();
    api.get('/families/children').then(r => setChildren(r.data)).catch(() => {});
    api.get('/grades/subjects').then(r => {
      const existing = r.data.filter(s => !PREDEFINED_SUBJECTS.includes(s));
      setSubjectOptions([...PREDEFINED_SUBJECTS, ...existing]);
    }).catch(() => setSubjectOptions(PREDEFINED_SUBJECTS));
  }, [filterChild]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/grades', { ...form, score: parseFloat(form.score), max_score: parseFloat(form.max_score) });
      toast.success(t('grade_added')); setShowModal(false); fetchGrades();
      setForm({ subject: '', type: 'test', score: '', max_score: 10, concept: '', observation: '', date: '', child_id: '' });
    } catch { toast.error(t('error_occurred')); }
  };

  // Calculate averages by child
  const avgByChild = {};
  grades.forEach(g => {
    if (!avgByChild[g.child_name]) {
      avgByChild[g.child_name] = { 
        total: 0, 
        count: 0, 
        color: g.child_color, 
        avatar_url: g.avatar_url, 
        avatar_preset: g.avatar_preset 
      };
    }
    if (g.score != null) { 
      avgByChild[g.child_name].total += g.score; 
      avgByChild[g.child_name].count++; 
    }
  });

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24">
        <div><h1 className="page-title">📚 {t('grade_tracking')}</h1></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ {t('add_grade')}</button>
      </div>

      {Object.keys(avgByChild).length > 0 && (
        <div className="grid grid-3 mb-24">
          {Object.entries(avgByChild).map(([name, data]) => (
            <div key={name} className="stat-card" style={{borderLeft:`4px solid ${data.color}`, display: 'flex', gap: 16}}>
              <div className="stat-icon" style={{background:`${data.color}20`, fontSize:'1.8rem', width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                {data.avatar_url ? (
                  <img src={`http://localhost:3001${data.avatar_url}`} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                ) : (
                  data.avatar_preset ? PRESET_AVATARS.find(a => a.id === data.avatar_preset)?.emoji : name[0]
                )}
              </div>
              <div style={{flex: 1}}>
                <h3 style={{fontWeight: 700}}>{name}</h3>
                <div style={{display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap'}}>
                  <div style={{flex: 1, minWidth: 60}}>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-light)'}}>Notas Cad.</div>
                    <div style={{fontWeight: 700, fontSize: '1.1rem'}}>{data.count}</div>
                  </div>
                  <div style={{flex: 1, minWidth: 60}}>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-light)'}}>Pontos</div>
                    <div style={{fontWeight: 700, fontSize: '1.1rem'}}>{data.total.toFixed(1)}</div>
                  </div>
                  <div style={{flex: 1, minWidth: 60}}>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-light)'}}>Média</div>
                    <div style={{fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)'}}>
                      {data.count > 0 ? (data.total / data.count).toFixed(1) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-12 mb-16">
        <select className="form-select" style={{width:'auto'}} value={filterChild} onChange={e => setFilterChild(e.target.value)}>
          <option value="">{t('all')} {t('children')}</option>
          {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>{t('subject')}</th><th>{t('select_child')}</th><th>{t('grade_type')}</th><th>{t('score')}</th><th>{t('date')}</th><th>{t('observation')}</th></tr></thead>
          <tbody>
            {grades.length === 0 ? (
              <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'var(--text-light)'}}>{t('no_grades')}</td></tr>
            ) : grades.map(g => (
              <tr key={g.id}>
                <td><strong>{g.subject}</strong></td>
                <td>
                  <div className="flex gap-8" style={{alignItems:'center'}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:g.child_color,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',fontSize:'0.75rem'}}>
                      {g.avatar_url ? <img src={`http://localhost:3001${g.avatar_url}`} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : (g.avatar_preset ? PRESET_AVATARS.find(a=>a.id===g.avatar_preset)?.emoji : g.child_name[0])}
                    </div>
                    {g.child_name}
                  </div>
                </td>
                <td><span className="badge badge-info">{t(g.type)}</span></td>
                <td><span style={{fontWeight:700,color: g.score >= (g.max_score*0.7) ? 'var(--success)' : g.score >= (g.max_score*0.5) ? '#E67E22' : 'var(--danger)'}}>{g.score}/{g.max_score}</span></td>
                <td>{g.date ? new Date(g.date+'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                <td style={{fontSize:'0.8rem',color:'var(--text-light)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis'}}>{g.observation || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">{t('add_grade')}</h2><button className="modal-close" onClick={() => setShowModal(false)}>✕</button></div>
            <form onSubmit={handleCreate}>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">{t('select_child')} *</label>
                  <select className="form-select" value={form.child_id} onChange={e => setForm(p => ({...p, child_id: e.target.value}))} required><option value="">--</option>{children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="form-group"><label className="form-label">{t('subject')} *</label>
                  <div className="flex gap-8">
                    <input className="form-input" list="subject-list-parent" value={form.subject} onChange={e => setForm(p => ({...p, subject: e.target.value}))} placeholder="Selecione ou digite..." required />
                    <datalist id="subject-list-parent">{subjectOptions.map(s => <option key={s} value={s} />)}</datalist>
                  </div></div>
              </div>
              <div className="grid grid-3">
                <div className="form-group"><label className="form-label">{t('grade_type')}</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))}>
                    {['test','homework','project','concept','participation'].map(tp => <option key={tp} value={tp}>{t(tp)}</option>)}</select></div>
                <div className="form-group"><label className="form-label">{t('score')}</label>
                  <input className="form-input" type="number" step="0.1" value={form.score} onChange={e => setForm(p => ({...p, score: e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">{t('max_score')}</label>
                  <input className="form-input" type="number" value={form.max_score} onChange={e => setForm(p => ({...p, max_score: e.target.value}))} /></div>
              </div>
              <div className="grid grid-2">
                <div className="form-group"><label className="form-label">{t('date')}</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">{t('concept')}</label>
                  <select className="form-select" value={form.concept} onChange={e => setForm(p => ({...p, concept: e.target.value}))}>
                    <option value="">-</option>{['A','B','C','D','E','F'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div className="form-group"><label className="form-label">{t('observation')}</label>
                <textarea className="form-textarea" value={form.observation} onChange={e => setForm(p => ({...p, observation: e.target.value}))} /></div>
              <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>{t('cancel')}</button><button type="submit" className="btn btn-primary">{t('save')}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
