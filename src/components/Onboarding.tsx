import React, { useState } from 'react';
import { LifeArea } from '../types';
import { cn } from '../lib/utils';

const ALL_AREAS: LifeArea[] = [
  "Trabalho", 
  "Conteúdo & Tráfego", 
  "Projetos & Ofertas", 
  "Saúde & Treino", 
  "Igreja & Espiritual", 
  "Descanso & Pessoal", 
  "Finanças", 
  "Estudos", 
  "Casa & Família", 
  "Social & Relacionamentos", 
  "Outro"
];

interface OnboardingProps {
  onComplete: (name: string, dailyCapacity: number, activeAreas: LifeArea[]) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [hours, setHours] = useState(6);
  const [areas, setAreas] = useState<LifeArea[]>([]);

  const handleNext = () => {
    if (step === 1 && !name.trim()) return;
    if (step === 2 && hours <= 0) return;
    if (step === 3 && areas.length === 0) return;

    if (step < 3) {
      setStep(step + 1);
    } else {
      onComplete(name, hours * 60, areas);
    }
  };

  const toggleArea = (area: LifeArea) => {
    setAreas(prev => 
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-surface border border-border p-8 rounded-2xl max-w-md w-full shadow-2xl">
        <h1 className="font-serif text-3xl text-accent-amber mb-6 text-center">FlowLife</h1>
        
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-medium">Como podemos chamar você?</h2>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-emerald transition-colors"
              placeholder="Seu nome"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-medium">Quantas horas por dia você tem disponível para suas tarefas?</h2>
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="1" max="16" 
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full accent-accent-emerald"
              />
              <span className="text-2xl font-serif text-accent-amber w-12 text-center">{hours}h</span>
            </div>
            <p className="text-sm text-gray-400">Isso nos ajuda a não sobrecarregar o seu dia.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-medium">Quais áreas da sua vida você quer organizar?</h2>
            <div className="grid grid-cols-2 gap-3">
              {ALL_AREAS.map(area => (
                <button
                  key={area}
                  onClick={() => toggleArea(area)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm text-left transition-all",
                    areas.includes(area) 
                      ? "border-accent-emerald bg-accent-emerald/10 text-accent-emerald" 
                      : "border-border bg-background text-gray-400 hover:border-gray-500"
                  )}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          {step > 1 ? (
            <button 
              onClick={() => setStep(step - 1)}
              className="px-6 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              Voltar
            </button>
          ) : <div></div>}
          
          <button 
            onClick={handleNext}
            disabled={(step === 1 && !name.trim()) || (step === 3 && areas.length === 0)}
            className="px-6 py-2 bg-accent-emerald text-background font-medium rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 3 ? 'Começar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}
