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
 * Formata mensagens de erro da API do Google para um texto em português claro e com instruções de resolução.
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
    return 'Esta chave de API não possui a "Generative Language API" habilitada no seu projeto Google Cloud.\n\n👉 Para resolver em 1 minuto:\n1. Acesse: https://aistudio.google.com/app/apikey com sua conta Google.\n2. Clique no botão "Create API key" (e selecione "Create API key in new project").\n3. Copie a chave gerada lá e cole aqui no FlowLife.\n(As chaves criadas diretamente pelo Google AI Studio já vêm com os modelos Gemini liberados gratuitamente).';
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
  // Exclui modelos de TTS, áudio, imagem, embedding e outros não textuais
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
 * Consulta a lista de modelos suportados pela chave do usuário em tempo real.
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

  // 1. Tenta endpoint v1beta
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
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

  // 2. Tenta endpoint v1
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${cleanKey}`);
    const data = await res.json();

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
 * Testa a validade de uma chave Gemini executando uma chamada simples.
 */
export async function testGeminiApiKey(key: string): Promise<{ success: boolean; error?: string }> {
  const cleanKey = key.trim();
  if (!cleanKey) {
    return { success: false, error: 'Chave não informada.' };
  }

  // Verifica se a chave tem acesso à Generative Language API
  const avail = await getAvailableModels(cleanKey);
  if (!avail.success && avail.isGenerativeApiDisabled) {
    return {
      success: false,
      error: formatGeminiErrorMessage(avail.error)
    };
  }

  try {
    const text = await callGemini({
      apiKey: cleanKey,
      prompt: 'Diga apenas: OK',
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
 * Executa uma chamada à API do Gemini com descoberta dinâmica de modelos e fallbacks automáticos.
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

  const cleanKey = apiKey.trim();
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  // Consulta modelos disponíveis para esta chave
  const avail = await getAvailableModels(cleanKey);
  if (!avail.success && avail.isGenerativeApiDisabled) {
    throw new Error(formatGeminiErrorMessage(avail.error || 'Generative Language API desativada'));
  }

  // Modelos candidatos padrão para texto (ordenados por qualidade e velocidade)
  const defaultTextModels = [
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
    'gemini-pro'
  ];

  let candidateModels = [...defaultTextModels];

  if (avail.success && avail.models.length > 0) {
    // Modelos que a API confirmou que existem nesta conta e que são exclusivamente de texto
    const flashList = avail.models.filter(m => m.includes('flash') && isPureTextModel(m));
    const others = avail.models.filter(m => !m.includes('flash') && isPureTextModel(m));
    candidateModels = [...new Set([...flashList, ...others, ...defaultTextModels])];
  }

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  let lastError: any = null;

  // Tentativa 1: SDK Oficial @google/genai
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
      console.warn(`Falha com modelo ${model} via SDK:`, err?.message || err);
      lastError = err;
      // Apenas aborta imediatamente se for erro de autenticação (chave inválida)
      const isAuthError = err?.message?.includes('API_KEY_INVALID') || err?.message?.includes('API key not valid');
      if (isAuthError) {
        throw new Error(formatGeminiErrorMessage(err));
      }
      // Se for erro 400 (ex: modalidade de modelo incorreta), CONTINUA para o próximo modelo!
    }
  }

  // Tentativa 2: Chamada direta via REST API v1beta
  for (const model of candidateModels.slice(0, 3)) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }]
        })
      });
      const data = await res.json();
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }
      if (data?.error) {
        lastError = data.error;
      }
    } catch (fetchErr) {
      lastError = fetchErr;
    }
  }

  // Tentativa 3: Chamada direta via REST API v1
  for (const model of ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro']) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${cleanKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }]
        })
      });
      const data = await res.json();
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }
      if (data?.error) {
        lastError = data.error;
      }
    } catch (fetchErr) {
      lastError = fetchErr;
    }
  }

  throw new Error(formatGeminiErrorMessage(lastError));
}

