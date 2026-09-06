import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Send, 
  Loader2, 
  Copy, 
  Check, 
  FileText, 
  Mic, 
  Square, 
  Video, 
  GraduationCap, 
  TrendingUp, 
  Dumbbell, 
  PenTool, 
  Bot, 
  ArrowRight, 
  ChevronDown 
} from 'lucide-react';
import { Task, AIAgent, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { soundEngine } from '../lib/notificationEngine';
import { getGeminiApiKey, callGemini, formatGeminiErrorMessage } from '../lib/gemini';

interface TaskCopilotDrawerProps {
  task: Task;
  agent: AIAgent;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTaskNotes?: (notes: string) => Promise<void>;
  availableAgents?: AIAgent[];
  onSwitchAgent?: (newAgentId: string) => void;
  profile?: UserProfile;
}

export function TaskCopilotDrawer({
  task,
  agent,
  isOpen,
  onClose,
  onUpdateTaskNotes,
  availableAgents = [],
  onSwitchAgent,
  profile
}: TaskCopilotDrawerProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string; id: string }[]>([
    {
      id: 'init',
      role: 'agent',
      text: `Olá! Sou seu **${agent.name}**.\n\nEstou pronto para ser seu braço direito na tarefa **"${task.title}"** (${task.timeEstimate} min planejados).\n\nToque em uma das sugestões abaixo ou me fale o que você precisa!`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedNotesId, setSavedNotesId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen) return null;

  // Icon selector
  const renderAgentIcon = (iconName: string, className = "w-5 h-5") => {
    switch (iconName) {
      case 'Video': return <Video className={className} />;
      case 'GraduationCap': return <GraduationCap className={className} />;
      case 'TrendingUp': return <TrendingUp className={className} />;
      case 'Dumbbell': return <Dumbbell className={className} />;
      case 'PenTool': return <PenTool className={className} />;
      default: return <Bot className={className} />;
    }
  };

  const copilotTranscriptRef = useRef('');

  const handleSendMessage = async (customPrompt?: string) => {
    if (isRecording) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      setIsRecording(false);
    }

    let textToSend = (customPrompt || input).trim();
    if (!textToSend && copilotTranscriptRef.current.trim()) {
      textToSend = copilotTranscriptRef.current.trim();
    }

    const apiKey = getGeminiApiKey(profile);
    if (!apiKey) {
      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: '⚠️ **Chave da API do Google Gemini não encontrada.**\n\nPor favor, insira sua chave gratuita do Gemini na aba **"Captura & IA"** ou em **"Configurações"** para conversar com os Agentes Copilotos.',
          id: `err-${Date.now()}`
        }
      ]);
      return;
    }

    if (!textToSend) return;

    if (!customPrompt) setInput('');
    copilotTranscriptRef.current = '';

    const userMessageId = `user-${Date.now()}`;
    const newHistory = [...messages, { role: 'user' as const, text: textToSend, id: userMessageId }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const prompt = `
${agent.systemPrompt}

CONTEXTO DA TAREFA ATUAL:
- Título da Tarefa: "${task.title}"
- Área da Vida: ${task.area}
- Tempo Estimado: ${task.timeEstimate} minutos
- Teto Máximo: ${task.timeMax || Math.round(task.timeEstimate * 1.5)} minutos
- Anotações Atuais: ${task.notes || 'Nenhuma anotação prévia.'}

HISTÓRICO DA CONVERSA:
${newHistory.map(m => `${m.role === 'user' ? 'Usuário' : agent.name}: ${m.text}`).join('\n\n')}

Responda de forma altamente prática, direta e estruturada para que o usuário possa aplicar imediatamente na tarefa agora!`;

      const responseText = await callGemini({
        apiKey,
        prompt
      });

      setMessages(prev => [
        ...prev, 
        { role: 'agent', text: responseText || 'Não consegui formular uma resposta no momento.', id: `agent-${Date.now()}` }
      ]);
    } catch (e: any) {
      console.error('Erro no copiloto:', e);
      const msg = formatGeminiErrorMessage(e);
      setMessages(prev => [
        ...prev,
        { role: 'agent', text: `⚠️ ${msg}`, id: `err-${Date.now()}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const saveToTaskNotes = async (text: string, id: string) => {
    if (!onUpdateTaskNotes) return;
    const combined = task.notes ? `${task.notes}\n\n---\n[Copiloto ${agent.name}]:\n${text}` : `[Copiloto ${agent.name}]:\n${text}`;
    await onUpdateTaskNotes(combined);
    setSavedNotesId(id);
    soundEngine.play('test');
    setTimeout(() => setSavedNotesId(null), 3000);
  };

  // Voice Input for Copilot
  const toggleVoice = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Reconhecimento de voz não suportado diretamente neste navegador.');
      return;
    }

    try {
      copilotTranscriptRef.current = '';
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = true;

      setIsRecording(true);

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        copilotTranscriptRef.current = transcript;
        setInput(transcript);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Erro ao abrir microfone:', e);
      setIsRecording(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Drawer Container */}
      <div className="w-full max-w-lg bg-surface border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-background font-bold shadow-md"
              style={{ backgroundColor: agent.color || '#f59e0b' }}
            >
              {renderAgentIcon(agent.avatarIcon, "w-5 h-5 text-zinc-950")}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm leading-tight">{agent.name}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-amber/15 text-accent-amber border border-accent-amber/30">
                  {agent.category}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">{agent.role}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switch Agent Dropdown */}
            {availableAgents.length > 1 && onSwitchAgent && (
              <select
                value={agent.id}
                onChange={(e) => onSwitchAgent(e.target.value)}
                className="bg-background border border-border rounded-lg text-[11px] text-gray-300 px-2 py-1 focus:outline-none focus:border-accent-amber"
              >
                {availableAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Fechar Copiloto"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Task Context Card */}
        <div className="px-4 py-2.5 bg-background/80 border-b border-border flex items-center justify-between text-xs">
          <div className="truncate pr-2">
            <span className="text-gray-400">Tarefa: </span>
            <span className="font-semibold text-white truncate">{task.title}</span>
          </div>
          <span className="font-mono text-accent-amber font-bold shrink-0">{task.timeEstimate} min</span>
        </div>

        {/* Suggested Prompts (1-Click Chips) */}
        <div className="p-3 bg-surface/50 border-b border-border overflow-x-auto">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-accent-amber" /> Ações Rápidas em 1 Toque:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agent.suggestedPrompts.map((promptText, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(promptText)}
                disabled={loading}
                className="px-2.5 py-1.5 bg-background border border-border hover:border-accent-amber text-[11px] text-gray-200 rounded-lg hover:text-white transition-all text-left flex items-center gap-1.5 hover:bg-accent-amber/5 disabled:opacity-50"
              >
                <span>{promptText}</span>
                <ArrowRight className="w-3 h-3 text-accent-amber shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => {
            const isAgent = m.role === 'agent';
            return (
              <div 
                key={m.id}
                className={cn(
                  "rounded-2xl p-4 text-xs md:text-sm leading-relaxed max-w-[92%]",
                  isAgent 
                    ? "bg-background border border-border text-gray-200" 
                    : "bg-accent-amber text-background ml-auto font-medium"
                )}
              >
                <div className="whitespace-pre-wrap font-sans">{m.text}</div>

                {isAgent && m.id !== 'init' && (
                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-2 justify-end">
                    <button
                      onClick={() => copyToClipboard(m.text, m.id)}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors"
                      title="Copiar texto"
                    >
                      {copiedId === m.id ? <Check className="w-3 h-3 text-accent-emerald" /> : <Copy className="w-3 h-3" />}
                      {copiedId === m.id ? 'Copiado!' : 'Copiar'}
                    </button>

                    {onUpdateTaskNotes && (
                      <button
                        onClick={() => saveToTaskNotes(m.text, m.id)}
                        className="px-2.5 py-1 bg-accent-amber/15 hover:bg-accent-amber/25 text-accent-amber border border-accent-amber/30 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors"
                        title="Salvar nas anotações da tarefa"
                      >
                        {savedNotesId === m.id ? <Check className="w-3 h-3 text-accent-emerald" /> : <FileText className="w-3 h-3" />}
                        {savedNotesId === m.id ? 'Salvo nas Notas!' : 'Salvar nas Notas'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 p-2">
              <Loader2 className="w-4 h-4 animate-spin text-accent-amber" />
              {agent.name} elaborando o material...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-border bg-surface flex items-center gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            className={cn(
              "p-2.5 rounded-xl font-bold transition-all shrink-0",
              isRecording 
                ? "bg-red-500 text-white animate-pulse" 
                : "bg-background border border-accent-amber/40 text-accent-amber hover:bg-accent-amber/10"
            )}
            title={isRecording ? "Parar de falar" : "Falar com o agente"}
          >
            {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={isRecording ? "Ouvindo sua fala..." : `Peça algo para ${agent.name}...`}
            className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-accent-amber placeholder:text-gray-500"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={loading || (!input.trim() && !isRecording)}
            className="px-4 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 shrink-0"
            title={isRecording ? "Parar e Enviar" : "Enviar mensagem"}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
