import React, { useState } from 'react';
import { RoutineBlock, UserProfile, LifeArea } from '../types';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { 
  Flame, 
  Plus, 
  Clock, 
  Trash2, 
  ShieldAlert, 
  Car, 
  Save, 
  Check,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { DEFAULT_ROUTINES } from '../lib/smartScheduler';
import { cn } from '../lib/utils';

interface RoutinesViewProps {
  profile: UserProfile;
  routines: RoutineBlock[];
}

const DAYS_OF_WEEK = [
  { id: 0, label: 'Dom' },
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sáb' },
];

export function RoutinesView({ profile, routines }: RoutinesViewProps) {
  // Configuração dos limites inegociáveis do perfil
  const [workStartTime, setWorkStartTime] = useState(profile.workStartTime || '08:30');
  const [workEndTime, setWorkEndTime] = useState(profile.workEndTime || '19:00');
  const [wakeTime, setWakeTime] = useState(profile.wakeTime || '07:00');
  const [bedTime, setBedTime] = useState(profile.bedTime || '23:00');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Modal de Nova Rotina
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<LifeArea>('Saúde & Treino');
  const [startTime, setStartTime] = useState('09:30');
  const [endTime, setEndTime] = useState('10:45');
  const [transitBefore, setTransitBefore] = useState(15);
  const [transitAfter, setTransitAfter] = useState(15);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const handleSaveProfileBoundaries = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSaved(false);

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        workStartTime,
        workEndTime,
        wakeTime,
        bedTime
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (e) {
      console.error("Erro ao salvar limites", e);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await addDoc(collection(db, 'routines'), {
        userId: profile.uid,
        title: title.trim(),
        area,
        startTime,
        endTime,
        transitMinutesBefore: Number(transitBefore),
        transitMinutesAfter: Number(transitAfter),
        daysOfWeek: selectedDays,
        isFixed: true,
        createdAt: new Date().toISOString()
      });

      setTitle('');
      setShowModal(false);
    } catch (e) {
      console.error("Erro ao adicionar rotina", e);
    }
  };

  const handleDeleteRoutine = async (routineId: string) => {
    if (!confirm('Deseja remover esta rotina inegociável?')) return;
    try {
      await deleteDoc(doc(db, 'routines', routineId));
    } catch (e) {
      console.error("Erro ao excluir", e);
    }
  };

  const toggleDay = (dayId: number) => {
    setSelectedDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  // Exibir rotinas cadastradas ou os padrões
  const displayRoutines = routines.length > 0 ? routines : DEFAULT_ROUTINES.map((r, i) => ({
    ...r,
    id: `default-${i}`,
    userId: profile.uid
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
          <Flame className="w-4 h-4" />
          Estrutura & Blocos Inegociáveis
        </div>
        <h2 className="font-serif text-3xl text-white">Rotinas & Limites de Vida</h2>
        <p className="text-sm text-gray-400">
          Sua saúde, seus treinos, igreja e horário de dormir são restrições do sistema, não obstáculos.
        </p>
      </div>

      {/* 1. Limites Globais de Jornada e Encerramento */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-accent-amber/10 text-accent-amber">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Limites Inegociáveis do Dia</h3>
            <p className="text-xs text-gray-400">O sistema nunca agendará tarefas fora da sua janela permitida.</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfileBoundaries} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Acordar</label>
            <input 
              type="time" 
              value={wakeTime}
              onChange={e => setWakeTime(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-amber"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Início do Trabalho</label>
            <input 
              type="time" 
              value={workStartTime}
              onChange={e => setWorkStartTime(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-amber"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-red-400 font-bold mb-1">
              Encerramento Obrigatório
            </label>
            <input 
              type="time" 
              value={workEndTime}
              onChange={e => setWorkEndTime(e.target.value)}
              className="w-full bg-background border-2 border-red-500/40 rounded-lg px-3 py-2 text-sm text-red-300 font-bold focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Hora de Dormir</label>
            <input 
              type="time" 
              value={bedTime}
              onChange={e => setBedTime(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-amber"
            />
          </div>

          <div className="md:col-span-4 flex justify-end pt-2">
            <button 
              type="submit"
              disabled={isSavingProfile}
              className="px-5 py-2.5 bg-accent-amber text-background font-bold text-xs rounded-xl hover:bg-amber-400 transition-colors flex items-center gap-2"
            >
              {profileSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {profileSaved ? 'Limites Salvos!' : 'Salvar Limites de Jornada'}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Lista de Rotinas Estruturais (Musculação, Jiu-Jitsu, Igreja, etc.) */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">Blocos Estruturais Cadastrados</h3>
            <p className="text-xs text-gray-400">Atividades que bloqueiam a agenda com reserva de deslocamento.</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="px-3.5 py-2 bg-accent-emerald text-background font-bold text-xs rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Novo Bloco
          </button>
        </div>

        <div className="space-y-3">
          {displayRoutines.map(routine => {
            const hasTransit = (routine.transitMinutesBefore || 0) > 0 || (routine.transitMinutesAfter || 0) > 0;
            return (
              <div 
                key={routine.id}
                className="bg-background/80 border border-border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-white">{routine.title}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                      {routine.area}
                    </span>
                  </div>

                  {/* Dias da semana */}
                  <div className="flex items-center gap-1 mt-2">
                    {DAYS_OF_WEEK.map(d => (
                      <span 
                        key={d.id}
                        className={cn(
                          "w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center",
                          routine.daysOfWeek.includes(d.id) 
                            ? "bg-accent-amber text-background" 
                            : "text-gray-600 bg-white/5"
                        )}
                      >
                        {d.label[0]}
                      </span>
                    ))}
                  </div>

                  {hasTransit && (
                    <div className="flex items-center gap-1 text-[11px] text-blue-400 mt-2">
                      <Car className="w-3.5 h-3.5" />
                      <span>Deslocamento: {routine.transitMinutesBefore || 0}m antes / {routine.transitMinutesAfter || 0}m depois</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 self-end md:self-center">
                  <div className="text-right font-mono">
                    <div className="text-sm text-white font-bold">{routine.startTime} – {routine.endTime}</div>
                    <div className="text-[11px] text-gray-500">Horário Fixo</div>
                  </div>

                  {routine.id && !routine.id.startsWith('default-') && (
                    <button 
                      onClick={() => handleDeleteRoutine(routine.id!)}
                      className="text-gray-500 hover:text-red-400 p-2"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Novo Bloco de Rotina */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-4">Adicionar Bloco Estrutural</h3>
            <form onSubmit={handleAddRoutine} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Nome da Atividade</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Ex: Musculação, Jiu-Jitsu, Culto..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-amber"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Área</label>
                <select 
                  value={area}
                  onChange={e => setArea(e.target.value as LifeArea)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-amber"
                >
                  <option value="Saúde & Treino">Saúde & Treino</option>
                  <option value="Igreja & Espiritual">Igreja & Espiritual</option>
                  <option value="Descanso & Pessoal">Descanso & Pessoal</option>
                  <option value="Trabalho">Trabalho</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Horário de Início</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    required
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-amber"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Horário de Fim</label>
                  <input 
                    type="time" 
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    required
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-amber"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Deslocamento Antes (min)</label>
                  <input 
                    type="number" 
                    value={transitBefore}
                    onChange={e => setTransitBefore(Number(e.target.value))}
                    min="0" step="5"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-amber"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Deslocamento Depois (min)</label>
                  <input 
                    type="number" 
                    value={transitAfter}
                    onChange={e => setTransitAfter(Number(e.target.value))}
                    min="0" step="5"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-amber"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Dias da Semana</label>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map(d => (
                    <button 
                      key={d.id}
                      type="button"
                      onClick={() => toggleDay(d.id)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-bold transition-colors",
                        selectedDays.includes(d.id) 
                          ? "bg-accent-amber text-background" 
                          : "bg-background border border-border text-gray-400"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-gray-400 hover:text-white text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-accent-emerald text-background font-bold rounded-lg text-sm hover:bg-emerald-400 transition-colors"
                >
                  Salvar Bloco
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
