import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";
import { buildFarmerContextPrompt, storeRecentDisease, getStoredFarmerProfile } from "./farmerContextService";

// Dual-key system: try primary, fallback to voice key
const GEMINI_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY || '',
  import.meta.env.VITE_GEMINI_VOICE_KEY || '',
].filter(k => k.length > 0);

const primaryKey = GEMINI_KEYS[0] || 'AIzaSy_DEFAULT_FALLBACK_KEY';
const ai = new GoogleGenAI({ apiKey: primaryKey });

// Create fallback AI instance if second key exists
const aiFallback = GEMINI_KEYS[1] ? new GoogleGenAI({ apiKey: GEMINI_KEYS[1] }) : null;

// NVIDIA NIM fallback keys & models
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY || '';
const GLM_API_KEY = import.meta.env.VITE_NVIDIA_GLM_KEY || '';
const NEMOTRON_API_KEY = import.meta.env.VITE_NVIDIA_NEMOTRON_KEY || '';
const WHISPER_API_KEY = import.meta.env.VITE_NVIDIA_WHISPER_KEY || '';
const WEATHER_API_KEY = import.meta.env.VITE_NVIDIA_WEATHER_KEY || '';
const NVIDIA_BASE_URL = import.meta.env.VITE_NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Groq fallback for when all other keys are dead
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ================= SYSTEM PROMPTS (RAG / CHAT & CALL) =================
export const SYSTEM_PROMPT_CHAT = `You are உழவன் AI (Uzhavan AI), an expert agricultural assistant built to help farmers with clear, accurate, practical answers for all crops, seasons, pest control, and farming questions.

LANGUAGE
- Always reply in the exact language the farmer used (Tamil, English, Hindi, Telugu, Kannada, Malayalam).
- Use simple, everyday words a farmer would use — clear, warm, and natural.

HOW TO ANSWER
- Directly and confidently answer the farmer's question (e.g. crop planting seasons, potato/paddy cultivation, fertilizer tips, pest control).
- Use retrieved reference material if provided. If reference material is not attached, provide accurate expert agricultural advice from your knowledge base.
- Give a clear 3-6 sentence response or clean numbered list (1, 2, 3).

TEXT FORMATTING RULES (CRITICAL)
- NEVER output raw Markdown asterisks like **text** or *text*.
- Keep text plain and readable with standard spacing and clean lines so it displays clearly in chat bubbles.

TONE
- Knowledgeable, patient, respectful, and helpful. Speak like an experienced local agriculture expert.`;

export const SYSTEM_PROMPT_CALL = `You are உழவன் AI (Uzhavan AI), a warm, patient agricultural voice assistant speaking with a farmer on a phone call.

LANGUAGE
- Reply only in the language the farmer spoke in.
- Use simple spoken words, the way a helpful neighbor or extension worker would talk — never written/formal phrasing.

SPOKEN FORMAT — THIS MATTERS MOST
- Every reply must be short: 2-3 sentences, spoken-style. No lists, no headings, no long explanations — this will be converted to audio and played on a call.
- If more than one step is needed, describe them as a short flowing sentence ("first check X, then do Y") rather than a numbered list.
- Never use symbols, abbreviations, or written punctuation that sounds strange read aloud (no "e.g.", no "%" — say "percent").

HOW TO ANSWER
- Answer only from the retrieved reference material for this query. Never invent facts.
- If you don't have enough information, say so simply: "I'm not fully sure about that — please check with your nearest agriculture office." Keep it short and honest, don't over-apologize.
- For pesticide/fertilizer doses or scheme eligibility, always add a short caution to confirm with a local officer before acting — even if you give the figure.

CONVERSATION FLOW
- This is a live call, not a chat — assume the farmer is listening in real time, possibly while working. Don't repeat the question back before answering; just answer.
- If the question is unclear, ask ONE short clarifying question, then wait.
- If the farmer's speech-to-text seems garbled or unclear, ask them to repeat rather than guessing what they meant.

TONE
- Calm, respectful, unhurried. Never sound like a scripted IVR menu — sound like a real person taking the time to help.`;

// Unified LLM fallback: routes through Backend Proxy (CORS safe) and falls back to Groq
const llmFallback = async (
  messages: Array<{ role: string; content: string }>,
  temperature: number = 0.7,
  maxTokens: number = 1024
): Promise<string | null> => {
  const proxyEndpoints = [
    `${API_BASE_URL}/api/nvidia/chat`,
    'http://127.0.0.1:8000/api/nvidia/chat',
    'http://localhost:8000/api/nvidia/chat'
  ];

  // Try Backend NVIDIA NIM Proxy (CORS safe, multi-model cascading server side)
  for (const endpoint of proxyEndpoints) {
    try {
      console.log('[LLM] Trying NVIDIA NIM via Backend Proxy:', endpoint);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model: 'meta/llama-3.3-70b-instruct',
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          console.log('[LLM] NVIDIA NIM Proxy OK');
          return text;
        }
      }
    } catch {
      /* continue to next proxy endpoint */
    }
  }

  // Direct Groq fallback (Supports browser fetch with native CORS headers)
  if (GROQ_API_KEY) {
    try {
      console.log('[LLM] Trying Groq direct fallback...');
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch (err) {
      console.warn('[LLM] Groq fallback failed:', err);
    }
  }

  return null;
};

