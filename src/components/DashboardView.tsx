import React, { useState, useEffect } from 'react';
import { Task, UserProfile } from '../types';
import { GoogleGenAI } from '@google/genai';
import { Loader2, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface DashboardViewProps {
  profile: UserProfile;
  tasks: Task[];
}

export function DashboardView({ profile, tasks }: DashboardViewProps) {
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  
  const overdueTasks = pendingTasks.filter(t => 
    parseISO(t.deadline).getTime() < new Date().setHours(0,0,0,0)
  );

  // Calculate area distribution
  const areaStats = tasks.reduce((acc, task) => {
    acc[task.area] = (acc[task.area] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const generateInsight = async () => {
    if (!process.env.GEMINI_API_KEY) {
      setInsight("Chave da API do Gemini não configurada.");
      return;
    }

    setLoadingInsight(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
        Atue como um coach de produtividade. Analise os seguintes dados do usuário e dê um insight curto e estratégico (máximo 3 frases) sobre o equilíbrio da vida dele.
        
        Nome: ${profile.name}
        Tarefas Totais: ${tasks.length}
        Concluídas: ${completedTasks.length}
        Atrasadas: ${overdueTasks.length}
        Distribuição por Área: ${JSON.stringify(areaStats)}
        
        Dê um conselho prático e motivador.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
      });

      setInsight(response.text || "Continue o bom trabalho!");
    } catch (error) {
      console.error("Error generating insight", error);
      setInsight("Não foi possível gerar o insight no momento.");
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
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="font-serif text-3xl mb-2">Dashboard</h2>
        <p className="text-gray-400">Visão geral e métricas da sua vida.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="text-gray-400 text-sm mb-2">Total de Itens</div>
          <div className="text-4xl font-serif text-white">{tasks.length}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="text-gray-400 text-sm mb-2">Concluídos</div>
          <div className="text-4xl font-serif text-accent-emerald">{completedTasks.length}</div>
        </div>
        <div className="bg-surface border border-red-500/30 rounded-xl p-6 bg-red-500/5">
          <div className="text-red-400 text-sm mb-2">Em Atraso</div>
          <div className="text-4xl font-serif text-red-500">{overdueTasks.length}</div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-accent-amber"></div>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-accent-amber/10 rounded-lg text-accent-amber">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium mb-2">Insight Estratégico</h3>
            {loadingInsight ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Analisando seu padrão de vida...
              </div>
            ) : (
              <p className="text-gray-300 leading-relaxed">{insight}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-medium mb-6">Distribuição por Área</h3>
        <div className="space-y-4">
          {Object.entries(areaStats).map(([area, count]) => {
            const percentage = Math.round((count / tasks.length) * 100);
            return (
              <div key={area}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{area}</span>
                  <span className="text-gray-400">{count} ({percentage}%)</span>
                </div>
                <div className="w-full bg-background rounded-full h-2">
                  <div 
                    className="bg-accent-emerald h-full rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
