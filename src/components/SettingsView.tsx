import React, { useState } from 'react';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Settings, Save, Check, Bell, Smartphone } from 'lucide-react';

interface SettingsViewProps {
  profile: UserProfile;
  onNavigateToNotifications?: () => void;
}

export function SettingsView({ profile, onNavigateToNotifications }: SettingsViewProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    webhookUrlStart: profile.webhookUrlStart || '',
    webhookUrl5Min: profile.webhookUrl5Min || '',
    webhookUrlEnd: profile.webhookUrlEnd || ''
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        webhookUrlStart: form.webhookUrlStart,
        webhookUrl5Min: form.webhookUrl5Min,
        webhookUrlEnd: form.webhookUrlEnd
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Erro ao salvar config", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-accent-amber/10 text-accent-amber rounded-lg">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-serif text-3xl text-accent-amber">Configurações</h2>
          <p className="text-gray-400">Configure suas integrações e automações.</p>
        </div>
      </div>

      {/* Card de Acesso Rápido a Notificações e PWA */}
      {onNavigateToNotifications && (
        <div className="bg-surface border border-accent-amber/30 rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent-amber/20 text-accent-amber rounded-xl">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Central de Notificações & PWA</h3>
              <p className="text-xs text-gray-400">
                Ative alertas de início, aviso de 5 minutos e encerramento no seu iPhone.
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToNotifications}
            className="px-4 py-2 bg-accent-amber text-background font-bold text-xs rounded-lg hover:bg-amber-400 transition-colors shrink-0"
          >
            Abrir Alertas
          </button>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl font-medium mb-4">Webhooks de Atividades</h3>
        <p className="text-sm text-gray-400 mb-6">
          Insira aqui as URLs para disparar automações no sistema (ex: Pushcut, Make, Zapier).
        </p>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Quando iniciar uma nova atividade</label>
            <input 
              type="url"
              value={form.webhookUrlStart}
              onChange={e => setForm({...form, webhookUrlStart: e.target.value})}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber transition-colors"
              placeholder="https://hook.pushcut.io/..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Faltando 5 minutos para encerrar a atividade atual</label>
            <input 
              type="url"
              value={form.webhookUrl5Min}
              onChange={e => setForm({...form, webhookUrl5Min: e.target.value})}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber transition-colors"
              placeholder="https://hook.pushcut.io/..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Quando o tempo da atividade finalizar</label>
            <input 
              type="url"
              value={form.webhookUrlEnd}
              onChange={e => setForm({...form, webhookUrlEnd: e.target.value})}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent-amber transition-colors"
              placeholder="https://hook.pushcut.io/..."
            />
            <p className="text-xs text-gray-500 mt-2">Você receberá a notificação para encerrar no app e começar a próxima.</p>
          </div>

          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-accent-amber text-background font-medium rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {saving ? <span className="animate-spin text-xl leading-none">⟳</span> : (saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />)}
              {saved ? 'Salvo!' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
