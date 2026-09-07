// FlowLife Unified Notification & Sound Engine
// Optimized for iOS PWA (Standalone Web App on iPhone), Desktop & Android

export type ChimeType = 'start' | 'warning' | 'end' | 'overthinking' | 'test';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundEnabledKey = 'flowlife_sound_enabled';

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isSoundEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(this.soundEnabledKey);
    return saved === null ? true : saved === 'true';
  }

  public setSoundEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.soundEnabledKey, String(enabled));
  }

  // Play synthesized Apple-inspired subtle harmonic chime
  public play(type: ChimeType = 'test') {
    if (!this.isSoundEnabled()) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'start') {
        // Upward energetic Apple chime (C5 -> E5 -> G5 -> C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          this.playTone(ctx, freq, now + idx * 0.08, 0.25, 0.2);
        });
      } else if (type === 'warning') {
        // Gentle 2-tone alert for 5 minutes remaining (A5 -> E5)
        this.playTone(ctx, 880.00, now, 0.2, 0.25);
        this.playTone(ctx, 659.25, now + 0.15, 0.35, 0.25);
      } else if (type === 'end') {
        // Completion fanfare (G5 -> A5 -> B5 -> C6)
        const notes = [783.99, 880.00, 987.77, 1046.50];
        notes.forEach((freq, idx) => {
          this.playTone(ctx, freq, now + idx * 0.1, 0.4, 0.25);
        });
      } else if (type === 'overthinking') {
        // Soft double-tap amber reminder
        this.playTone(ctx, 440.00, now, 0.15, 0.2);
        this.playTone(ctx, 440.00, now + 0.18, 0.25, 0.2);
      } else {
        // Test chime (smooth bell)
        this.playTone(ctx, 587.33, now, 0.3, 0.2);
        this.playTone(ctx, 880.00, now + 0.12, 0.4, 0.25);
      }
    } catch (e) {
      console.warn('Audio playback not permitted or unavailable:', e);
    }
  }

  private playTone(ctx: AudioContext, freq: number, startTime: number, duration: number, gainVal: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    // Smooth envelope attack and exponential decay
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainVal, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const soundEngine = new SoundEngine();

// Platform Detection Helpers
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export function getNotificationPermissionStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (error) {
    console.error('Erro ao pedir permissão de notificação:', error);
    return 'denied';
  }
}

// Dispatch Webhook Helper
async function dispatchWebhook(url: string, payload: Record<string, any>) {
  if (!url || !url.trim()) return;
  try {
    await fetch(url.trim(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('Falha no disparo do webhook:', e);
  }
}

export interface FlowNotificationOptions {
  title: string;
  body: string;
  tag?: string;
  sound?: ChimeType;
  webhookUrl?: string;
  webhookPayload?: Record<string, any>;
}

// Core unified dispatch function
export async function sendFlowNotification(opts: FlowNotificationOptions): Promise<boolean> {
  const { title, body, tag = 'flowlife-alert', sound, webhookUrl, webhookPayload } = opts;

  // 1. Play sound
  if (sound) {
    soundEngine.play(sound);
  }

  // 2. Dispatch Webhook (for background iOS notification if screen is off)
  if (webhookUrl) {
    const payload = {
      title,
      text: body,
      app: 'FlowLife',
      timestamp: new Date().toISOString(),
      ...webhookPayload
    };
    dispatchWebhook(webhookUrl, payload);
  }

  // 3. Show System / Web App Notification
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    const notificationData = {
      body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag,
      vibrate: [200, 100, 200] as any,
      renotify: true,
      data: '/'
    };

    // Priority 1: Service Worker showNotification (Mandatory for iOS 16.4+ standalone PWAs!)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, notificationData);
          return true;
        }
      } catch (e) {
        console.warn('Service worker showNotification falhou, tentando fallback:', e);
      }
    }

    // Priority 2: Standard Notification constructor
    try {
      new Notification(title, notificationData);
      return true;
    } catch (e) {
      console.warn('Erro ao disparar new Notification:', e);
    }
  }

  return false;
}