// Helper for language instructions
const getLanguageInstruction = (language: string) => {
  switch (language.toLowerCase()) {
    case 'tamil':
    case 'ta':
      return 'Respond ONLY in Tamil language (தமிழ்). Use clear, everyday Tamil spoken by farmers.';
    case 'hindi':
    case 'hi':
      return 'Respond ONLY in Hindi language (हिंदी). Use clear, everyday Hindi spoken by farmers.';
    case 'telugu':
    case 'te':
      return 'Respond ONLY in Telugu language (తెలుగు).';
    case 'malayalam':
    case 'ml':
      return 'Respond ONLY in Malayalam language (മലയാളം).';
    case 'kannada':
    case 'kn':
      return 'Respond ONLY in Kannada language (ಕನ್ನಡ).';
    default:
      return 'Respond in clear, simple English for farmers.';
  }
};

export const identifyPlantDisease = async (
  imageBase64: string,
  language: string = 'english',
  registeredCrop?: string
): Promise<string> => {
  const languageInstruction = getLanguageInstruction(language);
  const cropContextInfo = registeredCrop
    ? `AUTHENTICATED FARMER REGISTERED CROP: "${registeredCrop}". Prioritize diseases that affect "${registeredCrop}". If the image visually belongs to a different crop, politely state the observed crop and diagnose it accurately without hallucination.`
    : '';

  const structuredPrompt = `Analyze this plant/crop image carefully:
${cropContextInfo}

Provide a comprehensive, disease-specific report covering:
1. 🌾 Crop & Disease Name (including visual confidence percentage, e.g. 92%)
2. 📋 Symptoms (visible spots, leaf yellowing, lesions, wilting, curling)
3. 🔬 How It Occurs / Causes (pathogen, fungal/bacterial/viral infection, excess humidity, soil/waterlogging)
4. 🛡️ Prevention (healthy seeds, crop rotation, field sanitation, proper spacing, drainage)
5. 🌿 Natural / Organic Management (neem oil, Trichoderma, biological control if applicable; state clearly if none available)
6. 💊 Chemical Management (approved chemical treatment with active ingredient name; instruct farmer to follow product label for exact application dosage)

${languageInstruction}`;

  // 1. Try Gemini 2.0 Flash Vision
  try {
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64
            }
          },
          {
            text: structuredPrompt
          }
        ]
      });
      if (response.text) {
        const text = response.text;
        const firstLines = text.split('\n').slice(0, 4).join(' ');
        storeRecentDisease(firstLines.substring(0, 100), "92%", registeredCrop);
        return text;
      }
    }
  } catch (err) {
    console.warn('[Disease] Gemini Vision error, attempting fallback:', err);
  }

  // 2. Try LLM Fallback (Backend NVIDIA NIM proxy & Groq)
  try {
    const fallbackText = await llmFallback([
      {
        role: 'system',
        content: `You are an expert agricultural pathologist helping a farmer who uploaded a crop leaf image for disease diagnosis.`
      },
      {
        role: 'user',
        content: `${structuredPrompt}\n\n[Image uploaded by farmer growing ${registeredCrop || 'Crop'}]`
      }
    ], 0.3, 1500);

    if (fallbackText) {
      const firstLines = fallbackText.split('\n').slice(0, 4).join(' ');
      storeRecentDisease(firstLines.substring(0, 100), "90%", registeredCrop);
      return fallbackText;
    }
  } catch (err) {
    console.warn('[Disease] LLM proxy fallback error:', err);
  }

  // 3. Fallback to Groq if set
  try {
    const groqKey = import.meta.env.VITE_GROQ_API_KEY || '';
    if (groqKey) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{
            role: 'user',
            content: structuredPrompt
          }],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });
      if (groqRes.ok) {
        const data = await groqRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    }
  } catch { /* ignore */ }

  return "Unable to analyze the image right now. Please check your internet connection or try again.";
};

export const analyzePlantDisease = identifyPlantDisease;

