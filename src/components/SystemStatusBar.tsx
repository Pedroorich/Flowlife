import React, { useState } from 'react';
import { 
  Clock, 
  Calendar, 
  Bell, 
  BellRing, 
  Sparkles, 
  ChevronRight, 
  Play, 
  Flame, 
  CheckCircle2, 
  Volume2
} from 'lucide-react';
import { useSystemClock, getCurrentAndNextActivity } from '../lib/systemClock';
import { RoutineBlock, Task, UserProfile } from '../types';
import { soundEngine, sendFlowNotification, getNotificationPermissionStatus } from '../lib/notificationEngine';
import { cn } from '../lib/utils';

interface SystemStatusBarProps {
  routines: RoutineBlock[];
  tasks: Task[];
  profile: UserProfile | null;
  onNavigateToNotifications?: () => void;
  onNavigateToToday?: () => void;
}

export function SystemStatusBar({
  routines,
  tasks,
  profile,
  onNavigateToNotifications,
  onNavigateToToday
}: SystemStatusBarProps) {
  const clock = useSystemClock(1000);
  let currentActivity: any = null;
  let nextActivity: any = null;

  try {
    const activityInfo = getCurrentAndNextActivity(clock, routines || [], tasks || [], profile);
    currentActivity = activityInfo.currentActivity;
    nextActivity = activityInfo.nextActivity;
  } catch (e) {
    console.warn('Falha segura em SystemStatusBar:', e);
  }

  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const permissionStatus = getNotificationPermissionStatus();

  const handleQuickChimeTest = () => {
    soundEngine.play('test');
    sendFlowNotification({
      title: 'FlowLife • Relógio e Som Operacionais ⏱️',
      body: `São ${clock.timeStr} de ${clock.dayOfWeekName}. O sistema de horário e notificações está ativo e sincronizado!`,
      sound: 'test'
    });
    setTestNotificationSent(true);
    setTimeout(() => setTestNotificationSent(false), 3000);
  };

  return (
    <div className="w-full bg-surface/95 backdrop-blur-md border-b border-border/80 sticky top-0 z-30 px-3 py-2 md:px-6 md:py-2.5 transition-all">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs">
        
        {/* Bloco 1: Data e Relógio em Tempo Real */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-amber/10 border border-accent-amber/30 text-accent-amber font-mono font-bold tracking-wide">
            <Clock className="w-3.5 h-3.5 animate-pulse text-accent-amber" />
            <span className="text-xs">{clock.secondsStr}</span>
          </div>

          <div className="flex items-center gap-1.5 text-gray-300">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-semibold text-white capitalize">{clock.dayOfWeekName}</span>
            <span className="text-gray-400 hidden sm:inline">•</span>
            <span className="text-gray-400 hidden sm:inline font-mono">{clock.dateStr}</span>
          </div>
        </div>

        {/* Bloco 2: Comunicação de Atividade do Momento / Próxima Atividade */}
        <div className="flex items-center gap-2 flex-1 justify-center max-w-lg min-w-[200px] overflow-hidden">
          {currentActivity ? (
            <div 
              onClick={onNavigateToToday}
              className="cursor-pointer group flex items-center gap-2 px-3 py-1 rounded-full bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald text-[11px] truncate hover:bg-accent-emerald/20 transition-all"
              title="Clique para ir para a agenda de Hoje"
            >
              <span className="w-2 h-2 rounded-full bg-accent-emerald animate-ping shrink-0" />
              <span className="font-semibold shrink-0">AGORA:</span>
              <span className="font-medium text-white truncate">{currentActivity.title}</span>
              <span className="text-accent-emerald/80 font-mono text-[10px] shrink-0">
                (restam {currentActivity.remainingMinutes}m)
              </span>
            </div>
          ) : nextActivity ? (
            <div 
              onClick={onNavigateToToday}
              className="cursor-pointer group flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 text-[11px] truncate hover:border-accent-amber/40 hover:text-white transition-all"
              title="Clique para ver a agenda de Hoje"
            >
              <Flame className="w-3 h-3 text-accent-amber shrink-0" />
              <span className="text-gray-400 shrink-0">Próxima às {nextActivity.startTime}:</span>
              <span className="font-medium text-white truncate">{nextActivity.title}</span>
              <span className="text-accent-amber font-mono text-[10px] shrink-0">
                (em {nextActivity.startsInMinutes}m)
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5 truncate">
              <Sparkles className="w-3 h-3 text-accent-amber" />
              <span>Sem atividades fixas imediatas • Janela livre para foco</span>
            </div>
          )}
        </div>

        {/* Bloco 3: Status das Notificações & Botão de Teste Rápido */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleQuickChimeTest}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border",
              testNotificationSent 
                ? "bg-accent-emerald/20 text-accent-emerald border-accent-emerald/40" 
                : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10 hover:border-gray-500"
            )}
            title="Clique para testar o som do relógio e o disparo de notificação"
          >
            {testNotificationSent ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-accent-emerald" />
                <span>Testado!</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3 h-3 text-accent-amber" />
                <span className="hidden md:inline">Testar Som & Alerta</span>
                <span className="md:hidden">Som</span>
              </>
            )}
          </button>

          <button
            onClick={onNavigateToNotifications}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all",
              permissionStatus === 'granted'
                ? "bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald hover:bg-accent-emerald/20"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
            )}
            title={permissionStatus === 'granted' ? "Notificações ativas" : "Clique para ativar notificações no seu aparelho"}
          >
            {permissionStatus === 'granted' ? (
              <>
                <BellRing className="w-3 h-3 text-accent-emerald" />
                <span className="hidden lg:inline">Alertas Ativos</span>
              </>
            ) : (
              <>
                <Bell className="w-3 h-3 text-amber-400" />
                <span>Ativar Alertas</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
