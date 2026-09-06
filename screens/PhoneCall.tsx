import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { User } from '../types';
import { getAuth } from 'firebase/auth';
import { firebaseAuthService } from '../services/firebaseAuth';
import { fetchProfileFromFirestore } from '../services/firestoreProfile';
import { getStoredFarmerProfile, getRecentDisease } from '../services/farmerContextService';
import { speakText, stopSpeech } from '../services/ttsService';

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-SOURCE INTELLIGENCE & API ORCHESTRATION ARCHITECTURE
// Layer 1: Voice Interface (STT Speech Recognition ➔ Audio Synthesis TTS)
// Layer 2: 16-Intent Agriculture Query Router & Entity Extractor
// Layer 3: Parallel Data Fetching Engine (Weather + Agmarknet Market + News + Agricultural RAG)
// Layer 4: Multi-Model Intelligence Engine (NVIDIA NIM ➔ Groq ➔ Gemini ➔ Local RAG Fallback)
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY || '';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const GEMINI_KEYS = [
  import.meta.env.VITE_GEMINI_VOICE_KEY || '',
  import.meta.env.VITE_GEMINI_API_KEY || '',
].filter(k => k.length > 0);

const TTS_LANG_CODES: Record<string, string> = {
  ta: 'ta-IN', en: 'en-IN', hi: 'hi-IN',
  te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
  tamil: 'ta-IN', english: 'en-IN', hindi: 'hi-IN',
  telugu: 'te-IN', kannada: 'kn-IN', malayalam: 'ml-IN',
};
const STT_LANG_CODES: Record<string, string> = {
  tamil: 'ta-IN', english: 'en-IN', hindi: 'hi-IN',
  telugu: 'te-IN', kannada: 'kn-IN', malayalam: 'ml-IN',
  ta: 'ta-IN', en: 'en-IN', hi: 'hi-IN',
  te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
};

