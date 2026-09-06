import React, { useState } from 'react';
import { RoutineBlock, UserProfile, LifeArea } from '../types';
import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  writeBatch 
} from 'firebase/firestore';
import { 
  Flame, 
  Plus, 
  Clock, 
  Trash2, 
  ShieldAlert, 
  Car, 
  Save, 
  Check,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  Loader2
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
  const currentUid = auth.currentUser?.uid || profile.uid;

  // Configuração dos limites inegociáveis do perfil (Apple Design)
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

  // Modais de Confirmação de Exclusão e Reset
  const [isResetting, setIsResetting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSaveProfileBoundaries = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSaved(false);

    try {
      await setDoc(doc(db, 'users', currentUid), {
        workStartTime,
        workEndTime,
        wakeTime,
        bedTime
      }, { merge: true });
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
        userId: currentUid,
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

      // Se havia flag de rotina limpa, remove
      if (profile.routinesCleared) {
        await setDoc(doc(db, 'users', currentUid), {
          routinesCleared: false
        }, { merge: true });
      }

      setTitle('');
      setShowModal(false);
    } catch (e) {
      console.error("Erro ao adicionar rotina", e);
    }
  };

  // Excluir uma rotina individual
  const handleDeleteRoutine = async (routineId: string) => {
    if (!routineId) return;
    if (!confirm('Deseja excluir esta rotina?')) return;

    setDeletingId(routineId);
    try {
      if (routineId.startsWith('default-')) {
        // Se for um bloco padrão que ainda não estava no Firestore, inicializa o Firestore com as outras
        const defaultList = DEFAULT_ROUTINES.map((r, i) => ({ ...r, id: `default-${i}` }));
        const remaining = defaultList.filter(r => r.id !== routineId);

        if (remaining.length === 0) {
          // Se não sobrou nenhuma rotina padrão, marca o perfil como limpo
          await setDoc(doc(db, 'users', currentUid), {
            routinesCleared: true
          }, { merge: true });
        } else {
          // Grava atomicamente as rotinas restantes no Firestore
          const batch = writeBatch(db);
          for (const r of remaining) {
            const newDocRef = doc(collection(db, 'routines'));
            batch.set(newDocRef, {
              userId: currentUid,
              title: r.title,
              area: r.area,
              startTime: r.startTime,
              endTime: r.endTime,
              transitMinutesBefore: r.transitMinutesBefore || 0,
              transitMinutesAfter: r.transitMinutesAfter || 0,
              daysOfWeek: r.daysOfWeek,
              isFixed: true,
              createdAt: new Date().toISOString()
            });
          }
          await batch.commit();

          await setDoc(doc(db, 'users', currentUid), {
            routinesCleared: false
          }, { merge: true });
        }
      } else {
        // Rotina real gravada no Firestore
        await deleteDoc(doc(db, 'routines', routineId));

        // Se esta era a única ou última rotina existente no Firestore, marca routinesCleared: true
        // para que as rotinas padrão não reapareçam do nada!
        if (routines.length <= 1) {
          await setDoc(doc(db, 'users', currentUid), {
            routinesCleared: true
          }, { merge: true });
        }
      }
    } catch (e: any) {
      console.error("Erro ao excluir rotina", e);
      alert(`Erro ao excluir rotina: ${e?.message || 'Falha de comunicação com o banco de dados'}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Excluir TODA a rotina (Limpar do zero)
  const handleClearAllRoutines = async () => {
    if (!confirm('Tem certeza que deseja excluir TODAS as rotinas? Você terá uma agenda totalmente limpa para definir do zero.')) return;

    setIsResetting(true);
    try {
      // Exclui todos os documentos de rotina do Firestore
      const q = query(collection(db, 'routines'), where('userId', '==', currentUid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // Marca o perfil como rotinas limpas para não reativar padrões automaticamente
      await setDoc(doc(db, 'users', currentUid), {
        routinesCleared: true
      }, { merge: true });
    } catch (e: any) {
      console.error("Erro ao limpar rotinas", e);
      alert(`Erro ao limpar rotinas: ${e?.message || 'Falha na comunicação com o banco'}`);
    } finally {
      setIsResetting(false);
    }
  };

  // Restaurar rotinas padrão do sistema
  const handleRestoreDefaultRoutines = async () => {
    if (!confirm('Deseja restaurar os blocos estruturais padrão (Musculação, Jiu-Jitsu, Igreja, etc.)?')) return;

    setIsResetting(true);
    try {
      const q = query(collection(db, 'routines'), where('userId', '==', currentUid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      await setDoc(doc(db, 'users', currentUid), {
        routinesCleared: false
      }, { merge: true });
    } catch (e: any) {
      console.error("Erro ao restaurar rotinas", e);
      alert(`Erro ao restaurar rotinas: ${e?.message || 'Falha na restauração'}`);
    } finally {
      setIsResetting(false);
    }
  };

  // Reset Total de Tarefas
  const handleClearAllTasks = async () => {
    if (!confirm('ATENÇÃO: Deseja excluir todas as suas tarefas do sistema? Essa ação não pode ser desfeita.')) return;

    setIsResetting(true);
    try {
      const q = query(collection(db, 'tasks'), where('userId', '==', currentUid));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      alert('Todas as tarefas foram excluídas com sucesso!');
    } catch (e) {
      console.error("Erro ao excluir tarefas", e);
    } finally {
      setIsResetting(false);
    }
  };

  const toggleDay = (dayId: number) => {
    setSelectedDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  // Determinar se exibe rotinas ou vazio
  const displayRoutines = routines.length > 0 
    ? routines 
    : (profile.routinesCleared ? [] : DEFAULT_ROUTINES.map((r, i) => ({
        ...r,
        id: `default-${i}`,
        userId: profile.uid
      })));

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header Apple Design */}
      <div>
        <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold tracking-wide uppercase mb-1">
          <Flame className="w-4 h-4" />
          Estrutura & Blocos Inegociáveis
        </div>
        <h2 className="font-serif text-3xl text-white tracking-tight">Rotinas & Limites de Vida</h2>
        <p className="text-sm text-white/60 mt-1">
          Seus treinos, cultos, almoço e horário de dormir são restrições inegociáveis do sistema, nunca obstáculos.
        </p>
      </div>

      {/* 1. Limites Globais de Jornada e Encerramento (Estilo Cartão Apple) */}
      <div className="apple-card rounded-3xl p-6 md:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-accent-amber/15 text-accent-amber border border-accent-amber/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Limites Inegociáveis de Jornada</h3>
            <p className="text-xs text-white/50">O FlowLife bloqueia novos trabalhos fora da sua janela de produtividade.</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfileBoundaries} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-white/60">Acordar</label>
            <input 
              type="time" 
              value={wakeTime}
              onChange={e => setWakeTime(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-amber focus:ring-1 focus:ring-accent-amber transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-white/60">Início do Trabalho</label>
            <input 
              type="time" 
              value={workStartTime}
              onChange={e => setWorkStartTime(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-amber focus:ring-1 focus:ring-accent-amber transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-red-400">
              Encerramento Obrigatório
            </label>
            <input 
              type="time" 
              value={workEndTime}
              onChange={e => setWorkEndTime(e.target.value)}
              className="w-full bg-red-950/20 border-2 border-red-500/40 rounded-xl px-3.5 py-2.5 text-sm text-red-300 font-bold focus:outline-none focus:border-red-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-white/60">Hora de Dormir</label>
            <input 
              type="time" 
              value={bedTime}
              onChange={e => setBedTime(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent-amber focus:ring-1 focus:ring-accent-amber transition-all"
            />
          </div>

          <div className="md:col-span-4 flex justify-end pt-3">
            <button 
              type="submit"
              disabled={isSavingProfile}
              className="apple-press px-6 py-2.5 bg-accent-amber text-background font-bold text-xs rounded-xl hover:bg-amber-400 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/15"
            >
              {profileSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {profileSaved ? 'Limites Salvos!' : 'Salvar Limites de Horário'}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Lista de Rotinas Estruturais com Gestão e Exclusão */}
      <div className="apple-card rounded-3xl p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Blocos Estruturais Ativos</h3>
            <p className="text-xs text-white/50">Atividades fixas que reservam o calendário e tempos de deslocamento.</p>
          </div>

          <div className="flex items-center gap-2">
            {profile.routinesCleared ? (
              <button 
                onClick={handleRestoreDefaultRoutines}
                disabled={isResetting}
                className="apple-press px-3.5 py-2 bg-white/10 text-white rounded-xl text-xs font-medium hover:bg-white/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {isResetting ? 'Restaurando...' : 'Restaurar Padrões'}
              </button>
            ) : (
              <button 
                onClick={handleClearAllRoutines}
                disabled={isResetting}
                className="apple-press px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs font-medium hover:bg-red-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isResetting ? 'Excluindo...' : 'Excluir Toda a Rotina'}
              </button>
            )}

            <button 
              onClick={() => setShowModal(true)}
              className="apple-press px-4 py-2 bg-accent-emerald text-background font-bold text-xs rounded-xl hover:bg-emerald-400 transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/15"
            >
              <Plus className="w-4 h-4" /> Novo Bloco
            </button>
          </div>
        </div>

        {displayRoutines.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-white/10 rounded-2xl">
            <Flame className="w-10 h-10 text-white/30 mx-auto mb-2" />
            <h4 className="text-sm font-medium text-white">Nenhuma rotina ativa</h4>
            <p className="text-xs text-white/40 max-w-sm mx-auto mb-4">
              Você excluiu todos os blocos estruturais. Adicione suas atividades personalizadas ou restaure os padrões quando quiser.
            </p>
            <button 
              onClick={handleRestoreDefaultRoutines}
              className="apple-press px-4 py-2 bg-accent-amber text-background font-bold rounded-xl text-xs"
            >
              Restaurar Rotinas Sugeridas
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {displayRoutines.map(routine => {
              const hasTransit = (routine.transitMinutesBefore || 0) > 0 || (routine.transitMinutesAfter || 0) > 0;
              return (
                <div 
                  key={routine.id}
                  className="bg-black/30 border border-white/8 hover:border-white/20 rounded-2xl p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-white tracking-tight">{routine.title}</span>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                        {routine.area}
                      </span>
                    </div>

                    {/* Dias da semana em formato de pílulas Apple */}
                    <div className="flex items-center gap-1 mt-2">
                      {DAYS_OF_WEEK.map(d => (
                        <span 
                          key={d.id}
                          className={cn(
                            "w-6 h-6 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all",
                            routine.daysOfWeek.includes(d.id) 
                              ? "bg-accent-amber text-background shadow-sm" 
                              : "text-white/25 bg-white/[0.03]"
                          )}
                        >
                          {d.label[0]}
                        </span>
                      ))}
                    </div>

                    {hasTransit && (
                      <div className="flex items-center gap-1.5 text-[11px] text-blue-400 mt-2.5 font-medium">
                        <Car className="w-3.5 h-3.5" />
                        <span>Deslocamento: {routine.transitMinutesBefore || 0}m antes / {routine.transitMinutesAfter || 0}m depois</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-center">
                    <div className="text-right font-mono">
                      <div className="text-sm text-white font-bold">{routine.startTime} – {routine.endTime}</div>
                      <div className="text-[11px] text-white/40">Horário Fixo</div>
                    </div>

                    {/* Botão de Excluir Bloco Individual */}
                    <button 
                      onClick={() => handleDeleteRoutine(routine.id!)}
                      disabled={deletingId === routine.id}
                      className="apple-press p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-red-500/40 hover:bg-red-500/10 text-white/50 hover:text-red-400 transition-all disabled:opacity-50"
                      title="Excluir este bloco"
                    >
                      {deletingId === routine.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. ZONA DE RESET TOTAL DO SISTEMA */}
      <div className="border border-red-500/20 bg-red-500/5 rounded-3xl p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-red-400">Zona de Reset & Recomeço</h3>
            <p className="text-xs text-red-300/80 leading-relaxed mb-4">
              Se você quiser limpar o aplicativo para recomeçar sua organização do zero, use as opções abaixo:
            </p>

            <div className="flex flex-wrap gap-3">
              <button 
                onClick={handleClearAllRoutines}
                disabled={isResetting}
                className="apple-press px-4 py-2.5 bg-black/40 border border-red-500/30 text-red-300 hover:bg-red-500/20 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Toda a Rotina
              </button>

              <button 
                onClick={handleClearAllTasks}
                disabled={isResetting}
                className="apple-press px-4 py-2.5 bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Resetar Todas as Tarefas
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Novo Bloco de Rotina */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="apple-glass rounded-3xl p-6 md:p-8 w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-white mb-4 tracking-tight">Adicionar Bloco Estrutural</h3>
            <form onSubmit={handleAddRoutine} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">Nome da Atividade</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Ex: Musculação, Jiu-Jitsu, Culto..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-amber"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">Área</label>
                <select 
                  value={area}
                  onChange={e => setArea(e.target.value as LifeArea)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent-amber"
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
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Horário de Início</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-accent-amber"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Horário de Fim</label>
                  <input 
                    type="time" 
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-accent-amber"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Deslocamento Antes (min)</label>
                  <input 
                    type="number" 
                    value={transitBefore}
                    onChange={e => setTransitBefore(Number(e.target.value))}
                    min="0" step="5"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-accent-amber"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Deslocamento Depois (min)</label>
                  <input 
                    type="number" 
                    value={transitAfter}
                    onChange={e => setTransitAfter(Number(e.target.value))}
                    min="0" step="5"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-accent-amber"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/60 mb-2">Dias da Semana</label>
                <div className="flex gap-1.5">
                  {DAYS_OF_WEEK.map(d => (
                    <button 
                      key={d.id}
                      type="button"
                      onClick={() => toggleDay(d.id)}
                      className={cn(
                        "apple-press flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
                        selectedDays.includes(d.id) 
                          ? "bg-accent-amber text-background shadow-md" 
                          : "bg-black/30 border border-white/10 text-white/40"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="apple-press flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="apple-press flex-1 py-3 bg-accent-emerald text-background font-bold rounded-xl text-sm hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/15"
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
