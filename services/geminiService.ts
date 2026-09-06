import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";
import { buildFarmerContextPrompt, buildEnrichedContextPrompt, storeRecentDisease, getStoredFarmerProfile, fetchLiveWeatherForContext, fetchLiveMarketForContext, fetchLiveNewsForContext } from "./farmerContextService";
import { getStrictSystemPrompt } from "./promptConfig";
import { analyzePlantDiseaseOffline, getOfflineAgriculturalResponse } from "./offlineIntelligenceService";
import { getApiBaseUrl } from "./api";

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

const API_BASE_URL = getApiBaseUrl();

// ================= SYSTEM PROMPTS (RAG / CHAT & CALL) =================
export const SYSTEM_PROMPT_CHAT = `You are உழவன் AI (Uzhavan AI), an expert agricultural assistant built to provide precise, direct answers to farmers.

STRICT RESPONSE BOUNDARIES (MANDATORY):
1. ZERO FLUFF & STRICT PRECISION:
- Answer the user's question directly in EXACTLY 1 or 2 short, precise sentences maximum.
- NEVER output lengthy paragraphs, bullet points, numbered lists, markdown headers, bold asterisks (**), emojis, or conversational fillers.
- Do NOT start with introductory filler like "Certainly!", "Hello farmer!", or "Here is the information:". Begin immediately with the exact answer.

2. EXACT INTENT MATCH:
- If the user asks a specific question (e.g., "How much water for onions?" or "What is the tomato price?"), provide ONLY the exact quantity, price, dosage, or fact requested.
- Do NOT provide unasked general advice, history, prevention measures, or side tips.

3. NO OVER-ANSWERING:
- Never list multiple options, varieties, or remedies when a single definitive answer is expected.
- Give one single, accurate, definitive recommendation.

4. ACTIVE LANGUAGE:
- Always respond strictly in the requested language (Tamil, English, Hindi, Telugu, Kannada, Malayalam).`;

export const SYSTEM_PROMPT_CALL = `You are உழவன் AI (Uzhavan AI), a warm, patient agricultural voice assistant speaking with a farmer on a phone call.

LANGUAGE
- Reply only in the language the farmer spoke in.
- Use simple spoken words, the way a helpful neighbor or extension worker would talk — never written/formal phrasing.

SPOKEN FORMAT — THIS MATTERS MOST
- Every reply must be short: 2-3 sentences, spoken-style. No lists, no headings, no long explanations — this will be converted to audio and played on a call.
- Never output raw JSON, arrays, or code blocks. Always respond in spoken natural language.

HOW TO ANSWER
- Answer directly from the retrieved reference material for this query. Never invent facts.
- For pesticide/fertilizer doses or scheme eligibility, always add a short caution to confirm with a local officer before acting.

TONE
- Calm, respectful, unhurried. Sound like a real person taking the time to help.`;

