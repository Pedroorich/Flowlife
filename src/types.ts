export type TaskType = "Projeto" | "Tarefa" | "Compromisso" | "Entrega" | "Reunião" | "Meta" | "Hábito" | "Outro";
export type LifeArea = "Trabalho" | "Estudos" | "Saúde & Bem-estar" | "Finanças" | "Casa & Família" | "Projetos Pessoais" | "Social & Relacionamentos" | "Outro";
export type Priority = "Alta" | "Média" | "Baixa";
export type TaskStatus = "pending" | "completed";

export interface Task {
  id?: string;
  title: string;
  type: TaskType;
  area: LifeArea;
  priority: Priority;
  deadline?: string; // Legacy, acts as endDate
  startDate?: string; // ISO string
  endDate?: string; // ISO string
  timeEstimate: number; // in minutes
  notes?: string;
  status: TaskStatus;
  dateAllocated?: string; // YYYY-MM-DD
  isFixed?: boolean;
  parentTaskId?: string;
  userId: string;
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
  webhookUrl?: string;
  webhookUrlStart?: string;
  webhookUrl5Min?: string;
  webhookUrlEnd?: string;
  dailyState?: {
    date: string; // YYYY-MM-DD
    active: boolean;
    currentTaskId?: string;
    taskEndTime?: string; // ISO string
    notified5Min?: boolean;
    notifiedEnd?: boolean;
  };
}
