/**
 * gradesHelpers.ts — Lógica de cálculo de boletim escolar (Por Matéria)
 * Funções puras — sem chamadas à API, sem side-effects.
 */

export const DEFAULT_PERIOD_LABELS: Record<string, string[]> = {
  bimonthly: ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'],
  trimester:  ['1º Trimestre', '2º Trimestre', '3º Trimestre'],
};

export const DEFAULT_PERIOD_POINTS: Record<string, number> = {
  bimonthly: 25,
  trimester:  33.33,
};

export interface PeriodConfig {
  number: number;
  label: string;
  total_points: number;
  approval_pct: number;
  weight: number;
  min_score: number;
}

export function buildPeriodConfig(settings: any, periods: any[] = []): PeriodConfig[] {
  const model = settings?.evaluation_model ?? 'bimonthly';
  const count = model === 'trimester' ? 3 : 4;
  const defaultPts = DEFAULT_PERIOD_POINTS[model];
  const defaultPct = settings?.approval_pct ?? 60;
  const labels = DEFAULT_PERIOD_LABELS[model];

  return Array.from({ length: count }, (_, i) => {
    const num = i + 1;
    const saved = periods.find((p) => p.period_number === num);
    const totalPts = saved?.total_points ?? defaultPts;
    const approvPct = saved?.approval_pct ?? defaultPct;
    return {
      number: num,
      label: saved?.period_label || labels[i] || `Período ${num}`,
      total_points: totalPts,
      approval_pct: approvPct,
      weight: saved?.weight ?? 1,
      min_score: (totalPts * approvPct) / 100,
    };
  });
}

/**
 * Agrupa notas por matéria e depois por período.
 */
