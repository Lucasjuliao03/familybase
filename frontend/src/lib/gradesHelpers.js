/**
 * gradesHelpers.js — Lógica de cálculo de boletim escolar
 * Funções puras — sem chamadas à API, sem side-effects.
 */

/** Rótulos padrão por modelo */
export const DEFAULT_PERIOD_LABELS = {
  bimonthly: ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'],
  trimester:  ['1º Trimestre', '2º Trimestre', '3º Trimestre'],
};

/** Pontos padrão por período quando não há configuração salva */
export const DEFAULT_PERIOD_POINTS = {
  bimonthly: 25,
  trimester:  33.33,
};

/**
 * Constrói a lista de períodos mesclando a configuração salva
 * com os valores padrão do modelo.
 *
 * @param {object} settings  – linha de school_grade_settings (pode ser null)
 * @param {object[]} periods – linhas de school_grade_periods para este aluno
 * @returns {Array<{
 *   number: number,
 *   label: string,
 *   total_points: number,
 *   approval_pct: number,
 *   weight: number,
 *   min_score: number  // pontos mínimos para aprovação neste período
 * }>}
 */
export function buildPeriodConfig(settings, periods = []) {
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
 * Agrupa notas por período e matéria, calculando totais e situação.
 *
 * @param {object[]} grades      – lista de notas do aluno
 * @param {object[]} periodCfg  – resultado de buildPeriodConfig()
 * @returns {object} boletim no formato:
 * {
 *   periods: [{
 *     ...cfg,
 *     obtained: number,     // pontos obtidos no período
 *     passed: boolean,      // atingiu min_score?
 *     subjects: {
 *       [subject]: { grades: [], total: number, avg: number }
 *     }
 *   }],
 *   overall: {
 *     totalObtained: number,
 *     totalMax: number,
 *     weightedAvg: number,  // 0-10
 *     passed: boolean,
 *     missing: number       // pontos faltantes para aprovação geral (0 se já passou)
 *   }
 * }
 */
export function buildBoletim(grades, periodCfg) {
  const periods = periodCfg.map((cfg) => {
    const periodGrades = grades.filter((g) => g.period_number === cfg.number);

    // Agrupar por matéria
    const subjects = {};
    periodGrades.forEach((g) => {
      if (!subjects[g.subject]) subjects[g.subject] = { grades: [], total: 0, max: 0 };
      subjects[g.subject].grades.push(g);
      subjects[g.subject].total += g.score ?? 0;
      subjects[g.subject].max   += g.max_score ?? 10;
    });

    // Calcular avg por matéria (0-10 proporcional)
    Object.values(subjects).forEach((s) => {
      s.avg = s.max > 0 ? (s.total / s.max) * 10 : null;
    });

    const obtained = periodGrades.reduce((sum, g) => sum + (g.score ?? 0), 0);
    return {
      ...cfg,
      obtained,
      passed: obtained >= cfg.min_score,
      subjects,
    };
  });

  // Média ponderada geral (0-10)
  const totalWeight   = periodCfg.reduce((s, c) => s + c.weight, 0);
  const weightedSum   = periods.reduce((s, p) => {
    const pct = p.total_points > 0 ? (p.obtained / p.total_points) * 10 : 0;
    return s + pct * p.weight;
  }, 0);
  const weightedAvg   = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const totalObtained = periods.reduce((s, p) => s + p.obtained, 0);
  const totalMax      = periodCfg.reduce((s, c) => s + c.total_points, 0);

  // Aprovação geral: todos os períodos aprovados OU média ponderada ≥ 5 (padrão MEC)
  const allPassed     = periods.every((p) => p.passed);
  const minWeightedAvg = 5; // mínimo para aprovação pela média
  const passed        = allPassed || weightedAvg >= minWeightedAvg;
  const missing       = passed ? 0 : Math.max(0, minWeightedAvg - weightedAvg);

  return { periods, overall: { totalObtained, totalMax, weightedAvg, passed, missing } };
}

/** Cor semântica baseada em percentual de aprovação */
export function scoreColor(obtained, total_points, approval_pct = 60) {
  if (total_points <= 0) return 'var(--text-muted)';
  const pct = (obtained / total_points) * 100;
  if (pct >= approval_pct) return 'var(--success)';
  if (pct >= approval_pct * 0.8) return '#F97316';
  return 'var(--danger)';
}

/** Percentual visual (0-100) para barra de progresso */
export function scorePct(obtained, total_points) {
  if (!total_points) return 0;
  return Math.min(100, (obtained / total_points) * 100);
}
