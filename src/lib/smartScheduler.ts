import { Task, RoutineBlock, UserProfile, UnforeseenEvent, LifeArea } from '../types';
import { calculateRealPriority, sortTasksByRealPriority } from './priorityEngine';
import { 
  format, 
  parseISO, 
  startOfDay, 
  addDays, 
  isSameDay, 
  getDay, 
  isBefore
} from 'date-fns';

export interface TimeSlot {
  id: string;
  type: 'routine' | 'transit' | 'fixed_commitment' | 'task' | 'meal' | 'buffer' | 'boundary';
  title: string;
  area: LifeArea;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  startMinutes: number; // minutos a partir das 00:00
  endMinutes: number;
  durationMinutes: number;
  taskId?: string;
  task?: Task;
  routine?: RoutineBlock;
  isCompleted?: boolean;
  priorityScore?: number;
  explanation?: string;
  canSplit?: boolean;
  isOverdue?: boolean;
}

export interface DailyTimelineResult {
  date: string; // "YYYY-MM-DD"
  slots: TimeSlot[];
  totalPlannedWorkMinutes: number;
  totalAvailableWorkMinutes: number;
  isOverloaded: boolean;
  overloadMinutes: number;
  suggestedReallocations: Task[];
  workStartTime: string;
  workEndTime: string;
  nextAction?: {
    task: Task;
    slot: TimeSlot;
    reason: string;
  };
}