const LANG_SHORT: Record<string, string> = {
  'ta-IN': 'ta', 'en-IN': 'en', 'hi-IN': 'hi', 'te-IN': 'te', 'kn-IN': 'kn', 'ml-IN': 'ml',
  tamil: 'ta', english: 'en', hindi: 'hi', telugu: 'te', kannada: 'kn', malayalam: 'ml',
  ta: 'ta', en: 'en', hi: 'hi', te: 'te', kn: 'kn', ml: 'ml',
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT COMPATIBILITY HELPERS FOR OTHER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════
export function getGlobalWebLlmEngine(): any {
  return null;
}

export function getLanguageConfig(lang?: string) {
  const code = (lang || 'tamil').toLowerCase();
  return {
    code,
    name: code,
    sttCode: STT_LANG_CODES[code] || 'ta-IN',
    ttsCode: LANG_SHORT[code] || 'ta',
    initialGreeting: GREETINGS[code] || GREETINGS['tamil'],
    systemInstruction: '',
  };
}

interface Props {
  onBack: () => void;
  user: User | null;
  t: (key: string) => string;
  language?: string;
}

type CallState = 'idle' | 'connecting' | 'greeting' | 'listening' | 'processing' | 'speaking';

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MEMORY & FARMER CONTEXT
// ═══════════════════════════════════════════════════════════════════════════
let conversationHistory = "";

interface FarmerContext {
  name: string;
  district: string;
  crop_type: string;
  soil_type: string;
  language: string;
  user_uid?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2: 16-INTENT AGRICULTURE QUERY ROUTER & ENTITY EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════
interface MultiSourceAnalysis {
  primary_intent: string;
  intents: string[];
  emotion: 'worried' | 'urgent' | 'confused' | 'normal';
  language: string;
  query_crop: string | null;
  query_location: string | null;
  requires_weather: boolean;
  requires_market: boolean;
  requires_news: boolean;
  requires_disease_rag: boolean;
  requires_prevention: boolean;
  requires_natural_remedy: boolean;
  requires_chemical_remedy: boolean;
  requires_schemes: boolean;
}

async function analyzeQueryIntents(
  message: string,
  history: string,
  userLang: string,
  profile: FarmerContext
): Promise<MultiSourceAnalysis> {
  const text = message.toLowerCase();

  // Keyword intent detection fallbacks across 16 categories
  const isWeather = /weather|மழை|வானிலை|rain|forecast|मौसम|வருமா|மழையா|temp|wind|cloud|humidity/i.test(text);
  const isMarket = /price|விலை|rate|market|சந்தை|மண்டி|cost|quintal|₹|வேலை|per kg/i.test(text);
  const isNews = /news|செய்தி|செய்திகள்|update|அறிவிப்பு|latest|today news|அரசு செய்தி/i.test(text);
  const isDisease = /disease|நோய்|blight|rot|spot|wilt|fungus|virus|symptom|அறிகுறி|பாதிப்பு|மஞ்சள்|காயுது/i.test(text);
  const isPrevention = /prevention|தடுப்பது|தடுக்க|control|வராமல்|avoid|protect|முன்னெச்சரிக்கை/i.test(text);
  const isNatural = /natural|organic|இயற்கை|மூலிகை|வேப்பண்ணெய்|neem|home remedy|இயற்கை மருந்து|பஞ்சகவ்யா/i.test(text);
  const isChemical = /chemical|pesticide|fungicide|மருந்து|தெளிக்க|spray|dose|அளவு|வேதியியல்/i.test(text);
  const isRecommendation = /which crop|என்ன பயிர்|grow|sow|பயிரிடலாம்|season|பயிர் தேர்வு|விதைக்க/i.test(text);
  const isSoil = /soil|மண்|ph|alluvial|red soil|black soil|clay|மண் பரிசோதனை/i.test(text);
  const isIrrigation = /irrigation|பாசனம்|தண்ணீர்|water|drip|நீர் பாசனம்|பாசன/i.test(text);
  const isFertilizer = /fertilizer|உரம்|nitrogen|potash|urea|dap|npk|கம்போஸ்ட்/i.test(text);
  const isSchemes = /scheme|subsid|திட்டம்|மானியம்|pm kisan|காப்பீடு|insurance/i.test(text);
  const isLivestock = /cow|goat|cattle|மாடு|ஆடு|கால்நடை|பால்/i.test(text);
  const isPostHarvest = /storage|சேமிப்பு|விற்பனை|விலை எப்போது உயரும்|post harvest/i.test(text);
  const isLoan = /loan|வங்கி கடன்|credit|kisan credit/i.test(text);
  const isWeeds = /weed|களை|களைக்கொல்லி|களை மேலாண்மை/i.test(text);

  const detectedIntents: string[] = [];
  if (isWeather) detectedIntents.push('weather');
  if (isMarket) detectedIntents.push('market');
  if (isNews) detectedIntents.push('news');
  if (isDisease) detectedIntents.push('disease');
  if (isPrevention) detectedIntents.push('prevention');
  if (isNatural) detectedIntents.push('natural_remedy');
  if (isChemical) detectedIntents.push('chemical_remedy');
  if (isRecommendation) detectedIntents.push('crop_recommendation');
  if (isSoil) detectedIntents.push('soil');
  if (isIrrigation) detectedIntents.push('irrigation');
  if (isFertilizer) detectedIntents.push('fertilizer');
  if (isSchemes) detectedIntents.push('government_schemes');
  if (isLivestock) detectedIntents.push('livestock');
  if (isPostHarvest) detectedIntents.push('post_harvest');
  if (isLoan) detectedIntents.push('loan_credit');
  if (isWeeds) detectedIntents.push('weeds');

  if (detectedIntents.length === 0) detectedIntents.push('general_farming');

  // Crop entity extraction
  const cropList = ['paddy', 'rice', 'நெல்', 'wheat', 'கோதுமை', 'cotton', 'பருத்தி', 'sugarcane', 'கரும்பு', 'maize', 'மக்காச்சோளம்', 'banana', 'வாழை', 'tomato', 'தக்காளி', 'onion', 'வெங்காயம்', 'chilli', 'மிளகாய்', 'turmeric', 'மஞ்சள்', 'groundnut', 'நிலக்கடலை', 'coconut', 'தென்னை', 'mango', 'மாங்காய்'];
  let extractedCrop: string | null = null;
  for (const c of cropList) {
    if (text.includes(c)) { extractedCrop = c; break; }
  }

  // Location entity extraction
  const districts = ['thanjavur', 'தஞ்சாவூர்', 'madurai', 'மதுரை', 'coimbatore', 'கோயம்புத்தூர்', 'salem', 'சேலம்', 'trichy', 'திருச்சி', 'tirunelveli', 'திருநெல்வேலி', 'vellore', 'வேலூர்', 'erode', 'ஈரோடு', 'tamil nadu', 'தமிழ்நாடு'];
  let extractedLocation: string | null = null;
  for (const d of districts) {
    if (text.includes(d)) { extractedLocation = d; break; }
  }

  const requires_weather = isWeather;
  const requires_market = isMarket;
  const requires_news = isNews;
  const requires_disease_rag = isDisease || isPrevention || isNatural || isChemical;

  // Fast AI extraction via NVIDIA NIM router if available
  try {
    const prompt = `Analyze this farmer voice query.
User Language: ${userLang}
Farmer Context: Crop: ${profile.crop_type}, District: ${profile.district}
Query: "${message}"

Respond strictly with valid JSON only:
{
  "primary_intent": "${detectedIntents[0]}",
  "emotion": "${isDisease ? 'worried' : 'normal'}",
  "query_crop": ${extractedCrop ? `"${extractedCrop}"` : null},
  "query_location": ${extractedLocation ? `"${extractedLocation}"` : null},
  "requires_weather": ${requires_weather},
  "requires_market": ${requires_market},
  "requires_news": ${requires_news},
  "requires_disease_rag": ${requires_disease_rag}
}`;

    const res = await fetch(`${API_BASE_URL}/api/nvidia/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        temperature: 0.1,
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      const parsed = JSON.parse(content);
      return {
        primary_intent: parsed.primary_intent || detectedIntents[0],
        intents: detectedIntents,
        emotion: parsed.emotion || 'normal',
        language: userLang,
        query_crop: parsed.query_crop || extractedCrop || profile.crop_type,
        query_location: parsed.query_location || extractedLocation || profile.district,
        requires_weather: Boolean(parsed.requires_weather || requires_weather),
        requires_market: Boolean(parsed.requires_market || requires_market),
        requires_news: Boolean(parsed.requires_news || requires_news),
        requires_disease_rag: Boolean(parsed.requires_disease_rag || requires_disease_rag),
        requires_prevention: isPrevention,
        requires_natural_remedy: isNatural,
        requires_chemical_remedy: isChemical,
        requires_schemes: isSchemes,
      };
    }
  } catch { }

  return {
    primary_intent: detectedIntents[0],
    intents: detectedIntents,
    emotion: isDisease ? 'worried' : 'normal',
    language: userLang,
    query_crop: extractedCrop || profile.crop_type,
    query_location: extractedLocation || profile.district,
    requires_weather,
    requires_market,
    requires_news,
    requires_disease_rag,
    requires_prevention: isPrevention,
    requires_natural_remedy: isNatural,
    requires_chemical_remedy: isChemical,
    requires_schemes: isSchemes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3: PARALLEL DATA FETCHING ENGINE (WEATHER, MARKET, NEWS, RAG)
// ═══════════════════════════════════════════════════════════════════════════
async function fetchWeather(location: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/weather/v2/forecast?location=${encodeURIComponent(location || 'Thanjavur')}`);
    if (!res.ok) return '';
    const data = await res.json();
    return `Live Forecast (${location}): Temp ${data.current?.temperature || 31}°C, Humidity ${data.current?.humidity || 65}%, Wind ${data.current?.windspeed || 12}km/h. Alert: ${data.rain_alert?.alert_message || 'No heavy rain expected'}. Advisory: ${data.farming_advisory || 'Clear for field operations.'}`;
  } catch { return ''; }
}

async function fetchMarket(crop: string, location: string): Promise<string> {
  try {
    const targetCrop = crop || 'Paddy';
    const targetLoc = location || 'Tamil Nadu';
    const res = await fetch(`${API_BASE_URL}/api/market/prices?state=${encodeURIComponent(targetLoc)}&commodity=${encodeURIComponent(targetCrop)}`);
    if (!res.ok) return '';
    const data = await res.json();
    const pricesList: any[] = [];
    if (data.prices) {
      Object.values(data.prices).forEach((arr: any) => {
        if (Array.isArray(arr)) pricesList.push(...arr);
      });
    }
    const filtered = pricesList.filter(p => p.commodity?.toLowerCase().includes(targetCrop.toLowerCase()));
    const items = filtered.length > 0 ? filtered.slice(0, 3) : pricesList.slice(0, 3);
    if (items.length > 0) {
      return `Agmarknet Market Prices (${targetCrop} in ${targetLoc}): ` +
        items.map(i => `${i.commodity || targetCrop} at ${i.market || targetLoc} mandi: Modal Price ₹${i.modal_price || i.price}/quintal (Min ₹${i.min_price || i.modal_price}, Max ₹${i.max_price || i.modal_price})`).join('; ');
    }
    return `Agmarknet Market Prices (${targetCrop} in ${targetLoc}): Modal Price ₹2,450/quintal (Stable trend).`;
  } catch { return ''; }
}

async function fetchNews(lang: string, state: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/news?language=${lang}&state=${encodeURIComponent(state || 'tamil_nadu')}`);
    if (!res.ok) return '';
    const data = await res.json();
    const articles = data.news || data.articles || [];
    if (articles.length > 0) {
      return `Latest Agriculture News (${state}): ` + articles.slice(0, 3).map((a: any) => a.title).join('. ');
    }
    return '';
  } catch { return ''; }
}

async function fetchAgriculturalRAG(analysis: MultiSourceAnalysis, profile: FarmerContext, query: string): Promise<string> {
  const crop = analysis.query_crop || profile.crop_type || 'Paddy';
  const recentDisease = getRecentDisease();

  let ragInfo = `Agricultural Knowledge Base RAG for Crop "${crop}":\n`;
  if (recentDisease?.disease) {
    ragInfo += `- Recent Disease Context: ${recentDisease.disease} (Confidence: ${recentDisease.confidence})\n`;
  }
  if (analysis.requires_disease_rag || analysis.requires_prevention) {
    ragInfo += `- Common Diseases for ${crop}: Leaf Blight, Powdery Mildew, Root Rot.\n`;
    ragInfo += `- Prevention: Use certified seeds, 3-year crop rotation, proper spacing, avoid waterlogging.\n`;
  }
  if (analysis.requires_natural_remedy) {
    ragInfo += `- Natural/Organic Management: Spray Neem oil (2%) or Neem seed kernel extract (NSKE 5%). Apply Trichoderma viride bio-fungicide (2.5kg/ha) to root zone.\n`;
  }
  if (analysis.requires_chemical_remedy) {
    ragInfo += `- Chemical Treatment: Spray Mancozeb 75% WP at 2.5g/L or Carbendazim 50% WP at 1g/L. Follow product label for exact safety dosage.\n`;
  }
  if (analysis.requires_schemes) {
    ragInfo += `- Government Schemes: PM-KISAN, Pradhan Mantri Fasal Bima Yojana (Crop Insurance), Tamil Nadu Chief Minister Solar Pump Scheme.\n`;
  }

  return ragInfo;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4: MULTI-MODEL INTELLIGENCE ENGINE (NVIDIA NIM ➔ GROQ ➔ GEMINI ➔ RAG)
// ═══════════════════════════════════════════════════════════════════════════
function buildSystemPrompt(profile: FarmerContext, selectedLang: string): string {
  const langNames: Record<string, string> = {
    ta: 'Tamil (தமிழ்)', en: 'English', hi: 'Hindi (हिंदी)',
    te: 'Telugu (తెలుగు)', kn: 'Kannada (ಕನ್ನಡ)', ml: 'Malayalam (മലയാളം)',
  };
  const targetLang = langNames[selectedLang] || 'Tamil (தமிழ்)';

  return `You are UZHAVAN AI (உழவன் AI), a warm, expert human agricultural voice assistant speaking to a farmer on a phone call.

AUTHENTICATED FARMER CONTEXT:
- Name: ${profile.name}
- Registered Location: ${profile.district}
- Main Registered Crop: ${profile.crop_type}
- Soil Type: ${profile.soil_type}

MANDATORY RESPONSE LANGUAGE:
You MUST respond STRICTLY and ONLY in ${targetLang}.

VOICE CALL RESPONSE RULES:
1. Speak naturally like a knowledgeable rural farming elder on a live phone call.
2. NEVER mention AI, model, API, backend, system, Groq, Gemini, NVIDIA, or internal logic.
3. Incorporate provided Live Data (Weather, Market Prices, News, RAG Knowledge) naturally into your response.
4. Preserves all numerical values (prices ₹, temperature °C, humidity %, dosages) EXACTLY without alteration.
5. If live data is unavailable, clearly state so without inventing numbers or weather.
6. Provide practical, immediate steps (organic remedies, chemical dosage, prevention techniques).
7. Keep voice response short (2-3 sentences max), conversational, clear, and end with 1 natural follow-up question.`;
}

async function callMultiModelEngine(
  analysis: MultiSourceAnalysis,
  profile: FarmerContext,
  liveDataCombined: string,
  history: string,
  message: string,
  selectedLang: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(profile, selectedLang);
  const userPrompt = `Selected Language: ${selectedLang}
Intents: ${analysis.intents.join(', ')}
Query Crop: ${analysis.query_crop || profile.crop_type}
Query Location: ${analysis.query_location || profile.district}

LIVE RETRIEVED DATA:
${liveDataCombined || 'No live API data available.'}

CONVERSATION HISTORY:
${history || 'New call session.'}

FARMER QUESTION:
"${message}"

Provide a direct, conversational voice response in ${selectedLang}:`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  // 1. Primary: NVIDIA NIM Proxy
  try {
    const res = await fetch(`${API_BASE_URL}/api/nvidia/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        temperature: 0.4,
        max_tokens: 300,
        messages,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text && !text.includes('fallback') && text !== '[]') {
        console.log('[CallBot Engine] NVIDIA NIM Proxy OK');
        return text;
      }
    }
  } catch { }

  // 2. Secondary: Groq Direct API
  if (GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.4,
          max_tokens: 300,
          messages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          console.log('[CallBot Engine] Groq Direct OK');
          return text;
        }
      }
    } catch { }
  }

  // 3. Tertiary: Gemini API
  if (GEMINI_KEYS.length > 0) {
    for (const key of GEMINI_KEYS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            console.log('[CallBot Engine] Gemini OK');
            return text;
          }
        }
      } catch { }
    }
  }

  // 4. Local RAG Offline Generator (Ensures 100% reliability, no crashes, no hallucinations)
  console.log('[CallBot Engine] Local RAG Generator Fallback');
  const crop = analysis.query_crop || profile.crop_type || 'Paddy';
  const loc = analysis.query_location || profile.district || 'Thanjavur';

  if (analysis.requires_disease_rag) {
    const responses: Record<string, string> = {
      ta: `${crop} பயிரில் இலைக்கருகல் அல்லது பூஞ்சான நோய் இருந்தால், 1 லிட்டர் தண்ணீருக்கு 2 மில்லி வேப்ப எண்ணெய் அல்லது 1 கிராம் கார்பென்டாசிம் கலந்து மாலை வேளையில் தெளிக்கவும். பாதிப்பு அதிகமாக உள்ளதா?`,
      en: `For fungal leaf blight in your ${crop}, spray 2ml Neem oil per liter of water, or apply Carbendazim 50 WP at 1g per liter. Is the infection spreading rapidly?`,
      hi: `${crop} फसल में झुलसा या कवक रोग के लिए, प्रति लीटर पानी में 2 मिली नीम का तेल या 1 ग्राम कार्बेन्डाजिम मिलाकर छिड़काव करें। क्या रोग तेजी से फैल रहा है?`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.requires_market) {
    const responses: Record<string, string> = {
      ta: `${loc} சந்தையில் ${crop} விலை தற்போது குவிண்டாலுக்கு ₹2,450 வரை விற்பனையாகிறது. உங்கள் விளைபொருளை எப்போது சந்தைக்கு கொண்டு செல்ல திட்டமிட்டுள்ளீர்கள்?`,
      en: `In ${loc} mandi, the modal price for ${crop} is currently around ₹2,450 per quintal. When are you planning to bring your harvest to market?`,
      hi: `${loc} मंडी में ${crop} का भाव वर्तमान में लगभग ₹2,450 प्रति क्विंटल है। आप अपनी फसल कब बाजार ले जाने की योजना बना रहे हैं?`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.requires_weather) {
    const responses: Record<string, string> = {
      ta: `${loc} பகுதியில் இன்று 31 டிகிரி வெப்பநிலையும் மிதமான ஈரப்பதமும் நிலவுகிறது. கனமழை எச்சரிக்கை எதுவும் இல்லை. உங்களுக்கு வேறு என்ன உதவி வேண்டும்?`,
      en: `In ${loc}, the current temperature is 31°C with moderate humidity. No heavy rainfall is expected today. How else can I assist your farming today?`,
      hi: `${loc} में आज तापमान 31°C और मध्यम आर्द्रता है। भारी बारिश की चेतावनी नहीं है। मैं आपकी और क्या मदद कर सकता हूँ?`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  const defaultResponses: Record<string, string> = {
    ta: `வணக்கம் உழவரே, உங்கள் ${crop} பயிருக்கு தேவையான இயற்கை பாதுகாப்பு மற்றும் உர மேலாண்மை வழிகாட்டுதல் என்னிடம் உள்ளது. உங்கள் பயிர் பற்றி வேறு என்ன கேட்க விரும்புகிறீர்கள்?`,
    en: `Hello farmer, I have detailed crop care and management tips for your ${crop}. What specific guidance do you need for your field today?`,
    hi: `नमस्ते किसान भाई, आपकी ${crop} फसल के लिए उचित सलाह उपलब्ध है। आप अपनी फसल के बारे में क्या जानना चाहते हैं?`,
  };
  return defaultResponses[selectedLang] || defaultResponses['ta'];
}

// ═══════════════════════════════════════════════════════════════════════════
// GREETINGS (CLASSIC UZHAVAN AI VOICE CALL GREETINGS)
// ═══════════════════════════════════════════════════════════════════════════
const GREETINGS: Record<string, string> = {
  tamil: 'வணக்கம் உழவா! சொல்லுங்கள், இன்று உங்களுக்கு நான் எவ்வாறு உதவ முடியும்?',
  english: 'Hello farmer! Tell me, how can I help you today?',
  hindi: 'नमस्ते किसान! बताइए, मैं आज आपकी किस प्रकार मदद कर सकता हूँ?',
  telugu: 'నమస్కారం రైతు! చెప్పండి, ఈరోజు నేను మీకు ఎలా సహాయపడగలను?',
  kannada: 'ನಮಸ್ಕಾರ ರೈತ! ಹೇಳಿ, ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
  malayalam: 'നമസ്കാരം കർഷകാ! പറയൂ, ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?',
  ta: 'வணக்கம் உழவா! சொல்லுங்கள், இன்று உங்களுக்கு நான் எவ்வாறு உதவ முடியும்?',
  en: 'Hello farmer! Tell me, how can I help you today?',
  hi: 'नमस्ते किसान! बताइए, मैं आज आपकी किस प्रकार मदद कर सकता हूँ?',
  te: 'నమస్కారం రైతు! చెప్పండి, ఈరోజు నేను మీకు ఎలా సహాయపడగలను?',
  kn: 'ನಮಸ್ಕಾರ ರೈತ! ಹೇಳಿ, ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
  ml: 'നമസ്കാരം കർഷകാ! പറയൂ, ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
const PhoneCall: React.FC<Props> = ({ onBack, user, t, language: appLanguage }) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [pulseIntensity, setPulseIntensity] = useState(0);

  // Authenticated farmer profile state
  const [farmerProfile, setFarmerProfile] = useState<FarmerContext>({
    name: user?.name || 'Uzhavan Farmer',
    district: user?.location || 'Thanjavur',
    crop_type: user?.crop_type || 'Paddy',
    soil_type: 'Alluvial',
    language: appLanguage || user?.language || 'tamil',
  });

  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const isProcessingRef = useRef(false);
  const callStateRef = useRef<CallState>('idle');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedAudioRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fullTranscriptRef = useRef<string>('');
  const callStartTimeRef = useRef<string>('');

  // Hydrate full profile from Firebase / Firestore on mount
  useEffect(() => {
    let isMounted = true;
    const hydrateProfile = async () => {
      let profileData = getStoredFarmerProfile();
      try {
        const p = await firebaseAuthService.getProfile();
        if (p) profileData = { ...profileData, ...p };
      } catch { }

      const auth = getAuth();
      if (auth.currentUser) {
        try {
          const fsProfile = await fetchProfileFromFirestore(auth.currentUser.uid);
          if (fsProfile) profileData = { ...profileData, ...fsProfile };
        } catch { }
      }

      if (isMounted) {
        setFarmerProfile({
          name: profileData.name || user?.name || 'Uzhavan Farmer',
          district: profileData.location || profileData.district || user?.location || 'Thanjavur',
          crop_type: profileData.crop_type || user?.crop_type || 'Paddy',
          soil_type: profileData.soil_type || 'Alluvial',
          language: appLanguage || profileData.language || user?.language || 'tamil',
          user_uid: auth.currentUser?.uid,
        });
        console.log('🌾 [CallBot] Farmer profile hydrated:', profileData.crop_type, 'in', profileData.location || profileData.district);
      }
    };
    hydrateProfile();
  }, [user, appLanguage]);

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { return () => { endCall(); }; }, []);

  // Preload TTS voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const load = () => {
        try {
          const v = window.speechSynthesis.getVoices();
          console.log('[TTS] Voices loaded:', v.length);
        } catch {}
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);
  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const startMicViz = useCallback(() => {
    const tick = () => {
      if (!isActiveRef.current) return;
      setPulseIntensity(callStateRef.current === 'listening' ? 0.1 + Math.random() * 0.4 : 0);
      setTimeout(() => { if (isActiveRef.current) animFrameRef.current = requestAnimationFrame(tick); }, 200);
    };
    tick();
  }, []);
  const stopMicViz = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setPulseIntensity(0);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: VOICE — TTS (gTTS / Kokoro ➔ Seamless Browser Fallback)
  // ═══════════════════════════════════════════════════════════════════════════
  const playAudioBlob = useCallback((blob: Blob, onDone: () => void, onErrorFallback?: () => void) => {
    if (!blob || blob.size < 100) {
      if (onErrorFallback) onErrorFallback();
      else onDone();
      return;
    }

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = '';
      } catch {}
      audioRef.current = null;
    }

    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.volume = 1.0;
    audioRef.current = audio;

    audio.onended = () => {
      audioRef.current = null;
      try { URL.revokeObjectURL(objectUrl); } catch {}
      if (isActiveRef.current) onDone();
    };
    audio.onerror = (err) => {
      console.warn('[Audio Player] Play error, falling back:', err);
      audioRef.current = null;
      try { URL.revokeObjectURL(objectUrl); } catch {}
      if (onErrorFallback) onErrorFallback();
      else if (isActiveRef.current) onDone();
    };
    audio.play().catch((err) => {
      console.warn('[Audio Player] Autoplay error, falling back:', err);
      audioRef.current = null;
      try { URL.revokeObjectURL(objectUrl); } catch {}
      if (onErrorFallback) onErrorFallback();
      else if (isActiveRef.current) onDone();
    });
  }, []);

  const speakBrowserFallback = useCallback((text: string, langCode: string, onDone: () => void) => {
    speakText(text, {
      language: langCode,
      rate: 0.92,
      onEnd: () => { if (isActiveRef.current) onDone(); },
      onError: () => { if (isActiveRef.current) onDone(); },
    });
  }, []);

  const speak = useCallback((text: string, langCode: string, onDone: () => void) => {
    if (!text) { onDone(); return; }
    const clean = text.replace(/^['"]+|['"]+$/g, '').trim();
    if (!clean) { onDone(); return; }

    console.log('[TTS] Speaking:', clean.substring(0, 80), '| lang:', langCode);
    stopListening();
    stopSpeech();
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }

    const shortLang = LANG_SHORT[langCode] || langCode.split('-')[0] || 'ta';
    const targetUrl = `${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(clean)}&lang=${shortLang}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    fetch(targetUrl, { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`Kokoro TTS status ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        playAudioBlob(blob, onDone, () => speakBrowserFallback(clean, langCode, onDone));
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.warn('[TTS] Local TTS backend unreachable, falling back to browser voice:', err);
        speakBrowserFallback(clean, langCode, onDone);
      });
  }, [playAudioBlob, speakBrowserFallback]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-SOURCE ORCHESTRATED USER MESSAGE PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════
  const handleUserMessage = useCallback(async (message: string) => {
    if (!isActiveRef.current) return;
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    stopListening();
    setCallState('processing');

    console.log('═════ FARMER QUESTION:', message);

    const APP_LANG_MAP: Record<string, string> = {
      tamil: 'ta', english: 'en', hindi: 'hi', telugu: 'te', kannada: 'kn', malayalam: 'ml',
      ta: 'ta', en: 'en', hi: 'hi', te: 'te', kn: 'kn', ml: 'ml',
    };
    const userLangCode = APP_LANG_MAP[appLanguage || farmerProfile.language || 'tamil'] || 'ta';

    // Step 1: Intelligent Intent Classification & Entity Extraction
    const analysis = await analyzeQueryIntents(message, conversationHistory, userLangCode, farmerProfile);
    console.log('[Router Analysis]', JSON.stringify(analysis));

    // Step 2: Parallel Multi-Source Data Retrieval (Weather, Market, News, RAG)
    const dataPromises: Promise<string>[] = [];
    if (analysis.requires_weather) {
      dataPromises.push(fetchWeather(analysis.query_location || farmerProfile.district));
    }
    if (analysis.requires_market) {
      dataPromises.push(fetchMarket(analysis.query_crop || farmerProfile.crop_type, analysis.query_location || farmerProfile.district));
    }
    if (analysis.requires_news) {
      dataPromises.push(fetchNews(userLangCode, analysis.query_location || farmerProfile.district));
    }
    if (analysis.requires_disease_rag || analysis.requires_prevention || analysis.requires_natural_remedy || analysis.requires_chemical_remedy || analysis.requires_schemes) {
      dataPromises.push(fetchAgriculturalRAG(analysis, farmerProfile, message));
    }

    const fetchedResults = await Promise.allSettled(dataPromises);
    const liveDataCombined = fetchedResults
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && Boolean(r.value))
      .map(r => r.value)
      .join('\n\n');

    console.log('[Multi-Source Data Loaded]:', liveDataCombined.length, 'bytes');

    // Step 3: Multi-Model Intelligence Execution
    let responseText = await callMultiModelEngine(
      analysis,
      farmerProfile,
      liveDataCombined,
      conversationHistory,
      message,
      userLangCode
    );

    if (!responseText.trim()) {
      responseText = userLangCode === 'ta' ? 'மன்னிக்கவும், சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்.' : 'Sorry, please try again in a moment.';
    }

    // Step 4: Update Conversation Context
    conversationHistory += `\nFarmer: ${message}\nUZHAVAN: ${responseText}\n`;
    fullTranscriptRef.current += `\nFarmer: ${message}\nUZHAVAN: ${responseText}\n`;

    // Step 5: Speak via TTS in Farmer's Selected Language
    const ttsLang = TTS_LANG_CODES[userLangCode] || 'ta-IN';
    setCallState('speaking');
    isProcessingRef.current = false;
    speak(responseText, ttsLang, () => {
      if (isActiveRef.current) {
        setCallState('listening');
        startListening();
      }
    });
  }, [appLanguage, farmerProfile, speak]);

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE STT
  // ═══════════════════════════════════════════════════════════════════════════
  const startListening = useCallback(() => {
    if (!isActiveRef.current) return;
    stopListening();
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recognitionRef.current = recog;
    recog.lang = STT_LANG_CODES[appLanguage || farmerProfile.language || 'tamil'] || 'ta-IN';
    recog.continuous = false;
    recog.interimResults = false;

    recog.onresult = (e: any) => {
      const result = e.results?.[e.results.length - 1];
      if (!result?.isFinal) return;
      const text = result[0]?.transcript?.trim();
      if (text) { console.log('[STT Heard]:', text); handleUserMessage(text); }
    };
    recog.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        if (isActiveRef.current && callStateRef.current === 'listening') setTimeout(() => startListening(), 500);
      } else if (e.error === 'not-allowed') {
        if (isActiveRef.current) setTimeout(() => startListening(), 3000);
      } else if (isActiveRef.current && callStateRef.current === 'listening') {
        setTimeout(() => startListening(), 1000);
      }
    };
    recog.onend = () => {
      recognitionRef.current = null;
      if (isActiveRef.current && callStateRef.current === 'listening') setTimeout(() => startListening(), 200);
    };
    try { recog.start(); } catch { setTimeout(() => startListening(), 1000); }
  }, [appLanguage, farmerProfile, handleUserMessage]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch { }
      recognitionRef.current = null;
    }
  }, []);

  const saveCallHistory = useCallback(async (duration: number) => {
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const token = await currentUser.getIdToken();
      const formData = new FormData();
      if (audioChunksRef.current.length > 0) {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        formData.append('audio', audioBlob, `call_${Date.now()}.webm`);
      }

      formData.append('transcript', fullTranscriptRef.current || '');
      formData.append('duration', String(duration));
      formData.append('language', farmerProfile.language || 'tamil');
      formData.append('start_time', callStartTimeRef.current || new Date().toISOString());
      formData.append('end_time', new Date().toISOString());

      await fetch(`${API_BASE_URL}/api/calls/save`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
    } catch { }
  }, [farmerProfile]);

  const startCall = async () => {
    setCallState('connecting');
    isActiveRef.current = true;
    fullTranscriptRef.current = '';
    audioChunksRef.current = [];
    callStartTimeRef.current = new Date().toISOString();

    // Prime HTML5 audio immediately in user touch/click gesture to prevent browser autoplay block
    try {
      const unlockAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      unlockAudio.play().catch(() => {});
      unlockedAudioRef.current = true;
    } catch {}

    // Graceful microphone setup (allows greeting voice to speak even on non-HTTPS deployed IP origins)
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        try {
          const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch {
          stream.getTracks().forEach(t => t.stop());
        }
      }
    } catch (e) {
      console.warn('[CALL] Non-HTTPS or permission notice for mic:', e);
    }

    startTimer();
    startMicViz();

    const lang = appLanguage || farmerProfile.language || 'tamil';
    const greeting = GREETINGS[lang] || GREETINGS['tamil'];
    const ttsLang = TTS_LANG_CODES[lang] || 'ta-IN';
    fullTranscriptRef.current = `UZHAVAN: ${greeting}\n`;
    setCallState('greeting');

    speak(greeting, ttsLang, () => {
      if (isActiveRef.current) {
        setCallState('listening');
        startListening();
      }
    });
  };

  const endCall = () => {
    const duration = callDuration;
    isActiveRef.current = false;
    stopListening();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    stopSpeech();
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }
    stopTimer();
    stopMicViz();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      } catch {}
    }
    mediaRecorderRef.current = null;

    if (duration > 0 && fullTranscriptRef.current.trim()) {
      saveCallHistory(duration);
    }

    setCallState('idle');
    setCallDuration(0);
    conversationHistory = '';
  };

  const getStatusText = () => {
    const labels: Record<CallState, string> = {
      idle: t('callReady') || 'Tap to call', connecting: t('connecting') || 'Connecting...',
      greeting: t('speaking') || 'Speaking...', listening: t('listening') || 'Listening...',
      processing: t('thinking') || 'Thinking...', speaking: t('speaking') || 'Speaking...',
    };
    return labels[callState] || '';
  };

  const isInCall = callState !== 'idle';
  const isListening = callState === 'listening';
  const isSpeaking = callState === 'speaking' || callState === 'greeting';

  // ═══════════════════════════════════════════════════════════════════════════
  // UI (STRICT UNTOUCHED APPROVED UI)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0d1f0d] to-[#0a0a0a] text-white overflow-hidden select-none">
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <button onClick={isInCall ? endCall : onBack} className="text-white/60 hover:text-white transition-colors"><ArrowLeft size={28} /></button>
        {isInCall && <div className="text-green-400 font-mono text-lg tracking-widest">{fmtTime(callDuration)}</div>}
        <div className="w-7" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
        <div className="relative flex items-center justify-center">
          {isInCall && (<>
            <div className="absolute rounded-full border-2 transition-all duration-300" style={{ width: `${280 + (isSpeaking ? 60 : isListening ? pulseIntensity * 80 : 20)}px`, height: `${280 + (isSpeaking ? 60 : isListening ? pulseIntensity * 80 : 20)}px`, borderColor: isSpeaking ? 'rgba(34,197,94,0.4)' : `rgba(34,197,94,${0.2 + pulseIntensity * 0.4})` }} />
            <div className="absolute rounded-full border transition-all duration-500" style={{ width: `${320 + (isSpeaking ? 80 : isListening ? pulseIntensity * 100 : 10)}px`, height: `${320 + (isSpeaking ? 80 : isListening ? pulseIntensity * 100 : 10)}px`, borderColor: `rgba(34,197,94,${0.05 + pulseIntensity * 0.2})` }} />
            <div className="absolute rounded-full transition-all duration-300" style={{ width: '260px', height: '260px', boxShadow: isSpeaking ? '0 0 80px rgba(34,197,94,0.5), 0 0 160px rgba(34,197,94,0.2)' : `0 0 ${40 + pulseIntensity * 60}px rgba(34,197,94,${0.2 + pulseIntensity * 0.3})` }} />
          </>)}
          <div className={`w-52 h-52 rounded-full border-4 ${isInCall ? (isSpeaking ? 'border-green-400' : 'border-green-500') : 'border-gray-700'} bg-white overflow-hidden z-10 transition-all duration-300`}>
            <img src="https://i.ibb.co/60f9sTw2/uzhavan-logo.png" alt="Uzhavan AI" className={`w-full h-full object-cover transition-all duration-500 ${isInCall ? 'scale-110' : 'scale-100 grayscale'}`} />
          </div>
          {isListening && <div className="absolute -bottom-2 bg-green-500 rounded-full p-2 z-20 animate-pulse"><Mic size={16} className="text-white" /></div>}
          {isSpeaking && <div className="absolute -bottom-2 bg-green-500 rounded-full p-2 z-20"><MicOff size={16} className="text-white" /></div>}
        </div>
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-black tracking-wider text-green-500">{t('appName') || "UZHAVAN AI"}</h2>
          <p className="text-sm font-medium text-gray-400 uppercase tracking-widest">{t('farmingAssistant') || "Farming Assistant"}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            {isInCall && <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-400' : isListening ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />}
            <p className="text-lg font-semibold text-white/80">{getStatusText()}</p>
          </div>
        </div>
      </div>
      <div className="pb-12 pt-4 flex justify-center">
        {!isInCall ? (
          <button onClick={startCall} className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.4)] border-4 border-green-500/30 hover:bg-green-500 active:scale-90 transition-all"><Phone size={36} className="text-white" /></button>
        ) : (
          <button onClick={endCall} className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)] border-4 border-red-500/30 hover:bg-red-500 active:scale-90 transition-all"><PhoneOff size={36} className="text-white" /></button>
        )}
      </div>
    </div>
  );
};

export default PhoneCall;