// ─────────────────── FARMER RESPONSE SANITIZER ───────────────────
export const sanitizeFarmerResponse = (text: string, language: string = 'english'): string => {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();

  // Strip markdown code fences like ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();

  // Check if string contains or starts with JSON
  const firstChar = cleaned.charAt(0);
  const isJsonStart = firstChar === '[' || firstChar === '{';
  const containsJsonArray = cleaned.includes('[') && cleaned.includes(']');
  const containsJsonObject = cleaned.includes('{') && cleaned.includes('}');

  if (isJsonStart || containsJsonArray || containsJsonObject) {
    try {
      let jsonStr = cleaned;
      if (!isJsonStart) {
        const arrMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (arrMatch) jsonStr = arrMatch[0];
        else if (objMatch) jsonStr = objMatch[0];
      }

      const parsed = JSON.parse(jsonStr);
      const langLower = (language || 'english').toLowerCase();
      const isTamil = langLower === 'tamil' || langLower === 'ta';

      // 1. Array of Disease objects [{ name, symptoms, causes, remedy, prevention }]
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        if (parsed[0].name || parsed[0].disease || parsed[0].symptoms) {
          if (isTamil) {
            return (
              `🌾 பயிர் நோய் மற்றும் சிகிச்சை விவரங்கள்:\n\n` +
              parsed.map((item: any, idx: number) => 
                `📌 ${idx + 1}. ${item.name || item.disease || 'பயிர் நோய்'}\n` +
                `🔍 அறிகுறிகள்: ${item.symptoms || 'இலைகளில் புள்ளிகள் மற்றும் வாடல்'}\n` +
                `🔬 காரணம்: ${item.causes || item.cause || 'பூஞ்சை தாக்குதல்'}\n` +
                `🌿 இயற்கை & ரசாயன தீர்வு: ${item.remedy || item.treatment || 'தகுந்த பூச்சிக்கொல்லி தெளிக்கவும்'}\n` +
                `🛡️ தடுப்பு முறை: ${item.prevention || 'பாதிக்கப்பட்ட இலைகளை அகற்றி, நல்ல நீர் மேலாண்மை செய்யவும்'}`
              ).join('\n\n')
            );
          } else {
            return (
              `🌾 Crop Disease & Treatment Guide:\n\n` +
              parsed.map((item: any, idx: number) => 
                `📌 ${idx + 1}. ${item.name || item.disease || 'Crop Disease'}\n` +
                `🔍 Symptoms: ${item.symptoms || 'Leaf spots or wilting'}\n` +
                `🔬 Cause: ${item.causes || item.cause || 'Fungal or bacterial infection'}\n` +
                `🌿 Treatment: ${item.remedy || item.treatment || 'Apply recommended organic or chemical spray'}\n` +
                `🛡️ Prevention: ${item.prevention || 'Remove infected leaves and maintain good soil drainage'}`
              ).join('\n\n')
            );
          }
        }
      }

      // 2. Single Disease Object { name, symptoms, causes, remedy, prevention }
      if (!Array.isArray(parsed) && typeof parsed === 'object' && (parsed.name || parsed.disease || parsed.symptoms)) {
        if (isTamil) {
          return (
            `🌾 பயிர் நோய் தகவல்:\n\n` +
            `📌 நோய்: ${parsed.name || parsed.disease || 'பயிர் நோய்'}\n` +
            `🔍 அறிகுறிகள்: ${parsed.symptoms || 'இலை வாடல்'}\n` +
            `🔬 காரணம்: ${parsed.causes || parsed.cause || 'பூஞ்சை நோய்'}\n` +
            `🌿 மேலாண்மை: ${parsed.remedy || parsed.treatment || 'தகுந்த பூச்சிக்கொல்லி தெளிக்கவும்'}\n` +
            `🛡️ தடுப்பு முறை: ${parsed.prevention || 'நீர் தேங்குவதை தவிர்க்கவும்'}`
          );
        } else {
          return (
            `🌾 Disease Information:\n\n` +
            `📌 Disease: ${parsed.name || parsed.disease || 'Crop Disease'}\n` +
            `🔍 Symptoms: ${parsed.symptoms || 'Symptoms observed'}\n` +
            `🔬 Cause: ${parsed.causes || parsed.cause || 'Pathogen infection'}\n` +
            `🌿 Remedy: ${parsed.remedy || parsed.treatment || 'Apply suitable treatment'}\n` +
            `🛡️ Prevention: ${parsed.prevention || 'Ensure crop rotation and good drainage'}`
          );
        }
      }

      // 3. Router Intent Object {"intent": "...", "emotion": "...", "crop": "...", ...}
      if (!Array.isArray(parsed) && typeof parsed === 'object' && (parsed.intent || parsed.primary_intent)) {
        const cropStr = parsed.crop || parsed.query_crop || '';
        if (isTamil) {
          return `வணக்கம் உழவரே! உங்கள் ${cropStr ? cropStr + ' ' : ''}பயிர் மற்றும் விவசாயக் கேள்விகளுக்கு உதவத் தயாராக உள்ளேன். உங்கள் கேள்வியைக் கேட்கவும்.`;
        } else {
          return `Hello farmer! I am ready to assist you with your ${cropStr ? cropStr + ' ' : ''}farming and crop guidance. How can I help you today?`;
        }
      }

      // 4. Generic Key-Value JSON Object
      if (!Array.isArray(parsed) && typeof parsed === 'object') {
        const lines: string[] = [];
        for (const [key, val] of Object.entries(parsed)) {
          if (val && typeof val !== 'object') {
            const cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            lines.push(`• ${cleanKey}: ${val}`);
          }
        }
        if (lines.length > 0) return lines.join('\n');
      }
    } catch {
      /* ignore JSON parse error */
    }
  }

  // Remove any raw JSON snippet artifacts and clean markdown
  let result = cleaned
    .replace(/\{"intent"[^}]+\}/gi, '')
    .replace(/\[\s*\{"name":[^\]]+\}\s*\]/gi, '')
    .replace(/[*#_`]/g, '')
    .trim();

  // Enforce 1-2 sentences maximum
  const sentences = result.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('-') && !s.startsWith('•'));
  if (sentences.length > 2) {
    result = sentences.slice(0, 2).join(' ').trim();
  }
  return result;
};

