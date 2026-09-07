import React, { useState, useMemo } from 'react';
import { Task, UserProfile, UnforeseenEvent, RoutineBlock, Project } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
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
  Trash2,
  Layers,
  RefreshCw,
  FolderKanban,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import { buildDailyTimeline, distributeWorkAcrossWeek } from '../lib/smartScheduler';

interface WeeklyViewProps {
  profile: UserProfile;
  tasks: Task[];
  unforeseenEvents: UnforeseenEvent[];
  routines?: RoutineBlock[];
  projects?: Project[];
}

export function WeeklyView({ 
  profile, 
  tasks, 
  unforeseenEvents, 
  routines = [], 
  projects = [] 
}: WeeklyViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Começa na Segunda-feira
  );

  const [showUnallocatedDrawer, setShowUnallocatedDrawer] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  // Tarefas pendentes sem data alocada (vindas de Projetos ou Backlog)
  const unallocatedTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'pending' && !t.dateAllocated);
  }, [tasks]);

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

  // Auto-distribuir trabalho na semana respeitando limites
  const handleAutoDistributeWeek = async () => {
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const result = distributeWorkAcrossWeek(
        tasks,
        profile,
        routines,
        unforeseenEvents,
        undefined,
        currentWeekStart
      );

      if (result.allocations.length === 0) {
        setSyncMessage('Nenhuma tarefa pendente precisava ser alocada.');
        setTimeout(() => setSyncMessage(null), 4000);
        return;
      }

      const batch = writeBatch(db);
      result.allocations.forEach(alloc => {
        const taskRef = doc(db, 'tasks', alloc.taskId);
        batch.update(taskRef, {
          dateAllocated: alloc.dateAllocated
        });
      });

      await batch.commit();
      setSyncMessage(`⚡ ${result.allocations.length} tarefas de trabalho organizadas e sincronizadas com os dias da semana!`);
      setTimeout(() => setSyncMessage(null), 6000);
    } catch (e) {
      console.error("Erro ao auto-distribuir semana", e);
      setSyncMessage('Erro ao distribuir tarefas na semana.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
            <CalendarIcon className="w-4 h-4" />
            Planejamento Semanal & Sincronização de Trabalho
          </div>
          <h2 className="font-serif text-3xl text-white">Sua Semana Balanceada</h2>
          <p className="text-sm text-gray-400">
            Trabalho de projetos distribuído harmonicamente com suas rotinas inegociáveis.
          </p>
        </div>

        {/* Controles de Semana e Botão de Sincronização */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleAutoDistributeWeek}
            disabled={isSyncing}
            className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 rounded-xl transition-all flex items-center gap-2 text-xs font-bold shadow-md"
            title="Distribuir tarefas de projetos pendentes nos dias livres da semana"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-purple-300", isSyncing && "animate-spin")} />
            Auto-Distribuir Trabalho na Semana
          </button>

          <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-xl">
            <button 
              onClick={() => setCurrentWeekStart(prev => addDays(prev, -7))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-300"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-xs text-white px-2">
              {format(weekDays[0], 'd MMM')} – {format(weekDays[6], 'd MMM yyyy')}
            </span>
            <button 
              onClick={() => setCurrentWeekStart(prev => addDays(prev, 7))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-300"
              title="Próxima semana"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Banner de Feedback de Sincronização */}
      {syncMessage && (
        <div className="bg-accent-emerald/15 border-2 border-accent-emerald/40 text-accent-emerald p-4 rounded-2xl text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        </div>
      )}

      {/* Painel Expansível de Tarefas Aguardando Alocação (Projetos & Backlog) */}
      {unallocatedTasks.length > 0 && (
        <div className="bg-surface border border-purple-500/30 rounded-2xl p-5 shadow-lg space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  Demandas de Projetos Aguardando Alocação na Semana
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-mono font-bold">
                    {unallocatedTasks.length}
                  </span>
                </h4>
                <p className="text-xs text-gray-400">
                  Clique no dia desejado para sincronizar a tarefa diretamente na coluna correspondente:
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowUnallocatedDrawer(prev => !prev)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
            >
              {showUnallocatedDrawer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showUnallocatedDrawer && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-white/5">
              {unallocatedTasks.map(task => {
                const proj = projects.find(p => p.id === task.projectId);

                return (
                  <div 
                    key={task.id}
                    className="p-3 bg-background/80 border border-border hover:border-purple-500/40 rounded-xl flex flex-col justify-between gap-2.5 transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        {proj && (
                          <span 
                            className="text-[10px] px-2 py-0.5 rounded font-bold border truncate"
                            style={{ 
                              backgroundColor: `${proj.color || '#f59e0b'}20`, 
                              borderColor: `${proj.color || '#f59e0b'}40`,
                              color: proj.color || '#f59e0b'
                            }}
                          >
                            {proj.name}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-mono">
                          {task.timeEstimate} min
                        </span>
                      </div>
                      <div className="text-xs font-medium text-white line-clamp-2">{task.title}</div>
                    </div>

                    {/* Botões rápidos de alocação para os dias da semana */}
                    <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-white/5">
                      <span className="text-[10px] text-gray-400 shrink-0 mr-1">Alocar:</span>
                      {weekDays.map(d => {
                        const dKey = format(d, 'yyyy-MM-dd');
                        const dayLabel = format(d, 'EEE');
                        const isDToday = isToday(d);

                        return (
                          <button
                            key={dKey}
                            onClick={() => handleMoveTask(task.id!, dKey)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors shrink-0",
                              isDToday 
                                ? "bg-accent-amber/20 border-accent-amber/40 text-accent-amber hover:bg-accent-amber hover:text-background" 
                                : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                            )}
                            title={`Alocar para ${format(d, 'EEEE, d/MM')}`}
                          >
                            {dayLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                    Sem tarefas alocadas
                  </div>
                ) : (
                  dayTasks.map(task => {
                    const proj = projects.find(p => p.id === task.projectId);

                    return (
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
                          <div className="truncate max-w-[100px]">
                            {proj ? (
                              <span style={{ color: proj.color || '#f59e0b' }} className="font-bold truncate">
                                {proj.name}
                              </span>
                            ) : (
                              <span>{task.area.split(' ')[0]}</span>
                            )}
                          </div>
                          <span className="font-mono text-gray-300 shrink-0">{task.timeEstimate}m</span>
                        </div>

                        {/* Ações de Mover entre os dias */}
                        {task.status !== 'completed' && (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity pt-2 flex items-center justify-between text-[10px]">
                            <button 
                              onClick={() => handleMoveTask(task.id!, format(addDays(date, -1), 'yyyy-MM-dd'))}
                              className="text-gray-400 hover:text-white p-0.5"
                              title="Mover para dia anterior"
                            >
                              ←
                            </button>
                            <span className="text-[9px] text-gray-500">Mover</span>
                            <button 
                              onClick={() => handleMoveTask(task.id!, format(addDays(date, 1), 'yyyy-MM-dd'))}
                              className="text-gray-400 hover:text-white p-0.5"
                              title="Mover para próximo dia"
                            >
                              →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
