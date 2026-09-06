import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellRing, 
  BellOff, 
  Webhook, 
  Save, 
  Send, 
  Smartphone, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Check 
} from 'lucide-react';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { 
  requestNotificationPermission, 
  getNotificationPermissionStatus, 
  isStandalonePWA, 
  isIOS, 
  soundEngine, 
  notifyTaskStart, 
  notifyTaskWarning5Min, 
  notifyTaskEnd, 
  sendFlowNotification 
} from '../lib/notificationEngine';
import { cn } from '../lib/utils';

interface NotificationsViewProps {
  profile: UserProfile;
}

export function NotificationsView({ profile }: NotificationsViewProps) {
  const [permission, setPermission] = useState<string>(getNotificationPermissionStatus());
  const [isPWA, setIsPWA] = useState(false);
  const [isIPhoneDevice, setIsIPhoneDevice] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soundEngine.isSoundEnabled());
  
  // Webhook URLs
  const [webhookUrlStart, setWebhookUrlStart] = useState(profile.webhookUrlStart || profile.webhookUrl || '');
  const [webhookUrl5Min, setWebhookUrl5Min] = useState(profile.webhookUrl5Min || '');
  const [webhookUrlEnd, setWebhookUrlEnd] = useState(profile.webhookUrlEnd || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    setIsPWA(isStandalonePWA());
    setIsIPhoneDevice(isIOS());
    setPermission(getNotificationPermissionStatus());
  }, []);

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      sendFlowNotification({
        title: 'FlowLife Notificações Ativadas! 🚀',
        body: 'Você receberá alertas no início, aviso de 5 minutos e encerramento de cada tarefa.',
        sound: 'test'
      });
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    soundEngine.setSoundEnabled(next);
    setSoundEnabled(next);
    if (next) {
      soundEngine.play('test');
    }
  };

  const handleSaveWebhooks = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaved(false);

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        webhookUrl: webhookUrlStart.trim(),
        webhookUrlStart: webhookUrlStart.trim(),
        webhookUrl5Min: webhookUrl5Min.trim(),
        webhookUrlEnd: webhookUrlEnd.trim()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Erro ao salvar webhooks", error);
      alert('Erro ao salvar webhooks.');
    } finally {
      setIsSaving(false);
    }
  };

  const testTrigger = async (type: 'start' | 'warning' | 'end') => {
    setTestResult(`Disparando notificação de ${type}...`);
    try {
      if (type === 'start') {
        await notifyTaskStart('Produzir Criativos Oferta A', 45, webhookUrlStart);
      } else if (type === 'warning') {
        await notifyTaskWarning5Min('Produzir Criativos Oferta A', webhookUrl5Min || webhookUrlStart);
      } else if (type === 'end') {
        await notifyTaskEnd('Produzir Criativos Oferta A', webhookUrlEnd || webhookUrlStart);
      }
      setTestResult(`✅ Notificação disparada com sucesso! Verifique a tela.`);
      setTimeout(() => setTestResult(null), 4000);
    } catch (e) {
      setTestResult('Erro ao disparar teste de notificação.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-accent-amber font-semibold mb-1">
          <Bell className="w-4 h-4" />
          Central de Notificações & Web App
        </div>
        <h2 className="font-serif text-3xl text-white">Alertas & Notificações Personalizadas</h2>
        <p className="text-sm text-gray-400">
          Configure avisos no iPhone, notificações na tela de bloqueio e acompanhamento de tarefas.
        </p>
      </div>

      {/* 1. Status do Web App no iPhone (PWA) */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-3 rounded-xl",
              isPWA ? "bg-accent-emerald/15 text-accent-emerald" : "bg-accent-amber/15 text-accent-amber"
            )}>
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isPWA 
                  ? "FlowLife Ativo como Web App (Tela de Início)" 
                  : "Adicionar à Tela de Início do iPhone"}
              </h3>
              <p className="text-xs text-gray-400">
                {isPWA 
                  ? "Seu iPhone está executando o app em modo nativo standalone, permitindo notificações diretas."
                  : "Para receber notificações no iPhone, adicione o FlowLife à tela de início pelo Safari."}
              </p>
            </div>
          </div>
          {isPWA && (
            <span className="px-3 py-1 bg-accent-emerald/20 border border-accent-emerald/40 text-accent-emerald text-xs font-bold rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> PWA Ativo
            </span>
          )}
        </div>

        {!isPWA && (
          <div className="bg-background/80 border border-border rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-accent-amber uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Passo a Passo no iPhone:
            </div>
            <ol className="text-xs text-gray-300 space-y-2 list-decimal list-inside leading-relaxed">
              <li>Abra esta página no navegador <strong>Safari</strong> do seu iPhone.</li>
              <li>Toque no botão <strong>Compartilhar</strong> (ícone com quadrado e seta para cima ⬆️ no rodapé do Safari).</li>
              <li>Role a lista para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.</li>
              <li>Abra o FlowLife direto pelo ícone criado na tela inicial e clique em <strong>"Ativar Notificações"</strong> abaixo.</li>
            </ol>
          </div>
        )}
      </div>

      {/* 2. Permissão de Notificações e Sons */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-3 rounded-xl",
              permission === 'granted' ? "bg-accent-emerald/15 text-accent-emerald" : "bg-red-500/15 text-red-400"
            )}>
              {permission === 'granted' ? <BellRing className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Notificações do Sistema</h3>
              <p className="text-xs text-gray-400">
                {permission === 'granted' 
                  ? 'Permissão autorizada. Você receberá alertas a cada início, aviso de 5 min e encerramento.' 
                  : 'Permissão necessária para o FlowLife enviar alertas no seu aparelho.'}
              </p>
            </div>
          </div>

          {permission !== 'granted' ? (
            <button
              onClick={handleRequestPermission}
              className="px-5 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-all text-xs flex items-center justify-center gap-2 shadow-lg shrink-0"
            >
              <Bell className="w-4 h-4" />
              Ativar Notificações
            </button>
          ) : (
            <div className="px-3 py-1.5 bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-4 h-4" /> Ativadas
            </div>
          )}
        </div>

        {/* Chime / Audio Preferences */}
        <div className="pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/5 rounded-xl text-gray-300">
              {soundEnabled ? <Volume2 className="w-5 h-5 text-accent-amber" /> : <VolumeX className="w-5 h-5 text-gray-500" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Sons de Alerta (Apple Chimes)</div>
              <div className="text-xs text-gray-400">Toca harmonias suaves e elegantes ao iniciar e encerrar tarefas.</div>
            </div>
          </div>
          <button
            onClick={toggleSound}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
              soundEnabled 
                ? "bg-accent-amber/20 border-accent-amber text-accent-amber" 
                : "bg-background border-border text-gray-400 hover:text-white"
            )}
          >
            {soundEnabled ? "Som Ativado" : "Som Desativado"}
          </button>
        </div>
      </div>

      {/* 3. Painel de Testes Rápidos Instantâneos */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white mb-1">Testar Notificações Personalizadas</h3>
          <p className="text-xs text-gray-400">
            Dispare um teste para conferir como o som e o alerta aparecem no seu aparelho agora.
          </p>
        </div>

        {testResult && (
          <div className="p-3 rounded-xl bg-accent-amber/10 border border-accent-amber/30 text-accent-amber text-xs font-medium animate-in fade-in">
            {testResult}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => testTrigger('start')}
            className="p-4 bg-background border border-border hover:border-accent-amber rounded-xl text-left transition-all group"
          >
            <div className="flex items-center justify-between text-xs text-accent-amber font-semibold mb-1">
              <span>1. Início de Tarefa</span>
              <span className="text-[10px] opacity-75">⏰</span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-accent-amber transition-colors">
              "Iniciando: Criativos (45m)"
            </div>
            <div className="text-[11px] text-gray-400 mt-1">Dispara o chime de largada e foco.</div>
          </button>

          <button
            onClick={() => testTrigger('warning')}
            className="p-4 bg-background border border-border hover:border-accent-amber rounded-xl text-left transition-all group"
          >
            <div className="flex items-center justify-between text-xs text-amber-400 font-semibold mb-1">
              <span>2. Aviso de 5 Minutos</span>
              <span className="text-[10px] opacity-75">⚡</span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-accent-amber transition-colors">
              "Faltam 5 Minutos!"
            </div>
            <div className="text-[11px] text-gray-400 mt-1">Alerta sutil para concluir detalhes.</div>
          </button>

          <button
            onClick={() => testTrigger('end')}
            className="p-4 bg-background border border-border hover:border-accent-amber rounded-xl text-left transition-all group"
          >
            <div className="flex items-center justify-between text-xs text-accent-emerald font-semibold mb-1">
              <span>3. Hora de Encerrar</span>
              <span className="text-[10px] opacity-75">🏁</span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-accent-emerald transition-colors">
              "Tarefa Encerrada!"
            </div>
            <div className="text-[11px] text-gray-400 mt-1">Instrui a iniciar a próxima atividade.</div>
          </button>
        </div>
      </div>

      {/* 4. Integração Webhooks para Tela Bloqueada (Pushcut, Make, Zapier) */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-accent-amber/10 text-accent-amber rounded-xl">
            <Webhook className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Disparo por Webhooks (Pushcut, Make, Zapier)</h3>
            <p className="text-xs text-gray-400">
              Garante notificações mesmo se o iPhone estiver bloqueado ou em repouso absoluto.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveWebhooks} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Webhook: Quando Iniciar Nova Tarefa
            </label>
            <input 
              type="url" 
              value={webhookUrlStart}
              onChange={(e) => setWebhookUrlStart(e.target.value)}
              placeholder="https://api.pushcut.io/v1/notifications/... ou Make/Zapier"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Webhook: Faltando 5 Minutos para Encerrar
            </label>
            <input 
              type="url" 
              value={webhookUrl5Min}
              onChange={(e) => setWebhookUrl5Min(e.target.value)}
              placeholder="https://api.pushcut.io/v1/notifications/... (opcional)"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Webhook: Quando o Tempo da Tarefa Finalizar
            </label>
            <input 
              type="url" 
              value={webhookUrlEnd}
              onChange={(e) => setWebhookUrlEnd(e.target.value)}
              placeholder="https://api.pushcut.io/v1/notifications/... (opcional)"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-amber font-mono"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-accent-amber text-background font-bold rounded-xl hover:bg-amber-400 transition-colors flex items-center gap-2 text-xs disabled:opacity-50"
            >
              {isSaving ? 'Salvando...' : (saved ? <><Check className="w-4 h-4" /> Salvo!</> : <><Save className="w-4 h-4" /> Salvar Webhooks</>)}
            </button>
          </div>
        </form>
      </div>

      {/* 5. Regras Automáticas Ativas */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent-amber" />
          Eventos Automáticos Ativos no FlowLife
        </h3>
        <ul className="space-y-3 text-xs text-gray-300">
          <li className="flex items-start gap-3 bg-background/50 p-3 rounded-xl">
            <span className="text-accent-amber font-bold">⏰</span>
            <div>
              <strong className="text-white">Início de Tarefa:</strong>
              <p className="text-gray-400">Toca o chime de foco e avisa quantos minutos você tem de meta.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 bg-background/50 p-3 rounded-xl">
            <span className="text-amber-400 font-bold">⚡</span>
            <div>
              <strong className="text-white">Aviso de 5 Minutos:</strong>
              <p className="text-gray-400">Alerta sonoro e visual para você fechar a tarefa sem procrastinar nem overthinking.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 bg-background/50 p-3 rounded-xl">
            <span className="text-accent-emerald font-bold">🏁</span>
            <div>
              <strong className="text-white">Encerramento da Tarefa:</strong>
              <p className="text-gray-400">Avisa imediatamente para registrar a conclusão e avançar para o próximo bloco da agenda.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 bg-background/50 p-3 rounded-xl">
            <span className="text-red-400 font-bold">🛑</span>
            <div>
              <strong className="text-white">Alerta de Overthinking (Teto Máximo):</strong>
              <p className="text-gray-400">Se passar do tempo limite tolerado, emite alerta para impedir desperdício de tempo.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 bg-background/50 p-3 rounded-xl">
            <span className="text-accent-amber font-bold">🌅</span>
            <div>
              <strong className="text-white">Corte do Expediente ({profile.workEndTime || '19:00'}):</strong>
              <p className="text-gray-400">Alerta de fim do dia de trabalho para preservar seu treino, descanso e igreja.</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
