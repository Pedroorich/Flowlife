import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task, RoutineBlock, UserProfile } from '../types';
import { timeToMinutes } from './smartScheduler';

export interface SystemClockState {
  now: Date;
  timeStr: string;       // "HH:mm" (ex: "08:35")
  secondsStr: string;    // "HH:mm:ss" (ex: "08:35:12")
  dateStr: string;       // "YYYY-MM-DD" (ex: "2026-09-07")
  dayOfWeek: number;     // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  dayOfWeekName: string; // "Segunda-feira"
  formattedFullDate: string; // "Segunda-feira, 7 de setembro de 2026"
  currentMinutes: number; // minutos desde as 00:00
}

export const DAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export function getSystemClockState(date: Date = new Date()): SystemClockState {
  const timeStr = format(date, 'HH:mm');
  const secondsStr = format(date, 'HH:mm:ss');
  const dateStr = format(date, 'yyyy-MM-dd');
  const dayOfWeek = date.getDay();
  const dayOfWeekName = DAY_NAMES[dayOfWeek];
  const formattedFullDate = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  return {
    now: date,
    timeStr,
    secondsStr,
    dateStr,
    dayOfWeek,
    dayOfWeekName,
    formattedFullDate,
    currentMinutes
  };
}

export function useSystemClock(intervalMs: number = 1000): SystemClockState {
  const [clock, setClock] = useState<SystemClockState>(() => getSystemClockState());

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(getSystemClockState());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return clock;
}

export interface ActivityStatus {
  currentActivity: {
    title: string;
    type: 'routine' | 'task';
    timeRange: string;
    remainingMinutes: number;
  } | null;
  nextActivity: {
    title: string;
    type: 'routine' | 'task';
    startTime: string;
    startsInMinutes: number;
  } | null;
}

/**
 * Identifica em tempo real qual atividade está em andamento agora
 * e qual é a próxima atividade do dia.
 */
export function getCurrentAndNextActivity(
  clock: SystemClockState,
  routines: RoutineBlock[] = [],
  tasks: Task[] = [],
  profile?: UserProfile | null
): ActivityStatus {
  try {
    const { currentMinutes, dayOfWeek, dateStr } = clock;

    interface SchedItem {
      title: string;
      type: 'routine' | 'task';
      startMin: number;
      endMin: number;
      startTime: string;
      endTime: string;
    }

    const items: SchedItem[] = [];

    // 1. Rotinas de hoje (com validação ultra-segura)
    if (Array.isArray(routines)) {
      routines.forEach(r => {
        if (!r || !r.title || !r.startTime || !r.endTime) return;
        const days = Array.isArray(r.daysOfWeek) && r.daysOfWeek.length > 0 
          ? r.daysOfWeek 
          : [0, 1, 2, 3, 4, 5, 6]; // se não especificado, considera diária

        if (!days.includes(dayOfWeek)) return;

        const sMin = timeToMinutes(r.startTime);
        const eMin = timeToMinutes(r.endTime);
        items.push({
          title: r.title,
          type: 'routine',
          startMin: sMin,
          endMin: eMin,
          startTime: r.startTime,
          endTime: r.endTime
        });
      });
    }

    // 2. Tarefas com horário agendado hoje (com validação ultra-segura)
    if (Array.isArray(tasks)) {
      tasks.forEach(t => {
        if (!t || !t.title || !t.scheduledStartTime) return;
        if (t.status === 'completed') return;
        if (t.dateAllocated && t.dateAllocated !== dateStr) return;

        const sMin = timeToMinutes(t.scheduledStartTime);
        const duration = Number(t.timeEstimate) || 45;
        const eMin = sMin + duration;
        const endHour = Math.floor(eMin / 60);
        const endMinPart = eMin % 60;
        const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinPart).padStart(2, '0')}`;
        items.push({
          title: t.title,
          type: 'task',
          startMin: sMin,
          endMin: eMin,
          startTime: t.scheduledStartTime,
          endTime
        });
      });
    }

    // Ordenar por horário de início
    items.sort((a, b) => a.startMin - b.startMin);

    // Atividade atual
    let currentActivity: ActivityStatus['currentActivity'] = null;
    const current = items.find(i => currentMinutes >= i.startMin && currentMinutes < i.endMin);
    if (current) {
      currentActivity = {
        title: current.title,
        type: current.type,
        timeRange: `${current.startTime} – ${current.endTime}`,
        remainingMinutes: Math.max(0, current.endMin - currentMinutes)
      };
    }

    // Próxima atividade
    let nextActivity: ActivityStatus['nextActivity'] = null;
    const next = items.find(i => i.startMin > currentMinutes);
    if (next) {
      nextActivity = {
        title: next.title,
        type: next.type,
        startTime: next.startTime,
        startsInMinutes: next.startMin - currentMinutes
      };
    }

    return { currentActivity, nextActivity };
  } catch (err) {
    console.warn('Erro ao calcular atividade atual/próxima:', err);
    return { currentActivity: null, nextActivity: null };
  }
}
