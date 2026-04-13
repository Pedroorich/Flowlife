import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskType, LifeArea, Priority, UserProfile } from '../types';
import { db } from '../firebase';
import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { Plus, Sparkles, Send, Loader2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { cn } from '../lib/utils';

const TASK_TYPES: TaskType[] = ["Projeto", "Tarefa", "Compromisso", "Entrega", "Reunião", "Meta", "Hábito", "Outro"];
const PRIORITIES: Priority[] = ["Alta", "Média", "Baixa"];

interface InboxViewProps {
  profile: UserProfile;
}

export function InboxView({ profile }: InboxViewProps) {
  const [mode, setMode] = useState<'manual' | 'ai'>('ai');
  
  // Manual Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('Tarefa');
  const [area, setArea] = useState<LifeArea>(profile.activeAreas[0] || 'Outro');
  const [priority, setPriority] = useState<Priority>('Média');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timeEstimate, setTimeEstimate] = useState(60);
  const [notes, setNotes] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [loading, setLoading] = useState(false);

  // AI Chat State
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Olá! Me conte qual é o seu objetivo, projeto ou tarefa. Se for algo grande (como ler um livro ou fazer um curso), eu farei algumas perguntas para fracionar isso perfeitamente no seu calendário.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [proposedTasks, setProposedTasks] = useState<Partial<Task>[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, proposedTasks]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !endDate) return;

    setLoading(true);
    try {
      const newTask: Omit<Task, 'id'> = {
        title,
        type,
        area,
        priority,
        deadline: new Date(endDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        timeEstimate,
        notes,
        status: 'pending',
        isFixed,
        userId: profile.uid,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'tasks'), newTask);
      
      setTitle('');
      setNotes('');
      setStartDate('');
      setEndDate('');
      setTimeEstimate(60);
      setIsFixed(false);
    } catch (error) {
      console.error("Error adding task", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendAI = async () => {
    if (!input.trim() || !process.env.GEMINI_API_KEY) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const systemPrompt = `Você é o assistente de IA do FlowLife.
O usuário quer adicionar uma tarefa, projeto ou objetivo.
Se o objetivo for complexo (ex: ler um livro, fazer um curso, projeto grande), faça perguntas curtas para entender a dimensão (ex: páginas, horas totais, prazo).
Seu objetivo final é fracionar o objetivo em tarefas diárias ou menores.

RESPONDA SEMPRE EM JSON no seguinte formato:
Se precisar perguntar algo:
{
  "action": "reply",
  "message": "Sua pergunta aqui..."
}

Se tiver informações suficientes para criar as tarefas (fracionadas ou única):
{
  "action": "create_tasks",
  "message": "Aqui está o plano que montei...",
  "tasks": [
    {
      "title": "Nome da subtarefa",
      "type": "Tarefa",
      "area": "Estudos",
      "priority": "Alta",
      "timeEstimate": 30,
      "startDate": "2026-04-12T00:00:00Z",
      "endDate": "2026-04-12T23:59:59Z"
    }
  ]
}

Áreas válidas: ${profile.activeAreas.join(', ')}.
Tipos válidos: Projeto, Tarefa, Compromisso, Entrega, Reunião, Meta, Hábito, Outro.
Prioridades: Alta, Média, Baixa.
Data atual para referência: ${new Date().toISOString()}.
Seja direto, amigável e focado em produtividade.`;

      const chatHistory = messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
      const prompt = `${systemPrompt}\n\nHistórico:\n${chatHistory}\nUser: ${userMsg}\nAI:`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
      });

      let text = response.text || '';
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const data = JSON.parse(text);

      if (data.action === 'reply') {
        setMessages(prev => [...prev, { role: 'ai', text: data.message }]);
      } else if (data.action === 'create_tasks') {
        setMessages(prev => [...prev, { role: 'ai', text: data.message }]);
        setProposedTasks(data.tasks);
      }

    } catch (error) {
      console.error("AI Error", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Desculpe, tive um problema ao processar isso. Tente novamente." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const confirmAITasks = async () => {
    if (!proposedTasks) return;
    setLoading(true);
    try {
      // Use batch to add multiple tasks
      const batch = writeBatch(db);
      
      proposedTasks.forEach(pt => {
        const docRef = doc(collection(db, 'tasks'));
        const newTask: Omit<Task, 'id'> = {
          title: pt.title || 'Tarefa sem nome',
          type: pt.type as TaskType || 'Tarefa',
          area: pt.area as LifeArea || profile.activeAreas[0] || 'Outro',
          priority: pt.priority as Priority || 'Média',
          deadline: pt.endDate || new Date().toISOString(),
          startDate: pt.startDate,
          endDate: pt.endDate,
          timeEstimate: pt.timeEstimate || 30,
          status: 'pending',
          userId: profile.uid,
          createdAt: new Date().toISOString()
        };
        batch.set(docRef, newTask);
      });

      await batch.commit();
      
      setProposedTasks(null);
      setMessages(prev => [...prev, { role: 'ai', text: "✅ Plano adicionado com sucesso ao seu FlowLife! O algoritmo já está distribuindo as tarefas nos seus dias." }]);
    } catch (error) {
      console.error("Error saving AI tasks", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="font-serif text-3xl mb-2">Inbox</h2>
        <p className="text-gray-400">Capture tudo o que precisa ser feito.</p>
      </div>

      <div className="flex gap-2 mb-6 p-1 bg-surface border border-border rounded-lg w-fit">
        <button 
          onClick={() => setMode('ai')}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2", mode === 'ai' ? "bg-accent-amber/20 text-accent-amber" : "text-gray-400 hover:text-white")}
        >
          <Sparkles className="w-4 h-4" /> Assistente IA
        </button>
        <button 
          onClick={() => setMode('manual')}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", mode === 'manual' ? "bg-white/10 text-white" : "text-gray-400 hover:text-white")}
        >
          Criar Manualmente
        </button>
      </div>

      {mode === 'ai' ? (
        <div className="bg-surface border border-border rounded-xl flex flex-col h-[600px] overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl p-4", msg.role === 'user' ? "bg-accent-emerald text-background rounded-tr-sm" : "bg-background border border-border rounded-tl-sm")}>
                  {msg.text}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-background border border-border rounded-2xl rounded-tl-sm p-4 flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Pensando...
                </div>
              </div>
            )}

            {proposedTasks && (
              <div className="bg-background border border-accent-amber/50 rounded-xl p-4 mt-4">
                <h4 className="font-medium text-accent-amber mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Plano Sugerido
                </h4>
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-2">
                  {proposedTasks.map((pt, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-surface rounded-lg border border-border text-sm">
                      <div>
                        <div className="font-medium">{pt.title}</div>
                        <div className="text-gray-400 text-xs mt-1">{pt.area} • {pt.timeEstimate} min</div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {pt.startDate && <div>Início: {new Date(pt.startDate).toLocaleDateString()}</div>}
                        {pt.endDate && <div>Fim: {new Date(pt.endDate).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setProposedTasks(null)}
                    className="flex-1 py-2 rounded-lg border border-border hover:bg-white/5 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmAITasks}
                    disabled={loading}
                    className="flex-1 py-2 rounded-lg bg-accent-amber text-background font-medium hover:bg-amber-400 transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar e Criar'}
                  </button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="p-4 border-t border-border bg-background">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendAI()}
                placeholder="Ex: Quero ler o livro Hábitos Atômicos este mês..."
                className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                disabled={isTyping || proposedTasks !== null}
              />
              <button 
                onClick={handleSendAI}
                disabled={!input.trim() || isTyping || proposedTasks !== null}
                className="p-3 bg-accent-amber text-background rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="bg-surface border border-border rounded-xl p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">O que precisa ser feito?</label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald text-lg"
              placeholder="Ex: Consulta médica, Projeto X..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Tipo</label>
              <select 
                value={type} 
                onChange={e => setType(e.target.value as TaskType)}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald"
              >
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Área da Vida</label>
              <select 
                value={area} 
                onChange={e => setArea(e.target.value as LifeArea)}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald"
              >
                {profile.activeAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Quando começar? (Opcional)</label>
              <input 
                type="datetime-local" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Quando encerrar? (Prazo)</label>
              <input 
                type="datetime-local" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                required
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Prioridade</label>
              <select 
                value={priority} 
                onChange={e => setPriority(e.target.value as Priority)}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Tempo Estimado (min)</label>
              <input 
                type="number" 
                min="5" step="5"
                value={timeEstimate}
                onChange={e => setTimeEstimate(Number(e.target.value))}
                required
                className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-3 p-4 border border-border rounded-lg bg-background cursor-pointer hover:border-gray-500 transition-colors">
              <input 
                type="checkbox" 
                checked={isFixed}
                onChange={e => setIsFixed(e.target.checked)}
                className="w-5 h-5 accent-accent-emerald"
              />
              <div>
                <div className="font-medium">Compromisso Fixo?</div>
                <div className="text-sm text-gray-400">Marque se isso tem hora exata para acontecer (ex: Reunião)</div>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Notas (Opcional)</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald min-h-[100px]"
              placeholder="Detalhes adicionais..."
            />
          </div>

          <button 
            type="submit"
            disabled={loading || !title || !endDate}
            className="w-full bg-accent-emerald text-background font-medium rounded-lg px-4 py-4 hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {loading ? 'Adicionando...' : 'Adicionar ao FlowLife'}
          </button>
        </form>
      )}
    </div>
  );
}
