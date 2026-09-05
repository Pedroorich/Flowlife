export type TaskType = "Projeto" | "Tarefa" | "Compromisso" | "Entrega" | "Reunião" | "Meta" | "Hábito" | "Outro";

export type LifeArea = 
  | "Trabalho" 
  | "Conteúdo & Tráfego" 
  | "Projetos & Ofertas" 
  | "Saúde & Treino" 
  | "Igreja & Espiritual" 
  | "Descanso & Pessoal" 
  | "Finanças" 
  | "Estudos"
  | "Casa & Família"
  | "Social & Relacionamentos"
  | "Outro";

export type Priority = "Alta" | "Média" | "Baixa";

export type TaskStatus = "pending" | "completed";

export type EnergyLevel = "Alta (Foco Profundo)" | "Média" | "Baixa (Operacional/Leve)";

export type ExecutionStatus = 
  | "backlog"        // na fila, aguardando alocação
  | "scheduled"      // agendada na timeline
  | "in_progress"    // sendo executada agora
  | "paused"         // pausada
  | "completed"      // concluída
  | "rescheduled"    // realocada para outro dia/bloco
  | "cancelled";

// Entidade Projeto (Ofertas, Operações, Nichos)
export interface Project {
  id?: string;
  userId: string;
  name: string; // Ex: "Oferta A", "Oferta B", "Conteúdo Orgânico", "Operação Nicho X"
  description?: string;
  area: LifeArea;
  color: string;
  status: "active" | "paused" | "completed";
  lastActivityDate?: string; // ISO string para detectar abandono (> 7 dias)
  createdAt: string;
}

// Rotina Recorrente Estrutural (Blocos Inegociáveis: Academia, Jiu-Jitsu, Igreja, etc.)
export interface RoutineBlock {
  id?: string;
  userId: string;
  title: string; // Ex: "Musculação", "Jiu-Jitsu", "Igreja", "Almoço", "Encerramento"
  area: LifeArea;
  startTime: string; // "09:30"
  endTime: string;   // "10:45"
  transitMinutesBefore?: number; // Ex: 30 min para Jiu-Jitsu
  transitMinutesAfter?: number;
  daysOfWeek: number[]; // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  isFixed: boolean; // bloqueio estrito da agenda
  createdAt?: string;
}

// Tarefa Enriquecida
export interface Task {
  id?: string;
  userId: string;
  title: string;
  type: TaskType;
  area: LifeArea;
  projectId?: string; // Vinculada a projeto/oferta
  
  // Priorização Multifatorial
  priority: Priority; // Legado mantido para compatibilidade
  urgency?: number;    // 1 a 5
  impact?: number;     // 1 a 5 (impacto estratégico no avanço/faturamento)
  unlocksTaskIds?: string[]; // IDs de tarefas desbloqueadas por esta
  
  // Limites de Tempo e Overthinking
  timeEstimate: number; // minutos planejados
  timeIdeal?: number;   // tempo meta
  timeMax?: number;     // teto limite (ex: 90 min para tarefa de 45 min)
  actualDuration?: number; // tempo real gasto (para aprendizado)
  
  // Restrições de Agenda e Timeline
  isFixed?: boolean;
  scheduledStartTime?: string; // "14:00"
  scheduledEndTime?: string;   // "15:00"
  deadline?: string;    // Data final (ISO string)
  startDate?: string;   // Data/hora de início (ISO string)
  endDate?: string;     // Data/hora de término (ISO string)
  dateAllocated?: string; // YYYY-MM-DD
  energyLevel?: EnergyLevel;
  
  notes?: string;
  status: TaskStatus; // "pending" | "completed"
  executionStatus?: ExecutionStatus;
  parentTaskId?: string;
  
  createdAt: string; // ISO string
}

export interface UnforeseenEvent {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  duration: number; // in minutes
  description: string;
  createdAt: string; // ISO string
}

export interface UserProfile {
  name: string;
  dailyCapacity: number; // in minutes
  activeAreas: LifeArea[];
  onboardingCompleted: boolean;
  uid: string;
  
  // Restrições de Horários Inegociáveis
  wakeTime?: string;       // "07:00"
  workStartTime?: string;  // "08:30"
  workEndTime?: string;    // "19:00" (HORÁRIO DE ENCERRAMENTO OBRIGATÓRIO)
  bedTime?: string;        // "23:00"
  
  // Capacidade variável por dia da semana (0=Dom, 1=Seg...)
  weeklyCapacityMap?: Record<number, number>;
  
  // Notificações e Webhooks
  webhookUrl?: string;
  webhookUrlStart?: string;
  webhookUrl5Min?: string;
  webhookUrlEnd?: string;
  
  routinesCleared?: boolean;
  
  dailyState?: {
    date: string; // YYYY-MM-DD
    active: boolean;
    currentTaskId?: string;
    taskEndTime?: string; // ISO string
    taskStartTime?: string; // ISO string
    elapsedSeconds?: number;
    isPaused?: boolean;
    notified5Min?: boolean;
    notifiedEnd?: boolean;
    overtimeAlertShown?: boolean;
  };
}

