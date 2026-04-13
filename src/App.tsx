import React, { useEffect, useState } from 'react';
import { auth, db, signInWithPopup, googleProvider, signOut } from './firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { Onboarding } from './components/Onboarding';
import { UserProfile, Task, LifeArea, UnforeseenEvent } from './types';
import { LogIn, LogOut, Loader2, Inbox, Calendar, LayoutDashboard, Bell, CheckSquare } from 'lucide-react';
import { cn } from './lib/utils';
import { InboxView } from './components/InboxView';
import { TodayView } from './components/TodayView';
import { MonthlyView } from './components/MonthlyView';
import { DashboardView } from './components/DashboardView';
import { NotificationsView } from './components/NotificationsView';
import { SettingsView } from './components/SettingsView';
import { Settings } from 'lucide-react';

type Tab = 'inbox' | 'today' | 'monthly' | 'dashboard' | 'notifications' | 'settings';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unforeseenEvents, setUnforeseenEvents] = useState<UnforeseenEvent[]>([]);

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
    
    const qTasks = query(collection(db, 'tasks'), where('userId', '==', user.uid));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);
    });

    const qEvents = query(collection(db, 'unforeseen_events'), where('userId', '==', user.uid));
    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnforeseenEvent));
      setUnforeseenEvents(eventsData);
    });

    return () => {
      unsubTasks();
      unsubEvents();
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
      uid: user.uid
    };
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setProfile(newProfile);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-emerald" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="font-serif text-5xl text-accent-amber mb-4">FlowLife</h1>
        <p className="text-gray-400 mb-8 text-center max-w-md">
          Tudo na sua vida, no lugar certo. Organize estrategicamente seus dias e não esqueça de nada.
        </p>
        <button 
          onClick={handleLogin}
          className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
        >
          <LogIn className="w-5 h-5" />
          Entrar com Google
        </button>
      </div>
    );
  }

  if (!profile?.onboardingCompleted) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const tabs = [
    { id: 'inbox', icon: Inbox, label: 'Inbox' },
    { id: 'today', icon: CheckSquare, label: 'Hoje' },
    { id: 'monthly', icon: Calendar, label: 'Mês' },
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'notifications', icon: Bell, label: 'Alertas' },
    { id: 'settings', icon: Settings, label: 'Config' },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar (Desktop) / Bottom Bar (Mobile) */}
      <nav className="fixed bottom-0 w-full md:relative md:w-64 bg-surface border-t md:border-t-0 md:border-r border-border z-50">
        <div className="flex flex-col h-full">
          <div className="hidden md:block p-6">
            <h1 className="font-serif text-2xl text-accent-amber">FlowLife</h1>
          </div>
          
          <div className="flex flex-row md:flex-col justify-around md:justify-start p-2 md:p-4 gap-1 md:gap-2 flex-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={cn(
                    "flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-lg transition-colors flex-1 md:flex-none",
                    isActive 
                      ? "text-accent-emerald bg-accent-emerald/10" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs md:text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:block p-4 mt-auto border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400 truncate pr-2">{profile.name}</span>
              <button onClick={handleLogout} className="text-gray-400 hover:text-white p-2">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-8">
          <div className="flex justify-between items-center mb-8 md:hidden">
            <h1 className="font-serif text-xl text-accent-amber">FlowLife</h1>
            <button onClick={handleLogout} className="text-gray-400">
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {activeTab === 'inbox' && <InboxView profile={profile} />}
            {activeTab === 'today' && <TodayView profile={profile} tasks={tasks} unforeseenEvents={unforeseenEvents} />}
            {activeTab === 'monthly' && <MonthlyView profile={profile} tasks={tasks} unforeseenEvents={unforeseenEvents} />}
            {activeTab === 'dashboard' && <DashboardView profile={profile} tasks={tasks} />}
            {activeTab === 'notifications' && <NotificationsView profile={profile} />}
            {activeTab === 'settings' && <SettingsView profile={profile} />}
          </div>
        </div>
        
        {/* Floating Action Button */}
        {activeTab !== 'inbox' && (
          <button
            onClick={() => setActiveTab('inbox')}
            className="fixed bottom-20 md:bottom-8 right-4 md:right-8 p-4 bg-accent-amber text-background rounded-full shadow-lg hover:bg-amber-400 hover:scale-105 transition-all z-50"
            title="Nova Tarefa"
          >
            <Inbox className="w-6 h-6" />
          </button>
        )}
      </main>
    </div>
  );
}

