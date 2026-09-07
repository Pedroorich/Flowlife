import React, { useState, useEffect, useMemo } from 'react';
import { Task, UserProfile, UnforeseenEvent, RoutineBlock, Project } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { 
  Play, 
  Check, 
  Clock, 
  AlertTriangle, 
  Edit2, 
  PlayCircle, 
  Sparkles, 
  Pause, 
  RotateCcw, 
  ArrowRight, 
  AlertCircle,
  Calendar,
  Layers,
  Flame,
  ShieldAlert,
  Coffee,
  Car,
  Trash2,
  Plus
} from 'lucide-react';
import { format, parseISO, isSameDay } from 'date-fns';
import { cn, sendBrowserNotification } from '../lib/utils';
import { 
  notifyTaskStart, 
  notifyTaskWarning5Min, 
  notifyTaskEnd, 
  notifyOverthinking,
  notifyWorkdayEnd,
  notifyTimelineTaskStarting,
  soundEngine
} from '../lib/notificationEngine';
import { buildDailyTimeline, DailyTimelineResult, TimeSlot } from '../lib/smartScheduler';
import { calculateRealPriority } from '../lib/priorityEngine';
import { AIAgent } from '../types';
import { DEFAULT_AI_AGENTS, getAgentById } from '../lib/defaultAgents';
import { TaskCopilotDrawer } from './TaskCopilotDrawer';

interface TodayViewProps {
  profile: UserProfile;
  tasks: Task[];
  unforeseenEvents: UnforeseenEvent[];
  routines?: RoutineBlock[];
  projects?: Project[];
}

