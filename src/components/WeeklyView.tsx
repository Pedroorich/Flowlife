import React, { useState, useMemo } from 'react';
import { Task, UserProfile, UnforeseenEvent, RoutineBlock } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { 
  addDays, 
  startOfWeek, 
  format, 
  isToday, 
  parseISO 
} from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle,
  ArrowRight,
  Check,
  Sparkles,
  Trash2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { buildDailyTimeline } from '../lib/smartScheduler';

interface WeeklyViewProps {
  profile: UserProfile;
  tasks: Task[];
  unforeseenEvents: UnforeseenEvent[];
  routines?: RoutineBlock[];
}

export function WeeklyView({ profile, tasks, unforeseenEvents, routines = [] }: WeeklyViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Começa na Segunda-feira
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  // Construir timeline para cada um dos 7 dias
  const weeklyTimelines = useMemo(() => {
    return weekDays.map(day => {
      const timeline = buildDailyTimeline(day, tasks, profile, routines, unforeseenEvents);
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayTasks = tasks.filter(t => t.dateAllocated === dateKey);
      const completedDayTasks = dayTasks.filter(t => t.status === 'completed');

      return {
        date: day,
        dateKey,
        timeline,
        dayTasks,
        completedDayTasks,
        totalMinutes: dayTasks.reduce((sum, t) => sum + t.timeEstimate, 0)
      };
    });
  }, [weekDays, tasks, profile, routines, unforeseenEvents]);

  const handleMoveTask = async (taskId: string, targetDateStr: string) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        dateAllocated: targetDateStr
      });
    } catch (e) {
      console.error("Erro ao mover tarefa", e);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: 'completed'
      });
    } catch (e) {
      console.error("Erro ao concluir", e);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (e) {
      console.error("Erro ao excluir", e);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
            <CalendarIcon className="w-4 h-4" />
            Planejamento Semanal Estratégico
          </div>
          <h2 className="font-serif text-3xl text-white">Sua Semana Balanceada</h2>
          <p className="text-sm text-gray-400">
            Capacidade variável por dia, compromissos fixos e alocação sem sobrecarga.
          </p>
        </div>

        {/* Controles de Semana */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentWeekStart(prev => addDays(prev, -7))}
            className="p-2 bg-surface border border-border hover:border-gray-500 rounded-lg text-gray-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-medium text-sm text-white px-2">
            {format(weekDays[0], 'd MMM')} – {format(weekDays[6], 'd MMM yyyy')}
          </span>
          <button 
            onClick={() => setCurrentWeekStart(prev => addDays(prev, 7))}
            className="p-2 bg-surface border border-border hover:border-gray-500 rounded-lg text-gray-300"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Grid de 7 Colunas da Semana */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weeklyTimelines.map(({ date, dateKey, timeline, dayTasks, completedDayTasks, totalMinutes }) => {
          const isCurrentDay = isToday(date);
          const isOverloaded = timeline.isOverloaded;
          const capacityHours = Math.round(timeline.totalAvailableWorkMinutes / 60 * 10) / 10;
          const plannedHours = Math.round(totalMinutes / 60 * 10) / 10;

          return (
            <div 
              key={dateKey}
              className={cn(
                "bg-surface border rounded-2xl p-4 flex flex-col min-h-[480px] transition-all",
                isCurrentDay ? "border-accent-amber shadow-[0_0_20px_rgba(245,158,11,0.12)] ring-1 ring-accent-amber/50" : "border-border",
                isOverloaded && "border-red-500/40 bg-red-500/5"
              )}
            >
              {/* Header do Dia */}
              <div className="border-b border-border/60 pb-3 mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className={cn("text-xs uppercase font-bold tracking-wider", isCurrentDay ? "text-accent-amber" : "text-gray-400")}>
                    {format(date, 'EEE')}
                  </span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-bold",
                    isCurrentDay ? "bg-accent-amber text-background" : "text-gray-400"
                  )}>
                    {format(date, 'd')}
                  </span>
                </div>

                {/* Status de Carga */}
                <div className="flex justify-between items-center text-[11px] mt-2">
                  <span className="text-gray-400">Capacidade:</span>
                  <span className="font-mono text-gray-300">{capacityHours}h</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-gray-400">Planejado:</span>
                  <span className={cn("font-mono font-bold", isOverloaded ? "text-red-400" : "text-accent-emerald")}>
                    {plannedHours}h
                  </span>
                </div>

                {isOverloaded && (
                  <div className="flex items-center gap-1 text-[10px] text-red-400 font-semibold mt-2 bg-red-500/20 px-2 py-1 rounded">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Sobrecarga (+{Math.round(timeline.overloadMinutes)}m)
                  </div>
                )}
              </div>

              {/* Lista de Tarefas do Dia */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {dayTasks.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-xs italic">
                    Sem tarefas flexíveis
                  </div>
                ) : (
                  dayTasks.map(task => (
                    <div 
                      key={task.id}
                      className={cn(
                        "bg-background/80 border border-border/80 rounded-xl p-2.5 text-xs transition-all hover:border-gray-500 group",
                        task.status === 'completed' && "opacity-50 line-through"
                      )}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-medium text-white line-clamp-2">{task.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {task.status !== 'completed' && (
                            <button 
                              onClick={() => handleComplete(task.id!)}
                              className="text-gray-500 hover:text-accent-emerald apple-press p-0.5"
                              title="Concluir"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteTask(task.id!)}
                            className="text-gray-500 hover:text-red-400 apple-press p-0.5"
                            title="Excluir Tarefa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-white/5">
                        <span>{task.area.split(' ')[0]}</span>
                        <span className="font-mono text-gray-300">{task.timeEstimate}m</span>
                      </div>

                      {/* Ações de Mover */}
                      {task.status !== 'completed' && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity pt-2 flex items-center justify-between text-[10px]">
                          <button 
                            onClick={() => handleMoveTask(task.id!, format(addDays(date, -1), 'yyyy-MM-dd'))}
                            className="text-gray-400 hover:text-white"
                            title="Mover para dia anterior"
                          >
                            ←
                          </button>
                          <span className="text-[9px] text-gray-500">Mover</span>
                          <button 
                            onClick={() => handleMoveTask(task.id!, format(addDays(date, 1), 'yyyy-MM-dd'))}
                            className="text-gray-400 hover:text-white"
                            title="Mover para próximo dia"
                          >
                            →
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