export function buildSubjectBoletim(grades: any[], periodCfg: PeriodConfig[], settings: any) {
  const annualTotal = settings?.annual_total_points ?? 100;
  const approvalPct = settings?.approval_pct ?? 60;
  const goalPct = settings?.goal_pct ?? 80;
  const attentionPct = settings?.attention_pct ?? 50;
  const riskPct = settings?.risk_pct ?? 75;

  const minRequiredAnnual = (annualTotal * approvalPct) / 100;
  const goalRequiredAnnual = (annualTotal * goalPct) / 100;

  // Agrupar todas as notas por matéria
  const bySubject: Record<string, { grades: any[]; teacher: string }> = {};
  grades.forEach(g => {
    if (!bySubject[g.subject]) {
      bySubject[g.subject] = { grades: [], teacher: g.teacher_name || '' };
    }
    bySubject[g.subject].grades.push(g);
    if (g.teacher_name && !bySubject[g.subject].teacher) {
      bySubject[g.subject].teacher = g.teacher_name;
    }
  });

  const subjects = Object.entries(bySubject).map(([name, data]) => {
    const subjectGrades = data.grades;
    let obtainedAnnual = 0;
    let maxEvaluatedAnnual = 0;

    // Construir os períodos para esta matéria
    const periods = periodCfg.map(cfg => {
      const pGrades = subjectGrades.filter(g => g.period_number === cfg.number);
      const scoredGrades = pGrades.filter(g => g.score != null);
      
      const obtained = scoredGrades.reduce((s, g) => s + g.score, 0);
      const maxEvaluated = scoredGrades.reduce((s, g) => s + (g.max_score || 0), 0);
      
      obtainedAnnual += obtained;
      maxEvaluatedAnnual += maxEvaluated;

      return {
        number: cfg.number,
        label: cfg.label,
        totalPoints: cfg.total_points,
        minScore: cfg.min_score,
        obtained,
        maxEvaluated,
        pct: maxEvaluated > 0 ? (obtained / maxEvaluated) * 100 : 0,
        passed: obtained >= cfg.min_score,
        hasData: scoredGrades.length > 0,
        grades: pGrades
      };
    });

    const missing = Math.max(0, minRequiredAnnual - obtainedAnnual);
    const missingGoal = Math.max(0, goalRequiredAnnual - obtainedAnnual);
    const remainingAnnualPoints = Math.max(0, annualTotal - maxEvaluatedAnnual);
    
    let requiredRate = 0;
    if (missing > 0) {
      requiredRate = remainingAnnualPoints > 0 ? (missing / remainingAnnualPoints) * 100 : Infinity;
    }

    let status = 'nodata';
    let statusLabel = 'Sem Notas';
    
    if (maxEvaluatedAnnual > 0) {
      if (obtainedAnnual >= minRequiredAnnual) {
        status = 'approved';
        statusLabel = 'Aprovado 🎉';
      } else if (requiredRate > 100 || (missing > remainingAnnualPoints)) {
        status = 'failed';
        statusLabel = 'Reprovado ❌';
      } else if (requiredRate > riskPct) {
        status = 'risk';
        statusLabel = 'Em Risco ⚠️';
      } else if (requiredRate >= attentionPct) {
        status = 'attention';
        statusLabel = 'Atenção 🟡';
      } else {
        status = 'comfortable';
        statusLabel = 'Confortável 🟢';
      }
    }

    const currentAvg = maxEvaluatedAnnual > 0 ? (obtainedAnnual / maxEvaluatedAnnual) * 10 : null;
    const goalReached = obtainedAnnual >= goalRequiredAnnual;

    return {
      name,
      teacher: data.teacher,
      obtained: obtainedAnnual,
      maxEvaluated: maxEvaluatedAnnual,
      annualTotal,
      minRequiredAnnual,
      goalRequiredAnnual,
      missing,
      missingGoal,
      remainingAnnualPoints,
      requiredRate,
      status,
      statusLabel,
      currentAvg,
      goalReached,
      periods
    };
  });

  // Calcular métricas gerais
  let sumAvg = 0;
  let countAvg = 0;
  let subjectsApproved = 0;
  let subjectsAttention = 0;
  let subjectsRisk = 0;
  let subjectsFailed = 0;
  let subjectsGoalReached = 0;

  subjects.forEach(s => {
    if (s.currentAvg !== null) {
      sumAvg += s.currentAvg;
      countAvg++;
    }
    if (s.status === 'approved' || s.status === 'comfortable') subjectsApproved++;
    else if (s.status === 'attention') subjectsAttention++;
    else if (s.status === 'risk') subjectsRisk++;
    else if (s.status === 'failed') subjectsFailed++;
    
    if (s.goalReached) subjectsGoalReached++;
  });

  const overallAvg = countAvg > 0 ? sumAvg / countAvg : null;

  return {
    subjects,
    overall: {
      avg: overallAvg,
      approved: subjectsApproved,
      attention: subjectsAttention,
      risk: subjectsRisk,
      failed: subjectsFailed,
      goalReached: subjectsGoalReached,
      totalSubjects: subjects.length
    }
  };
}

export function scoreColorByStatus(status: string): string {
  switch (status) {
    case 'approved':
    case 'comfortable': return '#22C55E'; // Colors.success
    case 'attention': return '#F59E0B'; // amber-500
    case 'risk':
    case 'failed': return '#EF4444'; // Colors.danger
    default: return '#9E9EBA'; // Colors.textMuted
  }
}

