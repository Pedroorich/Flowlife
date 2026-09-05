import { Task } from '../types';
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

export interface PriorityScoreBreakdown {
  totalScore: number;
  impactScore: number;
  urgencyScore: number;
  deadlineBonus: number;
  unlockBonus: number;
  quickWinBonus: number;
  explanation: string;
}

/**
 * Calcula a PRIORIDADE REAL multifatorial de uma tarefa.
 * Regras:
 * - Impacto Estratégico (1-5): peso 2.5 (foco em receita, ofertas e projetos-chave)
 * - Urgência (1-5): peso 2.0
 * - Proximidade do Prazo: vence hoje (+35), amanhã (+20), atrasada (+50)
 * - Tarefas que desbloqueiam outras tarefas: +12 pontos por dependência
 * - Quick Wins: tarefas de <= 20 min com bom impacto (+8 pontos)
 */
export function calculateRealPriority(task: Task, today: Date = new Date()): PriorityScoreBreakdown {
  // 1. Mapeamento de Impacto (1 a 5)
  let impact = task.impact || 3;
  if (!task.impact) {
    if (task.priority === 'Alta') impact = 4;
    else if (task.priority === 'Baixa') impact = 2;
  }
  const impactScore = impact * 2.5;

  // 2. Mapeamento de Urgência (1 a 5)
  let urgency = task.urgency || 3;
  if (!task.urgency) {
    if (task.priority === 'Alta') urgency = 4;
    else if (task.priority === 'Baixa') urgency = 2;
  }
  const urgencyScore = urgency * 2.0;

  // 3. Proximidade de Prazo
  let deadlineBonus = 0;
  let deadlineExplanation = '';
  if (task.deadline || task.endDate) {
    const deadlineDate = startOfDay(parseISO(task.deadline || task.endDate!));
    const todayStart = startOfDay(today);
    const daysDiff = differenceInCalendarDays(deadlineDate, todayStart);

    if (daysDiff < 0) {
      deadlineBonus = 50; // Atrasada: atenção máxima
      deadlineExplanation = 'Atrasada';
    } else if (daysDiff === 0) {
      deadlineBonus = 35; // Vence hoje
      deadlineExplanation = 'Prazo é hoje';
    } else if (daysDiff === 1) {
      deadlineBonus = 20; // Vence amanhã
      deadlineExplanation = 'Prazo amanhã';
    } else if (daysDiff <= 3) {
      deadlineBonus = 10;
      deadlineExplanation = `Vence em ${daysDiff} dias`;
    }
  }

  // 4. Desbloqueio de outras tarefas
  const unlockCount = task.unlocksTaskIds?.length || 0;
  const unlockBonus = unlockCount * 12;

  // 5. Quick Win (tarefas rápidas que destravam o dia)
  let quickWinBonus = 0;
  if (task.timeEstimate <= 25 && impact >= 3) {
    quickWinBonus = 8;
  }

  const totalScore = Math.round((impactScore + urgencyScore + deadlineBonus + unlockBonus + quickWinBonus) * 10) / 10;

  // Montar explicação humana
  const reasons: string[] = [];
  if (deadlineExplanation) reasons.push(deadlineExplanation);
  if (impact >= 4) reasons.push('Alto impacto estratégico');
  if (unlockCount > 0) reasons.push(`Desbloqueia ${unlockCount} tarefa(s)`);
  if (quickWinBonus > 0) reasons.push('Quick Win (rápida de resolver)');

  const explanation = reasons.length > 0 
    ? reasons.join(' • ') 
    : `Prioridade calculada (Score: ${totalScore})`;

  return {
    totalScore,
    impactScore,
    urgencyScore,
    deadlineBonus,
    unlockBonus,
    quickWinBonus,
    explanation,
  };
}

/**
 * Ordena tarefas por Prioridade Real decrescente
 */
export function sortTasksByRealPriority(tasks: Task[], today: Date = new Date()): Task[] {
  return [...tasks].sort((a, b) => {
    const scoreA = calculateRealPriority(a, today).totalScore;
    const scoreB = calculateRealPriority(b, today).totalScore;
    return scoreB - scoreA;
  });
}
