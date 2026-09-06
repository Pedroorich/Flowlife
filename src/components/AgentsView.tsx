import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  Plus, 
  Video, 
  GraduationCap, 
  TrendingUp, 
  Dumbbell, 
  PenTool, 
  ArrowRight, 
  MessageSquare, 
  Check, 
  X, 
  Save, 
  Loader2 
} from 'lucide-react';
import { AIAgent, AIAgentCategory, UserProfile, Task } from '../types';
import { DEFAULT_AI_AGENTS } from '../lib/defaultAgents';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { TaskCopilotDrawer } from './TaskCopilotDrawer';

interface AgentsViewProps {
  profile: UserProfile;
  tasks: Task[];
  customAgents?: AIAgent[];
  onAgentCreated?: () => void;
}

export function AgentsView({ profile, tasks, customAgents = [], onAgentCreated }: AgentsViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [testingAgent, setTestingAgent] = useState<AIAgent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New Agent Form State
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<AIAgentCategory>('Conteúdo');
  const [avatarIcon, setAvatarIcon] = useState<AIAgent['avatarIcon']>('Bot');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt1, setPrompt1] = useState('');
  const [prompt2, setPrompt2] = useState('');
  const [prompt3, setPrompt3] = useState('');

  const allAgents = [...DEFAULT_AI_AGENTS, ...customAgents];

  const categories = ['Todos', 'Conteúdo', 'Estudos', 'Negócios', 'Saúde', 'Geral'];

  const filteredAgents = selectedCategory === 'Todos' 
    ? allAgents 
    : allAgents.filter(a => a.category === selectedCategory);

  const renderIcon = (iconName: string, className = "w-6 h-6") => {
    switch (iconName) {
      case 'Video': return <Video className={className} />;
      case 'GraduationCap': return <GraduationCap className={className} />;
      case 'TrendingUp': return <TrendingUp className={className} />;
      case 'Dumbbell': return <Dumbbell className={className} />;
      case 'PenTool': return <PenTool className={className} />;
      default: return <Bot className={className} />;
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) return;

    setIsSaving(true);
    try {
      const suggestedPrompts = [prompt1, prompt2, prompt3].filter(p => p.trim().length > 0);
      const newAgent: Omit<AIAgent, 'id'> = {
        name: name.trim(),
        role: role.trim() || 'Copiloto de IA',
        description: description.trim() || 'Agente personalizado criado para tarefas específicas.',
        category,
        avatarIcon,
        systemPrompt: systemPrompt.trim(),
        suggestedPrompts: suggestedPrompts.length > 0 ? suggestedPrompts : ['Como posso executar isso?', 'Dê 3 passos práticos'],
        isDefault: false,
        userId: profile.uid,
        color: '#f59e0b',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'ai_agents'), newAgent);
      
      setShowCreateModal(false);
      setName('');
      setRole('');
      setDescription('');
      setSystemPrompt('');
      setPrompt1('');
      setPrompt2('');
      setPrompt3('');
      if (onAgentCreated) onAgentCreated();
      alert('Novo agente criado com sucesso!');
    } catch (e) {
      console.error('Erro ao criar agente:', e);
      alert('Erro ao salvar agente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
            <Bot className="w-4 h-4" />
            Copilotos Especialistas para Tarefas
          </div>
          <h2 className="font-serif text-3xl text-white">Agentes de Inteligência Artificial</h2>
          <p className="text-sm text-gray-400">
            Adicione agentes como seu braço direito para criar roteiros de Instagram, estudar como um professor ou validar ofertas.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-all text-xs flex items-center justify-center gap-2 shadow-lg shrink-0"
        >
          <Plus className="w-4 h-4" />
          Criar Agente Personalizado
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0",
              selectedCategory === cat 
                ? "bg-accent-amber text-background shadow-md" 
                : "bg-surface border border-border text-gray-400 hover:text-white"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Agents Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAgents.map(agent => {
          const assignedTasksCount = tasks.filter(t => t.assignedAgentId === agent.id && t.status === 'pending').length;

          return (
            <div 
              key={agent.id}
              className="bg-surface border border-border hover:border-accent-amber/50 rounded-2xl p-5 flex flex-col justify-between transition-all group relative overflow-hidden"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div 
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-zinc-950 font-bold shadow-lg"
                    style={{ backgroundColor: agent.color || '#f59e0b' }}
                  >
                    {renderIcon(agent.avatarIcon, "w-6 h-6 text-zinc-950")}
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/5 border border-white/10 text-gray-300">
                    {agent.category}
                  </span>
                </div>

                <h3 className="font-bold text-white text-base leading-tight mb-1 group-hover:text-accent-amber transition-colors">
                  {agent.name}
                </h3>
                <div className="text-xs text-accent-amber/90 font-medium mb-2.5">
                  {agent.role}
                </div>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 mb-4">
                  {agent.description}
                </p>

                {/* Suggested prompts preview */}
                <div className="space-y-1.5 mb-4">
                  <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    Especialidade:
                  </div>
                  {agent.suggestedPrompts.slice(0, 2).map((p, i) => (
                    <div key={i} className="text-[11px] text-gray-300 bg-background/60 px-2.5 py-1.5 rounded-lg truncate flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-accent-amber shrink-0" />
                      <span className="truncate">{p}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-border/80 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {assignedTasksCount > 0 ? (
                    <strong className="text-accent-emerald">{assignedTasksCount} tarefas ativas</strong>
                  ) : (
                    'Disponível para tarefas'
                  )}
                </span>

                <button
                  onClick={() => setTestingAgent(agent)}
                  className="px-3.5 py-1.5 bg-accent-amber/15 hover:bg-accent-amber text-accent-amber hover:text-background font-bold rounded-lg text-xs transition-all flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Abrir Chat
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Criação de Agente */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-accent-amber/20 text-accent-amber rounded-xl">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Criar Agente de IA Personalizado</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Nome do Agente</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Ex: Professor de Inglês, Roteirista TikTok, Tutor de Python..."
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Papel / Especialidade</label>
                  <input 
                    type="text" 
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    placeholder="Ex: Mentor de Fluência & Gramática"
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Categoria</label>
                  <select 
                    value={category}
                    onChange={e => setCategory(e.target.value as AIAgentCategory)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
                  >
                    <option value="Conteúdo">Conteúdo</option>
                    <option value="Estudos">Estudos</option>
                    <option value="Negócios">Negócios</option>
                    <option value="Saúde">Saúde</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Breve Descrição</label>
                <input 
                  type="text" 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Ajuda na conversação diária e correção de textos em inglês."
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Instruções & Prompt do Sistema (Como o agente deve agir)
                </label>
                <textarea 
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  required
                  rows={4}
                  placeholder="Ex: Você é um professor nativo de inglês focado em ensinar vocabulário prático e corrigir frases com explicações simples..."
                  className="w-full bg-background border border-border rounded-xl p-3 text-xs text-white focus:outline-none focus:border-accent-amber resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Botões de Ação Rápida (Sugestões de 1 toque)
                </label>
                <div className="space-y-2">
                  <input 
                    type="text" 
                    value={prompt1}
                    onChange={e => setPrompt1(e.target.value)}
                    placeholder="Sugestão 1: Ex: Explicar essa regra em 3 exemplos práticos"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber"
                  />
                  <input 
                    type="text" 
                    value={prompt2}
                    onChange={e => setPrompt2(e.target.value)}
                    placeholder="Sugestão 2: Ex: Criar 3 frases para eu treinar agora"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-gray-400 hover:text-white text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-accent-amber text-background font-bold rounded-xl text-xs hover:bg-amber-400 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Agente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer de Teste do Agente */}
      {testingAgent && (
        <TaskCopilotDrawer
          task={{
            title: `Conversa com ${testingAgent.name}`,
            area: 'Trabalho',
            timeEstimate: 30,
            status: 'pending',
            type: 'Tarefa',
            userId: profile.uid,
            priority: 'Alta',
            createdAt: new Date().toISOString()
          }}
          agent={testingAgent}
          isOpen={!!testingAgent}
          onClose={() => setTestingAgent(null)}
          availableAgents={allAgents}
          profile={profile}
          onSwitchAgent={(id) => {
            const found = allAgents.find(a => a.id === id);
            if (found) setTestingAgent(found);
          }}
        />
      )}
    </div>
  );
}
