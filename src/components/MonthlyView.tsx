import React, { useState, useMemo } from 'react';
import { Task, UserProfile, UnforeseenEvent, LifeArea, Priority } from '../types';
import { distributeTasks } from '../lib/smartScheduler';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { X, Edit2, Check, Clock } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface MonthlyViewProps {
  profile: UserProfile;
  tasks: Task[];
  unforeseenEvents: UnforeseenEvent[];
}

export function MonthlyView({ profile, tasks, unforeseenEvents }: MonthlyViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  
  const schedule = useMemo(() => {
    return distributeTasks(tasks, profile.dailyCapacity, unforeseenEvents);
  }, [tasks, profile.dailyCapacity, unforeseenEvents]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Padding for calendar grid
  const startDayOfWeek = monthStart.getDay(); // 0 = Sunday
  const paddingDays = Array.from({ length: startDayOfWeek }).map((_, i) => i);

  const getDayColor = (minutes: number) => {
    if (minutes === 0) return 'bg-surface border-border';
    const ratio = minutes / profile.dailyCapacity;
    if (ratio > 0.9) return 'bg-red-500/10 border-red-500/30 text-red-200';
    if (ratio > 0.6) return 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber';
    return 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald';
  };

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      area: task.area,
      priority: task.priority,
      timeEstimate: task.timeEstimate,
      notes: task.notes || ''
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask?.id) return;
    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        title: editForm.title,
        area: editForm.area,
        priority: editForm.priority,
        timeEstimate: Number(editForm.timeEstimate),
        notes: editForm.notes || '',
      });
      setEditingTask(null);
    } catch (error) {
      console.error("Error updating task", error);
    }
  };

  const handleComplete = async (task: Task) => {
    if (!task.id) return;
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'completed',
        dateAllocated: selectedDate || format(new Date(), 'yyyy-MM-dd')
      });
    } catch (error) {
      console.error("Error completing task", error);
    }
  };

  const areaColors: Record<string, string> = {
    "Trabalho": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "Estudos": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "Saúde & Bem-estar": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "Finanças": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "Casa & Família": "bg-pink-500/20 text-pink-400 border-pink-500/30",
    "Projetos Pessoais": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    "Social & Relacionamentos": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "Outro": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-3xl mb-2">Planejamento Mensal</h2>
          <p className="text-gray-400">Distribuição estratégica das suas tarefas.</p>
        </div>
        <div className="text-xl font-medium">
          {format(currentMonth, 'MMMM yyyy')}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
            <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {paddingDays.map(i => (
            <div key={`pad-${i}`} className="aspect-square rounded-lg bg-background/50 border border-transparent" />
          ))}
          
          {daysInMonth.map(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayTasks = schedule[dateStr] || [];
            const totalMinutes = dayTasks.reduce((acc, t) => acc + t.timeEstimate, 0);
            
            return (
              <div 
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={cn(
                  "aspect-square rounded-lg border p-2 flex flex-col transition-colors hover:border-gray-400 cursor-pointer",
                  getDayColor(totalMinutes),
                  isToday(date) && "ring-2 ring-accent-amber ring-offset-2 ring-offset-background"
                )}
              >
                <div className="text-right text-sm font-medium opacity-70 mb-1">
                  {format(date, 'd')}
                </div>
                
                {dayTasks.length > 0 && (
                  <div className="mt-auto">
                    <div className="text-xs font-medium truncate">
                      {dayTasks.length} itens
                    </div>
                    <div className="text-[10px] opacity-70 truncate">
                      {Math.round(totalMinutes / 60 * 10) / 10}h
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDate && !editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-2xl animate-in fade-in zoom-in-95 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-medium">Tarefas de {format(parseISO(selectedDate), 'dd/MM/yyyy')}</h3>
              <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="overflow-y-auto pr-2 space-y-3 flex-1">
              {(schedule[selectedDate] || []).length === 0 ? (
                <p className="text-gray-400 text-center py-8">Nenhuma tarefa agendada para este dia.</p>
              ) : (
                (schedule[selectedDate] || []).map(task => (
                  <div key={task.id} className="bg-background border border-border rounded-lg p-4 flex justify-between items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn("text-xs px-2 py-1 rounded border", areaColors[task.area] || areaColors["Outro"])}>
                          {task.area}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {task.timeEstimate} min
                        </span>
                      </div>
                      <h4 className="font-medium">{task.title}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEditClick(task)} 
                        className="p-2 rounded-lg bg-surface border border-border hover:border-blue-400 hover:text-blue-400 transition-colors" 
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {task.status === 'pending' && (
                        <button 
                          onClick={() => handleComplete(task)} 
                          className="p-2 rounded-lg bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/30 hover:bg-accent-emerald hover:text-background transition-colors" 
                          title="Concluir"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
            <h3 className="text-xl font-medium mb-6">Editar Tarefa</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Título</label>
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={e => setEditForm({...editForm, title: e.target.value})}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Área</label>
                  <select
                    value={editForm.area || ''}
                    onChange={e => setEditForm({...editForm, area: e.target.value as LifeArea})}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                  >
                    {profile.activeAreas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Prioridade</label>
                  <select
                    value={editForm.priority || ''}
                    onChange={e => setEditForm({...editForm, priority: e.target.value as Priority})}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                  >
                    {["Alta", "Média", "Baixa"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Tempo Estimado (min)</label>
                <input
                  type="number"
                  min="5" step="5"
                  value={editForm.timeEstimate || 0}
                  onChange={e => setEditForm({...editForm, timeEstimate: Number(e.target.value)})}
                  required
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Notas</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={e => setEditForm({...editForm, notes: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber min-h-[80px]"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="flex-1 py-3 rounded-lg border border-border hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-lg bg-accent-amber text-background font-medium hover:bg-amber-400 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