export function TodayView({ 
  profile, 
  tasks, 
  unforeseenEvents, 
  routines = [],
  projects = [] 
}: TodayViewProps) {
  const todayDate = useMemo(() => new Date(), []);
  const todayStr = format(todayDate, 'yyyy-MM-dd');

  // Estado da Timeline Inteligente
  const [timeline, setTimeline] = useState<DailyTimelineResult>(() => 
    buildDailyTimeline(todayDate, tasks, profile, routines, unforeseenEvents)
  );
  const [recalcFeedback, setRecalcFeedback] = useState(false);

  const handleReallocateWithDatabaseRoutines = () => {
    const updated = buildDailyTimeline(todayDate, tasks, profile, routines, unforeseenEvents);
    setTimeline(updated);
    setRecalcFeedback(true);
    setTimeout(() => setRecalcFeedback(false), 3000);
  };

  // Timer & Modo Foco State
  const [activeTimer, setActiveTimer] = useState<{ 
    taskId: string; 
    timeLeft: number; 
    totalSeconds: number;
    isPaused: boolean;
  } | null>(null);

  // Overthinking Alert State
  const [showOverthinkingModal, setShowOverthinkingModal] = useState(false);
  const [overthinkingTask, setOverthinkingTask] = useState<Task | null>(null);

  // Modais de Imprevisto e Interrupção
  const [showImprevistoModal, setShowImprevistoModal] = useState(false);
  const [imprevistoDesc, setImprevistoDesc] = useState('');
  const [imprevistoDuration, setImprevistoDuration] = useState(45);

  const [showInterruptionModal, setShowInterruptionModal] = useState(false);
  const [interruptionDesc, setInterruptionDesc] = useState('');
  const [interruptionDuration, setInterruptionDuration] = useState(15);

  // Edição de Tarefa
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});

  // Copiloto IA State (Agente Braço Direito)
  const [copilotTask, setCopilotTask] = useState<Task | null>(null);
  const [copilotAgent, setCopilotAgent] = useState<AIAgent | null>(null);

  const handleOpenCopilot = (task: Task) => {
    const agent = getAgentById(task.assignedAgentId) || DEFAULT_AI_AGENTS[0];
    setCopilotTask(task);
    setCopilotAgent(agent);
  };

  const handleUpdateTaskNotes = async (notes: string) => {
    if (!copilotTask?.id) return;
    await updateDoc(doc(db, 'tasks', copilotTask.id), { notes });
    setCopilotTask(prev => prev ? { ...prev, notes } : null);
  };

  const handleSwitchCopilotAgent = async (newAgentId: string) => {
    const agent = getAgentById(newAgentId);
    if (agent && copilotTask) {
      setCopilotAgent(agent);
      if (copilotTask.id) {
        await updateDoc(doc(db, 'tasks', copilotTask.id), { assignedAgentId: newAgentId });
      }
    }
  };

  // Recalcular Timeline quando tasks, rotinas ou imprevistos mudarem
  useEffect(() => {
    const updated = buildDailyTimeline(todayDate, tasks, profile, routines, unforeseenEvents);
    setTimeline(updated);
  }, [tasks, profile, routines, unforeseenEvents, todayDate]);

  // Sincronizar activeTimer com o dailyState
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTimer && !activeTimer.isPaused && activeTimer.timeLeft > 0) {
      interval = setInterval(() => {
        setActiveTimer(prev => {
          if (!prev) return null;
          const newTimeLeft = prev.timeLeft - 1;
          const elapsed = prev.totalSeconds - newTimeLeft;

          // Checar se atingiu o Limite Máximo (Overthinking)
          const currentTask = tasks.find(t => t.id === prev.taskId);
          const maxAllowedSeconds = (currentTask?.timeMax || currentTask?.timeEstimate * 1.5 || 60) * 60;

          if (elapsed >= maxAllowedSeconds && !showOverthinkingModal && currentTask) {
            setOverthinkingTask(currentTask);
            setShowOverthinkingModal(true);
            notifyOverthinking(currentTask.title, Math.round(maxAllowedSeconds / 60));
          }

          return { ...prev, timeLeft: newTimeLeft };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimer, showOverthinkingModal, tasks]);

  // Checagem de Notificações Locais (5 min e Encerramento)
  useEffect(() => {
    if (!profile.dailyState?.active || !profile.dailyState?.currentTaskId || !activeTimer) return;
    
    const { timeLeft } = activeTimer;
    const task = tasks.find(t => t.id === profile.dailyState?.currentTaskId);
    if (!task) return;

    if (timeLeft <= 300 && timeLeft > 0 && !profile.dailyState.notified5Min) {
      notifyTaskWarning5Min(task.title, profile.webhookUrl5Min || profile.webhookUrl);
      updateDoc(doc(db, 'users', profile.uid), {
        'dailyState.notified5Min': true
      }).catch(console.error);
    } else if (timeLeft <= 0 && !profile.dailyState.notifiedEnd) {
      notifyTaskEnd(task.title, profile.webhookUrlEnd || profile.webhookUrl);
      updateDoc(doc(db, 'users', profile.uid), {
        'dailyState.notifiedEnd': true
      }).catch(console.error);
    }
  }, [activeTimer?.timeLeft, profile.dailyState, tasks, profile.uid, profile.webhookUrl, profile.webhookUrl5Min, profile.webhookUrlEnd]);

  // Handlers para Alocação de Demandas em Hoje
  const [showQuickAddToday, setShowQuickAddToday] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddEstimate, setQuickAddEstimate] = useState(45);
  const [quickAddProjectId, setQuickAddProjectId] = useState('');

  const handlePullNextTaskToToday = async () => {
    const unallocated = tasks.filter(t => 
      t.status === 'pending' && 
      t.dateAllocated !== todayStr &&
      (Boolean(t.projectId) || t.area === 'Trabalho' || t.area === 'Projetos & Ofertas')
    );

    const candidate = unallocated.length > 0 ? unallocated[0] : tasks.find(t => t.status === 'pending' && t.dateAllocated !== todayStr);

    if (!candidate || !candidate.id) {
      alert('Todas as suas tarefas de trabalho já estão alocadas ou concluídas!');
      return;
    }

    try {
      await updateDoc(doc(db, 'tasks', candidate.id), {
        dateAllocated: todayStr
      });
    } catch (e) {
      console.error('Erro ao puxar tarefa para hoje:', e);
    }
  };

  const handleCreateTaskForToday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddTitle.trim()) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        userId: profile.uid,
        title: quickAddTitle.trim(),
        type: 'Tarefa',
        area: 'Trabalho',
        projectId: quickAddProjectId || undefined,
        priority: 'Alta',
        urgency: 4,
        impact: 4,
        timeEstimate: Number(quickAddEstimate) || 45,
        timeMax: Math.round((Number(quickAddEstimate) || 45) * 1.5),
        status: 'pending',
        dateAllocated: todayStr,
        createdAt: new Date().toISOString()
      });

      setQuickAddTitle('');
      setShowQuickAddToday(false);
    } catch (e) {
      console.error('Erro ao criar tarefa para hoje:', e);
    }
  };

  // Iniciar Tarefa no Modo Foco
  const handleStartTask = async (task: Task) => {
    const totalMinutes = task.timeEstimate || 30;
    const endTime = new Date(Date.now() + totalMinutes * 60000).toISOString();

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        dailyState: {
          date: todayStr,
          active: true,
          currentTaskId: task.id,
          taskStartTime: new Date().toISOString(),
          taskEndTime: endTime,
          notified5Min: false,
          notifiedEnd: false
        }
      });

      setActiveTimer({
        taskId: task.id!,
        timeLeft: totalMinutes * 60,
        totalSeconds: totalMinutes * 60,
        isPaused: false
      });

      // Disparar Notificação Sonora e Webhook de Início
      notifyTaskStart(task.title, totalMinutes, profile.webhookUrlStart || profile.webhookUrl);
    } catch (e) {
      console.error("Erro ao iniciar tarefa:", e);
    }
  };

  // Concluir Tarefa com registro de tempo real
  const handleCompleteTask = async (task: Task) => {
    if (!task.id) return;
    try {
      let actualMinutes = task.timeEstimate;
      if (activeTimer && activeTimer.taskId === task.id) {
        const elapsedSeconds = activeTimer.totalSeconds - activeTimer.timeLeft;
        actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
      }

      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'completed',
        dateAllocated: todayStr,
        actualDuration: actualMinutes
      });

      // Atualizar última atividade no projeto (se houver)
      if (task.projectId) {
        await updateDoc(doc(db, 'projects', task.projectId), {
          lastActivityDate: new Date().toISOString()
        }).catch(() => {});
      }

      // Limpar timer se for a tarefa ativa
      if (activeTimer?.taskId === task.id) {
        setActiveTimer(null);
        await updateDoc(doc(db, 'users', profile.uid), {
          'dailyState.currentTaskId': null,
          'dailyState.active': false
        });
      }

      // Tocar som de vitória/conclusão
      soundEngine.play('end');

      sendBrowserNotification('FlowLife', { 
        body: `Tarefa concluída: "${task.title}" em ${actualMinutes} minutos!` 
      });
    } catch (error) {
      console.error("Erro ao concluir tarefa", error);
    }
  };

  // Excluir Tarefa
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir permanentemente esta tarefa?')) return;
    try {
      if (activeTimer?.taskId === taskId) {
        setActiveTimer(null);
        await updateDoc(doc(db, 'users', profile.uid), {
          'dailyState.currentTaskId': null,
          'dailyState.active': false
        });
      }
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (e) {
      console.error("Erro ao excluir tarefa", e);
    }
  };

  // Realocar tarefas que estouram o encerramento das 19:00 para amanhã
  const handleReallocateOverloadToTomorrow = async () => {
    if (timeline.suggestedReallocations.length === 0) return;
    const tomorrowStr = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');

    try {
      for (const t of timeline.suggestedReallocations) {
        if (t.id) {
          await updateDoc(doc(db, 'tasks', t.id), {
            dateAllocated: tomorrowStr
          });
        }
      }
      alert(`${timeline.suggestedReallocations.length} tarefas realocadas para amanhã para manter seu horário de encerramento das 19:00.`);
    } catch (e) {
      console.error("Erro ao realocar tarefas", e);
    }
  };

  // Registrar Imprevisto
  const handleSaveImprevisto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imprevistoDesc || imprevistoDuration <= 0) return;

    try {
      await addDoc(collection(db, 'unforeseen_events'), {
        userId: profile.uid,
        date: todayStr,
        duration: imprevistoDuration,
        description: imprevistoDesc,
        createdAt: new Date().toISOString()
      });
      setShowImprevistoModal(false);
      setImprevistoDesc('');
      setImprevistoDuration(45);
    } catch (error) {
      console.error("Erro ao adicionar imprevisto", error);
    }
  };

  // Registrar Interrupção durante uma tarefa
  const handleSaveInterruption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interruptionDesc || interruptionDuration <= 0) return;

    try {
      await addDoc(collection(db, 'unforeseen_events'), {
        userId: profile.uid,
        date: todayStr,
        duration: interruptionDuration,
        description: `Interrupção: ${interruptionDesc}`,
        createdAt: new Date().toISOString()
      });

      // Se houver timer ativo, adicionar tempo equivalente ou pausar
      if (activeTimer) {
        setActiveTimer(prev => prev ? { ...prev, isPaused: true } : null);
      }

      setShowInterruptionModal(false);
      setInterruptionDesc('');
      setInterruptionDuration(15);
    } catch (error) {
      console.error("Erro ao registrar interrupção", error);
    }
  };

  const formatSeconds = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const completedTodayCount = tasks.filter(t => t.status === 'completed' && t.dateAllocated === todayStr).length;
  const pendingTodayTasks = tasks.filter(t => {
    if (t.status === 'completed') return false;
    return t.dateAllocated === todayStr || (t.deadline && isSameDay(parseISO(t.deadline), todayDate));
  });

  const totalTodayTasks = completedTodayCount + pendingTodayTasks.length;
  const progressPercent = totalTodayTasks === 0 ? 0 : Math.round((completedTodayCount / totalTodayTasks) * 100);

  // Tarefa ativa atual
  const activeTask = activeTimer ? tasks.find(t => t.id === activeTimer.taskId) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* 1. Header Estratégico com Horário de Encerramento */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-accent-amber/20 text-accent-amber border border-accent-amber/30">
              Sistema de Comando Diário
            </span>
            <span className="text-xs text-gray-400">
              {format(todayDate, 'EEEE, d MMMM')}
            </span>
          </div>
          <h2 className="font-serif text-3xl text-white">
            Bom dia, <span className="text-accent-amber">{profile.name.split(' ')[0]}</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Horário inegociável de encerramento: <strong className="text-white">{profile.workEndTime || '19:00'}</strong>.
            Sua saúde e seu tempo pessoal são restrições do sistema.
          </p>
        </div>

        {/* Botões de Ação Imediata */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowInterruptionModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/20 transition-colors text-xs font-medium"
          >
            <Pause className="w-3.5 h-3.5" />
            Interrupção
          </button>
          <button 
            onClick={() => setShowImprevistoModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors text-xs font-medium"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Tive um Imprevisto
          </button>
        </div>
      </div>

      {/* 2. CARD HERO: "O QUE FAZER AGORA?" (Next Action Engine) */}
      <div className="bg-gradient-to-br from-surface to-background border-2 border-accent-amber/40 rounded-2xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.08)] relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-accent-amber/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-accent-amber text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4" />
              O que faz mais sentido você fazer agora?
            </div>

            {activeTask ? (
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-accent-amber/20 text-accent-amber border border-accent-amber/30 text-xs font-semibold mb-2">
                  <span className="w-2 h-2 rounded-full bg-accent-amber animate-ping" />
                  EM ANDAMENTO NO MODO FOCO
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{activeTask.title}</h3>
                <p className="text-sm text-gray-300 line-clamp-2">
                  {activeTask.notes || 'Mantenha o foco profundo até o encerramento do bloco.'}
                </p>
              </div>
            ) : timeline.nextAction ? (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">
                    {timeline.nextAction.task.area}
                  </span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {timeline.nextAction.task.timeEstimate} min
                  </span>
                  {timeline.nextAction.task.projectId && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                      {projects.find(p => p.id === timeline.nextAction?.task.projectId)?.name || 'Projeto'}
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{timeline.nextAction.task.title}</h3>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-gray-300 flex items-start gap-2">
                  <Flame className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
                  <div>
                    <strong>Por que esta tarefa agora?</strong> {timeline.nextAction.reason}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-xl font-medium text-white mb-1">Tudo em dia por enquanto! ✨</h3>
                <p className="text-sm text-gray-400">
                  Nenhuma tarefa pendente precisa da sua atenção imediata agora. Aproveite para descansar ou revisar o Backlog.
                </p>
              </div>
            )}
          </div>

          {/* Botão de Início / Timer Ativo */}
          <div className="flex flex-col items-center justify-center shrink-0">
            {activeTimer && activeTask ? (
              <div className="flex flex-col items-center gap-3">
                <div className="text-4xl font-mono font-bold text-accent-amber tracking-wider">
                  {formatSeconds(activeTimer.timeLeft)}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setActiveTimer(prev => prev ? { ...prev, isPaused: !prev.isPaused } : null)}
                    className="p-2.5 rounded-xl bg-surface border border-border hover:border-gray-500 text-gray-300 transition-colors"
                    title={activeTimer.isPaused ? "Retomar" : "Pausar"}
                  >
                    {activeTimer.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => handleCompleteTask(activeTask)}
                    className="px-5 py-2.5 bg-accent-emerald text-background font-bold rounded-xl hover:bg-emerald-400 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    <Check className="w-4 h-4" /> Concluir Tarefa
                  </button>
                </div>
                {/* Botão Copiloto no Timer Ativo */}
                <button
                  onClick={() => handleOpenCopilot(activeTask)}
                  className="w-full py-2 bg-accent-amber/20 hover:bg-accent-amber/30 border border-accent-amber/40 text-accent-amber rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {activeTask.assignedAgentId 
                    ? `Copiloto: ${getAgentById(activeTask.assignedAgentId)?.name}` 
                    : "Acionar Copiloto IA nesta Tarefa"}
                </button>
              </div>
            ) : timeline.nextAction ? (
              <div className="flex flex-col md:flex-row items-center gap-2">
                <button 
                  onClick={() => handleStartTask(timeline.nextAction!.task)}
                  className="px-8 py-4 bg-accent-amber text-background font-bold text-base rounded-xl hover:bg-amber-400 hover:scale-105 transition-all flex items-center gap-3 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                >
                  <PlayCircle className="w-6 h-6" />
                  Iniciar no Modo Foco
                </button>
                <button
                  onClick={() => handleOpenCopilot(timeline.nextAction!.task)}
                  className="p-4 bg-surface border border-border hover:border-accent-amber text-gray-300 hover:text-accent-amber rounded-xl transition-all"
                  title="Abrir Copiloto IA para planejar a tarefa"
                >
                  <Sparkles className="w-6 h-6" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 3. ALERTA DE AGENDA IMPOSSÍVEL / SOBRECARGA */}
      {timeline.isOverloaded && (
        <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-red-500/20 text-red-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-red-400 mb-1">
                Alerta de Agenda Impossível Detectada
              </h4>
              <p className="text-sm text-red-300/90 leading-relaxed mb-4">
                Você tem <strong>{Math.round(timeline.totalPlannedWorkMinutes / 60 * 10) / 10}h</strong> de trabalho planejado para apenas <strong>{Math.round(timeline.totalAvailableWorkMinutes / 60 * 10) / 10}h</strong> disponíveis antes do encerramento das {profile.workEndTime || '19:00'}.
                Para não sacrificar sua saúde e compromissos, recomendamos realocar o excedente:
              </p>

              <div className="space-y-2 mb-4">
                {timeline.suggestedReallocations.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs bg-red-950/40 border border-red-500/20 px-3 py-2 rounded-lg">
                    <span className="font-medium text-red-200">{t.title}</span>
                    <span className="text-red-400 font-mono">+{t.timeEstimate} min</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleReallocateOverloadToTomorrow}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg text-xs transition-colors flex items-center gap-2"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Mover Excedentes para Amanhã
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Barra de Progresso do Dia */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex justify-between items-center text-xs mb-2">
          <span className="text-gray-400 font-medium">Progresso de Hoje</span>
          <span className="font-mono text-accent-emerald font-bold">
            {completedTodayCount} de {totalTodayTasks} concluídas ({progressPercent}%)
          </span>
        </div>
        <div className="w-full bg-background rounded-full h-2.5 overflow-hidden">
          <div 
            className="bg-accent-emerald h-full transition-all duration-700 ease-out rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 4.5. DEMANDAS DE TRABALHO & TAREFAS DE HOJE */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-accent-amber">
                Foco Prático
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-amber/20 text-accent-amber font-mono font-bold">
                {pendingTodayTasks.length} pendente(s)
              </span>
            </div>
            <h3 className="font-serif text-xl text-white">Demandas & Tarefas de Hoje</h3>
            <p className="text-xs text-gray-400">
              Todas as ações de trabalho, projetos e entregas alocadas para o seu dia.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePullNextTaskToToday}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-xl hover:bg-purple-500/25 transition-all text-xs font-semibold"
              title="Puxar a próxima tarefa pendente do backlog de trabalho para hoje"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Puxar da Semana
            </button>
            <button
              onClick={() => setShowQuickAddToday(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-accent-amber text-background rounded-xl hover:bg-amber-400 transition-all text-xs font-bold shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Demanda
            </button>
          </div>
        </div>

        {/* Modal Rápido de Nova Demanda para Hoje */}
        {showQuickAddToday && (
          <form onSubmit={handleCreateTaskForToday} className="mb-6 p-4 rounded-xl bg-background/90 border border-accent-amber/40 animate-in fade-in space-y-3">
            <div className="text-xs font-bold text-accent-amber">Adicionar Tarefa Direta para Hoje</div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={quickAddTitle}
                onChange={e => setQuickAddTitle(e.target.value)}
                placeholder="Nome da demanda ou entrega..."
                required
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber"
              />
              <input
                type="number"
                value={quickAddEstimate}
                onChange={e => setQuickAddEstimate(Number(e.target.value))}
                min="15"
                step="15"
                placeholder="Duração (min)"
                className="w-28 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber font-mono"
              />
              {projects.length > 0 && (
                <select
                  value={quickAddProjectId}
                  onChange={e => setQuickAddProjectId(e.target.value)}
                  className="bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber"
                >
                  <option value="">Sem Projeto (Geral)</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowQuickAddToday(false)}
                className="px-3 py-1.5 rounded-lg border border-border text-gray-400 hover:text-white text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-accent-amber text-background font-bold rounded-lg text-xs hover:bg-amber-400 transition-colors"
              >
                Salvar para Hoje
              </button>
            </div>
          </form>
        )}

        {/* Lista de Demandas */}
        {pendingTodayTasks.length === 0 && completedTodayCount === 0 ? (
          <div className="py-10 text-center border border-dashed border-border rounded-xl">
            <Layers className="w-10 h-10 text-gray-500 mx-auto mb-2 opacity-50" />
            <div className="text-sm font-medium text-white mb-1">Nenhuma demanda de trabalho alocada para hoje</div>
            <p className="text-xs text-gray-400 max-w-md mx-auto mb-4">
              Você pode puxar tarefas pendentes dos seus projetos ou criar uma nova entrega para organizar o trabalho nas janelas livres do dia.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={handlePullNextTaskToToday}
                className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Puxar Tarefa do Projeto
              </button>
              <button
                onClick={() => setShowQuickAddToday(true)}
                className="px-4 py-2 bg-accent-amber text-background rounded-xl text-xs font-bold hover:bg-amber-400 transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Criar Demanda Agora
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingTodayTasks.map(task => {
              const proj = projects.find(p => p.id === task.projectId);
              const isRunning = activeTimer?.taskId === task.id;

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all",
                    isRunning 
                      ? "bg-accent-amber/10 border-accent-amber shadow-md" 
                      : "bg-background/80 border-border hover:border-gray-600"
                  )}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => handleCompleteTask(task)}
                      className="mt-0.5 w-5 h-5 rounded-lg border border-gray-500 hover:border-accent-emerald hover:bg-accent-emerald/20 flex items-center justify-center text-transparent hover:text-accent-emerald transition-all shrink-0"
                      title="Concluir tarefa"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {proj && (
                          <span 
                            className="text-[10px] px-2 py-0.5 rounded font-bold border"
                            style={{ 
                              backgroundColor: `${proj.color || '#f59e0b'}20`, 
                              borderColor: `${proj.color || '#f59e0b'}40`,
                              color: proj.color || '#f59e0b'
                            }}
                          >
                            {proj.name}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                          {task.area}
                        </span>
                        {task.scheduledStartTime && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {task.scheduledStartTime}
                          </span>
                        )}
                        {isRunning && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-accent-amber text-background animate-pulse">
                            RODANDO AGORA
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-white truncate">{task.title}</h4>
                      {task.notes && (
                        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{task.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span className="font-mono text-xs text-gray-400 mr-1">{task.timeEstimate}m</span>

                    {/* Copiloto IA */}
                    <button
                      onClick={() => handleOpenCopilot(task)}
                      className={cn(
                        "p-2 rounded-xl border transition-all text-xs",
                        task.assignedAgentId 
                          ? "bg-accent-amber/20 border-accent-amber text-accent-amber hover:bg-accent-amber/30" 
                          : "bg-white/5 border-white/10 text-gray-400 hover:text-accent-amber"
                      )}
                      title={task.assignedAgentId ? `Copiloto: ${getAgentById(task.assignedAgentId)?.name}` : "Acionar Copiloto de IA"}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>

                    {/* Iniciar / Pausar Timer */}
                    {!isRunning ? (
                      <button
                        onClick={() => handleStartTask(task)}
                        className="px-3 py-1.5 rounded-xl bg-accent-amber text-background font-bold text-xs hover:bg-amber-400 transition-all flex items-center gap-1 shadow-sm"
                        title="Iniciar no Modo Foco"
                      >
                        <Play className="w-3.5 h-3.5" /> Iniciar
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveTimer(prev => prev ? { ...prev, isPaused: !prev.isPaused } : null)}
                        className="px-3 py-1.5 rounded-xl bg-accent-amber/20 border border-accent-amber text-accent-amber font-bold text-xs"
                      >
                        {activeTimer?.isPaused ? 'Retomar' : 'Pausar'}
                      </button>
                    )}

                    {/* Concluir */}
                    <button
                      onClick={() => handleCompleteTask(task)}
                      className="p-2 rounded-xl bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30 hover:bg-accent-emerald hover:text-background transition-all"
                      title="Marcar como Concluída"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>

                    {/* Excluir */}
                    <button
                      onClick={() => handleDeleteTask(task.id!)}
                      className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. TIMELINE DIÁRIA INTELIGENTE (Visualização Cronológica com Encerramento) */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-serif text-xl text-white">Timeline da sua Rotina</h3>
            <p className="text-xs text-gray-400">
              Rotinas inegociáveis, deslocamentos e blocos de trabalho organizados dinamicamente.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleReallocateWithDatabaseRoutines}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all",
                recalcFeedback 
                  ? "bg-accent-emerald/20 border-accent-emerald text-accent-emerald" 
                  : "bg-white/5 border-white/10 hover:border-accent-amber text-gray-300 hover:text-white"
              )}
              title="Consultar rotinas do banco de dados e realocar tarefas nos blocos livres"
            >
              <RotateCcw className={cn("w-3.5 h-3.5 text-accent-amber", recalcFeedback && "animate-spin")} />
              <span>{recalcFeedback ? "Rotinas do Banco Sincronizadas!" : "Realocar com Rotinas do Banco"}</span>
            </button>

            <div className="text-xs text-gray-500 font-mono hidden sm:inline">
              {timeline.slots.length} blocos mapeados
            </div>
          </div>
        </div>

        <div className="space-y-3 relative before:absolute before:top-3 before:bottom-3 before:left-8 before:w-0.5 before:bg-border">
          {timeline.slots.map((slot) => {
            const isCutoff = slot.type === 'boundary';
            const isRoutine = slot.type === 'routine' || slot.type === 'meal';
            const isTransit = slot.type === 'transit';
            const isTask = slot.type === 'task' || slot.type === 'fixed_commitment';
            const isRunning = activeTimer?.taskId === slot.taskId;

            return (
              <div 
                key={slot.id} 
                className={cn(
                  "relative pl-14 transition-all",
                  isCutoff && "my-6"
                )}
              >
                {/* Marcador do Ponto na Linha do Tempo */}
                <div className={cn(
                  "absolute left-6 top-3.5 -translate-x-1/2 w-4 h-4 rounded-full border-2 bg-background flex items-center justify-center text-[9px] font-bold z-10",
                  isCutoff ? "border-red-500 bg-red-500 text-white w-5 h-5 left-6" :
                  isRunning ? "border-accent-amber bg-accent-amber animate-ping" :
                  isRoutine ? "border-purple-500 text-purple-400" :
                  isTransit ? "border-blue-400 text-blue-400" :
                  "border-accent-emerald text-accent-emerald"
                )} />

                {/* Bloco de Encerramento Inegociável */}
                {isCutoff ? (
                  <div className="bg-red-500/10 border-2 border-dashed border-red-500/40 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="w-5 h-5 text-red-400" />
                      <div>
                        <div className="text-sm font-bold text-red-400">{slot.title}</div>
                        <div className="text-xs text-red-300/80">A partir deste horário, nenhum novo trabalho é alocado. Hora de descanso e vida pessoal.</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-red-400 text-sm">{slot.startTime}</span>
                  </div>
                ) : isTransit ? (
                  /* Deslocamento */
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-blue-300">
                    <div className="flex items-center gap-2">
                      <Car className="w-3.5 h-3.5 text-blue-400" />
                      <span>{slot.title}</span>
                    </div>
                    <span className="font-mono text-gray-400">{slot.startTime} – {slot.endTime} ({slot.durationMinutes}m)</span>
                  </div>
                ) : isRoutine ? (
                  /* Rotina Estrutural (Treino, Igreja, Almoço) */
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                        {slot.type === 'meal' ? <Coffee className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{slot.title}</div>
                        <div className="text-xs text-purple-400">{slot.area} • Bloco Inegociável</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-gray-300">{slot.startTime} – {slot.endTime}</div>
                      <div className="text-[11px] text-gray-500">{slot.durationMinutes} min</div>
                    </div>
                  </div>
                ) : (
                  /* Tarefa Flexível ou Fixa */
                  <div className={cn(
                    "bg-background/80 border rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3",
                    isRunning ? "border-accent-amber shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-accent-amber" :
                    slot.isCompleted ? "border-border/40 opacity-60" : "border-border hover:border-gray-600"
                  )}>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300 font-medium">
                          {slot.area}
                        </span>
                        {slot.task?.projectId && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {projects.find(p => p.id === slot.task?.projectId)?.name || 'Projeto'}
                          </span>
                        )}
                        {slot.priorityScore && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-accent-amber/15 text-accent-amber border border-accent-amber/25 font-mono font-medium">
                            Score: {slot.priorityScore}
                          </span>
                        )}
                        {isRunning && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-accent-amber text-background font-bold animate-pulse">
                            RODANDO AGORA
                          </span>
                        )}
                      </div>
                      <h4 className={cn("text-base font-medium text-white", slot.isCompleted && "line-through text-gray-400")}>
                        {slot.title}
                      </h4>
                      {slot.task?.assignedAgentId && (
                        <div className="mt-1">
                          <button
                            onClick={() => handleOpenCopilot(slot.task!)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-amber/15 text-accent-amber border border-accent-amber/30 hover:bg-accent-amber/25 transition-all"
                          >
                            <Sparkles className="w-3 h-3 text-accent-amber" />
                            {getAgentById(slot.task.assignedAgentId)?.name || 'Agente Copiloto'}
                          </button>
                        </div>
                      )}
                      {slot.explanation && (
                        <p className="text-xs text-gray-400 mt-1">{slot.explanation}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-center">
                      <div className="text-right">
                        <div className="font-mono text-sm text-gray-300">{slot.startTime} – {slot.endTime}</div>
                        <div className="text-[11px] text-gray-500">{slot.durationMinutes} min planejados</div>
                      </div>

                      {slot.task && !slot.isCompleted && (
                        <div className="flex items-center gap-2">
                          {/* Botão Copiloto IA */}
                          <button
                            onClick={() => handleOpenCopilot(slot.task!)}
                            className={cn(
                              "apple-press p-2.5 rounded-xl border transition-all flex items-center justify-center",
                              slot.task.assignedAgentId 
                                ? "bg-accent-amber/20 border-accent-amber text-accent-amber hover:bg-accent-amber/30 shadow-sm" 
                                : "bg-white/5 border-white/10 text-gray-400 hover:text-accent-amber hover:border-accent-amber/30"
                            )}
                            title={slot.task.assignedAgentId ? `Abrir ${getAgentById(slot.task.assignedAgentId)?.name}` : "Acionar Copiloto de IA"}
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>

                          {!isRunning ? (
                            <button 
                              onClick={() => handleStartTask(slot.task!)}
                              className="p-2.5 rounded-lg bg-surface border border-border hover:border-accent-amber hover:text-accent-amber text-gray-300 transition-colors"
                              title="Iniciar no Modo Foco"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          ) : (
                            <button 
                              onClick={() => setActiveTimer(prev => prev ? { ...prev, isPaused: !prev.isPaused } : null)}
                              className="p-2.5 rounded-lg bg-accent-amber/20 border border-accent-amber text-accent-amber"
                              title={activeTimer?.isPaused ? "Retomar" : "Pausar"}
                            >
                              {activeTimer?.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                            </button>
                          )}

                          <button 
                            onClick={() => handleCompleteTask(slot.task!)}
                            className="apple-press p-2.5 rounded-xl bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30 hover:bg-accent-emerald hover:text-background transition-all"
                            title="Marcar como Concluída"
                          >
                            <Check className="w-4 h-4" />
                          </button>

                          <button 
                            onClick={() => handleDeleteTask(slot.task!.id!)}
                            className="apple-press p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
                            title="Excluir Tarefa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. MODAL ANTI-OVERTHINKING (Alerta de Limite Máximo) */}
      {showOverthinkingModal && overthinkingTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-surface border-2 border-accent-amber rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-accent-amber mb-3">
              <ShieldAlert className="w-7 h-7" />
              <h3 className="text-xl font-bold">Atenção ao Overthinking / Limite de Tempo</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed mb-6">
              Você atingiu o tempo máximo estipulado para <strong>"{overthinkingTask.title}"</strong>.
              Continuar indefinidamente nesta tarefa sacrificará outras áreas do seu dia e comprometerá seu horário de encerramento às {profile.workEndTime || '19:00'}.
            </p>

            <div className="space-y-3">
              <button 
                onClick={() => {
                  handleCompleteTask(overthinkingTask);
                  setShowOverthinkingModal(false);
                }}
                className="w-full py-3 bg-accent-emerald hover:bg-emerald-400 text-background font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Concluir e Entregar como Está
              </button>

              <button 
                onClick={async () => {
                  // Concluir bloco atual e criar continuação para amanhã
                  const tomorrowStr = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
                  await addDoc(collection(db, 'tasks'), {
                    title: `${overthinkingTask.title} (Continuação)`,
                    type: overthinkingTask.type,
                    area: overthinkingTask.area,
                    priority: overthinkingTask.priority,
                    timeEstimate: 30,
                    status: 'pending',
                    dateAllocated: tomorrowStr,
                    userId: profile.uid,
                    createdAt: new Date().toISOString()
                  });
                  await handleCompleteTask(overthinkingTask);
                  setShowOverthinkingModal(false);
                  alert('Restante da tarefa realocado para amanhã!');
                }}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors"
              >
                Pausar e Realocar Restante para Amanhã
              </button>

              <button 
                onClick={() => {
                  if (activeTimer) {
                    setActiveTimer(prev => prev ? { ...prev, timeLeft: prev.timeLeft + 15 * 60 } : null);
                  }
                  setShowOverthinkingModal(false);
                }}
                className="w-full py-2.5 border border-border text-gray-400 hover:text-white rounded-xl text-xs transition-colors"
              >
                Estender apenas +15 min (Tolerância Final)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal de Registro de Interrupção */}
      {showInterruptionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-2">Reportar Interrupção</h3>
            <p className="text-xs text-gray-400 mb-6">
              Surgiu uma ligação urgente, colega chamou ou demanda rápida? Registre e o FlowLife recalculará o restante do dia.
            </p>

            <form onSubmit={handleSaveInterruption} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">O que interrompeu você?</label>
                <input 
                  type="text" 
                  value={interruptionDesc}
                  onChange={e => setInterruptionDesc(e.target.value)}
                  required
                  placeholder="Ex: Ligação de cliente, alinhamento rápido..."
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-amber"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Duração estimada (minutos)</label>
                <input 
                  type="number" 
                  min="5" 
                  step="5"
                  value={interruptionDuration}
                  onChange={e => setInterruptionDuration(Number(e.target.value))}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-amber"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setShowInterruptionModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-gray-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-background font-bold rounded-lg text-sm transition-colors"
                >
                  Registrar e Recalcular
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal de Imprevisto Maior */}
      {showImprevistoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-2">Registrar Imprevisto</h3>
            <p className="text-xs text-gray-400 mb-6">
              Aconteceu algo fora do planejado? O sistema deduz essa capacidade e realoca o que não couber até as {profile.workEndTime || '19:00'}.
            </p>

            <form onSubmit={handleSaveImprevisto} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">O que aconteceu?</label>
                <input 
                  type="text" 
                  value={imprevistoDesc}
                  onChange={e => setImprevistoDesc(e.target.value)}
                  required
                  placeholder="Ex: Pneu furou, reunião de emergência..."
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Tempo perdido (minutos)</label>
                <input 
                  type="number" 
                  min="15" 
                  step="15"
                  value={imprevistoDuration}
                  onChange={e => setImprevistoDuration(Number(e.target.value))}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setShowImprevistoModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-gray-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm transition-colors"
                >
                  Registrar e Otimizar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. Drawer do Copiloto de IA */}
      {copilotTask && copilotAgent && (
        <TaskCopilotDrawer
          task={copilotTask}
          agent={copilotAgent}
          isOpen={!!copilotTask}
          onClose={() => setCopilotTask(null)}
          onUpdateTaskNotes={handleUpdateTaskNotes}
          availableAgents={DEFAULT_AI_AGENTS}
          profile={profile}
          onSwitchAgent={handleSwitchCopilotAgent}
        />
      )}
    </div>
  );
}