// Converte string "HH:mm" em minutos a partir de 00:00
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Converte minutos para string "HH:mm"
export function minutesToTime(minutes: number): string {
  const normalized = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Rotinas estruturais padrão caso o usuário ainda não tenha cadastrado
export const DEFAULT_ROUTINES: Omit<RoutineBlock, 'id' | 'userId'>[] = [
  {
    title: 'Acordar & Rotina Matinal',
    area: 'Descanso & Pessoal',
    startTime: '07:00',
    endTime: '08:00',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isFixed: true
  },
  {
    title: 'Musculação',
    area: 'Saúde & Treino',
    startTime: '09:30',
    endTime: '10:45',
    transitMinutesBefore: 15,
    transitMinutesAfter: 15,
    daysOfWeek: [1, 2, 3, 4, 5], // Seg a Sex
    isFixed: true
  },
  {
    title: 'Almoço & Descanso',
    area: 'Descanso & Pessoal',
    startTime: '12:30',
    endTime: '13:30',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isFixed: true
  },
  {
    title: 'Jiu-Jitsu',
    area: 'Saúde & Treino',
    startTime: '20:00',
    endTime: '21:30',
    transitMinutesBefore: 30,
    transitMinutesAfter: 30,
    daysOfWeek: [2, 4], // Ter e Qui
    isFixed: true
  },
  {
    title: 'Igreja / Culto',
    area: 'Igreja & Espiritual',
    startTime: '19:30',
    endTime: '21:00',
    transitMinutesBefore: 20,
    transitMinutesAfter: 20,
    daysOfWeek: [3], // Quarta
    isFixed: true
  },
  {
    title: 'Igreja / Culto Domingo',
    area: 'Igreja & Espiritual',
    startTime: '18:00',
    endTime: '20:00',
    transitMinutesBefore: 20,
    transitMinutesAfter: 20,
    daysOfWeek: [0], // Domingo
    isFixed: true
  }
];

/**
 * Constrói a Timeline Diária Inteligente com respeito rigoroso
 * ao horário de encerramento, rotinas inegociáveis, deslocamentos e tarefas por Prioridade Real.
 */
export function buildDailyTimeline(
  targetDate: Date,
  tasks: Task[],
  profile: UserProfile,
  customRoutines: RoutineBlock[] = [],
  unforeseenEvents: UnforeseenEvent[] = []
): DailyTimelineResult {
  const dateStr = format(targetDate, 'yyyy-MM-dd');
  const dayOfWeek = getDay(targetDate); // 0=Dom, 1=Seg...

  const workStartTime = profile.workStartTime || '08:30';
  const workEndTime = profile.workEndTime || '19:00'; // HORÁRIO DE ENCERRAMENTO OBRIGATÓRIO

  const workStartMin = timeToMinutes(workStartTime);
  const workEndMin = timeToMinutes(workEndTime);

  const rawRoutines = customRoutines.length > 0 
    ? customRoutines 
    : (profile.routinesCleared ? [] : DEFAULT_ROUTINES.map((r, i) => ({ ...r, id: `default-${i}`, userId: profile.uid })));

  const dayRoutines = rawRoutines.filter(r => r.daysOfWeek.includes(dayOfWeek));

  const slots: TimeSlot[] = [];

  // 1. Injetar Rotinas Estruturais e Deslocamentos
  for (const routine of dayRoutines) {
    const routineStart = timeToMinutes(routine.startTime);
    const routineEnd = timeToMinutes(routine.endTime);

    // Deslocamento antes
    if (routine.transitMinutesBefore && routine.transitMinutesBefore > 0) {
      const transitStart = routineStart - routine.transitMinutesBefore;
      slots.push({
        id: `transit-before-${routine.id}`,
        type: 'transit',
        title: `Deslocamento / Preparação: ${routine.title}`,
        area: routine.area,
        startTime: minutesToTime(transitStart),
        endTime: routine.startTime,
        startMinutes: transitStart,
        endMinutes: routineStart,
        durationMinutes: routine.transitMinutesBefore,
        routine
      });
    }

    // Bloco da Rotina
    slots.push({
      id: `routine-${routine.id}`,
      type: routine.title.toLowerCase().includes('almoço') ? 'meal' : 'routine',
      title: routine.title,
      area: routine.area,
      startTime: routine.startTime,
      endTime: routine.endTime,
      startMinutes: routineStart,
      endMinutes: routineEnd,
      durationMinutes: routineEnd - routineStart,
      routine
    });

    // Deslocamento depois
    if (routine.transitMinutesAfter && routine.transitMinutesAfter > 0) {
      const transitEnd = routineEnd + routine.transitMinutesAfter;
      slots.push({
        id: `transit-after-${routine.id}`,
        type: 'transit',
        title: `Retorno: ${routine.title}`,
        area: routine.area,
        startTime: routine.endTime,
        endTime: minutesToTime(transitEnd),
        startMinutes: routineEnd,
        endMinutes: transitEnd,
        durationMinutes: routine.transitMinutesAfter,
        routine
      });
    }
  }

  // 2. Injetar Compromissos Fixos Agendados do Usuário
  const fixedTasksForDay = tasks.filter(t => {
    if (t.status === 'completed') return false;
    if (!t.isFixed) return false;
    const taskDate = t.dateAllocated || (t.startDate ? format(parseISO(t.startDate), 'yyyy-MM-dd') : '');
    return taskDate === dateStr;
  });

  for (const task of fixedTasksForDay) {
    let startMin = workStartMin;
    if (task.scheduledStartTime) {
      startMin = timeToMinutes(task.scheduledStartTime);
    } else if (task.startDate) {
      const parsed = parseISO(task.startDate);
      startMin = parsed.getHours() * 60 + parsed.getMinutes();
    }
    const duration = task.timeEstimate || 60;
    const endMin = startMin + duration;

    slots.push({
      id: `fixed-${task.id}`,
      type: 'fixed_commitment',
      title: task.title,
      area: task.area,
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
      startMinutes: startMin,
      endMinutes: endMin,
      durationMinutes: duration,
      taskId: task.id,
      task,
      isCompleted: task.status === 'completed'
    });
  }

  // Ordenar slots fixos existentes por horário
  slots.sort((a, b) => a.startMinutes - b.startMinutes);

  // 3. Identificar Janelas Livres para Trabalho entre workStartMin e workEndMin
  interface Window {
    start: number;
    end: number;
    duration: number;
  }

  const workWindows: Window[] = [];
  let pointer = workStartMin;

  // Filtrar apenas bloqueios que colidem com o horário de trabalho
  const workBlockers = slots
    .filter(s => s.endMinutes > workStartMin && s.startMinutes < workEndMin)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  for (const blocker of workBlockers) {
    const effectiveStart = Math.max(workStartMin, blocker.startMinutes);
    const effectiveEnd = Math.min(workEndMin, blocker.endMinutes);

    if (effectiveStart > pointer) {
      workWindows.push({
        start: pointer,
        end: effectiveStart,
        duration: effectiveStart - pointer
      });
    }
    pointer = Math.max(pointer, effectiveEnd);
  }

  if (pointer < workEndMin) {
    workWindows.push({
      start: pointer,
      end: workEndMin,
      duration: workEndMin - pointer
    });
  }

  // Considerar dedução por Imprevistos do dia
  const todayImprevistos = unforeseenEvents.filter(e => e.date === dateStr);
  const imprevistoMinutes = todayImprevistos.reduce((sum, e) => sum + e.duration, 0);

  const rawAvailableWorkMinutes = workWindows.reduce((sum, w) => sum + w.duration, 0);
  const totalAvailableWorkMinutes = Math.max(0, rawAvailableWorkMinutes - imprevistoMinutes);

  // 4. Selecionar e Ordenar Tarefas Flexíveis por Prioridade Real
  const flexibleTasks = tasks.filter(t => {
    if (t.status === 'completed') return false;
    if (t.isFixed) return false;
    
    // Alocadas para hoje ou com deadline hoje ou pendentes no backlog
    const taskDate = t.dateAllocated;
    const isDueToday = t.deadline && isSameDay(parseISO(t.deadline), targetDate);
    const isOverdue = t.deadline && isBefore(startOfDay(parseISO(t.deadline)), startOfDay(targetDate));

    return taskDate === dateStr || isDueToday || isOverdue;
  });

  const sortedTasks = sortTasksByRealPriority(flexibleTasks, targetDate);

  // 5. Alocar Tarefas Flexíveis nas Janelas Livres (Time Blocking Inteligente)
  let windowIndex = 0;
  let currentWindowTime = workWindows.length > 0 ? workWindows[0].start : 0;
  const suggestedReallocations: Task[] = [];
  let totalPlannedWorkMinutes = 0;

  for (const task of sortedTasks) {
    let taskDurationRemaining = task.timeEstimate;
    const priorityInfo = calculateRealPriority(task, targetDate);

    while (taskDurationRemaining > 0 && windowIndex < workWindows.length) {
      const currentWindow = workWindows[windowIndex];
      const availableInWindow = currentWindow.end - currentWindowTime;

      if (availableInWindow <= 0) {
        windowIndex++;
        if (windowIndex < workWindows.length) {
          currentWindowTime = workWindows[windowIndex].start;
        }
        continue;
      }

      // Se cabe totalmente na janela
      if (taskDurationRemaining <= availableInWindow) {
        const slotEnd = currentWindowTime + taskDurationRemaining;
        slots.push({
          id: `task-slot-${task.id}-${currentWindowTime}`,
          type: 'task',
          title: task.title,
          area: task.area,
          startTime: minutesToTime(currentWindowTime),
          endTime: minutesToTime(slotEnd),
          startMinutes: currentWindowTime,
          endMinutes: slotEnd,
          durationMinutes: taskDurationRemaining,
          taskId: task.id,
          task,
          priorityScore: priorityInfo.totalScore,
          explanation: priorityInfo.explanation,
          isCompleted: false
        });

        totalPlannedWorkMinutes += taskDurationRemaining;
        currentWindowTime = slotEnd;
        taskDurationRemaining = 0;
      } else {
        // Tarefa não cabe inteira: Fracionamento Inteligente (Time-block) se janela for razoável (>= 30 min)
        if (availableInWindow >= 30) {
          const chunkDuration = availableInWindow;
          const slotEnd = currentWindowTime + chunkDuration;

          slots.push({
            id: `task-slot-${task.id}-chunk-${currentWindowTime}`,
            type: 'task',
            title: `${task.title} (Parte 1: ${chunkDuration}m)`,
            area: task.area,
            startTime: minutesToTime(currentWindowTime),
            endTime: minutesToTime(slotEnd),
            startMinutes: currentWindowTime,
            endMinutes: slotEnd,
            durationMinutes: chunkDuration,
            taskId: task.id,
            task,
            priorityScore: priorityInfo.totalScore,
            explanation: `${priorityInfo.explanation} • Fracionada para caber no bloco`,
            canSplit: true
          });

          totalPlannedWorkMinutes += chunkDuration;
          taskDurationRemaining -= chunkDuration;
          windowIndex++;
          if (windowIndex < workWindows.length) {
            currentWindowTime = workWindows[windowIndex].start;
          }
        } else {
          // Janela pequena demais para esta tarefa: avança para a próxima janela
          windowIndex++;
          if (windowIndex < workWindows.length) {
            currentWindowTime = workWindows[windowIndex].start;
          }
        }
      }
    }

    // Se a tarefa não coube antes do encerramento das 19:00:
    if (taskDurationRemaining > 0) {
      suggestedReallocations.push(task);
      totalPlannedWorkMinutes += taskDurationRemaining;
    }
  }

  // Re-ordenar slots finais em ordem cronológica
  slots.sort((a, b) => a.startMinutes - b.startMinutes);

  // Injetar marcador do Horário de Encerramento (19:00)
  slots.push({
    id: 'work-cutoff-boundary',
    type: 'boundary',
    title: `Encerramento do Trabalho (${workEndTime}) - Fim da Jornada`,
    area: 'Descanso & Pessoal',
    startTime: workEndTime,
    endTime: workEndTime,
    startMinutes: workEndMin,
    endMinutes: workEndMin,
    durationMinutes: 0
  });

  slots.sort((a, b) => a.startMinutes - b.startMinutes);

  const isOverloaded = totalPlannedWorkMinutes > totalAvailableWorkMinutes;
  const overloadMinutes = Math.max(0, totalPlannedWorkMinutes - totalAvailableWorkMinutes);

  // 6. Determinar "O QUE FAZER AGORA" (Next Action)
  let nextAction: DailyTimelineResult['nextAction'] = undefined;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (isSameDay(targetDate, now)) {
    // 1º: Há alguma tarefa em andamento ou alocada para o horário atual?
    const currentTaskSlot = slots.find(s => 
      s.type === 'task' && 
      s.task && 
      s.task.status === 'pending' &&
      currentMinutes >= s.startMinutes && 
      currentMinutes < s.endMinutes
    );

    if (currentTaskSlot && currentTaskSlot.task) {
      nextAction = {
        task: currentTaskSlot.task,
        slot: currentTaskSlot,
        reason: `Agendada para este momento (${currentTaskSlot.startTime}–${currentTaskSlot.endTime}). ${currentTaskSlot.explanation || ''}`
      };
    } else {
      // 2º: Próxima tarefa mais relevante que ainda não começou hoje
      const upcomingTaskSlot = slots.find(s => 
        s.type === 'task' && 
        s.task && 
        s.task.status === 'pending' && 
        s.startMinutes >= currentMinutes
      );

      if (upcomingTaskSlot && upcomingTaskSlot.task) {
        nextAction = {
          task: upcomingTaskSlot.task,
          slot: upcomingTaskSlot,
          reason: `Próxima tarefa da agenda. ${upcomingTaskSlot.explanation || ''}`
        };
      } else if (sortedTasks.length > 0) {
        // 3º: Tarefa de maior prioridade real que ainda não foi concluída
        const topTask = sortedTasks[0];
        const breakdown = calculateRealPriority(topTask, targetDate);
        nextAction = {
          task: topTask,
          slot: {
            id: `top-action-${topTask.id}`,
            type: 'task',
            title: topTask.title,
            area: topTask.area,
            startTime: minutesToTime(currentMinutes),
            endTime: minutesToTime(currentMinutes + topTask.timeEstimate),
            startMinutes: currentMinutes,
            endMinutes: currentMinutes + topTask.timeEstimate,
            durationMinutes: topTask.timeEstimate,
            task: topTask
          },
          reason: `Maior Prioridade Real no momento (Score: ${breakdown.totalScore}). ${breakdown.explanation}`
        };
      }
    }
  }

  return {
    date: dateStr,
    slots,
    totalPlannedWorkMinutes,
    totalAvailableWorkMinutes,
    isOverloaded,
    overloadMinutes,
    suggestedReallocations,
    workStartTime,
    workEndTime,
    nextAction
  };
}

/**
 * Função de retrocompatibilidade para distribuir tarefas ao longo do mês/semana
 */
export function distributeTasks(
  tasks: Task[],
  dailyCapacityMinutes: number,
  unforeseenEvents: UnforeseenEvent[] = [],
  allowWeekends: boolean = false
): Record<string, Task[]> {
  const schedule: Record<string, Task[]> = {};
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const fixedTasks = pendingTasks.filter(t => t.isFixed);
  let flexibleTasks = pendingTasks.filter(t => !t.isFixed);

  const today = startOfDay(new Date());

  // Fixed tasks
  fixedTasks.forEach(task => {
    const taskDate = startOfDay(parseISO(task.deadline || task.endDate || task.startDate || new Date().toISOString()));
    const dateKey = format(taskDate, 'yyyy-MM-dd');
    if (!schedule[dateKey]) schedule[dateKey] = [];
    schedule[dateKey].push(task);
  });

  // Flexible sorted by Prioridade Real
  flexibleTasks = sortTasksByRealPriority(flexibleTasks, today);

  let currentDate = today;
  let daysLookahead = 0;

  while (flexibleTasks.length > 0 && daysLookahead < 60) {
    const dateKey = format(currentDate, 'yyyy-MM-dd');

    const eventsToday = unforeseenEvents.filter(e => e.date === dateKey);
    const lostCapacity = eventsToday.reduce((acc, e) => acc + e.duration, 0);
    const usedCapacity = (schedule[dateKey] || []).reduce((acc, t) => acc + t.timeEstimate, 0);
    let remainingCapacity = Math.max(0, dailyCapacityMinutes - lostCapacity) - usedCapacity;

    const availableTasks = [...flexibleTasks];

    for (const task of availableTasks) {
      if (remainingCapacity >= task.timeEstimate) {
        if (!schedule[dateKey]) schedule[dateKey] = [];
        schedule[dateKey].push(task);
        remainingCapacity -= task.timeEstimate;
        flexibleTasks = flexibleTasks.filter(t => t.id !== task.id);
      }
      if (remainingCapacity <= 0) break;
    }

    currentDate = addDays(currentDate, 1);
    daysLookahead++;
  }

  // Se sobrou alguma tarefa além da capacidade, coloca no backlog do dia final
  if (flexibleTasks.length > 0) {
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    if (!schedule[dateKey]) schedule[dateKey] = [];
    schedule[dateKey].push(...flexibleTasks);
  }

  return schedule;
}
