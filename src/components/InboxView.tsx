import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskType, LifeArea, Priority, UserProfile, Project, RoutineBlock } from '../types';
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
  Radio,
  Key,
  ExternalLink,
  CheckCircle2,
  Dumbbell,
  Repeat,
  Layers,
  ArrowRight
} from 'lucide-react';
import { getGeminiApiKey, saveGeminiApiKey, testGeminiApiKey, callGemini, formatGeminiErrorMessage } from '../lib/gemini';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { DEFAULT_AI_AGENTS } from '../lib/defaultAgents';
import { ChatMessageFormatter } from './ChatMessageFormatter';

const TASK_TYPES: TaskType[] = ["Projeto", "Tarefa", "Compromisso", "Entrega", "Reunião", "Meta", "Hábito", "Outro"];
const PRIORITIES: Priority[] = ["Alta", "Média", "Baixa"];

export interface RoutineItemProposal {
  title: string;
  area?: LifeArea;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  transitMinutesBefore?: number;
  transitMinutesAfter?: number;
  isFixed?: boolean;
}

export interface ProjectItemProposal {
  name: string;
  area?: LifeArea;
  description?: string;
  color?: string;
}

export interface TaskItemProposal {
  title: string;
  type?: TaskType;
  area?: LifeArea;
  projectName?: string;
  priority?: Priority;
  urgency?: number;
  impact?: number;
  timeEstimate?: number;
  timeMax?: number;
  scheduledStartTime?: string;
  isFixed?: boolean;
  assignedAgentId?: string;
  notes?: string;
}

export interface ProfileUpdateProposal {
  workStartTime?: string;
  workEndTime?: string;
  wakeTime?: string;
  bedTime?: string;
}

export interface SystemModificationPlan {
  action?: 'apply_changes' | 'create_tasks' | 'reply';
  message?: string;
  autoApply?: boolean;
  routines?: RoutineItemProposal[];
  projects?: ProjectItemProposal[];
  tasks?: TaskItemProposal[];
  profileUpdates?: ProfileUpdateProposal;
}

interface InboxViewProps {
  profile: UserProfile;
  projects?: Project[];
  tasks?: Task[];
  routines?: RoutineBlock[];
  onNavigateTab?: (tab: string) => void;
}