export function statusBadgeStyle(status: string) {
  const base = { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, display: 'flex' };
  switch (status) {
    case 'approved':
    case 'comfortable': return { ...base, backgroundColor: 'rgba(34,197,94,0.1)', color: '#22C55E' };
    case 'good': return { ...base, backgroundColor: 'rgba(59,130,246,0.1)', color: '#2563EB' };
    case 'attention': return { ...base, backgroundColor: 'rgba(245,158,11,0.1)', color: '#D97706' };
    case 'risk':
    case 'failed': return { ...base, backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' };
    default: return { ...base, backgroundColor: '#EDE9FE', color: '#6B6B8A' };
  }
}

/** Ícone amigável por disciplina (área infantil). */
export function subjectIcon(subjectName: string): string {
  const n = String(subjectName || '').toLowerCase();
  if (n.includes('portugu')) return '📖';
  if (n.includes('matem')) return '🔢';
  if (n.includes('ciên') || n.includes('cienc')) return '🔬';
  if (n.includes('hist')) return '🏛️';
  if (n.includes('geo')) return '🌍';
  if (n.includes('ingl') || n.includes('espan')) return '🗣️';
  if (n.includes('fís') || n.includes('fis')) return '⚡';
  if (n.includes('quím') || n.includes('quim')) return '🧪';
  if (n.includes('bio')) return '🌱';
  if (n.includes('arte')) return '🎨';
  if (n.includes('mús') || n.includes('mus')) return '🎵';
  if (n.includes('educação fís') || n.includes('edf')) return '⚽';
  return '📚';
}

/** Rótulo e cor para cards infantis (Confortável, Bom, Atenção, Risco). */
export function getSubjectDisplayStatus(subj: any) {
  if (!subj || subj.maxEvaluated === 0 || subj.status === 'nodata') {
    return { key: 'nodata', label: 'Sem notas', dot: '⚪', pastel: '#F1F5F9', accent: '#94A3B8' };
  }
  const avg = subj.currentAvg;
  if (subj.status === 'failed' || subj.status === 'risk') {
    return { key: 'risk', label: 'Risco', dot: '🟠', pastel: '#FFF1F2', accent: '#FB7185' };
  }
  if (subj.status === 'attention') {
    return { key: 'attention', label: 'Atenção', dot: '🟡', pastel: '#FFFBEB', accent: '#FBBF24' };
  }
  if (subj.status === 'approved' || (avg != null && avg >= 9)) {
    return { key: 'comfortable', label: 'Confortável', dot: '🟢', pastel: '#ECFDF5', accent: '#34D399' };
  }
  if (avg != null && avg >= 7.5) {
    return { key: 'good', label: 'Bom', dot: '🔵', pastel: '#EFF6FF', accent: '#60A5FA' };
  }
  return { key: 'comfortable', label: 'Confortável', dot: '🟢', pastel: '#ECFDF5', accent: '#34D399' };
}

export function gradeTypeLabel(type: string): string {
  const map: Record<string, string> = {
    test: 'Prova',
    homework: 'Dever',
    project: 'Trabalho',
    assignment: 'Trabalho',
    concept: 'Conceito',
    participation: 'Participação',
    exam: 'Prova',
    quiz: 'Quiz',
    other: 'Avaliação',
  };
  return map[type] || 'Avaliação';
}

/** Texto curto da nota para chips (ex.: 10/10 ou conceito). */
export function formatGradeChip(g: any): string {
  if (g.score != null && g.max_score != null) {
    const s = Number(g.score);
    const m = Number(g.max_score);
    const fs = Number.isInteger(s) ? String(s) : s.toFixed(1).replace(/\.0$/, '');
    const fm = Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, '');
    return `${fs}/${fm}`;
  }
  if (g.concept) return String(g.concept);
  return '—';
}

export function schoolGoalMessage(subj: any): string | null {
  if (!subj || subj.maxEvaluated === 0) return null;
  if (subj.status === 'approved' || subj.missing <= 0) {
    return 'Meta da escola alcançada! Parabéns!';
  }
  if (subj.missing > 0) {
    return `Faltam ${subj.missing.toFixed(1).replace(/\.0$/, '')} pontos para alcançar a meta.`;
  }
  return null;
}

export function familyGoalMessage(subj: any): string | null {
  if (!subj || subj.maxEvaluated === 0) return null;
  if (subj.goalReached) {
    return 'Meta da família alcançada! Muito bem!';
  }
  if (subj.missingGoal > 0) {
    return `Faltam ${subj.missingGoal.toFixed(1).replace(/\.0$/, '')} pontos para atingir a meta.`;
  }
  return null;
}