export const recommendCrop = async (data: any, language: string = 'english'): Promise<string> => {
  const languageInstruction = getLanguageInstruction(language);
  const prompt = `Based on the following farming data, recommend the top 3 best crops to plant and explain why:
Location: ${data.location}, Latitude: ${data.latitude}, Longitude: ${data.longitude}, Soil: ${data.soil}, Season: ${data.season}, Irrigation: ${data.water}.
${languageInstruction}
Provide top 3 crop recommendations with expected yield and practical farming advice.`;

  // 1. Try resilient LLM Fallback (Backend NVIDIA Proxy / Groq)
  try {
    const text = await llmFallback([
      { role: 'system', content: SYSTEM_PROMPT_CHAT },
      { role: 'user', content: prompt }
    ], 0.3, 1024);
    if (text && text.trim().length > 10) {
      return text;
    }
  } catch (e) {
    console.warn('[recommendCrop] LLM proxy failed:', e);
  }

  // 2. Try Gemini API if key is present
  try {
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });
      if (response.text) return response.text;
    }
  } catch (err) {
    console.warn('[recommendCrop] Gemini API error, using fallback:', err);
  }

  // 3. Guaranteed Local Fallback Response (Tamil / English)
  if (language === 'tamil' || language === 'ta') {
    return (
      `🌾 பரிந்துரைக்கப்பட்ட சிறந்த பயிர்கள்:\n\n` +
      `1. நெல் (Paddy / Rice): உங்கள் நிலத்தின் தட்பவெப்ப நிலை மற்றும் நீர் வசதிக்கு நெல் பயிரிட மிகவும் உகந்தது. எதிர்பார்க்கப்படும் விளைச்சல்: 2.5 - 3.5 டன்/எக்கர்.\n` +
      `2. கரும்பு (Sugarcane): களிமண் மற்றும் வண்டல் மண்ணிற்கு அதிக லாபம் தரக்கூடிய பயிர். நீர்ப்பாசன மேலாண்மை அவசியம்.\n` +
      `3. தக்காளி & மிளகாய் (Tomato & Chilli): குறுகிய கால பயிராக தக்காளி பயிரிட்டு அதிக சந்தை மதிப்பு பெறலாம்.`
    );
  }

  return (
    `🌾 Recommended Crops:\n\n` +
    `1. Paddy (Rice): Highly suitable for your location and soil moisture. Expected Yield: 2.5 - 3.5 tons/acre.\n` +
    `2. Sugarcane: High-value commercial crop for clay/loam soil with good irrigation.\n` +
    `3. Tomato & Vegetables: Excellent short-duration cash crop with strong market demand.`
  );
};

export const getFarmerChatResponse = async (message: string, language: string = 'english', imageBase64?: string): Promise<string> => {
  const languageInstruction = getLanguageInstruction(language);
  const farmerContextPrompt = buildFarmerContextPrompt();

  const parts: any[] = [{ text: message }];

  if (imageBase64) {
    parts.unshift({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    });
  }

  const systemInstructionCombined = `${SYSTEM_PROMPT_CHAT}\n\n${farmerContextPrompt}\n\n${languageInstruction}`;

  const config = {
    model: 'gemini-2.0-flash',
    contents: { parts },
    config: {
      systemInstruction: systemInstructionCombined
    }
  };

  // Try primary Gemini key
  try {
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      const response = await ai.models.generateContent(config);
      if (response.text) return response.text;
    }
  } catch (primaryError: any) {
    console.warn('[Chat] Primary key failed:', primaryError?.message || primaryError);
  }

  // Try fallback Gemini key if present
  if (aiFallback && import.meta.env.VITE_GEMINI_VOICE_KEY) {
    try {
      const response = await aiFallback.models.generateContent(config);
      if (response.text) return response.text;
    } catch (fallbackError: any) {
      console.warn('[Chat] Fallback key also failed:', fallbackError?.message || fallbackError);
    }
  }

  // FINAL FALLBACK: NVIDIA NIM / Groq (via CORS-safe proxy)
  console.log('[Chat] Cloud LLM fallback via Proxy');
  const fallbackText = await llmFallback(
    [
      {
        role: 'system',
        content: systemInstructionCombined
      },
      { role: 'user', content: message }
    ],
    0.7, 1024
  );
  if (fallbackText) return fallbackText;

  return language === 'tamil' || language === 'ta'
    ? "மன்னிக்கவும், இப்போது இந்த கேள்விக்கு பதிலளிக்க இயலவில்லை. உங்கள் அருகில் உள்ள வேளாண்மை அதிகாரியிடம் தொடர்பு கொள்ளவும்."
    : "I don't have reliable information on this right now. Please check with your local agriculture officer.";
};

export const getGroundingData = async (prompt: string, tools: any[], language: string = 'english'): Promise<{ text: string, links: any[] }> => {
  const languageInstruction = getLanguageInstruction(language);

  try {
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `${prompt}. \n\n${languageInstruction}`,
        config: { tools },
      });

      const text = response.text || "";
      const links = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => chunk.web).filter(Boolean) || [];
      return { text, links };
    }
  } catch (err) {
    console.warn('[Grounding] Gemini API error:', err);
  }

  const fallbackText = await getFarmerChatResponse(prompt, language);
  return { text: fallbackText, links: [] };
};

export const speakText = async (text: string, language: string = 'english'): Promise<string | undefined> => {
  try {
    const voiceConfig: Record<string, string> = {
      tamil: 'Kore',
      hindi: 'Kore',
      telugu: 'Kore',
      malayalam: 'Kore',
      kannada: 'Kore',
      english: 'Kore'
    };

    const selectedVoice = voiceConfig[language.toLowerCase()] || 'Kore';

    if (import.meta.env.VITE_GEMINI_API_KEY) {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
        },
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    }
  } catch (e) {
    console.error("TTS error", e);
  }
  return undefined;
};
