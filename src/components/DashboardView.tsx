import React, { useState, useEffect } from 'react';
import { Task, UserProfile, Project } from '../types';
import { GoogleGenAI } from '@google/genai';
import { 
  Loader2, 
  Sparkles, 
  PieChart, 
  TrendingUp, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Flame,
  Award
} from 'lucide-react';
import { 
  calculateLifeBalance, 
  analyzeEstimationAccuracy, 
  analyzeProjectsHealth 
} from '../lib/adaptiveLearning';
import { cn } from '../lib/utils';

interface DashboardViewProps {
  profile: UserProfile;
  tasks: Task[];
  projects?: Project[];
}

export function DashboardView({ profile, tasks, projects = [] }: DashboardViewProps) {
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  
  const overdueTasks = pendingTasks.filter(t => 
    t.deadline && new Date(t.deadline).getTime() < new Date().setHours(0,0,0,0)
  );

  const totalMinutesInvested = completedTasks.reduce((sum, t) => sum + (t.actualDuration || t.timeEstimate || 30), 0);
  const hoursInvested = Math.round(totalMinutesInvested / 60 * 10) / 10;

  // Análise de Equilíbrio de Vida
  const lifeBalance = calculateLifeBalance(tasks);

  // Análise de Precisão de Estimativas (Detector de Overthinking)
  const estimationInsights = analyzeEstimationAccuracy(completedTasks);

  // Saúde dos Projetos
  const projectHealth = analyzeProjectsHealth(projects, tasks);
  const stalledCount = projectHealth.filter(p => p.isStalled).length;

  const generateInsight = async () => {
    if (!process.env.GEMINI_API_KEY) {
      setInsight("Chave da API do Gemini não configurada.");
      return;
    }

    setLoadingInsight(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
        Atue como o mentor executivo e coach de vida do Pedro (profissional de marketing digital, com múltiplos projetos, ofertas validadas, treinos de musculação, Jiu-Jitsu e igreja).
        Analise os dados de execução dele:
        
        Nome: ${profile.name}
        Horas Investidas em Tarefas: ${hoursInvested}h
        Tarefas Concluídas: ${completedTasks.length}
        Tarefas Pendentes: ${pendingTasks.length}
        Tarefas em Atraso: ${overdueTasks.length}
        Projetos Estagnados (>7 dias): ${stalledCount}
        Distribuição de Vida: ${JSON.stringify(lifeBalance.map(b => `${b.area}: ${b.percentage}%`))}
        Calibração de Tempo (Overthinking): ${JSON.stringify(estimationInsights.map(e => e.recommendation))}
        
        Dê um parecer estratégico, direto, motivador e focado em evitar desperdício de tempo e preservar a saúde e o horário de encerramento das ${profile.workEndTime || '19:00'}.
        Máximo de 3 parágrafos curtos.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
      });

      setInsight(response.text || "Continue focado no que gera maior impacto!");
    } catch (error) {
      console.error("Error generating insight", error);
      setInsight("Não foi possível gerar o diagnóstico no momento.");
    } finally {
      setLoadingInsight(false);
    }
  };

  useEffect(() => {
    if (tasks.length > 0 && !insight) {
      generateInsight();
    }
  }, [tasks.length]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
          <PieChart className="w-4 h-4" />
          Diagnóstico Semanal & Equilíbrio
        </div>
        <h2 className="font-serif text-3xl text-white">Equilíbrio de Vida & Aprendizado</h2>
        <p className="text-sm text-gray-400">
          Métricas de execução real, detecção de overthinking e saúde das suas ofertas.
        </p>
      </div>

      {/* 1. KPIs Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Tempo Investido</span>
            <Clock className="w-4 h-4 text-accent-amber" />
          </div>
          <div className="text-3xl font-serif text-white">{hoursInvested}h</div>
          <div className="text-[11px] text-gray-500 mt-1">em tarefas concluídas</div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Tarefas Entregues</span>
            <CheckCircle2 className="w-4 h-4 text-accent-emerald" />
          </div>
          <div className="text-3xl font-serif text-accent-emerald">{completedTasks.length}</div>
          <div className="text-[11px] text-gray-500 mt-1">com foco e encerramento</div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Itens em Atraso</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-serif text-red-400">{overdueTasks.length}</div>
          <div className="text-[11px] text-gray-500 mt-1">precisam de realocação</div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Projetos Estagnados</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className={cn("text-3xl font-serif", stalledCount > 0 ? "text-amber-400" : "text-gray-300")}>
            {stalledCount}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">sem atividade há {'>'}7 dias</div>
        </div>
      </div>

      {/* 2. Insight Estratégico com IA */}
      <div className="bg-surface border border-border rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-accent-amber" />
        <div className="flex items-start gap-4">
          <div className="p-3 bg-accent-amber/10 rounded-xl text-accent-amber shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-white">Parecer Executivo da sua Rotina</h3>
              <button 
                onClick={generateInsight}
                disabled={loadingInsight}
                className="text-xs text-accent-amber hover:underline flex items-center gap-1"
              >
                {loadingInsight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Atualizar Diagnóstico'}
              </button>
            </div>

            {loadingInsight ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-accent-amber" /> Analisando padrões de tempo e execução...
              </div>
            ) : (
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                {insight || "Inicie suas primeiras tarefas para que o FlowLife aprenda seus padrões de produtividade."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3. Painel de Equilíbrio de Vida (% por Área) */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">Equilíbrio das Áreas de Vida</h3>
          <span className="text-xs text-gray-400">Distribuição do tempo real gasto</span>
        </div>

        {lifeBalance.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Nenhuma atividade concluída para compor o gráfico.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex h-3 rounded-full overflow-hidden bg-background">
              {lifeBalance.map(b => (
                <div 
                  key={b.area}
                  style={{ width: `${b.percentage}%`, backgroundColor: b.color }}
                  title={`${b.area}: ${b.percentage}%`}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
              {lifeBalance.map(b => (
                <div key={b.area} className="flex items-center justify-between text-xs bg-background/60 p-2.5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="text-gray-300">{b.area}</span>
                  </div>
                  <span className="font-mono text-white font-bold">{b.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Sistema Aprendiz: Calibração de Estimativas & Detector de Overthinking */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-accent-amber" />
          <h3 className="text-base font-bold text-white">Sistema Aprendiz (Calibração de Estimativas)</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          O FlowLife compara o tempo que você planejou vs. o tempo real que levou, para impedir estimativas irrealistas.
        </p>

        {estimationInsights.length === 0 ? (
          <div className="text-xs text-gray-500 italic bg-background/40 p-4 rounded-xl border border-white/5">
            Execute mais tarefas no Modo Foco para que o sistema aprenda sua velocidade média por categoria.
          </div>
        ) : (
          <div className="space-y-3">
            {estimationInsights.map(ei => (
              <div key={ei.areaOrType} className="bg-background/80 border border-border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white mb-1">{ei.areaOrType}</div>
                  <p className="text-xs text-gray-300">{ei.recommendation}</p>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                  <div>
                    <span className="text-gray-500">Média Planejada: </span>
                    <span className="text-gray-300">{ei.avgEstimatedMinutes}m</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Média Real: </span>
                    <span className={cn("font-bold", ei.discrepancyRatio >= 1.3 ? "text-amber-400" : "text-accent-emerald")}>
                      {ei.avgActualMinutes}m
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