// Specialized Task Notification Triggers
export function notifyTaskStart(taskTitle: string, estimatedMinutes: number, webhookUrl?: string) {
  return sendFlowNotification({
    title: 'FlowLife - Início de Tarefa',
    body: `Iniciando agora: "${taskTitle}" (${estimatedMinutes} min planejados). Foco total!`,
    tag: 'task-start',
    sound: 'start',
    webhookUrl,
    webhookPayload: {
      event: 'task_started',
      task: taskTitle,
      estimatedMinutes
    }
  });
}

export function notifyTaskWarning5Min(taskTitle: string, webhookUrl?: string) {
  return sendFlowNotification({
    title: 'FlowLife - Faltam 5 Minutos!',
    body: `Atenção: restam 5 minutos para encerrar "${taskTitle}". Comece a fechar os detalhes.`,
    tag: 'task-warning-5min',
    sound: 'warning',
    webhookUrl,
    webhookPayload: {
      event: 'task_5min_warning',
      task: taskTitle
    }
  });
}

export function notifyTaskEnd(taskTitle: string, webhookUrl?: string) {
  return sendFlowNotification({
    title: 'FlowLife - Tarefa Encerrada',
    body: `Tempo da tarefa "${taskTitle}" finalizado! Abra o app para registrar o tempo e passar para a próxima.`,
    tag: 'task-ended',
    sound: 'end',
    webhookUrl,
    webhookPayload: {
      event: 'task_ended',
      task: taskTitle
    }
  });
}

export function notifyOverthinking(taskTitle: string, maxMinutes: number) {
  return sendFlowNotification({
    title: 'FlowLife - Limite de Tempo Excedido',
    body: `Você atingiu o teto de ${maxMinutes} min na tarefa "${taskTitle}". Evite overthinking e decida se conclui ou reprograma.`,
    tag: 'task-overthinking',
    sound: 'overthinking'
  });
}

export function notifyWorkdayEnd(workEndTime: string, webhookUrl?: string) {
  return sendFlowNotification({
    title: 'FlowLife - Encerramento do Expediente',
    body: `Horário de corte (${workEndTime}) atingido! Finalize suas pendências e preserve seu descanso.`,
    tag: 'workday-end',
    sound: 'end',
    webhookUrl,
    webhookPayload: {
      event: 'workday_ended',
      time: workEndTime
    }
  });
}

export function notifyTimelineTaskStarting(taskTitle: string, scheduledTime: string) {
  return sendFlowNotification({
    title: 'FlowLife - Nova Tarefa na Agenda',
    body: `São ${scheduledTime}! Hora de iniciar: "${taskTitle}".`,
    tag: `task-scheduled-${taskTitle.slice(0, 10)}`,
    sound: 'start'
  });
}

export function notifyRoutineStart(routineTitle: string, scheduledTime: string, webhookUrl?: string) {
  return sendFlowNotification({
    title: 'FlowLife - Bloco de Rotina Iniciando',
    body: `São ${scheduledTime}! Hora da sua atividade: "${routineTitle}".`,
    tag: `routine-start-${routineTitle.slice(0, 15)}`,
    sound: 'start',
    webhookUrl,
    webhookPayload: {
      event: 'routine_started',
      routine: routineTitle,
      time: scheduledTime
    }
  });
}

export function notifyRoutineWarning5Min(routineTitle: string, scheduledTime: string, webhookUrl?: string) {
  return sendFlowNotification({
    title: 'FlowLife - 5 Minutos para Iniciar',
    body: `Faltam 5 minutos para "${routineTitle}" (início às ${scheduledTime}). Prepare-se!`,
    tag: `routine-warn-5m-${routineTitle.slice(0, 15)}`,
    sound: 'warning',
    webhookUrl,
    webhookPayload: {
      event: 'routine_5min_warning',
      routine: routineTitle,
      time: scheduledTime
    }
  });
}

export function notifyTaskWarning5MinBeforeStart(taskTitle: string, scheduledTime: string, webhookUrl?: string) {
  return sendFlowNotification({
    title: 'FlowLife - Próxima Tarefa em 5 Minutos',
    body: `Às ${scheduledTime} começa: "${taskTitle}". Prepare seu ambiente de foco!`,
    tag: `task-warn-start-${taskTitle.slice(0, 15)}`,
    sound: 'warning',
    webhookUrl,
    webhookPayload: {
      event: 'task_pre_start_warning',
      task: taskTitle,
      time: scheduledTime
    }
  });
}