export function InboxView({ profile, projects = [], tasks = [], routines = [], onNavigateTab }: InboxViewProps) {
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
  const [assignedAgentId, setAssignedAgentId] = useState<string>('');
  const [isFixed, setIsFixed] = useState(false);
  const [loading, setLoading] = useState(false);

  // AI Chat State
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Olá, Pedro! Me conte ou fale qual é o seu objetivo, tarefas ou a rotina que você vai ter hoje. Você pode simplesmente falar no microfone que eu entendo sua rotina completa, horários de treino, compromissos e tarefas, fracionando tudo para respeitar seu horário de encerramento.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [proposedTasks, setProposedTasks] = useState<Partial<Task>[] | null>(null);
  const [proposedPlan, setProposedPlan] = useState<SystemModificationPlan | null>(null);
  const [appliedSummary, setAppliedSummary] = useState<{
    routinesCount: number;
    projectsCount: number;
    tasksCount: number;
    profileUpdated: boolean;
    timestamp: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice Input State (Speech-to-Text)
  const [isRecordingAI, setIsRecordingAI] = useState(false);
  const [isRecordingQuick, setIsRecordingQuick] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Gemini API Key Management
  const [apiKey, setApiKey] = useState<string>(() => getGeminiApiKey(profile));
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(() => !getGeminiApiKey(profile));
  const [keyInput, setKeyInput] = useState<string>(() => getGeminiApiKey(profile));
  const [keySaving, setKeySaving] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const k = getGeminiApiKey(profile);
    setApiKey(k);
    if (k && !keyInput) {
      setKeyInput(k);
    }
  }, [profile]);

  const handleSaveApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setKeySaving(true);
    setKeyMessage(null);
    try {
      const clean = keyInput.trim();
      if (!clean) {
        setKeyMessage({ type: 'error', text: 'Por favor, informe a chave da API.' });
        return;
      }
      const testResult = await testGeminiApiKey(clean);
      if (!testResult.success) {
        setKeyMessage({ type: 'error', text: `Chave inválida ou erro na API: ${testResult.error}` });
        return;
      }
      await saveGeminiApiKey(clean, profile.uid);
      setApiKey(clean);
      setShowKeyConfig(false);
      setVoiceError(null);
      setKeyMessage({ type: 'success', text: 'Chave do Gemini validada e salva com sucesso!' });
      setTimeout(() => setKeyMessage(null), 4000);
    } catch (err: any) {
      setKeyMessage({ type: 'error', text: err?.message || 'Erro ao validar chave.' });
    } finally {
      setKeySaving(false);
    }
  };

  const transcriptRef = useRef('');

  const startVoiceInput = (target: 'ai' | 'quick') => {
    setVoiceError(null);
    transcriptRef.current = '';
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
        transcriptRef.current = currentTranscript;
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
  }, [messages, proposedTasks, proposedPlan, appliedSummary]);

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
        assignedAgentId: assignedAgentId || undefined,
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
      setAssignedAgentId('');
      setIsFixed(false);
      alert('Tarefa adicionada com sucesso!');
    } catch (error) {
      console.error("Error adding task", error);
    } finally {
      setLoading(false);
    }
  };

  const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const formatDaysDisplay = (days?: number[]) => {
    if (!days || days.length === 0) return 'Todos os dias';
    if (days.length === 7) return 'Todos os dias';
    if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'Seg a Sex';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Fim de semana';
    return days.map(d => DAY_LABELS[d] ?? d).join(', ');
  };

  const handleApplyChanges = async (planToApply?: SystemModificationPlan | null) => {
    const plan = planToApply || proposedPlan;
    if (!plan && !proposedTasks) return;

    setLoading(true);
    try {
      let createdRoutinesCount = 0;
      let createdProjectsCount = 0;
      let createdTasksCount = 0;
      let profileUpdated = false;

      // 1. Criar Projetos necessários
      const projectMap = new Map<string, string>();
      projects.forEach(p => {
        if (p.id && p.name) {
          projectMap.set(p.name.toLowerCase().trim(), p.id);
        }
      });

      if (plan?.projects && plan.projects.length > 0) {
        for (const proj of plan.projects) {
          if (!proj.name || !proj.name.trim()) continue;
          const cleanName = proj.name.trim();
          const lowerName = cleanName.toLowerCase();

          if (!projectMap.has(lowerName)) {
            const docRef = await addDoc(collection(db, 'projects'), {
              userId: profile.uid,
              name: cleanName,
              description: proj.description || '',
              area: proj.area || 'Trabalho',
              color: proj.color || '#F59E0B',
              status: 'active',
              createdAt: new Date().toISOString()
            });
            projectMap.set(lowerName, docRef.id);
            createdProjectsCount++;
          }
        }
      }

      // 2. Criar Rotinas Recorrentes (Musculação, Jiu-Jitsu, Teatro, Leitura, etc.)
      if (plan?.routines && plan.routines.length > 0) {
        for (const r of plan.routines) {
          if (!r.title || !r.startTime || !r.endTime) continue;
          const cleanTitle = r.title.trim();
          const days = (r.daysOfWeek && r.daysOfWeek.length > 0) ? r.daysOfWeek : [1, 2, 3, 4, 5];

          const alreadyExists = routines.some(existing => 
            existing.title.toLowerCase().trim() === cleanTitle.toLowerCase() &&
            existing.startTime === r.startTime
          );

          if (!alreadyExists) {
            await addDoc(collection(db, 'routines'), {
              userId: profile.uid,
              title: cleanTitle,
              area: r.area || 'Saúde & Treino',
              startTime: r.startTime,
              endTime: r.endTime,
              transitMinutesBefore: Number(r.transitMinutesBefore) || 0,
              transitMinutesAfter: Number(r.transitMinutesAfter) || 0,
              daysOfWeek: days,
              isFixed: r.isFixed ?? true,
              createdAt: new Date().toISOString()
            });
            createdRoutinesCount++;
          }
        }
      }

      // 3. Criar Tarefas Fracionadas
      const tasksToCreate = plan?.tasks || proposedTasks || [];
      if (tasksToCreate.length > 0) {
        const batch = writeBatch(db);
        const todayKey = format(new Date(), 'yyyy-MM-dd');

        for (const pt of tasksToCreate) {
          if (!pt.title || !pt.title.trim()) continue;

          let matchedProjectId: string | undefined = undefined;
          const pName = (pt as any).projectName;
          if (pName) {
            matchedProjectId = projectMap.get(pName.toLowerCase().trim());
          }

          const docRef = doc(collection(db, 'tasks'));
          const newTask: Omit<Task, 'id'> = {
            title: pt.title.trim(),
            type: (pt.type as TaskType) || 'Tarefa',
            area: (pt.area as LifeArea) || profile.activeAreas[0] || 'Trabalho',
            projectId: matchedProjectId,
            priority: (pt.priority as Priority) || 'Média',
            urgency: pt.urgency || 3,
            impact: pt.impact || 3,
            timeEstimate: pt.timeEstimate || 45,
            timeMax: pt.timeMax || Math.round((pt.timeEstimate || 45) * 1.5),
            scheduledStartTime: pt.scheduledStartTime || undefined,
            isFixed: pt.isFixed ?? (pt.type === 'Compromisso' || pt.type === 'Reunião'),
            assignedAgentId: pt.assignedAgentId || undefined,
            dateAllocated: pt.scheduledStartTime ? todayKey : undefined,
            notes: (pt as any).notes || '',
            status: 'pending',
            userId: profile.uid,
            createdAt: new Date().toISOString()
          };
          batch.set(docRef, newTask);
          createdTasksCount++;
        }

        if (createdTasksCount > 0) {
          await batch.commit();
        }
      }

      // 4. Atualizar Limites do Perfil se enviados
      if (plan?.profileUpdates && Object.keys(plan.profileUpdates).length > 0) {
        const updates: any = {};
        if (plan.profileUpdates.workStartTime) updates.workStartTime = plan.profileUpdates.workStartTime;
        if (plan.profileUpdates.workEndTime) updates.workEndTime = plan.profileUpdates.workEndTime;
        if (plan.profileUpdates.wakeTime) updates.wakeTime = plan.profileUpdates.wakeTime;
        if (plan.profileUpdates.bedTime) updates.bedTime = plan.profileUpdates.bedTime;

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, 'users', profile.uid), updates);
          profileUpdated = true;
        }
      }

      setProposedPlan(null);
      setProposedTasks(null);

      setAppliedSummary({
        routinesCount: createdRoutinesCount,
        projectsCount: createdProjectsCount,
        tasksCount: createdTasksCount,
        profileUpdated,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });

      const summaryParts: string[] = [];
      if (createdRoutinesCount > 0) summaryParts.push(`• **${createdRoutinesCount} Rotina(s) Recorrente(s)** cadastradas (Musculação, Jiu-Jitsu, Teatro, Hábitos)`);
      if (createdProjectsCount > 0) summaryParts.push(`• **${createdProjectsCount} Projeto(s)** novo(s) inicializado(s) no sistema`);
      if (createdTasksCount > 0) summaryParts.push(`• **${createdTasksCount} Tarefa(s)** agendadas e fracionadas`);
      if (profileUpdated) summaryParts.push(`• **Limites do Perfil** sincronizados (horário de corte e rotina)`);

      const feedbackMsg = `⚡ **Toda a rotina combinada foi adicionada diretamente no sistema!**\n\n${summaryParts.length > 0 ? summaryParts.join('\n') : 'Estrutura configurada e ativa no FlowLife.'}\n\nVocê já pode conferir tudo na Agenda de Hoje, nas Rotinas Semanais ou nos Projetos!`;

      setMessages(prev => [...prev, { role: 'ai', text: feedbackMsg }]);

    } catch (error: any) {
      console.error("Erro ao aplicar modificações do sistema", error);
      setMessages(prev => [...prev, { role: 'ai', text: `⚠️ Erro ao salvar estrutura no sistema: ${error?.message || 'Falha na gravação'}` }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmAITasks = async () => {
    await handleApplyChanges();
  };

  const handleSendAI = async () => {
    if (isRecordingAI) {
      stopVoiceInput();
    }

    const currentKey = apiKey || getGeminiApiKey(profile);
    if (!currentKey) {
      setShowKeyConfig(true);
      setVoiceError('Configure sua Chave da API Google Gemini acima para ativar o envio de mensagens e comandos de voz.');
      return;
    }

    let textToSend = input.trim();
    if (!textToSend && transcriptRef.current.trim()) {
      textToSend = transcriptRef.current.trim();
    }
    if (!textToSend) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setIsTyping(true);
    setVoiceError(null);

    try {
      const routinesContext = routines.length > 0 
        ? routines.map(r => `- ${r.title} (${r.startTime}-${r.endTime}, Dias: [${r.daysOfWeek?.join(',') || ''}])`).join('\n')
        : 'Nenhuma rotina cadastrada ainda.';

      const projectsContext = projects.length > 0
        ? projects.map(p => `- ${p.name} (Área: ${p.area})`).join('\n')
        : 'Nenhum projeto cadastrado ainda.';

      const systemPrompt = `Você é o assistente executivo e gerenciador central de sistema do FlowLife.
O usuário é o Pedro (trabalha com marketing digital, ofertas validadas, tráfego orgânico, projetos paralelos, musculação, Jiu-Jitsu, teatro, leitura e igreja).

Você tem AUTORIDADE TOTAL para configurar e alterar a estrutura completa do app a partir da conversa com o usuário.
O usuário pode tanto falar pelo microfone quanto digitar livremente.

ESTRUTURA ATUAL DO SISTEMA DO USUÁRIO:
- Horários de Perfil: Acordar: ${profile.wakeTime || '07:00'} | Dormir: ${profile.bedTime || '23:00'} | Início: ${profile.workStartTime || '08:30'} | Corte Inegociável: ${profile.workEndTime || '19:00'}
- Áreas Ativas: ${profile.activeAreas.join(', ')}
- Rotinas já cadastradas:
${routinesContext}
- Projetos já cadastrados:
${projectsContext}

SUAS CAPACIDADES NO SISTEMA:
1. 'routines': Blocos semanais recorrentes inegociáveis.
   - title: nome do hábito ou compromisso (ex: "Musculação", "Jiu-Jitsu", "Aula de Teatro", "Leitura Matinal", "Almoço", "Igreja")
   - area: área da vida ("Saúde & Treino", "Descanso & Pessoal", "Estudos", "Trabalho", etc.)
   - startTime e endTime: formato "HH:mm" (ex: "18:00", "19:00")
   - daysOfWeek: array de números (0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb)
   - transitMinutesBefore / transitMinutesAfter: minutos de deslocamento (ex: 15 ou 30)
   - isFixed: true

2. 'projects': Entidades de projetos e ofertas.
   - name: nome claro (ex: "Site do Tio", "Criativos Instagram", "Oferta Validada")
   - area: área correspondente
   - description: resumo do projeto
   - color: cor hex (ex: "#10B981", "#8B5CF6", "#F59E0B")

3. 'tasks': Tarefas e metas práticas fracionadas em blocos de 30 a 90 minutos para evitar overthinking.
   - title: título claro da ação
   - type: "Projeto" | "Tarefa" | "Compromisso" | "Entrega" | "Reunião" | "Meta" | "Hábito" | "Outro"
   - area: área da tarefa
   - projectName: vincular ao nome de um projeto
   - priority: "Alta" | "Média" | "Baixa"
   - urgency e impact: números de 1 a 5
   - timeEstimate (ex: 45) e timeMax (ex: 75)
   - scheduledStartTime: horário sugerido (ex: "09:00")
   - assignedAgentId: agente copiloto ("agent-instagram-creator", "agent-study-tutor", "agent-marketing-strategist", "agent-fitness-coach", "agent-executive-writer")

4. 'profileUpdates': Atualização de limites de expediente e sono (wakeTime, bedTime, workStartTime, workEndTime).

COMO RESPONDER:
SEMPRE RESPONDA EM JSON no seguinte formato:

1. Se o usuário estiver apenas conversando, perguntando ou alinhando ideias:
{
  "action": "reply",
  "message": "Sua resposta estruturada em parágrafos aqui..."
}

2. Se você propôs uma rotina/estrutura, OU se o usuário disse para adicionar/salvar/montar/aplicar direto no sistema:
{
  "action": "apply_changes",
  "autoApply": true,
  "message": "Explicação detalhada e organizada em parágrafos do que foi estruturado...",
  "routines": [
    {
      "title": "Musculação",
      "area": "Saúde & Treino",
      "startTime": "18:00",
      "endTime": "19:00",
      "daysOfWeek": [1, 2, 3, 4, 5],
      "isFixed": true
    }
  ],
  "projects": [
    {
      "name": "Site do Tio",
      "area": "Trabalho",
      "description": "Desenvolvimento do site",
      "color": "#10B981"
    }
  ],
  "tasks": [
    {
      "title": "Rascunho da estrutura do site do tio",
      "type": "Tarefa",
      "area": "Trabalho",
      "projectName": "Site do Tio",
      "priority": "Alta",
      "urgency": 4,
      "impact": 5,
      "timeEstimate": 45,
      "timeMax": 75,
      "scheduledStartTime": "09:00",
      "assignedAgentId": "agent-executive-writer"
    }
  ],
  "profileUpdates": {
    "wakeTime": "07:00",
    "workEndTime": "19:00"
  }
}

REGRAS OBRIGATÓRIAS:
1. Se o usuário pedir para adicionar/salvar/montar/aplicar tudo o que foi conversado ("adicione toda a rotina que conversamos direto no sistema", "salve", "monte", etc.), NÃO RESPONDA APENAS TEXTO! Você DEVE gerar o JSON 'apply_changes' contendo TODAS as rotinas recorrentes, projetos e tarefas combinados no histórico da conversa, com 'autoApply': true.
2. Divida SEMPRE sua resposta em parágrafos curtos usando quebras duplas de linha (\\n\\n).
3. Destaque termos-chave, horários e prioridades com **negrito**.
4. Use tópicos com marcadores (• ou -) para opções ou etapas.
5. NUNCA envie texto corrido em um único bloco.`;

      const chatHistory = messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
      const prompt = `Histórico:\n${chatHistory}\nUser: ${textToSend}\nAI:`;

      const rawResponse = await callGemini({
        apiKey: currentKey,
        prompt,
        systemPrompt,
      });

      let text = (rawResponse || '').trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      // Extrai JSON mesmo se a IA colocar texto ao redor
      let jsonCandidate = text;
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonCandidate = text.substring(jsonStart, jsonEnd + 1);
      }
      
      try {
        const data: SystemModificationPlan = JSON.parse(jsonCandidate);
        const hasRoutines = Array.isArray(data.routines) && data.routines.length > 0;
        const hasProjects = Array.isArray(data.projects) && data.projects.length > 0;
        const hasTasks = Array.isArray(data.tasks) && data.tasks.length > 0;
        const hasProfile = Boolean(data.profileUpdates && Object.keys(data.profileUpdates).length > 0);
        const hasStructuredChanges = hasRoutines || hasProjects || hasTasks || hasProfile;

        const isUserAskingToApply = /\b(adicione|adicionar|coloque|colocar|salve|salvar|monte|montar|aplique|aplicar|insira|inserir|grave|gravar|configure|configurar|cadastre|cadastrar|integre|integrar)\b/i.test(textToSend);

        if (data.message) {
          setMessages(prev => [...prev, { role: 'ai', text: data.message! }]);
        }

        if (hasStructuredChanges) {
          if (data.autoApply || isUserAskingToApply) {
            await handleApplyChanges(data);
          } else {
            setProposedPlan(data);
          }
        } else if (data.action === 'create_tasks' && data.tasks) {
          setProposedTasks(data.tasks as any);
        } else if (!data.message) {
          setMessages(prev => [...prev, { role: 'ai', text: rawResponse }]);
        }
      } catch {
        setMessages(prev => [...prev, { role: 'ai', text: rawResponse }]);
      }

    } catch (error: any) {
      console.error("AI Error", error);
      const errMsg = formatGeminiErrorMessage(error);
      setMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${errMsg}` }]);
    } finally {
      setIsTyping(false);
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
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col h-[600px]">
          {/* Header da IA com Status da Chave */}
          <div className="mb-3 flex items-center justify-between pb-3 border-b border-border text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-amber" />
              <span className="font-medium text-gray-300">Assistente Estratégico FlowLife</span>
              {apiKey ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] flex items-center gap-1 font-semibold">
                  <Check className="w-3 h-3" /> IA Ativa
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] flex items-center gap-1 font-semibold">
                  <Key className="w-3 h-3" /> Chave Necessária
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              className="text-accent-amber hover:underline text-[11px] flex items-center gap-1 font-medium"
            >
              <Key className="w-3 h-3" />
              {showKeyConfig ? 'Ocultar Chave' : (apiKey ? 'Alterar Chave' : 'Configurar Chave')}
            </button>
          </div>

          {/* Card de Configuração da Chave da IA */}
          {showKeyConfig && (
            <div className="mb-4 bg-background/90 border border-accent-amber/30 rounded-xl p-4 text-xs space-y-3 animate-in fade-in duration-200 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
                    <Key className="w-3.5 h-3.5 text-accent-amber" /> Chave da API Google Gemini
                  </h4>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    Insira sua chave para ativar a IA e os comandos de voz. Chave 100% gratuita.
                  </p>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-accent-amber rounded-lg border border-accent-amber/20 flex items-center gap-1 text-[10px] shrink-0 font-medium"
                >
                  Criar Chave Grátis <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <form onSubmit={handleSaveApiKey} className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder="Cole sua chave AIzaSy..."
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber font-mono"
                />
                <button
                  type="submit"
                  disabled={keySaving || !keyInput.trim()}
                  className="px-3.5 py-2 bg-accent-amber text-background font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0 text-xs shadow-sm"
                >
                  {keySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {keySaving ? 'Testando...' : 'Salvar e Ativar'}
                </button>
              </form>

              {keyMessage && (
                <div className={cn(
                  "p-2.5 rounded-lg text-xs flex items-center gap-2",
                  keyMessage.type === 'success' 
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                )}>
                  {keyMessage.text}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {messages.map((m, i) => (
              <div 
                key={i} 
                className={cn(
                  "p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed shadow-sm",
                  m.role === 'user' 
                    ? "bg-accent-amber text-background ml-auto font-medium" 
                    : "bg-background border border-border text-gray-200"
                )}
              >
                <ChatMessageFormatter content={m.text} isUser={m.role === 'user'} />
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> FlowLife pensando no fracionamento...
              </div>
            )}

            {/* Card de Estrutura do Sistema Proposta pela IA */}
            {proposedPlan && (
              <div className="bg-background border-2 border-accent-amber/50 rounded-2xl p-4 space-y-3.5 shadow-xl animate-in fade-in-50 duration-200">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent-amber animate-pulse" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Estrutura do Sistema Pronta para Aplicação
                    </h4>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-accent-amber/20 text-accent-amber rounded-full font-mono font-bold">
                    {(proposedPlan.routines?.length || 0) + (proposedPlan.projects?.length || 0) + (proposedPlan.tasks?.length || 0)} itens
                  </span>
                </div>

                {/* Rotinas Recorrentes Propostas */}
                {proposedPlan.routines && proposedPlan.routines.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-accent-amber flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5" /> Rotinas Recorrentes Semanais ({proposedPlan.routines.length}):
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {proposedPlan.routines.map((r, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/5 transition-colors">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="text-[10px] px-2 py-0.5 bg-accent-amber/20 text-accent-amber rounded-md font-mono font-bold shrink-0">
                              {r.startTime} - {r.endTime}
                            </span>
                            <span className="font-medium text-white truncate">{r.title}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 bg-surface px-2 py-0.5 rounded border border-border shrink-0">
                            {formatDaysDisplay(r.daysOfWeek)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Projetos Propostos */}
                {proposedPlan.projects && proposedPlan.projects.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" /> Projetos / Ofertas a Criar ({proposedPlan.projects.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {proposedPlan.projects.map((proj, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: proj.color || '#10B981' }} />
                            <span className="font-medium text-emerald-200 truncate">{proj.name}</span>
                          </div>
                          <span className="text-[9px] text-emerald-400/80 uppercase font-mono">{proj.area || 'Trabalho'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tarefas Fracionadas Propostas */}
                {proposedPlan.tasks && proposedPlan.tasks.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-blue-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Tarefas Fracionadas ({proposedPlan.tasks.length}):
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {proposedPlan.tasks.map((pt, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                          <div className="flex items-center gap-2 truncate pr-2">
                            {pt.scheduledStartTime && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono font-bold shrink-0">
                                {pt.scheduledStartTime}
                              </span>
                            )}
                            <span className="font-medium text-white truncate">{pt.title}</span>
                          </div>
                          <span className="font-mono text-gray-400 shrink-0 text-[11px]">{pt.timeEstimate || 45}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Limites de Perfil Propostos */}
                {proposedPlan.profileUpdates && Object.keys(proposedPlan.profileUpdates).length > 0 && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200 flex flex-wrap items-center gap-3">
                    <span className="font-bold">Ajuste de Limites:</span>
                    {proposedPlan.profileUpdates.wakeTime && <span>Acordar: <strong>{proposedPlan.profileUpdates.wakeTime}</strong></span>}
                    {proposedPlan.profileUpdates.workEndTime && <span>Corte do Trabalho: <strong>{proposedPlan.profileUpdates.workEndTime}</strong></span>}
                    {proposedPlan.profileUpdates.bedTime && <span>Dormir: <strong>{proposedPlan.profileUpdates.bedTime}</strong></span>}
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="flex gap-2 pt-1">
                  <button 
                    onClick={() => handleApplyChanges(proposedPlan)}
                    disabled={loading}
                    className="flex-1 py-2.5 bg-accent-emerald text-background font-bold rounded-xl text-xs hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                    ⚡ Aplicar Toda Essa Estrutura no Sistema com 1 Clique
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposedPlan(null)}
                    disabled={loading}
                    className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl text-xs font-semibold transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {/* Card de Confirmação & Navegação Rápida Pós-Aplicação */}
            {appliedSummary && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        Estrutura Sincronizada no Sistema com Sucesso!
                      </h4>
                      <p className="text-[11px] text-emerald-300/80">
                        Aplicado às {appliedSummary.timestamp}. O FlowLife já sincronizou sua agenda e rotina.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setAppliedSummary(null)} 
                    className="text-gray-400 hover:text-white text-xs p-1"
                    title="Fechar aviso"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px]">
                  {appliedSummary.routinesCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-medium flex items-center gap-1">
                      <Repeat className="w-3 h-3" /> {appliedSummary.routinesCount} Rotina(s)
                    </span>
                  )}
                  {appliedSummary.projectsCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-medium flex items-center gap-1">
                      <Layers className="w-3 h-3" /> {appliedSummary.projectsCount} Projeto(s)
                    </span>
                  )}
                  {appliedSummary.tasksCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {appliedSummary.tasksCount} Tarefa(s)
                    </span>
                  )}
                  {appliedSummary.profileUpdated && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-medium flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> Limites Atualizados
                    </span>
                  )}
                </div>

                {onNavigateTab && (
                  <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap gap-2">
                    <span className="text-[11px] text-gray-400 flex items-center mr-1">Ir para:</span>
                    <button
                      onClick={() => onNavigateTab('today')}
                      className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold rounded-lg text-xs flex items-center gap-1 transition-colors border border-emerald-500/30"
                    >
                      <Calendar className="w-3.5 h-3.5" /> Agenda de Hoje <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onNavigateTab('routines')}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-200 font-semibold rounded-lg text-xs flex items-center gap-1 transition-colors border border-white/10"
                    >
                      <Repeat className="w-3.5 h-3.5 text-accent-amber" /> Rotinas Semanais <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onNavigateTab('projects')}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-200 font-semibold rounded-lg text-xs flex items-center gap-1 transition-colors border border-white/10"
                    >
                      <FolderKanban className="w-3.5 h-3.5 text-blue-400" /> Projetos <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Proposta Legada de Tarefas da IA (quando vem apenas lista de tarefas) */}
            {proposedTasks && !proposedPlan && (
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
              disabled={isTyping || (!input.trim() && !isRecordingAI)}
              className="px-4 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 shrink-0"
              title={isRecordingAI ? "Parar e Enviar para a IA" : "Enviar para a IA"}
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

          {/* Seletor de Agente Copiloto IA */}
          <div className="bg-background/40 border border-accent-amber/20 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-accent-amber/20 text-accent-amber font-bold text-xs">
                ✨
              </div>
              <div>
                <label className="block text-xs font-bold text-white leading-tight">
                  Atribuir Agente Copiloto IA
                </label>
                <p className="text-[11px] text-gray-400">
                  Um mentor ou braço direito para ajudar na produção ou execução desta tarefa.
                </p>
              </div>
            </div>

            <select
              value={assignedAgentId}
              onChange={e => setAssignedAgentId(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-amber min-w-[220px]"
            >
              <option value="">Sem copiloto</option>
              {DEFAULT_AI_AGENTS.map(ag => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.category})
                </option>
              ))}
            </select>
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
