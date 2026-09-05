import { Task, Project, LifeArea } from '../types';
import { differenceInDays, parseISO } from 'date-fns';

export interface ProjectHealth {
  project: Project;
  daysSinceLastActivity: number;
  isStalled: boolean; // >= 7 dias sem atividade
  totalTasks: number;
  completedTasks: number;
  progressPercentage: number;
  totalMinutesSpent: number;
}

export interface EstimationInsight {
  areaOrType: string;
  avgEstimatedMinutes: number;
  avgActualMinutes: number;
  discrepancyRatio: number; // ex: 1.4 = 40% acima do planejado
  recommendation: string;
}

export interface LifeBalanceStats {
  area: LifeArea;
  minutesSpent: number;
  percentage: number;
  color: string;
}

/**
 * Analisa a saúde dos projetos e detecta ofertas e operações estagnadas/abandonadas
 */
export function analyzeProjectsHealth(projects: Project[], tasks: Task[]): ProjectHealth[] {
  const now = new Date();

  return projects.map(project => {
    const projectTasks = tasks.filter(t => t.projectId === project.id);
    const completedTasks = projectTasks.filter(t => t.status === 'completed');
    const totalTasks = projectTasks.length;
    const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks.length / totalTasks) * 100);

    const totalMinutesSpent = completedTasks.reduce((sum, t) => sum + (t.actualDuration || t.timeEstimate), 0);

    // Calcular dias desde a última atividade
    let lastDate = project.lastActivityDate ? parseISO(project.lastActivityDate) : parseISO(project.createdAt);
    for (const t of completedTasks) {
      if (t.createdAt) {
        const taskDate = parseISO(t.createdAt);
        if (taskDate > lastDate) lastDate = taskDate;
      }
    }

    const daysSinceLastActivity = Math.max(0, differenceInDays(now, lastDate));
    const isStalled = project.status === 'active' && daysSinceLastActivity >= 7;

    return {
      project,
      daysSinceLastActivity,
      isStalled,
      totalTasks,
      completedTasks: completedTasks.length,
      progressPercentage,
      totalMinutesSpent
    };
  });
}

/**
 * Analisa o histórico de tarefas concluídas e detecta viés de subestimação (Overthinking/Estimativas Irrealistas)
 */
export function analyzeEstimationAccuracy(completedTasks: Task[]): EstimationInsight[] {
  const tasksWithActual = completedTasks.filter(t => t.actualDuration && t.actualDuration > 0 && t.timeEstimate > 0);
  if (tasksWithActual.length === 0) return [];

  const groups: Record<string, { planned: number[]; actual: number[] }> = {};

  for (const t of tasksWithActual) {
    const key = t.area;
    if (!groups[key]) groups[key] = { planned: [], actual: [] };
    groups[key].planned.push(t.timeEstimate);
    groups[key].actual.push(t.actualDuration!);
  }

  const insights: EstimationInsight[] = [];

  for (const [area, data] of Object.entries(groups)) {
    if (data.planned.length < 2) continue; // Precisa de pelo menos 2 amostras

    const avgPlanned = Math.round(data.planned.reduce((a, b) => a + b, 0) / data.planned.length);
    const avgActual = Math.round(data.actual.reduce((a, b) => a + b, 0) / data.actual.length);
    const ratio = Math.round((avgActual / avgPlanned) * 10) / 10;

    let recommendation = '';
    if (ratio >= 1.3) {
      recommendation = `Suas atividades em "${area}" levam em média ${ratio}x mais tempo do que o planejado. Recomendamos aumentar o tempo padrão em +${Math.round((ratio - 1) * 100)}%.`;
    } else if (ratio <= 0.8) {
      recommendation = `Você é muito ágil em "${area}". Conclui 20% mais rápido do que estima!`;
    } else {
      recommendation = `Suas estimativas para "${area}" estão bem calibradas!`;
    }

    insights.push({
      areaOrType: area,
      avgEstimatedMinutes: avgPlanned,
      avgActualMinutes: avgActual,
      discrepancyRatio: ratio,
      recommendation
    });
  }

  return insights;
}

/**
 * Calcula o Equilíbrio de Vida por área (Trabalho, Conteúdo, Treino, Igreja, Descanso...)
 */
export function calculateLifeBalance(tasks: Task[]): LifeBalanceStats[] {
  const completed = tasks.filter(t => t.status === 'completed');
  if (completed.length === 0) return [];

  const areaColors: Record<string, string> = {
    "Trabalho": "#3b82f6", // blue
    "Conteúdo & Tráfego": "#8b5cf6", // purple
    "Projetos & Ofertas": "#f59e0b", // amber
    "Saúde & Treino": "#10b981", // emerald
    "Igreja & Espiritual": "#ec4899", // pink
    "Descanso & Pessoal": "#06b6d4", // cyan
    "Finanças": "#eab308", // yellow
    "Estudos": "#a855f7", // violet
    "Casa & Família": "#f43f5e", // rose
    "Social & Relacionamentos": "#f97316", // orange
    "Outro": "#6b7280" // gray
  };

  const totalsByArea: Record<string, number> = {};
  let grandTotal = 0;

  for (const t of completed) {
    const minutes = t.actualDuration || t.timeEstimate || 30;
    totalsByArea[t.area] = (totalsByArea[t.area] || 0) + minutes;
    grandTotal += minutes;
  }

  if (grandTotal === 0) return [];

  return Object.entries(totalsByArea).map(([area, minutes]) => ({
    area: area as LifeArea,
    minutesSpent: minutes,
    percentage: Math.round((minutes / grandTotal) * 100),
    color: areaColors[area] || "#6b7280"
  })).sort((a, b) => b.minutesSpent - a.minutesSpent);
}