/**
 * Monitor Global de Notificações de Agenda (Rotinas + Tarefas + Encerramento)
 * Executado periodicamente no nível raiz do aplicativo.
 */
export function checkAndTriggerScheduleNotifications(
  now: Date,
  routines: any[] = [],
  tasks: any[] = [],
  profile?: any
): void {
  try {
    const currentHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const dayOfWeek = now.getDay();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Conjunto de chaves já notificadas hoje persistido em localStorage
    const storageKey = `flowlife_notified_events_${dateStr}`;
    let notifiedSet = new Set<string>();
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        notifiedSet = new Set(JSON.parse(raw));
      }
    } catch (_) {}

    const markNotified = (key: string) => {
      notifiedSet.add(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(notifiedSet)));
      } catch (_) {}
    };

    const webhookUrl = profile?.webhookUrl || profile?.webhookUrlStart;

    // 1. Checar Encerramento do Expediente (ex: 19:00)
    const workEnd = profile?.workEndTime || '19:00';
    const [wEndH, wEndM] = workEnd.split(':').map(Number);
    const workEndMinutes = (wEndH || 19) * 60 + (wEndM || 0);

    if (currentMinutes >= workEndMinutes && currentMinutes <= workEndMinutes + 2) {
      const key = `workday-end-${dateStr}-${workEnd}`;
      if (!notifiedSet.has(key)) {
        markNotified(key);
        notifyWorkdayEnd(workEnd, profile?.webhookUrlEnd || webhookUrl);
      }
    }

    // 2. Checar Rotinas Inegociáveis do dia (Ex: 07:15, 09:30, etc.)
    routines.forEach(routine => {
      if (!routine.daysOfWeek || !routine.daysOfWeek.includes(dayOfWeek)) return;
      if (!routine.startTime) return;

      const [rH, rM] = routine.startTime.split(':').map(Number);
      const routineMinutes = (rH || 0) * 60 + (rM || 0);
      const diff = routineMinutes - currentMinutes;

      const routineId = routine.id || routine.title;

      // Aviso prévio de 5 minutos
      if (diff === 5) {
        const warnKey = `routine-warn-5m-${routineId}-${dateStr}`;
        if (!notifiedSet.has(warnKey)) {
          markNotified(warnKey);
          notifyRoutineWarning5Min(routine.title, routine.startTime, webhookUrl);
        }
      }

      // Início da rotina (no horário exato ou até 2 minutos de tolerância após)
      if (diff <= 0 && diff >= -2) {
        const startKey = `routine-start-${routineId}-${dateStr}`;
        if (!notifiedSet.has(startKey)) {
          markNotified(startKey);
          notifyRoutineStart(routine.title, routine.startTime, webhookUrl);
        }
      }
    });

    // 3. Checar Tarefas Agendadas para Hoje
    tasks.forEach(task => {
      if (task.status === 'completed') return;
      const isForToday = task.dateAllocated === dateStr || (!task.dateAllocated && task.scheduledStartTime);
      if (!isForToday || !task.scheduledStartTime) return;

      const [tH, tM] = task.scheduledStartTime.split(':').map(Number);
      const taskStartMinutes = (tH || 0) * 60 + (tM || 0);
      const diff = taskStartMinutes - currentMinutes;
      const taskId = task.id || task.title;

      // Aviso prévio de 5 minutos
      if (diff === 5) {
        const warnKey = `task-pre-warn-${taskId}-${dateStr}`;
        if (!notifiedSet.has(warnKey)) {
          markNotified(warnKey);
          notifyTaskWarning5MinBeforeStart(task.title, task.scheduledStartTime, webhookUrl);
        }
      }

      // Início da tarefa (no horário exato ou até 2 minutos de tolerância após)
      if (diff <= 0 && diff >= -2) {
        const startKey = `task-start-${taskId}-${dateStr}`;
        if (!notifiedSet.has(startKey)) {
          markNotified(startKey);
          notifyTimelineTaskStarting(task.title, task.scheduledStartTime);
        }
      }
    });
  } catch (err) {
    console.warn('Erro na checagem de notificações de agenda:', err);
  }
}

