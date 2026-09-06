import { GoogleGenAI } from '@google/genai';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

export const GEMINI_STORAGE_KEY = 'flowlife_gemini_api_key';

/**
 * Obtém a chave da API do Gemini a partir das seguintes fontes (em ordem):
 * 1. localStorage
 * 2. Perfil do usuário (Firestore)
 * 3. Variáveis de ambiente Vite (VITE_GEMINI_API_KEY ou process.env.GEMINI_API_KEY)
 */
export function getGeminiApiKey(profile?: UserProfile | null): string {
  try {
    const fromStorage = localStorage.getItem(GEMINI_STORAGE_KEY);
    if (fromStorage && fromStorage.trim().length > 0) {
      return fromStorage.trim();
    }
  } catch (_) {
    // LocalStorage indisponível em alguns contextos restritos
  }

  if (profile?.geminiApiKey && profile.geminiApiKey.trim().length > 0) {
    return profile.geminiApiKey.trim();
  }

  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
  if (envKey && envKey !== 'MY_GEMINI_API_KEY' && envKey.trim().length > 0) {
    return envKey.trim();
  }

  return '';
}

/**
 * Salva a chave da API no localStorage e opcionalmente no perfil do Firestore.
 */
export async function saveGeminiApiKey(key: string, profileUid?: string): Promise<void> {
  const cleanKey = key.trim();
  try {
    if (cleanKey) {
      localStorage.setItem(GEMINI_STORAGE_KEY, cleanKey);
    } else {
      localStorage.removeItem(GEMINI_STORAGE_KEY);
    }
  } catch (_) {}

  if (profileUid) {
    try {
      await updateDoc(doc(db, 'users', profileUid), {
        geminiApiKey: cleanKey
      });
    } catch (err) {
      console.warn('Não foi possível salvar a chave no Firestore:', err);
    }
  }
}

/**
 * Testa a validade de uma chave Gemini executando uma chamada simples.
 */
export async function testGeminiApiKey(key: string): Promise<{ success: boolean; error?: string }> {
  const cleanKey = key.trim();
  if (!cleanKey) {
    return { success: false, error: 'Chave não informada.' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Responda apenas com a palavra: OK',
    });

    if (response && response.text) {
      return { success: true };
    }
    return { success: false, error: 'Resposta vazia da API do Gemini.' };
  } catch (error: any) {
    console.error('Erro ao testar chave Gemini:', error);
    const msg = error?.message || error?.toString() || 'Erro desconhecido ao conectar com a API do Gemini.';
    return { success: false, error: msg };
  }
}

/**
 * Executa uma chamada à API do Gemini com fallback automático de modelos suportados.
 */
export async function callGemini(options: {
  apiKey: string;
  prompt: string;
  systemPrompt?: string;
}): Promise<string> {
  const { apiKey, prompt, systemPrompt } = options;
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não encontrada.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  // Lista de modelos suportados em ordem de preferência
  const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`Falha com modelo ${model}:`, err?.message || err);
      lastError = err;
      if (err?.message?.includes('API_KEY_INVALID') || err?.status === 400 || err?.status === 403) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Não foi possível obter resposta da IA.');
}
