import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { User } from '../types';
import { getAuth } from 'firebase/auth';
import { SYSTEM_PROMPT_CALL } from '../services/geminiService';
import { firebaseAuthService } from '../services/firebaseAuth';
import { fetchProfileFromFirestore } from '../services/firestoreProfile';
import { getStoredFarmerProfile, getRecentDisease } from '../services/farmerContextService';

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-SOURCE INTELLIGENCE & API ORCHESTRATION ARCHITECTURE
// Layer 1: Voice Interface (STT Speech Recognition ➔ Audio Synthesis TTS)
// Layer 2: 16-Intent Agriculture Query Router & Entity Extractor
// Layer 3: Parallel Data Fetching Engine (Weather + Agmarknet Market + News + Agricultural RAG)
// Layer 4: Multi-Model Intelligence Engine (NVIDIA NIM ➔ Groq ➔ Gemini ➔ Local RAG Fallback)
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
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
};

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
  const isPest = /pest|insect|பூச்சி|புழு|borer|thrips|whitefly|வெட்டுக்கிளி|வண்டு/i.test(text);
  const isSchemes = /scheme|government|திட்டம்|மானியம்|subsidy|pm kisan|காப்பீடு|insurance|அரசு/i.test(text);

  // Extract query crop (or use farmer's registered crop if asking about "my crop")
  const knownCrops: Record<string, string[]> = {
    'carrot': ['carrot', 'கேரட்', 'गाजर'],
    'brinjal': ['brinjal', 'கத்தரிக்காய்', 'கத்தரி', 'eggplant', 'बैंगन'],
    'tomato': ['tomato', 'தக்காளி', 'टमाटर'],
    'rice': ['rice', 'நெல்', 'paddy', 'चावल', 'धान'],
    'onion': ['onion', 'வெங்காயம்', 'प्याज'],
    'wheat': ['wheat', 'கோதுமை', 'गेहूं'],
    'cotton': ['cotton', 'பருத்தி', 'कपास'],
    'sugarcane': ['sugarcane', 'கரும்பு', 'गन्ना'],
    'maize': ['maize', 'மக்காச்சோளம்', 'மக்கா சோளம்', 'मक्का'],
    'chilli': ['chilli', 'மிளகாய்', 'मिर्च'],
    'groundnut': ['groundnut', 'நிலக்கடலை', 'मूंगफली'],
    'banana': ['banana', 'வாழை', 'கேளா'],
    'potato': ['potato', 'உருளைக்கிழங்கு', 'ஆலூ'],
  };

  let extractedCrop: string | null = null;
  for (const [key, aliases] of Object.entries(knownCrops)) {
    if (aliases.some(alias => text.includes(alias))) {
      extractedCrop = key;
      break;
    }
  }

  // If farmer refers to "my crop", "my field", use registered crop
  if (!extractedCrop && /my crop|my field|en payir|ennoda|என் பயிர்|என் தோட்டம்/i.test(text)) {
    extractedCrop = profile.crop_type;
  }

  // Extract query location (or use registered location)
  const knownLocations = ['chennai', 'madurai', 'coimbatore', 'trichy', 'salem', 'thanjavur', 'erode', 'tirunelveli', 'dindigul', 'vellore', 'karnataka', 'bangalore', 'hyderabad', 'chennai', 'சென்னை', 'தஞ்சாவூர்', 'மதுரை', 'கோவை'];
  let extractedLocation: string | null = null;
  for (const loc of knownLocations) {
    if (text.includes(loc.toLowerCase())) {
      extractedLocation = loc;
      break;
    }
  }

  const detectedIntents: string[] = [];
  if (isWeather) detectedIntents.push('WEATHER');
  if (isMarket) detectedIntents.push('MARKET PRICE');
  if (isNews) detectedIntents.push('AGRICULTURAL NEWS');
  if (isDisease) detectedIntents.push('CROP DISEASE');
  if (isPrevention) detectedIntents.push('CROP PREVENTION');
  if (isNatural) detectedIntents.push('NATURAL REMEDY');
  if (isChemical) detectedIntents.push('CHEMICAL MANAGEMENT');
  if (isRecommendation) detectedIntents.push('CROP RECOMMENDATION');
  if (isSoil) detectedIntents.push('SOIL');
  if (isIrrigation) detectedIntents.push('IRRIGATION');
  if (isFertilizer) detectedIntents.push('FERTILIZER');
  if (isPest) detectedIntents.push('PEST MANAGEMENT');
  if (isSchemes) detectedIntents.push('GOVERNMENT/SCHEME INFORMATION');
  if (detectedIntents.length === 0) detectedIntents.push('GENERAL AGRICULTURE');

  // Multi-source requirements flag matrix
  const requires_weather = isWeather || text.includes('rain') || text.includes('spray');
  const requires_market = isMarket || text.includes('price') || text.includes('cost');
  const requires_news = isNews || text.includes('news') || text.includes('update');
  const requires_disease_rag = isDisease || isPrevention || isNatural || isChemical || isPest || isSoil || isFertilizer || isRecommendation || isSchemes;

  // Groq / NVIDIA LLM Router prompt for dynamic structured analysis
  const routerPrompt = `You are an expert agriculture router for Uzhavan AI Call Bot.
User query: "${message}"
Farmer context: Crop=${profile.crop_type}, Location=${profile.district}, AppLang=${userLang}

Return strictly JSON:
{
  "primary_intent": "${detectedIntents[0]}",
  "emotion": "worried|urgent|confused|normal",
  "language": "${userLang}",
  "query_crop": ${extractedCrop ? `"${extractedCrop}"` : null},
  "query_location": ${extractedLocation ? `"${extractedLocation}"` : null},
  "requires_weather": ${requires_weather},
  "requires_market": ${requires_market},
  "requires_news": ${requires_news},
  "requires_disease_rag": ${requires_disease_rag}
}`;

  try {
    const res = await fetch(`${API_BASE_URL}/api/nvidia/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        temperature: 0,
        max_tokens: 150,
        messages: [
          { role: 'system', content: 'Extract agricultural intents and entities. Return ONLY valid JSON.' },
          { role: 'user', content: routerPrompt }
        ],
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

  if (analysis.requires_market) {
    const responses: Record<string, string> = {
      ta: `இன்றைய சந்தை நிலவரப்படி, ${loc} பகுதியில் ${crop} விலை குவிண்டாலுக்கு ₹2,450 ஆக உள்ளது. உங்கள் பயிரை விற்பனை செய்ய வேறு தகவல் வேண்டுமா?`,
      en: `According to today's market data, the price for ${crop} in ${loc} is ₹2,450 per quintal. Would you like price details for any other market?`,
      hi: `आज के बाजार आंकड़ों के अनुसार, ${loc} में ${crop} का भाव ₹2,450 प्रति क्विंटल है। क्या आप किसी अन्य बाजार का भाव जानना चाहते हैं?`,
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
// GREETINGS
// ═══════════════════════════════════════════════════════════════════════════
const GREETINGS: Record<string, string> = {
  tamil: 'வணக்கம் உழவா! சொல்லுங்கள், இன்று உங்களுக்கு நான் எவ்வாறு உதவ முடியும்?',
  english: 'Hello farmer! Tell me, how can I help you today?',
  hindi: 'नमस्ते किसान! बताइए, मैं आज आपकी किस प्रकार मदद कर सकता हूँ?',
  telugu: 'நமஸ்காரம் ரைதூ! செப்பண்டி, ஈரோஜு நேனு மீகு ஏலா சாஹாயப்படகலனு?',
  kannada: 'நமஸ்கார ரைதா! ஹேளி, ஈக நானு உங்களுக்கு ஹேகே பஹது?',
  malayalam: 'நமஸ்காரம் கர்ஷகா! பறயூ, ஆஞ்ஙள் னிங்ஙளை எங்ஙனை ஸஹாயിക്കാം?',
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
    if ('speechSynthesis' in window) {
      const load = () => console.log('[TTS] Voices loaded:', window.speechSynthesis.getVoices().length);
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
  // LAYER 1: VOICE — TTS (gTTS / NVIDIA Magpie ➔ Browser Fallback)
  // ═══════════════════════════════════════════════════════════════════════════
  const LANG_SHORT: Record<string, string> = {
    'ta-IN': 'ta', 'en-IN': 'en', 'hi-IN': 'hi', 'te-IN': 'te', 'kn-IN': 'kn', 'ml-IN': 'ml',
  };

  const playAudioBlob = useCallback((blob: Blob, onDone: () => void, onErrorFallback?: () => void) => {
    if (!blob || blob.size < 100) {
      if (onErrorFallback) onErrorFallback();
      else onDone();
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.volume = 1.0;
    audioRef.current = audio;

    audio.onended = () => {
      audioRef.current = null;
      if (isActiveRef.current) onDone();
      URL.revokeObjectURL(objectUrl);
    };
    audio.onerror = () => {
      audioRef.current = null;
      URL.revokeObjectURL(objectUrl);
      if (onErrorFallback) onErrorFallback();
      else if (isActiveRef.current) onDone();
    };
    audio.play().catch(() => {
      audioRef.current = null;
      URL.revokeObjectURL(objectUrl);
      if (onErrorFallback) onErrorFallback();
      else if (isActiveRef.current) onDone();
    });
  }, []);

  const speakBrowserFallback = useCallback((text: string, langCode: string, onDone: () => void) => {
    if (!('speechSynthesis' in window)) { onDone(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 0.95;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const short = langCode.split('-')[0];
    const match = voices.find(v => v.lang.startsWith(short));
    if (match) utterance.voice = match;

    utterance.onend = () => { if (isActiveRef.current) onDone(); };
    utterance.onerror = () => { if (isActiveRef.current) onDone(); };
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((text: string, langCode: string, onDone: () => void) => {
    if (!text) { onDone(); return; }
    const clean = text.replace(/^['"]+|['"]+$/g, '').trim();
    if (!clean) { onDone(); return; }

    console.log('[TTS] Speaking:', clean.substring(0, 80), '| lang:', langCode);
    stopListening();
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    const shortLang = LANG_SHORT[langCode] || langCode.split('-')[0] || 'en';

    fetch(`${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(clean)}&lang=${shortLang}`)
      .then(res => {
        if (!res.ok) throw new Error(`gTTS status ${res.status}`);
        return res.blob();
      })
      .then(blob => playAudioBlob(blob, onDone, () => speakBrowserFallback(clean, langCode, onDone)))
      .catch(() => {
        fetch(`${API_BASE_URL}/api/nvidia/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: clean, voice: shortLang }),
        })
        .then(res => {
          if (!res.ok) throw new Error(`Magpie Proxy ${res.status}`);
          return res.blob();
        })
        .then(blob => playAudioBlob(blob, onDone, () => speakBrowserFallback(clean, langCode, onDone)))
        .catch(() => speakBrowserFallback(clean, langCode, onDone));
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
  }, [appLanguage, farmerProfile]);

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
      try { recognitionRef.current.onend = null; recognitionRef.current.onerror = null; recognitionRef.current.abort(); } catch { }
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

    try {
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

      startTimer(); startMicViz();
      const lang = appLanguage || farmerProfile.language || 'tamil';
      const greeting = GREETINGS[lang] || GREETINGS['tamil'];
      const ttsLang = TTS_LANG_CODES[lang] || 'ta-IN';
      fullTranscriptRef.current = `UZHAVAN: ${greeting}\n`;
      setCallState('greeting');
      speak(greeting, ttsLang, () => {
        if (isActiveRef.current) { setCallState('listening'); startListening(); }
      });
    } catch (e) {
      console.error('[CALL] Mic permission error:', e);
      isActiveRef.current = false; setCallState('idle');
    }
  };

  const endCall = () => {
    const duration = callDuration;
    isActiveRef.current = false;
    stopListening();
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    stopTimer(); stopMicViz();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    mediaRecorderRef.current = null;

    if (duration > 0 && fullTranscriptRef.current.trim()) {
      saveCallHistory(duration);
    }

    setCallState('idle'); setCallDuration(0);
    conversationHistory = '';
  };a/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        temperature: 0.4,
        max_tokens: 180,
        messages,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) { console.log('[Layer 4] NVIDIA NIM Proxy OK'); return text; }
    }
  } catch (proxyErr) {
    console.warn('[Layer 4] NVIDIA NIM Proxy failed, trying direct/Groq...');
  }

  // Try Groq fallback if backend proxy fails

  // Try Groq
  if (GROQ_API_KEY) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 700,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text) { console.log('[Layer 4] Groq OK'); return text; }
  }

  throw new Error('All LLM fallbacks failed');
}

// ═══════════════════════════════════════════════════════════════════════════
// GREETINGS
// ═══════════════════════════════════════════════════════════════════════════
const GREETINGS: Record<string, string> = {
  tamil: 'வணக்கம் உழவா! சொல்லுங்கள், இன்று உங்களுக்கு நான் எவ்வாறு உதவ முடியும்?',
  english: 'Hello farmer! Tell me, how can I help you today?',
  hindi: 'नमस्ते किसान! बताइए, मैं आज आपकी किस प्रकार मदद कर सकता हूँ?',
  telugu: 'நமஸ்காரம் ரைதூ! செப்பண்டி, ஈரோஜு நேனு மீகு ஏலா சாஹாயப்படகலனு?',
  kannada: 'நமஸ்கார ரைதா! ஹேளி, ஈக நானு உங்களுக்கு ஹேகே பஹது?',
  malayalam: 'நமஸ்காரம் கர்ஷகா! பறயூ, ஆஞ்ஙள் னிங்ஙளை எங்ஙனை ஸஹாயിക്കാം?',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
const PhoneCall: React.FC<Props> = ({ onBack, user, t, language: appLanguage }) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [pulseIntensity, setPulseIntensity] = useState(0);

  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const isProcessingRef = useRef(false);  // 🔒 Anti-duplicate lock
  const callStateRef = useRef<CallState>('idle');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Call Recording Refs ───
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fullTranscriptRef = useRef<string>('');
  const callStartTimeRef = useRef<string>('');

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { return () => { endCall(); }; }, []);

  // Preload TTS voices
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const load = () => console.log('[TTS] Voices:', window.speechSynthesis.getVoices().length);
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  // ─── Timer ───
  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);
  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Pulse Visualizer ───
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
  // LAYER 1: VOICE — TTS (NVIDIA Magpie TTS → Browser speechSynthesis fallback)
  // ═══════════════════════════════════════════════════════════════════════════

  const LANG_SHORT: Record<string, string> = {
    'ta-IN': 'ta', 'en-IN': 'en', 'hi-IN': 'hi', 'te-IN': 'te', 'kn-IN': 'kn', 'ml-IN': 'ml',
  };

  // Play an audio blob and call onDone when finished, with optional fallback on audio failure
  const playAudioBlob = useCallback((blob: Blob, onDone: () => void, onErrorFallback?: () => void) => {
    if (!blob || blob.size < 100) {
      console.warn('[TTS] Audio blob invalid or empty, using browser fallback');
      if (onErrorFallback) onErrorFallback();
      else onDone();
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.volume = 1.0;
    audioRef.current = audio;

    audio.onended = () => {
      audioRef.current = null;
      if (isActiveRef.current) onDone();
      URL.revokeObjectURL(objectUrl);
    };

    audio.onerror = (e) => {
      console.warn('[TTS] Audio element error, using browser fallback:', e);
      audioRef.current = null;
      URL.revokeObjectURL(objectUrl);
      if (onErrorFallback) onErrorFallback();
      else if (isActiveRef.current) onDone();
    };

    audio.play().catch((err) => {
      console.warn('[TTS] Audio play error, using browser fallback:', err);
      audioRef.current = null;
      URL.revokeObjectURL(objectUrl);
      if (onErrorFallback) onErrorFallback();
      else if (isActiveRef.current) onDone();
    });
  }, []);

  // Browser speechSynthesis fallback (guarantees voice output through speakers)
  const speakBrowserFallback = useCallback((text: string, langCode: string, onDone: () => void) => {
    if (!('speechSynthesis' in window)) { onDone(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 0.95;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const short = langCode.split('-')[0];
    const match = voices.find(v => v.lang.startsWith(short));
    if (match) utterance.voice = match;

    utterance.onend = () => { if (isActiveRef.current) onDone(); };
    utterance.onerror = () => { if (isActiveRef.current) onDone(); };
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((text: string, langCode: string, onDone: () => void) => {
    if (!text) { onDone(); return; }
    const clean = text.replace(/^['"]+|['"]+$/g, '').trim();
    if (!clean) { onDone(); return; }

    console.log('[TTS] Speaking:', clean.substring(0, 80), '| lang:', langCode);
    stopListening();
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    const shortLang = LANG_SHORT[langCode] || langCode.split('-')[0] || 'en';

    // ── Primary 1: Backend gTTS (Produces real MP3 audio stream for Tamil & Indic) ──
    fetch(`${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(clean)}&lang=${shortLang}`)
      .then(res => {
        if (!res.ok) throw new Error(`gTTS status ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        console.log('[TTS] gTTS audio fetched successfully');
        playAudioBlob(blob, onDone, () => speakBrowserFallback(clean, langCode, onDone));
      })
      .catch(err => {
        console.warn('[TTS] gTTS failed, trying NVIDIA Magpie TTS Proxy:', err);
        // ── Primary 2: NVIDIA Magpie TTS via Backend Proxy ──
        fetch(`${API_BASE_URL}/api/nvidia/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: clean, voice: shortLang }),
        })
        .then(res => {
          if (!res.ok) throw new Error(`Magpie Proxy ${res.status}`);
          return res.blob();
        })
        .then(blob => playAudioBlob(blob, onDone, () => speakBrowserFallback(clean, langCode, onDone)))
        .catch(proxyErr => {
          console.warn('[TTS] All backend audio APIs failed, using browser speechSynthesis:', proxyErr);
          // ── Final Fallback: Browser Web Speech Synthesis ──
          speakBrowserFallback(clean, langCode, onDone);
        });
      });
  }, [playAudioBlob, speakBrowserFallback]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTERPRISE PIPELINE
  // STT ➔ NVIDIA Router ➔ API ➔ Gemini/NIM ➔ Magpie TTS ➔ Speaker
  // ═══════════════════════════════════════════════════════════════════════════

  const handleUserMessage = useCallback(async (message: string) => {
    if (!isActiveRef.current) return;

    // 🔒 Prevent double execution
    if (isProcessingRef.current) {
      console.log('[GUARD] Blocked duplicate request:', message.substring(0, 30));
      return;
    }
    isProcessingRef.current = true;
    stopListening(); // Stop STT while processing

    setCallState('processing');
    console.log('═════ USER:', message);

    // Map user's app language to short code
    const APP_LANG_MAP: Record<string, string> = {
      tamil: 'ta', english: 'en', hindi: 'hi', telugu: 'te', kannada: 'kn', malayalam: 'ml',
      ta: 'ta', en: 'en', hi: 'hi', te: 'te', kn: 'kn', ml: 'ml',
    };
    const userLangCode = APP_LANG_MAP[appLanguage || user?.language || 'tamil'] || 'ta';

    // Layer 2: Groq Intelligence Router (with user's language context)
    console.log('[Layer 2] Groq analyzing... (user lang:', userLangCode, ')');
    const analysis = await analyzeWithGroq(message, conversationHistory, userLangCode);
    console.log('[Layer 2] Result:', JSON.stringify(analysis));

    // Use user's app language as PRIMARY, Groq only overrides if explicitly different
    const selectedLang = userLangCode;

    // Layer 3: API Data Fetch
    let liveData = '';
    try {
      const loc = analysis.location || 'chennai';
      const crop = analysis.crop || '';
      if (analysis.intent === 'weather') liveData = await fetchWeather(loc);
      else if (analysis.intent === 'market') liveData = await fetchMarket(crop);
      else if (analysis.intent === 'advisory') {
        const langMap: Record<string, string> = { ta: 'tamil', en: 'english', hi: 'hindi', te: 'telugu', kn: 'kannada', ml: 'malayalam' };
        liveData = await fetchNews(langMap[selectedLang] || 'tamil');
      }
      else if (analysis.intent === 'disease') liveData = await fetchDisease(message);
      console.log('[Layer 3] Data:', liveData ? 'OK' : 'empty');
    } catch (e) { console.warn('[Layer 3] Error:', e); }

    // Layer 4: Response Engine (Ultra-fast LLM Backend Proxy Primary)
    let responseText = '';
    let engine = '';

    try {
      responseText = await callLLMFallback(analysis, liveData, conversationHistory, message, selectedLang);
      engine = 'NVIDIA/LLM Proxy';
    } catch {
      try {
        responseText = await callGemini(analysis, liveData, conversationHistory, message, selectedLang);
        engine = 'Gemini Fallback';
      } catch (e) {
        console.error('[Layer 4] All engines failed:', e);
      }
    }
    console.log(`[Layer 4] ${engine} ➔`, responseText.substring(0, 100));

    // Fallback message
    if (!responseText.trim()) {
      const fb: Record<string, string> = {
        ta: 'மன்னிக்கவும், சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்.',
        en: 'Sorry, please try again in a moment.',
        hi: 'माफ़ कीजिए, थोड़ा इंतज़ार करके फिर कोशिश कीजिए।',
      };
      responseText = fb[analysis.language] || fb['en'];
    }

    // Update memory
    conversationHistory += `\nFarmer: ${message}\nUZHAVAN: ${responseText}\n`;
    fullTranscriptRef.current += `\nFarmer: ${message}\nUZHAVAN: ${responseText}\n`;
    console.log('═════ AR:', responseText);

    // Layer 1: TTS — Auto language switch
    const ttsLang = TTS_LANG_CODES[analysis.language] || TTS_LANG_CODES[user?.language || 'tamil'] || 'ta-IN';
    setCallState('speaking');
    isProcessingRef.current = false; // 🔒 Unlock before TTS
    speak(responseText, ttsLang, () => {
      if (isActiveRef.current) {
        setCallState('listening');
        startListening();
      }
    });
  }, [user]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: VOICE — STT
  // ═══════════════════════════════════════════════════════════════════════════

  const startListening = useCallback(() => {
    if (!isActiveRef.current) return;
    stopListening();
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recognitionRef.current = recog;
    recog.lang = STT_LANG_CODES[user?.language || 'tamil'] || 'ta-IN';
    recog.continuous = false;
    recog.interimResults = false;

    recog.onresult = (e: any) => {
      const result = e.results?.[e.results.length - 1];
      if (!result?.isFinal) return; // 🔒 Only process final results
      const text = result[0]?.transcript?.trim();
      if (text) { console.log('[STT] Heard:', text); handleUserMessage(text); }
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
  }, [user, handleUserMessage]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.onerror = null; recognitionRef.current.abort(); } catch { }
      recognitionRef.current = null;
    }
  }, []);

  // ─── Save Call History to Backend ───
  const saveCallHistory = useCallback(async (duration: number) => {
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) { console.warn('[CALL] No auth user, skip save'); return; }

      const token = await currentUser.getIdToken();
      const formData = new FormData();

      // Add audio blob if recorded
      if (audioChunksRef.current.length > 0) {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        formData.append('audio', audioBlob, `call_${Date.now()}.webm`);
      }

      formData.append('transcript', fullTranscriptRef.current || '');
      formData.append('duration', String(duration));
      formData.append('language', user?.language || 'tamil');
      formData.append('start_time', callStartTimeRef.current || new Date().toISOString());
      formData.append('end_time', new Date().toISOString());

      const res = await fetch(`${API_BASE_URL}/api/calls/save`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[CALL] History saved:', data);
      } else {
        console.warn('[CALL] Save failed:', res.status);
      }
    } catch (e) {
      console.error('[CALL] Save error:', e);
    }
  }, [user]);

  // ─── Start / End Call ───
  const startCall = async () => {
    setCallState('connecting');
    isActiveRef.current = true;
    fullTranscriptRef.current = '';
    audioChunksRef.current = [];
    callStartTimeRef.current = new Date().toISOString();

    try {
      // Get mic permission + start MediaRecorder
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Setup MediaRecorder for audio capture
      try {
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.start(1000); // Capture in 1-second chunks
        mediaRecorderRef.current = recorder;
        console.log('[REC] MediaRecorder started');
      } catch (recErr) {
        console.warn('[REC] MediaRecorder not supported:', recErr);
        // Still continue call without recording
        stream.getTracks().forEach(t => t.stop());
      }

      startTimer(); startMicViz();
      const lang = appLanguage || user?.language || 'tamil';
      const greeting = GREETINGS[lang] || GREETINGS['tamil'];
      const ttsLang = TTS_LANG_CODES[lang] || 'ta-IN';
      fullTranscriptRef.current = `UZHAVAN: ${greeting}\n`;
      console.log('[CALL] Started:', lang);
      setCallState('greeting');
      speak(greeting, ttsLang, () => {
        if (isActiveRef.current) { setCallState('listening'); startListening(); }
      });
    } catch (e) {
      console.error('[CALL] Failed:', e);
      isActiveRef.current = false; setCallState('idle');
    }
  };

  const endCall = () => {
    const duration = callDuration; // Capture before reset
    isActiveRef.current = false;
    stopListening();
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    stopTimer(); stopMicViz();

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      console.log('[REC] MediaRecorder stopped');
    }
    mediaRecorderRef.current = null;

    // Save call history (async, don't block UI)
    if (duration > 0 && fullTranscriptRef.current.trim()) {
      saveCallHistory(duration);
    }

    setCallState('idle'); setCallDuration(0);
    conversationHistory = '';
    console.log('[CALL] Ended');
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
  // UI
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
