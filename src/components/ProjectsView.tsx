import React, { useState } from 'react';
import { Project, Task, LifeArea, UserProfile } from '../types';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { 
  FolderKanban, 
  Plus, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  TrendingUp,
  Layers,
  Archive,
  Play
} from 'lucide-react';
import { analyzeProjectsHealth } from '../lib/adaptiveLearning';
import { cn } from '../lib/utils';

interface ProjectsViewProps {
  profile: UserProfile;
  projects: Project[];
  tasks: Task[];
}

export function ProjectsView({ profile, projects, tasks }: ProjectsViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectArea, setProjectArea] = useState<LifeArea>('Projetos & Ofertas');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectColor, setProjectColor] = useState('#f59e0b');

  const healthList = analyzeProjectsHealth(projects, tasks);
  const stalledProjects = healthList.filter(h => h.isStalled);

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

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
            <FolderKanban className="w-4 h-4" />
            Gestão Estratégica de Projetos & Ofertas
          </div>
          <h2 className="font-serif text-3xl text-white">Suas Operações & Ofertas</h2>
          <p className="text-sm text-gray-400">
            Acompanhe o progresso de cada oferta e nunca mais abandone projetos importantes.
          </p>
        </div>

        <button 
          onClick={() => setShowNewProjectModal(true)}
          className="px-4 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-colors flex items-center gap-2 text-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Novo Projeto / Oferta
        </button>
      </div>

      {/* Alerta de Abandono de Projetos */}
      {stalledProjects.length > 0 && (
        <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-5 animate-in fade-in">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-accent-amber shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-accent-amber mb-1">
                Alerta de Projetos Parados / Abandonados
              </h4>
              <p className="text-sm text-gray-300 mb-3">
                Identificamos projetos que não recebem novas conclusões há mais de 7 dias. Você ainda deseja mantê-los ativos ou prefere pausá-los?
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

      {/* Grid de Projetos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {healthList.length === 0 ? (
          <div className="col-span-full py-16 text-center border border-dashed border-border rounded-2xl">
            <FolderKanban className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-1">Nenhum projeto cadastrado ainda</h3>
            <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">
              Cadastre suas ofertas validadas, canais de conteúdo ou novas operações para acompanhar seu tempo e progresso.
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
            return (
              <div 
                key={project.id}
                className={cn(
                  "bg-surface border rounded-2xl p-6 transition-all hover:border-gray-500 flex flex-col justify-between",
                  h.isStalled ? "border-amber-500/40" : "border-border"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div 
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: project.color || '#f59e0b' }}
                      />
                      <h3 className="text-lg font-bold text-white">{project.name}</h3>
                    </div>
                    <span className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full font-medium",
                      project.status === 'active' ? "bg-accent-emerald/20 text-accent-emerald" : "bg-gray-500/20 text-gray-400"
                    )}>
                      {project.status === 'active' ? 'Ativo' : 'Pausado'}
                    </span>
                  </div>

                  {project.description && (
                    <p className="text-xs text-gray-400 line-clamp-2 mb-4">
                      {project.description}
                    </p>
                  )}

                  {/* Barra de Progresso */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Progresso ({h.completedTasks}/{h.totalTasks} tarefas)</span>
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

                {/* Footer do Card */}
                <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    <span>{Math.round(h.totalMinutesSpent / 60 * 10) / 10}h investidas</span>
                  </div>

                  <button 
                    onClick={() => handleToggleProjectStatus(project)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {project.status === 'active' ? 'Pausar' : 'Reativar'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Novo Projeto */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-4">Cadastrar Novo Projeto / Oferta</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Nome do Projeto ou Oferta</label>
                <input 
                  type="text" 
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  required
                  placeholder="Ex: Oferta A (Produto X), Conteúdo Orgânico..."
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-amber"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Área de Vida</label>
                <select 
                  value={projectArea}
                  onChange={e => setProjectArea(e.target.value as LifeArea)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-amber"
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
                  className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent-amber min-h-[70px]"
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
