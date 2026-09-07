import { GoogleGenAI } from '@google/genai';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

export const GEMINI_STORAGE_KEY = 'flowlife_gemini_api_key';
export const CACHED_WORKING_MODEL_KEY = 'flowlife_working_gemini_model';

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
  } catch (_) {}

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
      localStorage.removeItem(CACHED_WORKING_MODEL_KEY);
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
 * Formata mensagens de erro da API do Google para um texto em português claro.
 */
export function formatGeminiErrorMessage(error: any): string {
  const rawMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));

  if (
    rawMsg.includes('not found for API version') || 
    rawMsg.includes('ListModels') ||
    rawMsg.includes('not been used in project') ||
    rawMsg.includes('is disabled') ||
    rawMsg.includes('PERMISSION_DENIED')
  ) {
    return 'Esta chave de API não possui a "Generative Language API" habilitada no seu projeto Google Cloud.\n\n👉 Para resolver em 1 minuto:\n1. Acesse: https://aistudio.google.com/app/apikey com sua conta Google.\n2. Clique em "Create API key" (e selecione "Create API key in new project").\n3. Copie a chave gerada lá e cole aqui no FlowLife.\n(As chaves criadas no Google AI Studio já vêm com os modelos Gemini liberados gratuitamente).';
  }

  if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('API key not valid')) {
    return 'Chave de API inválida. Verifique se copiou a chave completa gerada no Google AI Studio (iniciando com "AIzaSy...").';
  }

  if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('quota')) {
    return 'Limite de requisições gratuitas atingido temporariamente pelo Google. Aguarde alguns instantes e tente novamente.';
  }

  return rawMsg;
}

function isPureTextModel(name: string): boolean {
  const lower = name.toLowerCase();
  if (
    lower.includes('tts') ||
    lower.includes('audio') ||
    lower.includes('image') ||
    lower.includes('imagen') ||
    lower.includes('veo') ||
    lower.includes('embedding') ||
    lower.includes('realtime') ||
    lower.includes('bison') ||
    lower.includes('aqa')
  ) {
    return false;
  }
  return lower.includes('gemini');
}

/**
 * Consulta a lista de modelos suportados pela chave do usuário (com cache).
 */
export async function getAvailableModels(apiKey: string): Promise<{
  success: boolean;
  models: string[];
  error?: string;
  isGenerativeApiDisabled?: boolean;
}> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, models: [], error: 'Chave não informada.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();

    if (data?.error) {
      const msg = data.error.message || '';
      const isGenerativeApiDisabled = 
        msg.includes('not been used in project') || 
        msg.includes('is disabled') ||
        msg.includes('not found for API version') ||
        data.error.status === 'PERMISSION_DENIED';

      return {
        success: false,
        models: [],
        error: msg,
        isGenerativeApiDisabled,
      };
    }

    if (Array.isArray(data?.models)) {
      const models = data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace(/^models\//, ''))
        .filter(isPureTextModel);

      if (models.length > 0) {
        return { success: true, models };
      }
    }
  } catch (_) {}

  return { success: false, models: [] };
}

/**
 * Executa uma requisição HTTP com timeout rígido (AbortController)
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Disparo rápido direto via REST API v1beta (Latência ultrabaixa)
 */
async function callGeminiRest(model: string, apiKey: string, prompt: string, timeoutMs = 12000): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        topP: 0.95
      }
    })
  }, timeoutMs);

  const data = await res.json();

  if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }

  if (data?.error) {
    throw new Error(data.error.message || 'Erro na API Gemini REST');
  }

  throw new Error('Resposta vazia da API Gemini.');
}

/**
 * Testa a validade de uma chave Gemini de forma rápida (2 segundos).
 */
export async function testGeminiApiKey(key: string): Promise<{ success: boolean; error?: string }> {
  const cleanKey = key.trim();
  if (!cleanKey) {
    return { success: false, error: 'Chave não informada.' };
  }

  try {
    const text = await callGemini({
      apiKey: cleanKey,
      prompt: 'Responda apenas com a palavra: OK',
      fastOnly: true
    });

    if (text) {
      return { success: true };
    }
    return { success: false, error: 'Resposta vazia da API do Gemini.' };
  } catch (error: any) {
    console.error('Erro ao testar chave Gemini:', error);
    return { success: false, error: formatGeminiErrorMessage(error) };
  }
}

/**
 * Executa uma chamada à API do Gemini com FAST-PATH direto (2 a 4 segundos).
 * Possui cache automático do modelo que funciona e timeouts controlados por tentativa.
 */
export async function callGemini(options: {
  apiKey: string;
  prompt: string;
  systemPrompt?: string;
  fastOnly?: boolean;
}): Promise<string> {
  const { apiKey, prompt, systemPrompt, fastOnly } = options;
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não encontrada.');
  }

  const cleanKey = apiKey.trim();
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  // 1. Verificar se já temos um modelo vencedor em cache
  let cachedModel = '';
  try {
    cachedModel = localStorage.getItem(CACHED_WORKING_MODEL_KEY) || '';
  } catch (_) {}

  // 2. Ranking prioritário de modelos ultra-rápidos
  const fastModels = [
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-1.5-pro-latest'
  ];

  // Se o modelo em cache for válido, coloca ele no topo absoluto
  const orderedModels = cachedModel 
    ? [cachedModel, ...fastModels.filter(m => m !== cachedModel)]
    : fastModels;

  let lastError: any = null;

  // 3. FAST-PATH: Chamada direta via REST API nativa com timeout de 12 segundos por modelo
  for (const model of orderedModels) {
    try {
      const result = await callGeminiRest(model, cleanKey, fullPrompt, fastOnly ? 7000 : 12000);
      if (result) {
        // Grava no cache o modelo que funcionou para as próximas chamadas irem direto nele
        try {
          localStorage.setItem(CACHED_WORKING_MODEL_KEY, model);
        } catch (_) {}
        return result;
      }
    } catch (err: any) {
      lastError = err;
      const isAuthError = err?.message?.includes('API_KEY_INVALID') || err?.message?.includes('API key not valid');
      if (isAuthError) {
        throw new Error(formatGeminiErrorMessage(err));
      }
      // Se for erro de cota ou modelo desativado, continua para o próximo imediatamente sem esperar
    }
  }

  // 4. Fallback secundário: SDK Oficial @google/genai (caso REST tenha sido bloqueado por proxy/CORS)
  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const fallbackModel = cachedModel || 'gemini-1.5-flash';
    const response = await ai.models.generateContent({
      model: fallbackModel,
      contents: fullPrompt,
    });

    if (response && response.text) {
      try {
        localStorage.setItem(CACHED_WORKING_MODEL_KEY, fallbackModel);
      } catch (_) {}
      return response.text;
    }
  } catch (sdkErr) {
    lastError = sdkErr;
  }

  throw new Error(formatGeminiErrorMessage(lastError));
}