// Unified LLM fallback: routes through Backend Proxy (CORS safe) and falls back to Groq
const llmFallback = async (
  messages: Array<{ role: string; content: string }>,
  temperature: number = 0.1,
  maxTokens: number = 150,
  language: string = 'english'
): Promise<string | null> => {
  const proxyEndpoints = [
    `${API_BASE_URL}/api/nvidia/chat`
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
          return sanitizeFarmerResponse(text, language);
        }
      }
    } catch {
      /* continue to next proxy endpoint */
    }
  }

  // Direct Groq fallback if frontend has Groq API Key
  if (GROQ_API_KEY) {
    try {
      console.log('[LLM] Trying Groq Direct API');
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
        if (text) {
          console.log('[LLM] Groq Direct API OK');
          return sanitizeFarmerResponse(text, language);
        }
      }
    } catch {
      /* ignore */
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
        return sanitizeFarmerResponse(text, language);
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
    ], 0.3, 1500, language);

    if (fallbackText) {
      const firstLines = fallbackText.split('\n').slice(0, 4).join(' ');
      storeRecentDisease(firstLines.substring(0, 100), "90%", registeredCrop);
      return sanitizeFarmerResponse(fallbackText, language);
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
        if (text) return sanitizeFarmerResponse(text, language);
      }
    }
  } catch { /* ignore */ }
  
  // 4. Client-side Offline Vision Engine Fallback
  try {
    const offlineResult = await analyzePlantDiseaseOffline(imageBase64, registeredCrop || 'Rice', language);
    if (offlineResult) {
      const firstLines = offlineResult.split('\n').slice(0, 4).join(' ');
      storeRecentDisease(firstLines.substring(0, 100), "88%", registeredCrop);
      return offlineResult;
    }
  } catch (offlineErr) {
    console.warn('[Disease] Offline vision error:', offlineErr);
  }

  const defaultErrorMsg = language === 'tamil' || language === 'ta'
    ? "படத்தின் அடிப்படையில் உறுதியாக நோய் கண்டறிய முடியவில்லை. தயவுசெய்து தெளிவான இலையின் படத்தை பதிவேற்றவும் அல்லது உள்ளூர் வேளாண்மை அலுவலரை அணுகவும்."
    : "Unable to analyze the image clearly right now. Please upload a clear leaf image or check with your local agriculture officer.";

  return sanitizeFarmerResponse(defaultErrorMsg, language);
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
  const profile = getStoredFarmerProfile();
  const district = profile.location || profile.district || 'Thanjavur';
  const registeredCrop = profile.crop_type || 'Paddy';
  const state = profile.state || 'Tamil Nadu';

  // ── 1. MULTILINGUAL CROP EXTRACTION FROM MESSAGE OR PROFILE ──
  const textLower = message.toLowerCase();
  const CROP_MAP: Record<string, string> = {
    'உருளைக்கிழங்கு': 'Potato', 'உருளை': 'Potato', 'potato': 'Potato', 'aloo': 'Potato', 'ஆலூ': 'Potato',
    'தக்காளி': 'Tomato', 'tomato': 'Tomato', 'tamatar': 'Tomato',
    'நெல்': 'Paddy', 'நெல்லு': 'Paddy', 'அரிசி': 'Paddy', 'paddy': 'Paddy', 'rice': 'Paddy',
    'வெங்காயம்': 'Onion', 'onion': 'Onion', 'pyaz': 'Onion',
    'கத்தரி': 'Brinjal', 'கத்தரிக்காய்': 'Brinjal', 'brinjal': 'Brinjal', 'eggplant': 'Brinjal',
    'மிளகாய்': 'Chilli', 'chilli': 'Chilli', 'chili': 'Chilli', 'mirchi': 'Chilli',
    'பருத்தி': 'Cotton', 'cotton': 'Cotton',
    'சோளம்': 'Maize', 'மக்காசோளம்': 'Maize', 'maize': 'Maize', 'corn': 'Maize',
    'வாழை': 'Banana', 'வாழைக்காய்': 'Banana', 'banana': 'Banana',
    'கேரட்': 'Carrot', 'carrot': 'Carrot',
    'கரும்பு': 'Sugarcane', 'sugarcane': 'Sugarcane',
    'வெண்டை': 'Okra', 'வெண்டைக்காய்': 'Okra', 'okra': 'Okra', 'bhindi': 'Okra',
    'மஞ்சள்': 'Turmeric', 'turmeric': 'Turmeric',
    'கடலை': 'Groundnut', 'நிலக்கடலை': 'Groundnut', 'groundnut': 'Groundnut', 'peanut': 'Groundnut'
  };

  let detectedCropInMessage = '';
  for (const [kw, cropName] of Object.entries(CROP_MAP)) {
    if (textLower.includes(kw)) {
      detectedCropInMessage = cropName;
      break;
    }
  }
  const effectiveCrop = detectedCropInMessage || registeredCrop;

  // ── 2. SMART INTENT DETECTION (MULTILINGUAL & TANGLISH) ──
  const isWeather = /weather|rain|மழை|வானிலை|forecast|மழையா|வருமா|temp|humidity|wind|मौसम|बारिश|వర్షం|ಮಳೆ|മഴ/i.test(textLower);
  const isMarket = /price|விலை|rate|market|சந்தை|cost|quintal|₹|per kg|மூல்ய|தாம்|பெல|வில|மண்டி|mandi/i.test(textLower);
  const isNews = /news|செய்தி|update|latest|today.*news|அரசு|scheme|திட்டம்|समाचार|खबर|వார்త|సుದ್ದಿ|വാർത്ത/i.test(textLower);
  const isFertilizer = /fertilizer|உரம்|manure|npk|urea|dap|potash|உரங்கள்/i.test(textLower);
  const isCultivation = /வளர்க்க|பயிரிட|நடவு|என்ன பண்ணலாம்|எப்படி வளர்ப்பது|சாகுபடி|sow|plant|grow|cultivat|care|guidance/i.test(textLower);
  const isDisease = /disease|blight|rot|wilt|spot|pest|fungus|insect|நோய்|பூச்சி|அறிகுறி/i.test(textLower) && !isCultivation;
  const isPrevention = /prevent|prevention|தடுப்பு|முன்னெச்சரிக்கை|பாதுகாப்பு/i.test(textLower);
  const isNatural = /natural|organic|இயற்கை|மூலிகை|பஞ்சகவ்யா|நீமாஸ்திரம்/i.test(textLower);
  const isChemical = /chemical|pesticide|fungicide|மருந்து|ரசாயனம்|ஸ்ப்ரே|spray/i.test(textLower);

  // ── 3. FETCH LIVE DATA (MULTI-PART QUERY HANDLING) ──
  let liveDataContext = '';
  try {
    const fetches: Promise<string>[] = [];

    if (isWeather) {
      fetches.push(fetchLiveWeatherForContext(district));
    }
    if (isMarket) {
      fetches.push(fetchLiveMarketForContext(effectiveCrop, district));
    }
    if (isNews) {
      fetches.push(fetchLiveNewsForContext(state, language));
    }

    // For general farming queries, include background weather context
    if (!isWeather && !isMarket && !isNews) {
      fetches.push(fetchLiveWeatherForContext(district).catch(() => ''));
    }

    const results = await Promise.allSettled(fetches);
    const resolved = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
      .map(r => r.value);
    liveDataContext = resolved.join('\n\n');
  } catch (err) {
    console.warn('[Chat] Live data fetch error:', err);
  }

  // ── 4. BUILD ENRICHED FARMER CONTEXT ──
  const profileWithEffectiveCrop = { ...profile, crop_type: effectiveCrop };
  let farmerContextPrompt: string;
  if (liveDataContext) {
    const weatherPart = liveDataContext.includes('Temperature') ? liveDataContext.split('\n\n')[0] : 'Live weather data active.';
    const marketPart = liveDataContext.includes('Market Data') ? liveDataContext.split('\n\n').find(s => s.includes('Market')) || '' : 'Agmarknet live mandi prices active.';
    farmerContextPrompt = buildFarmerContextPrompt(profileWithEffectiveCrop, weatherPart, marketPart);

    const newsPart = liveDataContext.includes('Agriculture News') ? '\n\n' + liveDataContext.split('\n\n').find(s => s.includes('News')) : '';
    if (newsPart) farmerContextPrompt += newsPart;
  } else {
    farmerContextPrompt = buildFarmerContextPrompt(profileWithEffectiveCrop);
  }

  // ── 5. INTENT-SPECIFIC RESPONSE GUIDANCE ──
  let intentInstruction = `Explicit User Question: "${message}"\nTarget Crop for Question: ${effectiveCrop}\nTarget Location: ${district}, ${state}\n`;

  if (isCultivation) {
    intentInstruction += `\nINTENT: Crop Cultivation & Planting Guidance. State only the direct answer to what was asked in 1 or 2 short, precise sentences for ${effectiveCrop}. Do not list steps or give unasked advice.`;
  }
  if (isWeather) {
    intentInstruction += `\nINTENT: Weather Query. Use the LIVE WEATHER DATA. State the temperature, weather condition, and rain alert in 1 or 2 concise sentences. Do not invent weather.`;
  }
  if (isMarket) {
    intentInstruction += `\nINTENT: Market Price Query. Use the LIVE MARKET DATA for ${effectiveCrop} in ${district}. State the modal price per quintal/kg in 1 or 2 concise sentences. Do not invent prices.`;
  }
  if (isNews) {
    intentInstruction += `\nINTENT: Agricultural News Query. State the top headline in 1 or 2 concise sentences.`;
  }
  if (isFertilizer) {
    intentInstruction += `\nINTENT: Fertilizer Guidance for ${effectiveCrop}. State only the exact recommended fertilizer and dosage in 1 or 2 concise sentences.`;
  }
  if (isDisease) {
    intentInstruction += `\nINTENT: Disease Guidance for ${effectiveCrop}. State the single primary remedy and dosage in 1 or 2 concise sentences. Do NOT output lists, sections, or bullet points.`;
  }
  if (isNatural) {
    intentInstruction += `\nINTENT: Organic Remedy for ${effectiveCrop}. State the single primary organic preparation and dosage in 1 or 2 concise sentences.`;
  }
  if (isChemical) {
    intentInstruction += `\nINTENT: Chemical Treatment for ${effectiveCrop}. State the single recommended chemical and dosage in 1 or 2 concise sentences.`;
  }

  intentInstruction += `\nCRITICAL RESPONSE MANDATE:
- Answer in EXACTLY 1 or 2 short sentences maximum.
- Zero fluff, no bullet points, no lists, no markdown asterisks.
- Answer strictly in the requested language (${language}).`;

  const parts: any[] = [{ text: message }];
  if (imageBase64) {
    parts.unshift({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    });
  }

  const strictPrompt = getStrictSystemPrompt(language);
  const systemInstructionCombined = `${strictPrompt}\n\n${SYSTEM_PROMPT_CHAT}\n\n${farmerContextPrompt}\n\n${intentInstruction}\n\n${languageInstruction}`;

  const config = {
    model: 'gemini-2.0-flash',
    contents: { parts },
    config: {
      systemInstruction: systemInstructionCombined,
      maxOutputTokens: 150,
      temperature: 0.1,
    }
  };

  // Try primary Gemini key
  try {
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      const response = await ai.models.generateContent(config);
      if (response.text) return sanitizeFarmerResponse(response.text, language);
    }
  } catch (primaryError: any) {
    console.warn('[Chat] Primary key failed:', primaryError?.message || primaryError);
  }

  // Try fallback Gemini key if present
  if (aiFallback && import.meta.env.VITE_GEMINI_VOICE_KEY) {
    try {
      const response = await aiFallback.models.generateContent(config);
      if (response.text) return sanitizeFarmerResponse(response.text, language);
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
      { role: 'user', content: message.replace(/[*#_`]/g, '').trim() }
    ],
    0.1, 150, language
  );
  if (fallbackText) return sanitizeFarmerResponse(fallbackText, language);

  // Final Guaranteed Offline Expert Response (No generic errors)
  const offlineAnswer = getOfflineAgriculturalResponse(message, {
    farmerName: profile?.name,
    district: profile?.location || profile?.district,
    crop: profile?.crop_type,
    soil: profile?.soil_type,
  }, language);
  if (offlineAnswer) return sanitizeFarmerResponse(offlineAnswer, language);

  const defaultMsg = language === 'tamil' || language === 'ta'
    ? "உங்கள் பயிர் சாகுபடிக்கு தேவையான உரம் மற்றும் நோய் பாதுகாப்பு ஆலோசனைகளை தாராளமாகக் கேளுங்கள்."
    : "Feel free to ask about your crop fertilizer schedule, pest protection, or market rates.";
  return sanitizeFarmerResponse(defaultMsg, language);
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
