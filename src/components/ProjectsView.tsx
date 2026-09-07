import React, { useState } from 'react';
import { Project, Task, LifeArea, UserProfile, RoutineBlock, UnforeseenEvent } from '../types';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { 
  FolderKanban, 
  Plus, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  Layers, 
  Check, 
  Trash2, 
  Calendar, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { analyzeProjectsHealth } from '../lib/adaptiveLearning';
import { distributeWorkAcrossWeek } from '../lib/smartScheduler';
import { format, addDays, startOfWeek } from 'date-fns';
import { cn } from '../lib/utils';

interface ProjectsViewProps {
  profile: UserProfile;
  projects: Project[];
  tasks: Task[];
  routines?: RoutineBlock[];
  unforeseenEvents?: UnforeseenEvent[];
}

export function ProjectsView({ 
  profile, 
  projects, 
  tasks, 
  routines = [], 
  unforeseenEvents = [] 
}: ProjectsViewProps) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectArea, setProjectArea] = useState<LifeArea>('Projetos & Ofertas');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectColor, setProjectColor] = useState('#f59e0b');

  // Adição rápida de tarefa dentro do projeto
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskEstimate, setNewTaskEstimate] = useState(45);
  const [addingTaskForProjectId, setAddingTaskForProjectId] = useState<string | null>(null);

  // Status de sincronização
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const healthList = analyzeProjectsHealth(projects, tasks);
  const stalledProjects = healthList.filter(h => h.isStalled);

  // Dias da semana para o seletor de alocação rápida
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Segunda
  const weekOptions = Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(currentWeekStart, i);
    const dateKey = format(d, 'yyyy-MM-dd');
    const label = format(d, 'EEE (d/MM)');
    return { dateKey, label };
  });

  // Criar Projeto
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    try {
      await addDoc(collection(db, 'projects'), {
        userId: profile.uid,
        name: projectName.trim(),
        area: projectArea,
        description: projectDesc.trim(),
        color: projectColor,
        status: 'active',
        lastActivityDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      setProjectName('');
      setProjectDesc('');
      setShowNewProjectModal(false);
    } catch (e) {
      console.error("Erro ao criar projeto", e);
    }
  };

  // Pausar / Reativar Projeto
  const handleToggleProjectStatus = async (project: Project) => {
    if (!project.id) return;
    const nextStatus = project.status === 'active' ? 'paused' : 'active';
    try {
      await updateDoc(doc(db, 'projects', project.id), {
        status: nextStatus
      });
    } catch (e) {
      console.error("Erro ao atualizar status", e);
    }
  };

  // Adicionar Tarefa ao Projeto
  const handleAddTaskToProject = async (projectId: string) => {
    if (!newTaskTitle.trim()) return;

    const proj = projects.find(p => p.id === projectId);

    try {
      await addDoc(collection(db, 'tasks'), {
        userId: profile.uid,
        title: newTaskTitle.trim(),
        type: 'Tarefa',
        area: proj?.area || 'Trabalho',
        projectId,
        priority: 'Alta',
        urgency: 4,
        impact: 4,
        timeEstimate: Number(newTaskEstimate) || 45,
        timeMax: Math.round((Number(newTaskEstimate) || 45) * 1.5),
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      setNewTaskTitle('');
      setAddingTaskForProjectId(null);
    } catch (e) {
      console.error("Erro ao adicionar tarefa ao projeto", e);
    }
  };

  // Mudar dia alocado da tarefa
  const handleChangeTaskDate = async (taskId: string, targetDateStr: string) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        dateAllocated: targetDateStr || null
      });
    } catch (e) {
      console.error("Erro ao alocar data da tarefa", e);
    }
  };

  // Concluir / Desconcluir Tarefa
  const handleToggleCompleteTask = async (task: Task) => {
    if (!task.id) return;
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: nextStatus,
        dateAllocated: nextStatus === 'completed' ? (task.dateAllocated || format(new Date(), 'yyyy-MM-dd')) : task.dateAllocated
      });
    } catch (e) {
      console.error("Erro ao alterar status da tarefa", e);
    }
  };

  // Excluir Tarefa
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir permanentemente esta tarefa?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (e) {
      console.error("Erro ao excluir tarefa", e);
    }
  };

  // Sincronizar Tarefas com a Semana (Global ou por Projeto)
  const handleSyncWorkWithWeek = async (targetProjectId?: string) => {
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const result = distributeWorkAcrossWeek(
        tasks,
        profile,
        routines,
        unforeseenEvents,
        targetProjectId,
        new Date()
      );

      if (result.allocations.length === 0) {
        setSyncMessage('Nenhuma tarefa pendente de trabalho precisava ser alocada.');
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
      setSyncMessage(`⚡ ${result.allocations.length} tarefas de trabalho sincronizadas e distribuídas pelos dias úteis da semana!`);
      setTimeout(() => setSyncMessage(null), 6000);
    } catch (e) {
      console.error("Erro na sincronização de trabalho", e);
      setSyncMessage('Erro ao sincronizar tarefas com a semana.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header com Ações Estratégicas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
            <FolderKanban className="w-4 h-4" />
            Gestão & Sincronização Semanal de Trabalho
          </div>
          <h2 className="font-serif text-3xl text-white">Suas Operações & Ofertas</h2>
          <p className="text-sm text-gray-400">
            Trabalho conectado aos dias da semana: veja demandas, distribua na agenda e acompanhe o progresso.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleSyncWorkWithWeek()}
            disabled={isSyncing}
            className="px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 rounded-xl transition-all flex items-center gap-2 text-xs font-bold shadow-md hover:scale-105"
            title="Distribuir automaticamente todas as tarefas de trabalho nos dias úteis da semana"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-purple-300", isSyncing && "animate-spin")} />
            Sincronizar Todo o Trabalho na Semana
          </button>

          <button 
            onClick={() => setShowNewProjectModal(true)}
            className="px-4 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-colors flex items-center gap-2 text-xs"
          >
            <Plus className="w-4 h-4" /> Novo Projeto / Oferta
          </button>
        </div>
      </div>

      {/* Banner de Feedback de Sincronização */}
      {syncMessage && (
        <div className="bg-accent-emerald/15 border-2 border-accent-emerald/40 text-accent-emerald p-4 rounded-2xl text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{syncMessage}</span>
          </div>
          <span className="text-[11px] text-accent-emerald/80">Confira nas abas Hoje e Semana!</span>
        </div>
      )}

      {/* Alerta de Abandono de Projetos */}
      {stalledProjects.length > 0 && (
        <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-5 animate-in fade-in">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-accent-amber shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-accent-amber mb-1">
                Alerta de Projetos Parados / Sem Atividade Recente
              </h4>
              <p className="text-sm text-gray-300 mb-3">
                Identificamos projetos que não recebem conclusões há mais de 7 dias. Deseja sincronizá-los com a semana ou pausá-los?
              </p>
              <div className="flex flex-wrap gap-2">
                {stalledProjects.map(h => (
                  <span 
                    key={h.project.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-background/80 border border-amber-500/30 text-xs text-amber-200"
                  >
                    <strong>{h.project.name}</strong> • parado há {h.daysSinceLastActivity} dias
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid de Projetos Interativos com Tarefas */}
      <div className="grid grid-cols-1 gap-6">
        {healthList.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border rounded-2xl">
            <FolderKanban className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-1">Nenhum projeto cadastrado ainda</h3>
            <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">
              Cadastre suas ofertas validadas, canais de conteúdo ou operações para distribuir tarefas ao longo da semana.
            </p>
            <button 
              onClick={() => setShowNewProjectModal(true)}
              className="px-4 py-2 bg-accent-amber text-background font-bold rounded-lg text-sm"
            >
              Criar Primeiro Projeto
            </button>
          </div>
        ) : (
          healthList.map(h => {
            const project = h.project;
            const isExpanded = expandedProjectId === project.id;
            const projectTasks = tasks.filter(t => t.projectId === project.id);
            const pendingTasks = projectTasks.filter(t => t.status === 'pending');
            const completedTasks = projectTasks.filter(t => t.status === 'completed');

            return (
              <div 
                key={project.id}
                className={cn(
                  "bg-surface border rounded-2xl overflow-hidden transition-all",
                  h.isStalled ? "border-amber-500/40" : "border-border",
                  isExpanded ? "ring-1 ring-accent-amber/40 shadow-xl" : "hover:border-gray-500"
                )}
              >
                {/* Header do Card de Projeto */}
                <div className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: project.color || '#f59e0b' }}
                      />
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          {project.name}
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-medium",
                            project.status === 'active' ? "bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30" : "bg-gray-500/20 text-gray-400"
                          )}>
                            {project.status === 'active' ? 'Ativo' : 'Pausado'}
                          </span>
                        </h3>
                        <span className="text-xs text-gray-400">{project.area}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSyncWorkWithWeek(project.id)}
                        className="px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-all text-xs font-semibold flex items-center gap-1.5"
                        title="Distribuir pendências deste projeto nos dias úteis da semana"
                      >
                        <RefreshCw className="w-3 h-3 text-purple-400" /> Sincronizar na Semana
                      </button>

                      <button
                        onClick={() => setExpandedProjectId(prev => prev === project.id ? null : project.id!)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 text-xs font-medium flex items-center gap-1 transition-all"
                      >
                        <span>Tarefas ({pendingTasks.length} pendentes)</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {project.description && (
                    <p className="text-xs text-gray-400 mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  {/* Barra de Progresso e Estatísticas */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Progresso ({h.completedTasks}/{h.totalTasks} tarefas concluídas)</span>
                      <span className="font-mono text-white font-bold">{h.progressPercentage}%</span>
                    </div>
                    <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-accent-emerald h-full rounded-full transition-all duration-700"
                        style={{ width: `${h.progressPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Área Expansível: Lista de Tarefas do Projeto e Alocação Semanal */}
                {isExpanded && (
                  <div className="bg-background/60 border-t border-border p-6 space-y-5 animate-in slide-in-from-top-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-accent-amber" />
                        Tarefas & Alocação Semanal ({projectTasks.length})
                      </h4>

                      <button
                        onClick={() => setAddingTaskForProjectId(project.id!)}
                        className="px-3 py-1.5 bg-accent-amber text-background font-bold text-xs rounded-lg hover:bg-amber-400 transition-all flex items-center gap-1 self-start sm:self-auto shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Tarefa
                      </button>
                    </div>

                    {/* Formulário de Adição de Tarefa */}
                    {addingTaskForProjectId === project.id && (
                      <div className="p-3 bg-surface border border-accent-amber/40 rounded-xl space-y-3 animate-in fade-in">
                        <div className="text-xs font-semibold text-accent-amber">Nova Tarefa para {project.name}</div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={newTaskTitle}
                            onChange={e => setNewTaskTitle(e.target.value)}
                            placeholder="Ex: Escrever roteiro do criativo 1..."
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber"
                          />
                          <input
                            type="number"
                            value={newTaskEstimate}
                            onChange={e => setNewTaskEstimate(Number(e.target.value))}
                            min="15"
                            step="15"
                            placeholder="Minutos"
                            className="w-24 bg-background border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber font-mono"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setAddingTaskForProjectId(null)}
                              className="px-3 py-2 border border-border text-gray-400 hover:text-white rounded-lg text-xs"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleAddTaskToProject(project.id!)}
                              className="px-4 py-2 bg-accent-amber text-background font-bold rounded-lg text-xs hover:bg-amber-400"
                            >
                              Salvar Tarefa
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Lista de Tarefas do Projeto */}
                    {projectTasks.length === 0 ? (
                      <div className="py-8 text-center border border-dashed border-border/70 rounded-xl text-xs text-gray-400">
                        Nenhuma tarefa cadastrada neste projeto. Clique em "Adicionar Tarefa" acima para começar.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {projectTasks.map(task => {
                          const isDone = task.status === 'completed';

                          return (
                            <div
                              key={task.id}
                              className={cn(
                                "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all",
                                isDone 
                                  ? "bg-surface/40 border-border/40 opacity-60 line-through" 
                                  : "bg-surface border-border hover:border-gray-600"
                              )}
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <button
                                  onClick={() => handleToggleCompleteTask(task)}
                                  className={cn(
                                    "mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0",
                                    isDone 
                                      ? "bg-accent-emerald text-background border-accent-emerald" 
                                      : "border-gray-500 hover:border-accent-emerald text-transparent hover:text-accent-emerald"
                                  )}
                                  title={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium text-white truncate">{task.title}</div>
                                  <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                                    {task.timeEstimate}m estimados • Prioridade {task.priority}
                                  </div>
                                </div>
                              </div>

                              {/* Alocação para o Dia da Semana */}
                              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                                  <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                  <select
                                    value={task.dateAllocated || ''}
                                    onChange={e => handleChangeTaskDate(task.id!, e.target.value)}
                                    className={cn(
                                      "bg-background border rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-accent-amber font-mono",
                                      task.dateAllocated ? "border-accent-amber/50 text-accent-amber font-semibold" : "border-border text-gray-400"
                                    )}
                                  >
                                    <option value="">Sem dia definido</option>
                                    {weekOptions.map(opt => (
                                      <option key={opt.dateKey} value={opt.dateKey}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <button
                                  onClick={() => handleDeleteTask(task.id!)}
                                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Excluir tarefa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="pt-2 flex justify-between items-center text-xs text-gray-400 border-t border-white/5">
                      <span>{Math.round(h.totalMinutesSpent / 60 * 10) / 10}h investidas</span>
                      <button 
                        onClick={() => handleToggleProjectStatus(project)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {project.status === 'active' ? 'Pausar Operação' : 'Reativar Operação'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Novo Projeto */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-4 text-white">Cadastrar Novo Projeto / Oferta</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Nome do Projeto ou Oferta</label>
                <input 
                  type="text" 
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  required
                  placeholder="Ex: Oferta A (Produto X), Conteúdo Orgânico..."
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-amber text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Área de Vida</label>
                <select 
                  value={projectArea}
                  onChange={e => setProjectArea(e.target.value as LifeArea)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-amber text-white"
                >
                  {profile.activeAreas.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Descrição ou Objetivo</label>
                <textarea 
                  value={projectDesc}
                  onChange={e => setProjectDesc(e.target.value)}
                  placeholder="Qual o objetivo principal deste projeto?"
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent-amber min-h-[70px] text-white"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-gray-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-accent-amber text-background font-bold rounded-lg text-sm hover:bg-amber-400 transition-colors"
                >
                  Criar Projeto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
