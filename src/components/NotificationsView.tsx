import React, { useState, useEffect } from 'react';
import { Bell, BellRing, BellOff, Webhook, Save, Send } from 'lucide-react';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface NotificationsViewProps {
  profile: UserProfile;
}

export function NotificationsView({ profile }: NotificationsViewProps) {
  const [permission, setPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );
  const [webhookUrl, setWebhookUrl] = useState(profile.webhookUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Este navegador não suporta notificações desktop.');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const testNotification = () => {
    if (permission === 'granted') {
      new Notification('FlowLife', {
        body: 'Esta é uma notificação de teste! Suas tarefas estão sob controle.',
        icon: '/vite.svg' // Placeholder icon
      });
    }
  };

  const handleSaveWebhook = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        webhookUrl: webhookUrl.trim()
      });
      alert('Webhook salvo com sucesso!');
    } catch (error) {
      console.error("Erro ao salvar webhook", error);
      alert('Erro ao salvar webhook.');
    } finally {
      setIsSaving(false);
    }
  };

  const testWebhook = async () => {
    if (!webhookUrl) {
      alert('Por favor, insira e salve uma URL de webhook primeiro.');
      return;
    }
    setIsTesting(true);
    try {
      // Usamos no-cors para evitar problemas com APIs que não retornam cabeçalhos CORS (como algumas do Zapier/Make)
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: "FlowLife",
          text: "Sua integração com o webhook está funcionando perfeitamente! 🚀"
        })
      });
      alert('Webhook disparado! Verifique seu aplicativo (ex: Pushcut).');
    } catch (error) {
      console.error("Erro ao testar webhook", error);
      alert('Erro ao disparar webhook. Verifique a URL.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="font-serif text-3xl mb-2">Notificações</h2>
        <p className="text-gray-400">Gerencie seus alertas e lembretes.</p>
      </div>

      {/* Webhook Integration (Pushcut, Make, Zapier) */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 rounded-lg bg-accent-amber/10 text-accent-amber">
            <Webhook className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-medium">Integração Webhook (Pushcut, Zapier, etc.)</h3>
            <p className="text-sm text-gray-400">
              Receba notificações no seu celular mesmo com o app fechado.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Cole abaixo a URL do seu Webhook. O FlowLife enviará um <code>POST</code> com <code>title</code> e <code>text</code> no formato JSON. Ideal para usar com o app <strong>Pushcut</strong> (iOS) ou ferramentas como Make.com e Zapier.
          </p>
          
          <div className="flex flex-col md:flex-row gap-3">
            <input 
              type="url" 
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://api.pushcut.io/v1/notifications/NomeDaNotificacao?webhook=..."
              className="flex-1 bg-background border border-border rounded-lg px-4 py-2 focus:outline-none focus:border-accent-amber text-sm"
            />
            <button 
              onClick={handleSaveWebhook}
              disabled={isSaving}
              className="px-4 py-2 bg-accent-amber text-background font-medium rounded-lg hover:bg-amber-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>

          <button 
            onClick={testWebhook}
            disabled={isTesting || !webhookUrl}
            className="w-full py-3 border border-border rounded-lg hover:border-accent-amber hover:text-accent-amber transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {isTesting ? 'Enviando...' : 'Disparar Teste de Webhook'}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${permission === 'granted' ? 'bg-accent-emerald/10 text-accent-emerald' : 'bg-gray-500/10 text-gray-400'}`}>
              {permission === 'granted' ? <BellRing className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-lg font-medium">Notificações do Navegador</h3>
              <p className="text-sm text-gray-400">
                {permission === 'granted' 
                  ? 'Ativadas. Você receberá alertas importantes.' 
                  : 'Desativadas. Autorize para receber alertas.'}
              </p>
            </div>
          </div>
          
          {permission !== 'granted' && (
            <button 
              onClick={requestPermission}
              className="px-4 py-2 bg-accent-emerald text-background font-medium rounded-lg hover:bg-emerald-400 transition-colors"
            >
              Ativar
            </button>
          )}
        </div>

        {permission === 'granted' && (
          <button 
            onClick={testNotification}
            className="w-full py-3 border border-border rounded-lg hover:border-accent-amber hover:text-accent-amber transition-colors"
          >
            Testar Notificação
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-medium mb-4">Eventos Automáticos (Em breve)</h3>
        <ul className="space-y-4 text-sm text-gray-300">
          <li className="flex items-start gap-3">
            <span className="text-accent-amber">⏰</span>
            <div>
              <strong>08:00 - Resumo do dia</strong>
              <p className="text-gray-500">Lista das tarefas de hoje com suas áreas.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-accent-amber">⚡</span>
            <div>
              <strong>30 min antes do prazo</strong>
              <p className="text-gray-500">Alerta de urgência para tarefas com horário fixo.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-accent-amber">✅</span>
            <div>
              <strong>18:00 - Fechamento</strong>
              <p className="text-gray-500">Resumo do que foi concluído vs pendente.</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
