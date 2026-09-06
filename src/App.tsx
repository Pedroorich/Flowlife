import React, { useEffect, useState } from 'react';
import { auth, db, signInWithPopup, googleProvider, signOut } from './firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { Onboarding } from './components/Onboarding';
import { UserProfile, Task, LifeArea, UnforeseenEvent, Project, RoutineBlock } from './types';
import { 
  LogIn, 
  LogOut, 
  Loader2, 
  Inbox, 
  Calendar, 
  LayoutDashboard, 
  Bell, 
  CheckSquare, 
  FolderKanban, 
  Flame, 
  Settings,
  CalendarDays
} from 'lucide-react';
import { cn } from './lib/utils';
import { InboxView } from './components/InboxView';
import { TodayView } from './components/TodayView';
import { WeeklyView } from './components/WeeklyView';
import { ProjectsView } from './components/ProjectsView';
import { RoutinesView } from './components/RoutinesView';
import { MonthlyView } from './components/MonthlyView';
import { DashboardView } from './components/DashboardView';
import { NotificationsView } from './components/NotificationsView';
import { SettingsView } from './components/SettingsView';

type Tab = 'today' | 'weekly' | 'projects' | 'routines' | 'inbox' | 'dashboard' | 'monthly' | 'notifications' | 'settings';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unforeseenEvents, setUnforeseenEvents] = useState<UnforeseenEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [routines, setRoutines] = useState<RoutineBlock[]>([]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !profile) return;
    
    // Tasks listener
    const qTasks = query(collection(db, 'tasks'), where('userId', '==', user.uid));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);
    });

    // Unforeseen Events listener
    const qEvents = query(collection(db, 'unforeseen_events'), where('userId', '==', user.uid));
    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnforeseenEvent));
      setUnforeseenEvents(eventsData);
    });

    // Projects listener
    const qProjects = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projectsData);
    });

    // Routines listener
    const qRoutines = query(collection(db, 'routines'), where('userId', '==', user.uid));
    const unsubRoutines = onSnapshot(qRoutines, (snapshot) => {
      const routinesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoutineBlock));
      setRoutines(routinesData);
    });

    return () => {
      unsubTasks();
      unsubEvents();
      unsubProjects();
      unsubRoutines();
    };
  }, [user, profile]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleOnboardingComplete = async (name: string, dailyCapacity: number, activeAreas: LifeArea[]) => {
    if (!user) return;
    const newProfile: UserProfile = {
      name,
      dailyCapacity,
      activeAreas,
      onboardingCompleted: true,
      uid: user.uid,
      workStartTime: '08:30',
      workEndTime: '19:00', // Horário obrigatório de encerramento padrão
      wakeTime: '07:00',
      bedTime: '23:00'
    };
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setProfile(newProfile);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent-amber" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-accent-amber/20 border border-accent-amber/40 flex items-center justify-center mx-auto text-accent-amber font-serif text-3xl font-bold">
            F
          </div>
          <div>
            <h1 className="font-serif text-4xl text-white mb-2">FlowLife</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              Sistema Inteligente de Alocação de Tempo, Rotinas e Prioridades.
              Planeje, execute, reavalie e nunca mais trabalhe no escuro.
            </p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white text-black px-6 py-3.5 rounded-xl font-bold hover:bg-gray-100 transition-colors shadow-lg"
          >
            <LogIn className="w-5 h-5" />
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  if (!profile?.onboardingCompleted) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const tabs = [
    { id: 'today', icon: CheckSquare, label: 'Hoje' },
    { id: 'weekly', icon: Calendar, label: 'Semana' },
    { id: 'projects', icon: FolderKanban, label: 'Projetos' },
    { id: 'routines', icon: Flame, label: 'Rotinas' },
    { id: 'inbox', icon: Inbox, label: 'Backlog' },
    { id: 'dashboard', icon: LayoutDashboard, label: 'Equilíbrio' },
    { id: 'monthly', icon: CalendarDays, label: 'Mês' },
    { id: 'notifications', icon: Bell, label: 'Alertas' },
    { id: 'settings', icon: Settings, label: 'Config' },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background text-gray-100">
      {/* Sidebar (Desktop) / Bottom Bar (Mobile) */}
      <nav className="fixed bottom-0 w-full md:relative md:w-64 bg-surface border-t md:border-t-0 md:border-r border-border z-50 shrink-0">
        <div className="flex flex-col h-full">
          <div className="hidden md:flex items-center gap-3 p-6 border-b border-white/5">
            <div className="w-8 h-8 rounded-xl bg-accent-amber text-background flex items-center justify-center font-serif font-bold text-lg">
              F
            </div>
            <div>
              <h1 className="font-serif text-xl text-white font-bold leading-none">FlowLife</h1>
              <span className="text-[10px] text-accent-amber font-mono">COMANDO INTELIGENTE</span>
            </div>
          </div>
          
          <div className="flex flex-row md:flex-col justify-around md:justify-start p-2 md:p-3 gap-1 flex-1 overflow-x-auto md:overflow-x-visible">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={cn(
                    "flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl transition-all flex-1 md:flex-none text-left",
                    isActive 
                      ? "text-accent-amber bg-accent-amber/10 border border-accent-amber/20 font-bold" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
                  <span className="text-[10px] md:text-xs font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:block p-4 mt-auto border-t border-border">
            <div className="flex items-center justify-between">
              <div className="truncate pr-2">
                <div className="text-xs text-white font-medium truncate">{profile.name}</div>
                <div className="text-[10px] text-gray-500 truncate">Corte: {profile.workEndTime || '19:00'}</div>
              </div>
              <button onClick={handleLogout} className="text-gray-400 hover:text-white p-2" title="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 pb-24 md:pb-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          <div className="flex justify-between items-center mb-6 md:hidden">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent-amber text-background flex items-center justify-center font-bold text-sm">
                F
              </div>
              <h1 className="font-serif text-lg text-white font-bold">FlowLife</h1>
            </div>
            <button onClick={handleLogout} className="text-gray-400">
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
            {activeTab === 'today' && (
              <TodayView 
                profile={profile} 
                tasks={tasks} 
                unforeseenEvents={unforeseenEvents} 
                routines={routines}
                projects={projects}
              />
            )}
            {activeTab === 'weekly' && (
              <WeeklyView 
                profile={profile} 
                tasks={tasks} 
                unforeseenEvents={unforeseenEvents}
                routines={routines}
              />
            )}
            {activeTab === 'projects' && (
              <ProjectsView 
                profile={profile} 
                projects={projects} 
                tasks={tasks} 
              />
            )}
            {activeTab === 'routines' && (
              <RoutinesView 
                profile={profile} 
                routines={routines} 
              />
            )}
            {activeTab === 'inbox' && (
              <InboxView 
                profile={profile} 
                projects={projects} 
                tasks={tasks}
              />
            )}
            {activeTab === 'dashboard' && (
              <DashboardView 
                profile={profile} 
                tasks={tasks} 
                projects={projects}
              />
            )}
            {activeTab === 'monthly' && (
              <MonthlyView 
                profile={profile} 
                tasks={tasks} 
                unforeseenEvents={unforeseenEvents} 
              />
            )}
            {activeTab === 'notifications' && (
              <NotificationsView profile={profile} />
            )}
            {activeTab === 'settings' && (
              <SettingsView profile={profile} />
            )}
          </div>
        </div>
        
        {/* Floating Action Button para Captura Rápida */}
        {activeTab !== 'inbox' && (
          <button
            onClick={() => setActiveTab('inbox')}
            className="fixed bottom-20 md:bottom-8 right-4 md:right-8 p-4 bg-accent-amber text-background rounded-full shadow-2xl hover:bg-amber-400 hover:scale-105 transition-all z-40"
            title="Captura Rápida no Backlog"
          >
            <Inbox className="w-6 h-6" />
          </button>
        )}
      </main>
    </div>
  );
}
