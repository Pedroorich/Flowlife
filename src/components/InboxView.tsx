import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskType, LifeArea, Priority, UserProfile, Project } from '../types';
import { db } from '../firebase';
import { collection, addDoc, writeBatch, doc, deleteDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { 
  Plus, 
  Sparkles, 
  Send, 
  Loader2, 
  Zap, 
  Clock, 
  ShieldAlert, 
  FolderKanban, 
  Trash2, 
  Check, 
  Calendar,
  Mic,
  MicOff,
  Square,
  Radio
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const TASK_TYPES: TaskType[] = ["Projeto", "Tarefa", "Compromisso", "Entrega", "Reunião", "Meta", "Hábito", "Outro"];
const PRIORITIES: Priority[] = ["Alta", "Média", "Baixa"];

interface InboxViewProps {
  profile: UserProfile;
  projects?: Project[];
  tasks?: Task[];
}

export function InboxView({ profile, projects = [], tasks = [] }: InboxViewProps) {
  const [mode, setMode] = useState<'ai' | 'quick' | 'manual'>('quick');
  
  // Quick Capture State
  const [quickText, setQuickText] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);

  // Manual Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('Tarefa');
  const [area, setArea] = useState<LifeArea>(profile.activeAreas[0] || 'Trabalho');
  const [projectId, setProjectId] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('Média');
  const [urgency, setUrgency] = useState(3);
  const [impact, setImpact] = useState(3);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timeEstimate, setTimeEstimate] = useState(45);
  const [timeMax, setTimeMax] = useState(75);
  const [notes, setNotes] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [loading, setLoading] = useState(false);

  // AI Chat State
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Olá, Pedro! Me conte ou fale qual é o seu objetivo, tarefas ou a rotina que você vai ter hoje. Você pode simplesmente falar no microfone que eu entendo sua rotina completa, horários de treino, compromissos e tarefas, fracionando tudo para respeitar seu horário de encerramento.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [proposedTasks, setProposedTasks] = useState<Partial<Task>[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice Input State (Speech-to-Text)
  const [isRecordingAI, setIsRecordingAI] = useState(false);
  const [isRecordingQuick, setIsRecordingQuick] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const startVoiceInput = (target: 'ai' | 'quick') => {
    setVoiceError(null);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Reconhecimento de voz não suportado diretamente neste navegador. No iPhone, abra no Safari ou adicione à Tela de Início.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = true;
      recognition.interimResults = true;

      if (target === 'ai') {
        setIsRecordingAI(true);
        setIsRecordingQuick(false);
      } else {
        setIsRecordingQuick(true);
        setIsRecordingAI(false);
      }

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (target === 'ai') {
          setInput(currentTranscript);
        } else {
          setQuickText(currentTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Erro voz:', event.error);
        if (event.error === 'not-allowed') {
          setVoiceError('Permissão do microfone negada. Autorize o microfone para falar suas tarefas.');
        } else if (event.error !== 'no-speech') {
          setVoiceError(`Aviso do microfone: ${event.error}`);
        }
        setIsRecordingAI(false);
        setIsRecordingQuick(false);
      };

      recognition.onend = () => {
        setIsRecordingAI(false);
        setIsRecordingQuick(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Falha ao iniciar microfone:', err);
      setVoiceError('Não foi possível ativar o microfone.');
      setIsRecordingAI(false);
      setIsRecordingQuick(false);
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
    setIsRecordingAI(false);
    setIsRecordingQuick(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, proposedTasks]);

  // Captura Rápida Inteligente
  const handleQuickCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim()) return;

    setQuickLoading(true);
    try {
      // Extrair se há horário ou duração simples no texto
      let estimated = 30;
      const lower = quickText.toLowerCase();
      if (lower.includes('15 min') || lower.includes('15m')) estimated = 15;
      else if (lower.includes('1h') || lower.includes('60 min')) estimated = 60;
      else if (lower.includes('2h') || lower.includes('120 min')) estimated = 120;
      else if (lower.includes('45 min') || lower.includes('45m')) estimated = 45;

      const isCommitment = lower.includes('reunião') || lower.includes('igreja') || lower.includes('treinar') || lower.includes('às ') || lower.includes('as ');

      await addDoc(collection(db, 'tasks'), {
        title: quickText.trim(),
        type: isCommitment ? 'Compromisso' : 'Tarefa',
        area: profile.activeAreas[0] || 'Trabalho',
        priority: 'Média',
        urgency: 3,
        impact: 3,
        timeEstimate: estimated,
        timeMax: Math.round(estimated * 1.5),
        status: 'pending',
        isFixed: isCommitment,
        userId: profile.uid,
        createdAt: new Date().toISOString()
      });

      setQuickText('');
    } catch (e) {
      console.error("Erro na captura rápida", e);
    } finally {
      setQuickLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    setLoading(true);
    try {
      const newTask: Omit<Task, 'id'> = {
        title: title.trim(),
        type,
        area,
        projectId: projectId || undefined,
        priority,
        urgency: Number(urgency),
        impact: Number(impact),
        deadline: endDate ? new Date(endDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        timeEstimate: Number(timeEstimate),
        timeMax: Number(timeMax) || Math.round(Number(timeEstimate) * 1.5),
        notes: notes.trim(),
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
      setTimeEstimate(45);
      setTimeMax(75);
      setIsFixed(false);
      alert('Tarefa adicionada com sucesso!');
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
      
      const systemPrompt = `Você é o assistente executivo e estrategista de IA do FlowLife.
O usuário é o Pedro (trabalha com marketing digital, ofertas validadas, tráfego orgânico, projetos paralelos, treinos de musculação, Jiu-Jitsu e igreja).
O usuário pode tanto digitar quanto FALAR livremente por voz sobre a rotina que ele vai ter, tarefas do dia, compromissos ou projetos complexos (ex: "amanhã preciso acordar às 7h, treinar Jiu-jitsu às 9h, depois gravar criativos da oferta A, almoçar às 12h30, reunião com cliente às 14h e encerrar às 19h").

Seu papel é:
1. Analisar a fala ou texto do usuário.
2. Identificar tanto tarefas executáveis quanto blocos de rotina/compromissos fixos (treinos, reuniões, almoço, culto).
3. Respeitar o horário inegociável de encerramento do expediente das ${profile.workEndTime || '19:00'}.
4. Fracionar projetos em blocos práticos de 30 a 90 minutos com limite de tempo máximo contra overthinking.

RESPONDA SEMPRE EM JSON no seguinte formato:
Se precisar perguntar algo ou esclarecer uma dúvida:
{
  "action": "reply",
  "message": "Sua resposta estratégica e direta aqui..."
}

Se tiver informações suficientes para criar as tarefas/rotinas na agenda:
{
  "action": "create_tasks",
  "message": "Entendi perfeitamente sua rotina e tarefas! Aqui está o plano estratégico fracionado:",
  "tasks": [
    {
      "title": "Nome claro da tarefa ou compromisso",
      "type": "Tarefa",
      "area": "Trabalho",
      "priority": "Alta",
      "urgency": 4,
      "impact": 5,
      "timeEstimate": 45,
      "timeMax": 75,
      "scheduledStartTime": "09:00",
      "isFixed": false
    }
  ]
}

Tipos válidos: "Projeto", "Tarefa", "Compromisso", "Entrega", "Reunião", "Meta", "Hábito", "Outro".
Áreas ativas válidas: ${profile.activeAreas.join(', ')}.
Projetos cadastrados: ${projects.map(p => p.name).join(', ')}.`;

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
      setMessages(prev => [...prev, { role: 'ai', text: "Desculpe, tive um problema ao processar sua solicitação por voz/texto. Poderia repetir?" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const confirmAITasks = async () => {
    if (!proposedTasks) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const todayKey = format(new Date(), 'yyyy-MM-dd');
      
      proposedTasks.forEach(pt => {
        const docRef = doc(collection(db, 'tasks'));
        const newTask: Omit<Task, 'id'> = {
          title: pt.title || 'Tarefa sem nome',
          type: (pt.type as TaskType) || 'Tarefa',
          area: (pt.area as LifeArea) || profile.activeAreas[0] || 'Trabalho',
          priority: (pt.priority as Priority) || 'Média',
          urgency: pt.urgency || 3,
          impact: pt.impact || 3,
          timeEstimate: pt.timeEstimate || 45,
          timeMax: pt.timeMax || Math.round((pt.timeEstimate || 45) * 1.5),
          scheduledStartTime: pt.scheduledStartTime || undefined,
          isFixed: pt.isFixed ?? (pt.type === 'Compromisso' || pt.type === 'Reunião'),
          dateAllocated: pt.scheduledStartTime ? todayKey : undefined,
          status: 'pending',
          userId: profile.uid,
          createdAt: new Date().toISOString()
        };
        batch.set(docRef, newTask);
      });

      await batch.commit();
      setProposedTasks(null);
      setMessages(prev => [...prev, { role: 'ai', text: "✅ Tarefas e rotinas salvas com sucesso! O FlowLife já sincronizou sua agenda e ativou os lembretes." }]);
    } catch (error) {
      console.error("Error saving AI tasks", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="font-serif text-3xl mb-1 text-white">Backlog & Captura Rápida</h2>
        <p className="text-sm text-gray-400">Capture ideias, compromissos ou deixe a IA fracionar projetos complexos.</p>
      </div>

      {/* Seletor de Modo */}
      <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-fit">
        <button 
          onClick={() => setMode('quick')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
            mode === 'quick' ? "bg-accent-amber text-background" : "text-gray-400 hover:text-white"
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          Captura Rápida
        </button>
        <button 
          onClick={() => setMode('ai')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
            mode === 'ai' ? "bg-accent-amber text-background" : "text-gray-400 hover:text-white"
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Assistente IA
        </button>
        <button 
          onClick={() => setMode('manual')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
            mode === 'manual' ? "bg-accent-amber text-background" : "text-gray-400 hover:text-white"
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Cadastro Completo
        </button>
      </div>

      {/* 1. MODO CAPTURA RÁPIDA */}
      {mode === 'quick' && (
        <div className="bg-surface border border-border rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-2">Entrada Sem Atrito</h3>
          <p className="text-xs text-gray-400 mb-4">
            Digite ou fale o que precisa ser feito. O FlowLife detecta se é uma tarefa, compromisso ou duração estimada.
          </p>

          {isRecordingQuick && (
            <div className="flex items-center justify-between p-3 bg-accent-amber/10 border border-accent-amber/30 rounded-xl mb-3 animate-pulse">
              <div className="flex items-center gap-2 text-xs font-semibold text-accent-amber">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-amber animate-ping" />
                <Radio className="w-4 h-4 text-accent-amber" />
                Ouvindo... Fale sua tarefa ou compromisso.
              </div>
              <button 
                type="button"
                onClick={stopVoiceInput}
                className="px-3 py-1 bg-accent-amber text-background rounded-lg text-xs font-bold hover:bg-amber-400 transition-colors flex items-center gap-1 shadow-sm"
              >
                <Square className="w-3 h-3 fill-current" />
                Concluir
              </button>
            </div>
          )}

          {voiceError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-3 text-xs text-red-400 flex items-center justify-between">
              <span>{voiceError}</span>
              <button onClick={() => setVoiceError(null)} className="text-red-300 font-bold ml-2">✕</button>
            </div>
          )}

          <form onSubmit={handleQuickCapture} className="space-y-3">
            <div className="relative flex items-center">
              <input 
                type="text"
                value={quickText}
                onChange={e => setQuickText(e.target.value)}
                placeholder="Ex: Editar 3 criativos da Oferta A 45 min..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 text-sm text-white focus:outline-none focus:border-accent-amber"
                autoFocus
              />
              <button
                type="button"
                onClick={() => isRecordingQuick ? stopVoiceInput() : startVoiceInput('quick')}
                className={cn(
                  "absolute right-2 p-2 rounded-lg transition-all",
                  isRecordingQuick 
                    ? "bg-red-500 text-white animate-pulse" 
                    : "text-gray-400 hover:text-accent-amber hover:bg-white/5"
                )}
                title={isRecordingQuick ? "Parar gravação" : "Falar por voz"}
              >
                {isRecordingQuick ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Dica: fale '15m', '45 min' ou 'reunião' para autodetecção</span>
              <button 
                type="submit"
                disabled={quickLoading || !quickText.trim()}
                className="px-5 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {quickLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Capturar no Backlog
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. MODO IA (GEMINI) */}
      {mode === 'ai' && (
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col h-[560px]">
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {messages.map((m, i) => (
              <div 
                key={i} 
                className={cn(
                  "p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed",
                  m.role === 'user' 
                    ? "bg-accent-amber text-background ml-auto font-medium" 
                    : "bg-background border border-border text-gray-200"
                )}
              >
                {m.text}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> FlowLife pensando no fracionamento...
              </div>
            )}

            {/* Proposta de Tarefas da IA */}
            {proposedTasks && (
              <div className="bg-background border-2 border-accent-amber/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-accent-amber uppercase tracking-wider">
                    Plano Estratégico Sugerido
                  </h4>
                  <span className="text-[10px] text-gray-400">{proposedTasks.length} itens</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {proposedTasks.map((pt, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs bg-white/5 px-3 py-2 rounded-lg">
                      <div className="flex items-center gap-2 truncate pr-2">
                        {pt.scheduledStartTime && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-accent-amber/20 text-accent-amber rounded font-mono font-bold">
                            {pt.scheduledStartTime}
                          </span>
                        )}
                        <span className="font-medium text-white truncate">{pt.title}</span>
                      </div>
                      <span className="font-mono text-accent-amber font-bold shrink-0">{pt.timeEstimate} min</span>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={confirmAITasks}
                  disabled={loading}
                  className="w-full py-2.5 bg-accent-emerald text-background font-bold rounded-lg text-xs hover:bg-emerald-400 transition-colors flex items-center justify-center gap-1.5 shadow-md"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirmar e Salvar no Backlog & Agenda
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Voice Recording Active Indicator in AI mode */}
          {isRecordingAI && (
            <div className="flex items-center justify-between p-3 bg-accent-amber/10 border border-accent-amber/30 rounded-xl mt-3 mb-1 animate-pulse">
              <div className="flex items-center gap-2 text-xs font-semibold text-accent-amber">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-amber animate-ping" />
                <Radio className="w-4 h-4 text-accent-amber animate-pulse" />
                Ouvindo sua rotina e tarefas... Fale naturalmente!
              </div>
              <button 
                type="button"
                onClick={stopVoiceInput}
                className="px-3 py-1 bg-accent-amber text-background rounded-lg text-xs font-bold hover:bg-amber-400 transition-colors flex items-center gap-1 shadow-sm"
              >
                <Square className="w-3 h-3 fill-current" />
                Concluir Fala
              </button>
            </div>
          )}

          {voiceError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl mt-3 mb-1 text-xs text-red-400 flex items-center justify-between">
              <span>{voiceError}</span>
              <button onClick={() => setVoiceError(null)} className="text-red-300 font-bold ml-2">✕</button>
            </div>
          )}

          {/* Input Bar with Voice Button & Send */}
          <div className="pt-3 border-t border-border mt-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => isRecordingAI ? stopVoiceInput() : startVoiceInput('ai')}
              className={cn(
                "p-2.5 rounded-xl font-bold transition-all flex items-center justify-center shrink-0",
                isRecordingAI 
                  ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30" 
                  : "bg-background border border-accent-amber/40 text-accent-amber hover:bg-accent-amber/10"
              )}
              title={isRecordingAI ? "Parar gravação" : "Falar minhas tarefas/rotina (Voz)"}
            >
              {isRecordingAI ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
            </button>

            <input 
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendAI()}
              placeholder={isRecordingAI ? "Ouvindo... Transcrevendo sua fala..." : "Fale pelo microfone ou digite sua rotina..."}
              className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent-amber placeholder:text-gray-500"
            />

            <button 
              onClick={handleSendAI}
              disabled={isTyping || !input.trim()}
              className="px-4 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 shrink-0"
              title="Enviar para a IA"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. MODO CADASTRO COMPLETO (COM LIMITES E PRIORIDADE REAL) */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Título da Tarefa</label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="Ex: Roteirizar 5 criativos para Oferta A"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-amber"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Área</label>
              <select 
                value={area}
                onChange={e => setArea(e.target.value as LifeArea)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
              >
                {profile.activeAreas.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Projeto / Oferta</label>
              <select 
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
              >
                <option value="">Nenhum projeto específico</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tipo</label>
              <select 
                value={type}
                onChange={e => setType(e.target.value as TaskType)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
              >
                {TASK_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Calibrador de Prioridade Real */}
          <div className="bg-background/60 border border-border/80 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Impacto Estratégico (Receita / Avanço)</span>
                <span className="font-bold text-accent-amber">{impact}/5</span>
              </div>
              <input 
                type="range" 
                min="1" max="5" 
                value={impact}
                onChange={e => setImpact(Number(e.target.value))}
                className="w-full accent-accent-amber"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Urgência</span>
                <span className="font-bold text-accent-amber">{urgency}/5</span>
              </div>
              <input 
                type="range" 
                min="1" max="5" 
                value={urgency}
                onChange={e => setUrgency(Number(e.target.value))}
                className="w-full accent-accent-amber"
              />
            </div>
          </div>

          {/* Limite de Tempo & Anti-Overthinking */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tempo Estimado (minutos)</label>
              <input 
                type="number" 
                min="5" step="5"
                value={timeEstimate}
                onChange={e => {
                  const est = Number(e.target.value);
                  setTimeEstimate(est);
                  setTimeMax(Math.round(est * 1.5));
                }}
                required
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent-amber"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-red-400 mb-1 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                Limite Máximo Anti-Overthinking (min)
              </label>
              <input 
                type="number" 
                min="10" step="5"
                value={timeMax}
                onChange={e => setTimeMax(Number(e.target.value))}
                required
                className="w-full bg-background border border-red-500/30 rounded-xl px-3 py-2.5 text-sm text-red-300 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Prazo Final (Opcional)</label>
            <input 
              type="datetime-local" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Notas ou Checklist</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Instruções ou links úteis..."
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber min-h-[60px]"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="apple-press w-full py-3 bg-accent-amber text-background font-bold text-sm rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 shadow-md shadow-amber-500/15"
          >
            {loading ? 'Salvando...' : 'Cadastrar Tarefa Estratégica'}
          </button>
        </form>
      )}

      {/* 4. FILA DO BACKLOG (TAREFAS CADASTRADAS & GESTÃO DE EXCLUSÃO) */}
      <div className="apple-card rounded-3xl p-6 md:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Fila do Backlog</h3>
            <p className="text-xs text-white/50">
              Tarefas pendentes aguardando alocação na agenda. Escolha quais agendar ou excluir.
            </p>
          </div>

          {tasks.filter(t => t.status === 'pending').length > 0 && (
            <button 
              onClick={async () => {
                if (!confirm('Deseja excluir TODAS as tarefas pendentes do Backlog?')) return;
                try {
                  const q = query(collection(db, 'tasks'), where('userId', '==', profile.uid), where('status', '==', 'pending'));
                  const snap = await getDocs(q);
                  const batch = writeBatch(db);
                  snap.docs.forEach(d => batch.delete(d.ref));
                  await batch.commit();
                  alert('Backlog limpo com sucesso!');
                } catch (e) {
                  console.error("Erro ao limpar backlog", e);
                }
              }}
              className="apple-press px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/20 transition-all flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpar Todo o Backlog
            </button>
          )}
        </div>

        {tasks.filter(t => t.status === 'pending').length === 0 ? (
          <div className="py-12 text-center text-white/40 text-xs italic">
            Nenhuma tarefa pendente no Backlog. Adicione acima para abastecer o sistema!
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.filter(t => t.status === 'pending').map(task => {
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              const isAllocatedToday = task.dateAllocated === todayStr;

              return (
                <div 
                  key={task.id}
                  className="bg-black/30 border border-white/8 hover:border-white/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 font-medium">
                        {task.area}
                      </span>
                      {task.projectId && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                          {projects.find(p => p.id === task.projectId)?.name || 'Projeto'}
                        </span>
                      )}
                      {isAllocatedToday && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-accent-amber/20 text-accent-amber border border-accent-amber/30 font-bold">
                          Agendada para Hoje
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-white tracking-tight">{task.title}</h4>
                    <div className="flex items-center gap-3 text-[11px] text-white/40 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {task.timeEstimate}m (Máx: {task.timeMax || Math.round(task.timeEstimate * 1.5)}m)
                      </span>
                      <span>Impacto: {task.impact || 3}/5</span>
                      <span>Urgência: {task.urgency || 3}/5</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!isAllocatedToday && (
                      <button 
                        onClick={async () => {
                          if (!task.id) return;
                          await updateDoc(doc(db, 'tasks', task.id), {
                            dateAllocated: todayStr
                          });
                        }}
                        className="apple-press px-3 py-1.5 rounded-xl bg-accent-amber/15 border border-accent-amber/30 text-accent-amber text-xs font-semibold hover:bg-accent-amber/25 transition-all flex items-center gap-1"
                        title="Puxar para Hoje"
                      >
                        <Calendar className="w-3 h-3" /> Hoje
                      </button>
                    )}

                    <button 
                      onClick={async () => {
                        if (!task.id) return;
                        await updateDoc(doc(db, 'tasks', task.id), {
                          status: 'completed',
                          dateAllocated: todayStr
                        });
                      }}
                      className="apple-press p-2 rounded-xl bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30 hover:bg-accent-emerald hover:text-background transition-all"
                      title="Concluir Tarefa"
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={async () => {
                        if (!task.id || !confirm('Deseja excluir esta tarefa?')) return;
                        await deleteDoc(doc(db, 'tasks', task.id));
                      }}
                      className="apple-press p-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
                      title="Excluir Tarefa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
