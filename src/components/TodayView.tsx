import React, { useState, useEffect } from 'react';
import { Task, UserProfile, UnforeseenEvent, LifeArea, Priority } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { Play, Check, Clock, AlertCircle, AlertTriangle, Edit2, PlayCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn, sendBrowserNotification } from '../lib/utils';
import { distributeTasks } from '../lib/scheduler';

interface TodayViewProps {
  profile: UserProfile;
  tasks: Task[];
  unforeseenEvents: UnforeseenEvent[];
}

export function TodayView({ profile, tasks, unforeseenEvents }: TodayViewProps) {
  const [activeTimer, setActiveTimer] = useState<{ taskId: string, timeLeft: number } | null>(null);
  const [schedule, setSchedule] = useState<Record<string, Task[]>>({});
  
  // Imprevisto State
  const [showImprevistoModal, setShowImprevistoModal] = useState(false);
  const [imprevistoDesc, setImprevistoDesc] = useState('');
  const [imprevistoDuration, setImprevistoDuration] = useState(60);

  // Edit Task State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});

  useEffect(() => {
    const newSchedule = distributeTasks(tasks, profile.dailyCapacity, unforeseenEvents);
    setSchedule(newSchedule);
  }, [tasks, profile.dailyCapacity, unforeseenEvents]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaysTasks = schedule[todayStr] || [];
  
  const overdueTasks = tasks.filter(t => 
    t.status === 'pending' && 
    parseISO(t.deadline || t.endDate || '2099-01-01').getTime() < new Date().setHours(0,0,0,0) &&
    !todaysTasks.find(td => td.id === t.id)
  );

  const allTodayTasks = [...overdueTasks, ...todaysTasks];
  
  const completedToday = tasks.filter(t => 
    t.status === 'completed' && 
    t.dateAllocated === todayStr
  ).length;

  const totalToday = allTodayTasks.length + completedToday;
  const progress = totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100);

  const isDayActive = profile.dailyState?.date === todayStr && profile.dailyState?.active === true;

  // Sincronizar o activeTimer com o dailyState se aplicável
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTimer && activeTimer.timeLeft > 0) {
      interval = setInterval(() => {
        setActiveTimer(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimer]);

  useEffect(() => {
    if (isDayActive && profile.dailyState?.currentTaskId && profile.dailyState?.taskEndTime) {
      const msLeft = parseISO(profile.dailyState.taskEndTime).getTime() - Date.now();
      if (msLeft > 0) {
        if (!activeTimer || activeTimer.taskId !== profile.dailyState.currentTaskId) {
          setActiveTimer({ taskId: profile.dailyState.currentTaskId, timeLeft: Math.floor(msLeft / 1000) });
        }
      } else {
        // Tempo expirado, mantenha como zero até o usuário confirmar
        if (!activeTimer || activeTimer.taskId !== profile.dailyState.currentTaskId) {
          setActiveTimer({ taskId: profile.dailyState.currentTaskId, timeLeft: 0 });
        }
      }
    }
  }, [profile.dailyState, isDayActive]);

  // Checagem de notificações locais para o timer ativo
  useEffect(() => {
    if (!isDayActive || !profile.dailyState?.currentTaskId || !activeTimer) return;
    
    const { timeLeft } = activeTimer;
    const task = allTodayTasks.find(t => t.id === profile.dailyState.currentTaskId);
    if (!task) return;

    if (timeLeft <= 300 && timeLeft > 0 && !profile.dailyState.notified5Min) {
      sendBrowserNotification('FlowLife', { body: `Faltam 5 minutos para encerrar a tarefa: ${task.title}` });
      updateDoc(doc(db, 'users', profile.uid), {
        'dailyState.notified5Min': true
      }).catch(console.error);
    } else if (timeLeft <= 0 && !profile.dailyState.notifiedEnd) {
      sendBrowserNotification('FlowLife', { body: `Tarefa "${task.title}" encerrada. Retorne ao app para começar a próxima!` });
      updateDoc(doc(db, 'users', profile.uid), {
        'dailyState.notifiedEnd': true
      }).catch(console.error);
    }
  }, [activeTimer?.timeLeft, profile.dailyState, isDayActive, allTodayTasks, profile.uid]);

  const startTask = async (task: Task) => {
    const endTime = new Date(Date.now() + task.timeEstimate * 60000).toISOString();
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        'dailyState.currentTaskId': task.id,
        'dailyState.taskEndTime': endTime,
        'dailyState.notified5Min': false,
        'dailyState.notifiedEnd': false
      });
      setActiveTimer({ taskId: task.id!, timeLeft: task.timeEstimate * 60 });
      
      // Notificação local
      sendBrowserNotification('FlowLife', { body: `Iniciando tarefa: ${task.title}` });
      
      // Fire webhook
      if (profile.webhookUrlStart) {
         fetch(profile.webhookUrlStart, {
           method: 'POST',
           mode: 'no-cors',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ evento: "atividadeIniciada", tarefa: task.title })
         }).catch(console.error);
      }
    } catch (error) {
      console.error("Error starting task", error);
    }
  };

  const startDay = async () => {
    if (allTodayTasks.length === 0) return;
    const firstTask = allTodayTasks[0];
    const endTime = new Date(Date.now() + firstTask.timeEstimate * 60000).toISOString();
    
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        dailyState: {
          date: todayStr,
          active: true,
          currentTaskId: firstTask.id,
          taskEndTime: endTime,
          notified5Min: false,
          notifiedEnd: false
        }
      });
      setActiveTimer({ taskId: firstTask.id!, timeLeft: firstTask.timeEstimate * 60 });

      // Notificação local
      sendBrowserNotification('FlowLife', { body: `Iniciando o dia. Primeira tarefa: ${firstTask.title}` });

      if (profile.webhookUrlStart) {
         fetch(profile.webhookUrlStart, {
           method: 'POST',
           mode: 'no-cors',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ evento: "diaIniciado", tarefa: firstTask.title })
         }).catch(console.error);
      }
    } catch (e) {
      console.error("Error starting day", e);
    }
  };

  const handleStartTimer = (task: Task) => {
    if (activeTimer?.taskId === task.id) {
      // Pause is not fully supported with global taskEndTime yet, but we will reset activeTimer locally
      setActiveTimer(null);
    } else {
      startTask(task);
    }
  };

  const handleComplete = async (task: Task) => {
    if (!task.id) return;
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'completed',
        dateAllocated: todayStr
      });
      
      const newAllTasks = allTodayTasks.filter(t => t.id !== task.id);
      
      if (activeTimer?.taskId === task.id) {
        if (newAllTasks.length > 0) {
          // Iniciar proxima tarefa automaticamente
          const nextTask = newAllTasks[0];
          await startTask(nextTask);
        } else {
          // Limpa estado
          await updateDoc(doc(db, 'users', profile.uid), {
            'dailyState.currentTaskId': null,
            'dailyState.active': false
          });
          setActiveTimer(null);
        }
      }
    } catch (error) {
      console.error("Error completing task", error);
    }
  };

  const handleAddImprevisto = async (e: React.FormEvent) => {
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
      setImprevistoDuration(60);
    } catch (error) {
      console.error("Error adding unforeseen event", error);
    }
  };

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      area: task.area,
      priority: task.priority,
      timeEstimate: task.timeEstimate,
      notes: task.notes || ''
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask?.id) return;
    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        title: editForm.title,
        area: editForm.area,
        priority: editForm.priority,
        timeEstimate: Number(editForm.timeEstimate),
        notes: editForm.notes || '',
      });
      setEditingTask(null);
    } catch (error) {
      console.error("Error updating task", error);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const areaColors: Record<string, string> = {
    "Trabalho": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "Estudos": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "Saúde & Bem-estar": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "Finanças": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "Casa & Família": "bg-pink-500/20 text-pink-400 border-pink-500/30",
    "Projetos Pessoais": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    "Social & Relacionamentos": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "Outro": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const todayEvents = unforeseenEvents.filter(e => e.date === todayStr);
  const lostTime = todayEvents.reduce((acc, e) => acc + e.duration, 0);

  return (
    <div className="max-w-3xl mx-auto relative">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl mb-2 text-accent-amber">Bom dia, {profile.name.split(' ')[0]}!</h2>
          <p className="text-gray-400">
            Você tem {allTodayTasks.length} tarefas pendentes hoje. 
            {progress === 100 && totalToday > 0 ? " Excelente trabalho!" : " Vamos ao foco."}
          </p>
        </div>
        <button 
          onClick={() => setShowImprevistoModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium"
        >
          <AlertTriangle className="w-4 h-4" />
          Tive um Imprevisto
        </button>
      </div>

      {lostTime > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-400 font-medium">Imprevistos registrados hoje</h4>
            <p className="text-sm text-red-400/80">
              Você perdeu {Math.floor(lostTime / 60)}h {lostTime % 60}m hoje. O FlowLife já otimizou e redistribuiu suas tarefas para compensar isso.
            </p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">Progresso do dia</span>
          <span className="font-medium">{completedToday} de {totalToday} concluídas ({progress}%)</span>
        </div>
        <div className="w-full bg-background rounded-full h-3 overflow-hidden">
          <div 
            className="bg-accent-emerald h-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Task List or Block Screen */}
      <div className="space-y-4">
        {allTodayTasks.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-xl font-medium mb-2">Tudo limpo por aqui!</h3>
            <p className="text-gray-400">Você não tem tarefas agendadas para hoje.</p>
          </div>
        ) : !isDayActive ? (
          <div className="flex flex-col items-center justify-center py-16 bg-surface border border-border rounded-xl px-4 text-center">
            <div className="w-16 h-16 bg-accent-amber/20 rounded-full flex items-center justify-center mb-6">
              <PlayCircle className="w-8 h-8 text-accent-amber" />
            </div>
            <h3 className="font-serif text-2xl text-accent-amber mb-2">Pronto para começar?</h3>
            <p className="text-gray-400 max-w-sm mb-8">
              Suas tarefas do dia estão programadas. Quando clicar em Iniciar, os temporizadores e automações de webhook começarão a contar.
            </p>
            <button 
              onClick={startDay}
              className="px-8 py-4 bg-accent-amber text-background rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-[0_0_20px_rgba(245,158,11,0.2)]"
            >
              Iniciar Atividades
            </button>
          </div>
        ) : (
          allTodayTasks.map(task => {
            const isOverdue = parseISO(task.deadline || task.endDate || '2099-01-01').getTime() < new Date().setHours(0,0,0,0);
            const isActive = activeTimer?.taskId === task.id;
            
            return (
              <div 
                key={task.id} 
                className={cn(
                  "bg-surface border rounded-xl p-4 md:p-6 transition-all",
                  isActive ? "border-accent-amber shadow-[0_0_15px_rgba(245,158,11,0.1)]" : "border-border hover:border-gray-600"
                )}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={cn("text-xs px-2 py-1 rounded border", areaColors[task.area] || areaColors["Outro"])}>
                        {task.area}
                      </span>
                      {isOverdue && (
                        <span className="text-xs px-2 py-1 rounded border bg-red-500/20 text-red-400 border-red-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Atrasado
                        </span>
                      )}
                      {task.isFixed && (
                        <span className="text-xs px-2 py-1 rounded border bg-blue-500/20 text-blue-400 border-blue-500/30">
                          Fixo
                        </span>
                      )}
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {task.timeEstimate} min
                      </span>
                    </div>
                    <h3 className="text-lg font-medium">{task.title}</h3>
                    {task.notes && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{task.notes}</p>}
                  </div>

                  <div className="flex items-center gap-2 md:gap-3">
                    {isActive ? (
                      <div className="flex flex-col md:flex-row items-center gap-3 bg-background px-4 py-2 rounded-lg border border-accent-amber">
                        <span className={cn("font-mono text-xl", activeTimer.timeLeft === 0 ? "text-red-500 animate-pulse" : "text-accent-amber")}>
                          {formatTime(activeTimer.timeLeft)}
                        </span>
                        {activeTimer.timeLeft === 0 && (
                          <span className="text-xs text-red-500 font-medium">Tempo esgotado!</span>
                        )}
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleStartTimer(task)}
                        className="p-3 rounded-lg bg-background border border-border hover:border-accent-amber hover:text-accent-amber transition-colors"
                        title="Iniciar Timer"
                      >
                        <Play className="w-5 h-5" />
                      </button>
                    )}
                    
                    {!isActive && (
                      <button 
                        onClick={() => handleEditClick(task)}
                        className="p-3 rounded-lg bg-background border border-border hover:border-blue-400 hover:text-blue-400 transition-colors"
                        title="Editar Tarefa"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                    )}

                    <button 
                      onClick={() => handleComplete(task)}
                      className="p-3 rounded-lg bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/30 hover:bg-accent-emerald hover:text-background transition-colors"
                      title="Concluir"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Edição de Tarefa */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
            <h3 className="text-xl font-medium mb-6">Editar Tarefa</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Título</label>
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={e => setEditForm({...editForm, title: e.target.value})}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Área</label>
                  <select
                    value={editForm.area || ''}
                    onChange={e => setEditForm({...editForm, area: e.target.value as LifeArea})}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                  >
                    {profile.activeAreas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Prioridade</label>
                  <select
                    value={editForm.priority || ''}
                    onChange={e => setEditForm({...editForm, priority: e.target.value as Priority})}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                  >
                    {["Alta", "Média", "Baixa"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Tempo Estimado (min)</label>
                <input
                  type="number"
                  min="5" step="5"
                  value={editForm.timeEstimate || 0}
                  onChange={e => setEditForm({...editForm, timeEstimate: Number(e.target.value)})}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Notas</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={e => setEditForm({...editForm, notes: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber min-h-[80px]"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="flex-1 py-3 rounded-lg border border-border hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-lg bg-accent-amber text-background font-medium hover:bg-amber-400 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Imprevisto */}
      {showImprevistoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
            <h3 className="text-xl font-medium mb-2">Registrar Imprevisto</h3>
            <p className="text-sm text-gray-400 mb-6">
              Aconteceu algo fora do planejado? Registre o tempo perdido e nós reorganizaremos o resto do seu mês.
            </p>
            
            <form onSubmit={handleAddImprevisto} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">O que aconteceu?</label>
                <input 
                  type="text" 
                  value={imprevistoDesc}
                  onChange={e => setImprevistoDesc(e.target.value)}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-red-500"
                  placeholder="Ex: Reunião de emergência, pneu furou..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Quanto tempo custou? (minutos)</label>
                <input 
                  type="number" 
                  min="15" step="15"
                  value={imprevistoDuration}
                  onChange={e => setImprevistoDuration(Number(e.target.value))}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowImprevistoModal(false)}
                  className="flex-1 py-3 rounded-lg border border-border hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={!imprevistoDesc}
                  className="flex-1 py-3 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
