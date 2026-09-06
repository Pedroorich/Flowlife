import React, { useState } from 'react';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Settings, Save, Check, Bell, Smartphone, Key, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import { getGeminiApiKey, saveGeminiApiKey, testGeminiApiKey } from '../lib/gemini';
import { cn } from '../lib/utils';

interface SettingsViewProps {
  profile: UserProfile;
  onNavigateToNotifications?: () => void;
}

export function SettingsView({ profile, onNavigateToNotifications }: SettingsViewProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey(profile));
  const [testingKey, setTestingKey] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  const [form, setForm] = useState({
    webhookUrlStart: profile.webhookUrlStart || '',
    webhookUrl5Min: profile.webhookUrl5Min || '',
    webhookUrlEnd: profile.webhookUrlEnd || ''
  });

  const handleTestKey = async () => {
    if (!geminiKey.trim()) {
      setTestStatus({ success: false, message: 'Digite uma chave antes de testar.' });
      return;
    }
    setTestingKey(true);
    setTestStatus(null);
    try {
      const res = await testGeminiApiKey(geminiKey.trim());
      if (res.success) {
        setTestStatus({ success: true, message: 'Conexão com Google Gemini realizada com sucesso!' });
      } else {
        setTestStatus({ success: false, message: `Falha no teste: ${res.error}` });
      }
    } catch (err: any) {
      setTestStatus({ success: false, message: `Erro ao testar: ${err?.message || err}` });
    } finally {
      setTestingKey(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      await saveGeminiApiKey(geminiKey.trim(), profile.uid);

      await updateDoc(doc(db, 'users', profile.uid), {
        webhookUrlStart: form.webhookUrlStart,
        webhookUrl5Min: form.webhookUrl5Min,
        webhookUrlEnd: form.webhookUrlEnd,
        geminiApiKey: geminiKey.trim()
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

      {/* Card de Inteligência Artificial Google Gemini */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent-amber/20 text-accent-amber rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Inteligência Artificial (Google Gemini)
                {geminiKey ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                    Ativa
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                    Pendente
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-400">
                Alimenta o assistente por voz, fracionamento de tarefas e os Agentes Copilotos.
              </p>
            </div>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-accent-amber rounded-lg border border-accent-amber/20 flex items-center gap-1.5 text-xs shrink-0 font-medium self-start sm:self-auto"
          >
            Obter Chave Grátis <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Chave da API (Gemini API Key)</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={geminiKey}
              onChange={e => {
                setGeminiKey(e.target.value);
                setTestStatus(null);
              }}
              className="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-accent-amber transition-colors"
              placeholder="Cole sua chave AIzaSy..."
            />
            <button
              type="button"
              onClick={handleTestKey}
              disabled={testingKey || !geminiKey.trim()}
              className="px-4 py-2.5 bg-white/5 border border-border hover:border-accent-amber text-accent-amber font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {testingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {testingKey ? 'Testando...' : 'Testar Conexão'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            Sua chave é armazenada com segurança e persistida no seu perfil.
          </p>
        </div>

        {testStatus && (
          <div className={cn(
            "p-3 rounded-lg text-xs flex items-center gap-2",
            testStatus.success 
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" 
              : "bg-red-500/10 text-red-400 border border-red-500/30"
          )}>
            {testStatus.success ? <Check className="w-4 h-4 shrink-0" /> : <span className="text-red-400 font-bold shrink-0">✕</span>}
            <span>{testStatus.message}</span>
          </div>
        )}
      </div>

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
