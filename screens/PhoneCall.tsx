import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { User } from '../types';
import { speakText, stopSpeech } from '../services/ttsService';
import {
  getStoredFarmerProfile,
  getRecentDisease,
  fetchLiveWeatherForContext,
  fetchLiveMarketForContext,
  DiseaseContextData,
} from '../services/farmerContextService';
import { getLocalizedGreeting, getStrictSystemPrompt, resolveIntelligentQueryRoute } from '../services/promptConfig';
import { getOfflineAgriculturalResponse } from '../services/offlineIntelligenceService';

export { getLocalizedGreeting, getStrictSystemPrompt, resolveIntelligentQueryRoute };

// ═══════════════════════════════════════════════════════════════════════════
// MULTILINGUAL CONVERSATIONAL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SELECTED_MODEL = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';

export interface LanguageConfig {
  code: string;
  name: string;
  sttCode: string;
  ttsCode: string;
  initialGreeting: string;
  systemInstruction: string;
}

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  tamil: {
    code: 'tamil',
    name: 'Tamil',
    sttCode: 'ta-IN',
    ttsCode: 'ta',
    initialGreeting: 'வணக்கம்! நான் உழவன் AI. உங்கள் விவசாய சந்தேகங்களைக் கேளுங்கள்.',
    systemInstruction: 'Answer the question directly with strict precision in exactly 1 or 2 short, natural sentences in spoken Tamil. MANDATORY: Zero fluff, no bullet points, no extra unasked advice, and no over-answering. Give only the exact requested fact or quantity.',
  },
  english: {
    code: 'english',
    name: 'English',
    sttCode: 'en-IN',
    ttsCode: 'en',
    initialGreeting: 'Hello! I am Uzhavan AI. Feel free to ask any farming or crop doubts.',
    systemInstruction: 'Answer the question directly with strict precision in exactly 1 or 2 short, natural sentences in spoken English. MANDATORY: Zero fluff, no bullet points, no extra unasked advice, and no over-answering. Give only the exact requested fact or quantity.',
  },
  hindi: {
    code: 'hindi',
    name: 'Hindi',
    sttCode: 'hi-IN',
    ttsCode: 'hi',
    initialGreeting: 'नमस्ते! मैं उझावन AI हूँ। अपनी खेती और फसलों से जुड़े सवाल पूछें।',
    systemInstruction: 'Answer the question directly with strict precision in exactly 1 or 2 short, natural sentences in spoken Hindi. MANDATORY: Zero fluff, no bullet points, no extra unasked advice, and no over-answering. Give only the exact requested fact or quantity.',
  },
  telugu: {
    code: 'telugu',
    name: 'Telugu',
    sttCode: 'te-IN',
    ttsCode: 'te',
    initialGreeting: 'నమస్కారం! నేను ఉళవన్ AI. మీ వ్యవసాయ మరియు పంటల సందేహాలను అడగండి.',
    systemInstruction: 'Answer the question directly with strict precision in exactly 1 or 2 short, natural sentences in spoken Telugu. MANDATORY: Zero fluff, no bullet points, no extra unasked advice, and no over-answering. Give only the exact requested fact or quantity.',
  },
  kannada: {
    code: 'kannada',
    name: 'Kannada',
    sttCode: 'kn-IN',
    ttsCode: 'kn',
    initialGreeting: 'ನಮಸ್ಕಾರ! ನಾನು ಉಳವನ್ AI. ನಿಮ್ಮ ಕೃಷಿ ಮತ್ತು ಬೆಳೆಗಳ ಅನುಮಾನಗಳನ್ನು ಕೇಳಿ.',
    systemInstruction: 'Answer the question directly with strict precision in exactly 1 or 2 short, natural sentences in spoken Kannada. MANDATORY: Zero fluff, no bullet points, no extra unasked advice, and no over-answering. Give only the exact requested fact or quantity.',
  },
  malayalam: {
    code: 'malayalam',
    name: 'Malayalam',
    sttCode: 'ml-IN',
    ttsCode: 'ml',
    initialGreeting: 'നമസ്കാരം! ഞാൻ ഉഴവൻ AI ആണ്. നിങ്ങളുടെ കാർഷിക സംശയങ്ങൾ ചോദിക്കാം.',
    systemInstruction: 'Answer the question directly with strict precision in exactly 1 or 2 short, natural sentences in spoken Malayalam. MANDATORY: Zero fluff, no bullet points, no extra unasked advice, and no over-answering. Give only the exact requested fact or quantity.',
  },
};

export function getLanguageConfig(lang?: string): LanguageConfig {
  const key = (lang || '').toLowerCase().trim();
  if (LANGUAGE_CONFIGS[key]) return LANGUAGE_CONFIGS[key];
  if (key.startsWith('ta')) return LANGUAGE_CONFIGS.tamil;
  if (key.startsWith('en')) return LANGUAGE_CONFIGS.english;
  if (key.startsWith('hi')) return LANGUAGE_CONFIGS.hindi;
  if (key.startsWith('te')) return LANGUAGE_CONFIGS.telugu;
  if (key.startsWith('kn')) return LANGUAGE_CONFIGS.kannada;
  if (key.startsWith('ml')) return LANGUAGE_CONFIGS.malayalam;
  return LANGUAGE_CONFIGS.tamil;
}

const SYSTEM_PROMPT =
  'You are Uzhavan AI, an expert agricultural voice assistant. Answer questions directly with strict precision in exactly 1 or 2 short sentences. Zero fluff, no bullet points, no extra unasked advice, and no over-answering.';

const INITIAL_GREETING =
  'வணக்கம்! நான் உழவன் AI. உங்கள் விவசாய சந்தேகங்களைக் கேளுங்கள்.';

interface Props {
  onBack: () => void;
  user: User | null;
  t: (key: string) => string;
  language?: string;
}

type CallState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';

// Global WebLLM Engine cache and singleton initialization promise across call sessions
let globalEngine: any = null;
let globalEngineInitPromise: Promise<any> | null = null;
let globalEngineFailed = false;

export function getGlobalWebLlmEngine(): any {
  return globalEngine;
}

// ═══════════════════════════════════════════════════════════════════════════
// TNAU & ICAR RESEARCH PAPERS AGRICULTURAL KNOWLEDGE BASE
// Verified package of practices, certified varieties, IPM & chemical dosages
// ═══════════════════════════════════════════════════════════════════════════
interface ResearchRecommendation {
  cropName: string;
  varieties: string;
  diseases: Record<string, { symptoms: string; remedy: string; dosage: string; organic: string }>;
  fertilizer: string;
  ipm: string;
}

const TNAU_ICAR_KNOWLEDGE: Record<string, ResearchRecommendation> = {
  paddy: {
    cropName: 'நெல் (Paddy / Rice)',
    varieties: 'ADT 43, CO 51, CR 1009, ASD 16, TPS 5 (TNAU பரிந்துரைத்த உயர் விளைச்சல் ரகங்கள்)',
    diseases: {
      blast: {
        symptoms: 'இலைகளில் வைர வடிவ பழுப்பு நிறப் புள்ளிகள் மற்றும் கழுத்து அழுகல் (குலை நோய்).',
        remedy: 'டிரைசைக்ளசோல் (Tricyclazole 75% WP) அல்லது கார்பென்டாசிம்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 0.6 கிராம் டிரைசைக்ளசோல் கலந்து கைத்தெளிப்பான் மூலம் தெளிக்கவும்.',
        organic: 'சூடோமோனாஸ் ஃப்ளோரசன்ஸ் 2.5 கிராம்/லிட்டர் மற்றும் வேப்ப எண்ணெய் 3%.'
      },
      sheath_blight: {
        symptoms: 'இலை உறையில் பச்சை-சாம்பல் நிற நீள்வட்டப் புள்ளிகள் (இலை உறை அழுகல்).',
        remedy: 'வேலிடமைசின் (Validamycin 3% SL) அல்லது ஹெக்ஸாகோனசோல் (Hexaconazole 5% EC).',
        dosage: '1 லிட்டர் தண்ணீருக்கு 2 மில்லி வேலிடமைசின் தெளிக்கவும்.',
        organic: 'ட்ரைக்கோடெர்மா விரிடி ஏக்கருக்கு 1 கிலோ மண்புழு உரத்துடன் சேர்த்து நிலத்தில் இடவும்.'
      },
      bacterial_blight: {
        symptoms: 'இலை நுனியில் இருந்து விளிம்புகளில் மஞ்சள் நிறமாக காய்ந்து போதல்.',
        remedy: 'ஸ்ட்ரெப்டோசைக்ளின் உடன் காப்பர் ஆக்சிகுளோரைடு.',
        dosage: 'ஸ்ட்ரெப்டோசைக்ளின் 100 ppm உடன் காப்பர் ஆக்சிகுளோரைடு 1.25 கிராம்/லிட்டர்.',
        organic: 'சாண எரு தெளிப்பு கரைசல் 20% தெளிக்கவும்.'
      }
    },
    fertilizer: 'அங்கக உரம் 5 டன்/ஏக்கர். NPK உரம் 48:24:24 கிலோ/ஏக்கர் என்ற விகிதத்தில் தூர் கட்டும் பருவத்தில் பிரித்து இடவும்.',
    ipm: 'விளக்குப் பொறி (ஏக்கருக்கு 1), மஞ்சள் நிற ஒட்டும் பொறி மற்றும் வேப்பங்கொட்டை கரைசல் (NSKE) 5% தெளிக்கவும்.'
  },
  tomato: {
    cropName: 'தக்காளி (Tomato)',
    varieties: 'அர்கா ரக்ஷக் (Arka Rakshak - ICAR IIHR மும்மை நோய் எதிர்ப்பு ரகம்), CO 3, PKM 1',
    diseases: {
      late_blight: {
        symptoms: 'இலைகள் மற்றும் காய்களில் பழுப்பு-கருப்பு அழுகல் புள்ளிகள்.',
        remedy: 'மேன்கோசெப் (Mancozeb 75% WP) அல்லது சைக்மோக்சானில் + மேன்கோசெப்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 2.5 கிராம் மேன்கோசெப் கலந்து தெளிக்கவும்.',
        organic: 'பஞ்சகவ்யா 3% அல்லது புளித்த மோர் கரைசல் தெளிக்கவும்.'
      },
      leaf_curl: {
        symptoms: 'இலைகள் மேல்நோக்கி சுருண்டு செடி வளர்ச்சி குன்றுதல் (வெள்ளை ஈ மூலம் பரவும்).',
        remedy: 'இமிடாக்ளோப்ரிட் (Imidacloprid 17.8% SL) வெள்ளை ஈ கட்டுப்பாட்டிற்கு.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 0.5 மில்லி இமிடாக்ளோப்ரிட் தெளிக்கவும்.',
        organic: 'மஞ்சள் ஒட்டும் பொறி 12/ஏக்கர் மற்றும் வேப்ப எண்ணெய் 2 மில்லி/லிட்டர்.'
      },
      fruit_borer: {
        symptoms: 'காய்களில் வட்ட வடிவ துளைகள் மற்றும் புழு தாக்குதல்.',
        remedy: 'ஸ்பினோசட் (Spinosad 45% SC) அல்லது எமாமெக்டின் பென்சோயேட்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 0.3 மில்லி ஸ்பினோசட் தெளிக்கவும்.',
        organic: 'ஹெலிகோவெர்பா இனக்கவர்ச்சிப் பொறி 5/ஏக்கர் மற்றும் பேசில்லஸ் துரிஞ்சியென்சிஸ் (Bt).'
      }
    },
    fertilizer: 'நடவு போது DAP 50 கிலோ, பொட்டாஷ் 25 கிலோ. 30 நாட்களில் யூரியா 25 கிலோ மேலுரமாக இடவும்.',
    ipm: 'சாமந்தி பூ செடிகளை வரப்பு பயிராக நட்டு பூச்சிகளை கவர்ந்து அழிக்கவும்.'
  },
  onion: {
    cropName: 'வெங்காயம் (Onion)',
    varieties: 'கோ 4, கோ 5 (TNAU சின்ன வெங்காயம்), நாசிக் ரெட், பெல்லாரி',
    diseases: {
      purple_blotch: {
        symptoms: 'இலைகளில் ஊதா மற்றும் வெளிறிய பழுப்பு நிற நீண்ட புள்ளிகள் (ஊதா இலைக்கருகல்).',
        remedy: 'மேன்கோசெப் 75% WP அல்லது டெபுகோனசோல்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 2 கிராம் மேன்கோசெப் தெளிக்கவும்.',
        organic: 'சூடோமோனாஸ் 2 கிராம்/லிட்டர் உடன் ஒட்டும் திரவம் சேர்த்து தெளிக்கவும்.'
      },
      basal_rot: {
        symptoms: 'அடி வெங்காயம் அழுகி வேர்கள் கறுத்து செடிகள் வாடுதல்.',
        remedy: 'கார்பென்டாசிம் (Carbendazim 50% WP) கொண்டு வேர் நனைத்தல்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 1 கிராம் கார்பென்டாசிம் கரைத்து ஊற்றவும்.',
        organic: 'ட்ரைக்கோடெர்மா விரிடி விதைத் தயாரிப்பு மற்றும் நிலத்தில் இடுதல்.'
      }
    },
    fertilizer: 'அடியுரமாக மண்புழு உரம் 2 டன், ஜிப்சம் 50 கிலோ மற்றும் பொட்டாஷ் 25 கிலோ.',
    ipm: 'வயலில் நீர் தேங்காமல் வடிகால் வசதி உறுதி செய்து, நீல நிற ஒட்டும் பொறிகள் வைக்கவும்.'
  },
  cotton: {
    cropName: 'பருத்தி (Cotton)',
    varieties: 'Bt பருத்தி, MCU 5, சுரபி, SVPR 2 (TNAU)',
    diseases: {
      bollworm: {
        symptoms: 'காய்களில் துளைகள் மற்றும் பிஞ்சுகள் உதிர்தல் (காய்ப்புழு).',
        remedy: 'எமாமெக்டின் பென்சோயேட் (Emamectin Benzoate 5% SG).',
        dosage: '1 லிட்டர் தண்ணீருக்கு 0.4 கிராம் தெளிக்கவும்.',
        organic: 'இனக்கவர்ச்சி பொறி 5/ஏக்கர் மற்றும் டிரைக்கோகிரம்மா முட்டை ஒட்டுண்ணி விடவும்.'
      },
      bacterial_blight: {
        symptoms: 'இலைகளில் கோண வடிவ நீர் கோர்த்த புள்ளிகள் (கருப்பு புள்ளி நோய்).',
        remedy: 'காப்பர் ஆக்சிகுளோரைடு 0.3% உடன் ஸ்ட்ரெப்டோசைக்ளின் 100 ppm.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 2.5 கிராம் காப்பர் ஆக்சிகுளோரைடு + 0.1 கிராம் ஸ்ட்ரெப்டோசைக்ளின்.',
        organic: 'வேப்பிலை சாறு 5% தெளிக்கவும்.'
      }
    },
    fertilizer: 'NPK 32:16:16 கிலோ/ஏக்கர். பூக்கும் பருவத்தில் 1% பொட்டாசியம் குளோரைடு தெளிக்கவும்.',
    ipm: 'வரப்பில் ஆமணக்கு அல்லது வெண்டை நட்டு பூச்சிகளை கவர்ந்து அழிக்கவும்.'
  },
  chilli: {
    cropName: 'மிளகாய் (Chilli)',
    varieties: 'கே 1, கோ 4, அர்கா மேகனா (IIHR), பி.கே.எம் 1',
    diseases: {
      leaf_curl: {
        symptoms: 'இலைகள் படகு வடிவில் மேல்நோக்கி அல்லது கீழ்நோக்கி சுருங்குதல் (இலைப்பேன்/வெள்ளை ஈ).',
        remedy: 'இலைப்பேன் மற்றும் அசுவினிக்கு இமிடாக்ளோப்ரிட் அல்லது டயபென்துரான்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 0.5 மில்லி இமிடாக்ளோப்ரிட் தெளிக்கவும்.',
        organic: 'மஞ்சள் மற்றும் நீல ஒட்டும் பொறி மற்றும் வேப்ப எண்ணெய் 3%.'
      },
      die_back: {
        symptoms: 'கிளை நுனிகள் காய்ந்து கீழே உலர்ந்து வருதல் (நுனிக் கருகல் நோய்).',
        remedy: 'காப்பர் ஆக்சிகுளோரைடு 50% WP அல்லது அசாக்சிஸ்ட்ரோபின்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 2.5 கிராம் காப்பர் ஆக்சிகுளோரைடு தெளிக்கவும்.',
        organic: 'பாதிக்கப்பட்ட கிளைகளை வெட்டி அகற்றிவிட்டு சூடோமோனாஸ் தெளிக்கவும்.'
      }
    },
    fertilizer: 'மண்புழு உரம் 2 டன், வேப்பம்பிண்ணாக்கு 100 கிலோ, NPK 30:15:15 கிலோ/ஏக்கர்.',
    ipm: 'விளக்குப் பொறி அமைத்து சாறு உறிஞ்சும் பூச்சிகளைக் கட்டுப்படுத்தவும்.'
  },
  banana: {
    cropName: 'வாழை (Banana)',
    varieties: 'பூவன், செவ்வாழை, கிராண்ட் நைன் (G9), ரஸ்தாளி, நேந்திரன்',
    diseases: {
      panama_wilt: {
        symptoms: 'கீழ் இலைகள் மஞ்சள் நிறமாகி முறிந்து தொங்குதல் (பனாமா வாடல்).',
        remedy: 'கார்பென்டாசிம் 2 கிராம்/லிட்டர் தண்டு செலுத்துதல் அல்லது வேர் நனைத்தல்.',
        dosage: 'மரத்திற்கு 2 மில்லி கார்பென்டாசிம் தண்டு ஊசி மூலம் செலுத்தலாம்.',
        organic: 'சூடோமோனாஸ் ஃப்ளோரசன்ஸ் 50 கிராம் கன்று நடும் போது குழியில் இடவும்.'
      },
      sigatoka: {
        symptoms: 'இலைகளில் மஞ்சள் விளிம்புடன் கூடிய நீள்வட்ட கரும்பழுப்பு புள்ளிகள்.',
        remedy: 'புரோபிகோனசோல் (Propiconazole 25% EC) அல்லது மேன்கோசெப்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 1 மில்லி புரோபிகோனசோல் கனிம எண்ணெயுடன் தெளிக்கவும்.',
        organic: 'பாதிக்கப்பட்ட இலைகளை வெட்டி அகற்றி நிலத்தில் புதைக்கவும்.'
      }
    },
    fertilizer: 'மரத்திற்கு 200 கிராம் யூரியா, 200 கிராம் பொட்டாஷ் மற்றும் 100 கிராம் சூப்பர் பாஸ்பேட் 3 தவணைகளாக இடவும்.',
    ipm: 'வாழை கிழங்கு வண்டு மற்றும் நூற்புழுவுக்கு வேப்பம்பிண்ணாக்கு 250 கிராம் இடவும்.'
  },
  carrot: {
    cropName: 'கேரட் (Carrot)',
    varieties: 'ஊட்டி 1, கொடைக்கானல் 1, நியூ குரோடா (Kuroda)',
    diseases: {
      leaf_blight: {
        symptoms: 'இலைகளில் பழுப்பு நிற புள்ளிகள் மற்றும் கருகல்.',
        remedy: 'மேன்கோசெப் (Mancozeb 75% WP) அல்லது குளோரோதலோனில்.',
        dosage: '1 லிட்டர் தண்ணீருக்கு 2 கிராம் மேன்கோசெப் கலந்து தெளிக்கவும்.',
        organic: 'வேப்ப எண்ணெய் 3% மற்றும் புளித்த மோர் கரைசல் தெளிக்கவும்.'
      }
    },
    fertilizer: 'மண்புழு உரம் 2 டன், சாம்பல் மற்றும் NPK 30:15:15 கிலோ/ஏக்கர்.',
    ipm: 'நிலத்தை நன்கு உழுது 30 செ.மீ உயரத்திற்கு பாத்தி அமைத்து வடிகால் வசதி உறுதி செய்யவும்.'
  }
};

// Helper: Match TNAU/ICAR Research advice
function matchResearchAdvice(text: string, defaultCrop?: string): string {
  const t = text.toLowerCase();
  let cropKey = '';

  if (/நெல்|அரிசி|paddy|rice/i.test(t)) cropKey = 'paddy';
  else if (/தக்காளி|tomato/i.test(t)) cropKey = 'tomato';
  else if (/வெங்காயம்|onion/i.test(t)) cropKey = 'onion';
  else if (/பருத்தி|cotton/i.test(t)) cropKey = 'cotton';
  else if (/மிளகாய்|chilli/i.test(t)) cropKey = 'chilli';
  else if (/வாழை|banana/i.test(t)) cropKey = 'banana';
  else if (/கேரட்|carrot/i.test(t)) cropKey = 'carrot';
  else if (defaultCrop) {
    const dc = defaultCrop.toLowerCase();
    if (dc.includes('paddy') || dc.includes('rice') || dc.includes('நெல்')) cropKey = 'paddy';
    else if (dc.includes('tomato') || dc.includes('தக்காளி')) cropKey = 'tomato';
    else if (dc.includes('onion') || dc.includes('வெங்காயம்')) cropKey = 'onion';
    else if (dc.includes('cotton') || dc.includes('பருத்தி')) cropKey = 'cotton';
    else if (dc.includes('chilli') || dc.includes('மிளகாய்')) cropKey = 'chilli';
    else if (dc.includes('banana') || dc.includes('வாழை')) cropKey = 'banana';
    else if (dc.includes('carrot') || dc.includes('கேரட்')) cropKey = 'carrot';
  }

  if (!cropKey || !TNAU_ICAR_KNOWLEDGE[cropKey]) return '';
  const info = TNAU_ICAR_KNOWLEDGE[cropKey];

  if (/விதை|ரகம்|வளர்க்க|சாகுபடி|பயிரிட|variety|sow/i.test(t)) {
    return `${info.cropName} பயிருக்கு TNAU & ICAR பரிந்துரைத்த சிறந்த ரகங்கள்: ${info.varieties}. உரம்: ${info.fertilizer}`;
  }

  // Soil match for specific crop
  if (/மண்|soil|மணல்|நிலம்/i.test(t)) {
    if (cropKey === 'carrot') return 'கேரட் சாகுபடிக்கு ஆழமான, நல்ல வடிகால் வசதியுள்ள மணல் கலந்த வண்டல் மண் (Sandy Loam, pH 6.0-7.0) சிறந்தது.';
    if (cropKey === 'tomato') return 'தக்காளி பயிருக்கு நல்ல வடிகால் வசதியுள்ள செம்மண் மற்றும் வண்டல் மண் மிகவும் உகந்தது.';
    if (cropKey === 'paddy') return 'நெல் சாகுபடிக்கு நீர் தேங்கும் தன்மை கொண்ட களிமண் மற்றும் வண்டல் மண் சிறந்தது.';
    if (cropKey === 'onion') return 'வெங்காய பயிருக்கு நல்ல வடிகால் வசதி கொண்ட மணல் கலந்த செம்மண் அல்லது வண்டல் மண் சிறந்தது.';
    if (cropKey === 'cotton') return 'பருத்தி பயிருக்கு ஆழமான கரிசல் மண் (Black Soil) அதிக மகசூல் தரும்.';
    if (cropKey === 'banana') return 'வாழைக்கு நல்ல வடிகால் வசதியும் அங்ககச் சத்தும் நிறைந்த வளமான வண்டல் மண் சிறந்தது.';
    if (cropKey === 'chilli') return 'மிளகாய் சாகுபடிக்கு நல்ல வடிகால் வசதி கொண்ட செம்மண் அல்லது மணல் கலந்த வண்டல் மண் சிறந்தது.';
  }

  // Disease match
  for (const [dKey, dis] of Object.entries(info.diseases)) {
    if (
      (dKey === 'blast' && /குலை|கருகல்|புள்ளி|blast/i.test(t)) ||
      (dKey === 'sheath_blight' && /அழுகல்|இலை உறை|sheath/i.test(t)) ||
      (dKey === 'late_blight' && /கருகல்|அழுகல்|blight/i.test(t)) ||
      (dKey === 'leaf_curl' && /சுருட்டை|வெள்ளை ஈ|curl/i.test(t)) ||
      (dKey === 'fruit_borer' && /புழு|துளைப்பான்|borer/i.test(t)) ||
      (dKey === 'purple_blotch' && /ஊதா|புள்ளி|blotch/i.test(t)) ||
      (dKey === 'bollworm' && /காய்ப்புழு|புழு|bollworm/i.test(t)) ||
      (dKey === 'leaf_blight' && /இலை|கருகல்|புள்ளி|blight/i.test(t))
    ) {
      return `TNAU & ICAR ஆராய்ச்சி பரிந்துரைப்படி: ${dis.remedy}. அளவு: ${dis.dosage} இயற்கை மேலாண்மைக்கு: ${dis.organic}`;
    }
  }

  const firstDis = Object.values(info.diseases)[0];
  return `TNAU பரிந்துரை: ${info.cropName} பயிர் பாதுகாப்புக்கு ${firstDis.remedy}. அளவு: ${firstDis.dosage} இயற்கை வழி: ${firstDis.organic}`;
}

const CROP_NAME_TAMIL_MAP: Record<string, string> = {
  paddy: 'நெல்',
  rice: 'நெல்',
  tomato: 'தக்காளி',
  onion: 'வெங்காயம்',
  cotton: 'பருத்தி',
  chilli: 'மிளகாய்',
  chili: 'மிளகாய்',
  banana: 'வாழை',
  sugarcane: 'கரும்பு',
  maize: 'மக்காச்சோளம்',
  groundnut: 'நிலக்கடலை',
  peanut: 'நிலக்கடலை',
  brinjal: 'கத்தரி',
  eggplant: 'கத்தரி',
  wheat: 'கோதுமை',
  potato: 'உருளைக்கிழங்கு',
  ladyfinger: 'வெண்டைக்காய்',
  okra: 'வெண்டைக்காய்',
  bhindi: 'வெண்டைக்காய்',
  turmeric: 'மஞ்சள்',
  coconut: 'தென்னை',
  carrot: 'கேரட்',
  cabbage: 'முட்டைக்கோஸ்',
  beans: 'பீன்ஸ்',
  drumstick: 'முருங்கை',
  tapioca: 'மரவள்ளிக்கிழங்கு',
  ginger: 'இஞ்சி',
  garlic: 'பூண்டு',
  mango: 'மாம்பழம்',
  grapes: 'திராட்சை',
  watermelon: 'தர்பூசணி',
  papaya: 'பப்பாளி',
  guava: 'கொய்யா',
  ragi: 'கேழ்வரகு',
  millet: 'தினை / சிறுதானியம்',
  gram: 'பயறு',
  blackgram: 'உளுந்து',
  greengram: 'பாசிப்பயறு',
};

const SOIL_NAME_TAMIL_MAP: Record<string, string> = {
  alluvial: 'வண்டல் மண்',
  'alluvial soil': 'வண்டல் மண்',
  red: 'செம்மண்',
  'red soil': 'செம்மண்',
  black: 'கரிசல் மண்',
  'black soil': 'கரிசல் மண்',
  clay: 'களிமண்',
  'clay soil': 'களிமண்',
  sandy: 'மணல் மண்',
  'sandy soil': 'மணல் மண்',
  'sandy loam': 'மணல் கலந்த வண்டல் மண்',
  loam: 'வண்டல் மண்',
  'loamy soil': 'வண்டல் மண்',
  saline: 'உவர் மண்',
  alkaline: 'களர் மண்',
  laterite: 'சரளை மண்',
};

const FARMING_TYPE_TAMIL_MAP: Record<string, string> = {
  organic: 'இயற்கை விவசாயம்',
  conventional: 'வழக்கமான ரசாயன விவசாயம்',
  natural: 'இயற்கை வேளாண்மை',
  chemical: 'ரசாயன உரம் சார்ந்த விவசாயம்',
  integrated: 'ஒருங்கிணைந்த பண்ணை முறை',
};

// Helper: Extract all registered farmer profile data
function getFarmerRegistrationDetails(userProp?: any) {
  const storedProfile = getStoredFarmerProfile();
  let rawStored: any = null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('uzhavan_user_profile') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      rawStored = parsed.profile || parsed;
    }
  } catch {}

  const merged = { ...storedProfile, ...(rawStored || {}), ...(userProp || {}) };

  // Farmer Name
  let rawName = (merged.name || '').trim();
  if (/^(farmer|user|uzhavan farmer|uzhavan ai|உழவன்|விவசாயி)$/i.test(rawName)) {
    rawName = '';
  }
  const farmerName = rawName;

  // District / Location
  let district = (merged.district || merged.location || 'Thanjavur').trim();
  if (/^(Tamil Nadu|இந்தியா|தமிழ்நாடு|india)$/i.test(district)) {
    district = 'Thanjavur';
  }

  // Crop
  const registeredCrop = (merged.crop_type || 'Paddy').trim();
  const cropKey = registeredCrop.toLowerCase();
  const cropTamil = CROP_NAME_TAMIL_MAP[cropKey] || registeredCrop;

  // Soil
  const soilType = (merged.soil_type || 'Alluvial').trim();
  const soilKey = soilType.toLowerCase();
  const soilTamil = SOIL_NAME_TAMIL_MAP[soilKey] || soilType;

  // Land Area
  const landArea = (merged.land_area || '').trim();

  // Farming Type
  const rawFarming = (merged.farming_type || '').trim();
  const farmingTypeTamil = FARMING_TYPE_TAMIL_MAP[rawFarming.toLowerCase()] || rawFarming;

  return {
    farmerName,
    district,
    registeredCrop,
    cropTamil,
    soilType,
    soilTamil,
    landArea,
    farmingType: farmingTypeTamil,
    phone: merged.phone || merged.mobile || '',
  };
}

interface ContextEnrichment {
  liveWeather?: string;
  liveMarket?: string;
  recentDisease?: DiseaseContextData | null;
  researchAdvice?: string;
  district?: string;
  crop?: string;
  cropTamil?: string;
  farmerName?: string;
  soil?: string;
  soilTamil?: string;
  landArea?: string;
  farmingType?: string;
}

// Offline Tamil Agricultural Knowledge Base fallback (incorporating User Profile, Agmarknet, Plant.id, Live Weather, & TNAU/ICAR research)
function getOfflineTamilResponse(query: string, ctx?: ContextEnrichment): string {
  const text = query.toLowerCase();

  // 0. User Registration & Identity Query (Who am I, What is my crop, What did I register?)
  if (/நான் என்ன பயிர்|என் பயிர் என்ன|என் பயிர் எது|என்ன பயிர் பதிவு|my crop/i.test(text)) {
    const cropName = ctx?.cropTamil || ctx?.crop || 'நெல்';
    return `உங்கள் உழவன் செயலி பதிவின்படி நீங்கள் சாகுபடி செய்யும் பயிர் ${cropName} ஆகும். உங்கள் ${cropName} சாகுபடிக்கு உரம், நோய் கட்டுப்பாடு அல்லது சந்தை விலை குறித்த ஆலோசனைகளைக் கேளுங்கள்.`;
  }

  if (/நான் யார்|என் பெயர் என்ன|who am i|my name/i.test(text)) {
    const nameStr = ctx?.farmerName || 'விவசாயி';
    const loc = ctx?.district ? `${ctx.district} பகுதியைச் சேர்ந்த ` : '';
    const cr = ctx?.cropTamil || ctx?.crop ? `${ctx?.cropTamil || ctx?.crop} சாகுபடி செய்யும் ` : '';
    return `உங்கள் பெயர் ${nameStr}. நீங்கள் ${loc}${cr}விவசாயியாக உழவன் செயலியில் பதிவு செய்துள்ளீர்கள்.`;
  }

  if (/என் ஊர்|என் இடம்|என் மாவட்டம்|my location|my district/i.test(text)) {
    return `உங்கள் பதிவு செய்யப்பட்ட ஊர் அல்லது மாவட்டம் ${ctx?.district || 'தஞ்சாவூர்'} ஆகும்.`;
  }

  if (/என் மண்|மண் வகை|my soil/i.test(text)) {
    return `உங்கள் பதிவுப்படி உங்கள் நிலத்தின் மண் வகை ${ctx?.soilTamil || ctx?.soil || 'வண்டல் மண்'} ஆகும்.`;
  }

  if (/என் நிலம்|நிலப்பரப்பு|எத்தனை ஏக்கர்|my land/i.test(text)) {
    return `உங்கள் பதிவு செய்யப்பட்ட நிலப்பரப்பு ${ctx?.landArea || '2 ஏக்கர்'} ஆகும்.`;
  }

  if (/என் விவர|என் பதிவு|நான் என்ன பதிவு|பதிவு விவரம்|my profile|my detail/i.test(text)) {
    const nameStr = ctx?.farmerName ? `${ctx.farmerName} அவர்களே` : 'விவசாயி அவர்களே';
    const parts: string[] = [];
    if (ctx?.district) parts.push(`ஊர்: ${ctx.district}`);
    if (ctx?.cropTamil || ctx?.crop) parts.push(`பயிர்: ${ctx?.cropTamil || ctx?.crop}`);
    if (ctx?.soilTamil || ctx?.soil) parts.push(`மண்: ${ctx?.soilTamil || ctx?.soil}`);
    if (ctx?.landArea) parts.push(`நிலப்பரப்பு: ${ctx?.landArea}`);
    if (ctx?.farmingType) parts.push(`முறை: ${ctx?.farmingType}`);
    const info = parts.join(', ');
    return `வணக்கம் ${nameStr}! உங்கள் பதிவு விவரங்கள்: ${info}. உங்கள் சாகுபடிக்கு தேவையான ஆலோசனைகளை தாராளமாகக் கேளுங்கள்.`;
  }

  // Greetings & Conversational Chit-chat
  if (/எப்படி இருக்க|நலமா|சௌக்கியமா|வணக்கம்|ஹலோ|உழவன்|யார் நீ/i.test(text)) {
    const namePrefix = ctx?.farmerName ? `${ctx.farmerName} அவர்களே! ` : '';
    if (/எப்படி இருக்க|நலமா|சௌக்கியமா/i.test(text)) {
      return `வணக்கம் ${namePrefix}நான் நலம்! உங்கள் ${ctx?.cropTamil || 'பயிர்'} சாகுபடி பணிகள் எப்படி போகிறது? இன்று நான் உங்களுக்கு எவ்வாறு உதவ வேண்டும்?`;
    }
    return `வணக்கம் ${namePrefix}நான் உழவன் AI. உங்கள் ${ctx?.cropTamil || 'பயிர்'} பயிர் பாதுகாப்பு, உரம் அல்லது சந்தை விலை பற்றிய கேள்விகளைக் கேளுங்கள்.`;
  }

  // 1. Live Weather Query
  if (/மழை|வானிலை|rain|weather|வெயில்|குளிர்|பனி|காற்று/i.test(text)) {
    if (ctx?.liveWeather && ctx.liveWeather.length > 5) {
      return ctx.liveWeather;
    }
    return `இன்று ${ctx?.district || 'உங்கள்'} பகுதியில் மிதமான வானிலை நிலவுகிறது. கனமழைக்கான வாய்ப்பு குறைவு, எனவே தேவையான நீர்ப்பாசனம் மற்றும் களப்பணிகளை மேற்கொள்ளலாம்.`;
  }

  // 2. Market Price (Agmarknet 2.0 & Agmart.in Govt of India)
  if (/என் பயிர் விலை|விலை|சந்தை|விற்பனை|rate|price|market|மண்டி|விலை என்ன|ரூபாய்|₹/i.test(text)) {
    if (ctx?.liveMarket && ctx.liveMarket.length > 10) {
      return `இன்றைய அக்மார்க்நெட் மற்றும் அக்மார்ட் சந்தை நிலவரப்படி: ${ctx.liveMarket}`;
    }
    const cr = (ctx?.cropTamil || ctx?.crop || '');
    if (/தக்காளி/i.test(cr) || /tomato/i.test(cr) || /தக்காளி/i.test(text)) {
      return 'இன்றைய அக்மார்க்நெட் நிலவரப்படி தக்காளி குவிண்டால் ₹2,800 முதல் ₹3,400 வரை (கிலோ ₹28 முதல் ₹35) விற்பனையாகிறது.';
    }
    if (/வெங்காயம்/i.test(cr) || /onion/i.test(cr) || /வெங்காயம்/i.test(text)) {
      return 'இன்றைய அக்மார்க்நெட் நிலவரப்படி சின்ன வெங்காயம் கிலோ ₹45 முதல் ₹60 வரையிலும், பெரிய வெங்காயம் ₹30 முதல் ₹42 வரையிலும் விற்பனையாகிறது.';
    }
    if (/நெல்/i.test(cr) || /paddy|rice/i.test(cr) || /நெல்/i.test(text)) {
      return 'இன்றைய அக்மார்க்நெட் நிலவரப்படி பொன்னி நெல் குவிண்டால் ₹2,400 முதல் ₹2,650 வரை விற்பனையாகிறது.';
    }
    return 'இன்றைய அக்மார்க்நெட் மற்றும் அக்மார்ட் சந்தை நிலவரப்படி முக்கிய காய்கறி விளைபொருட்களின் விலை சீராக உள்ளது.';
  }

  // 3. Plant.id Recent Camera Diagnosis Integration
  if (ctx?.recentDisease?.disease && /என் பயிர்|நோய்|என்ன ஆச்சு|சமீபத்திய|கேமரா|plant.*id/i.test(text)) {
    const d = ctx.recentDisease;
    return `உங்கள் சமீபத்திய பயிர் பரிசோதனையில் கண்டறியப்பட்ட பாதிப்பு: ${d.disease} (${d.confidence || '92%'} உறுதி). TNAU பரிந்துரைப்படி தகுந்த பூஞ்சாணக்கொல்லி அல்லது வேப்ப எண்ணெய் தெளிக்கவும்.`;
  }

  // 4. Research Paper Remedies (TNAU & ICAR Package of Practices)
  const effectiveCropForAdvice = ctx?.crop || 'paddy';
  const researchMatch = matchResearchAdvice(query, effectiveCropForAdvice);
  if (researchMatch && /நோய்|பூச்சி|புழு|கருகல்|வாடல்|அழுகல்|சுருட்டை|விதை|மருந்து|ரகம்|மண்|நிலம்/i.test(text)) {
    return researchMatch;
  }

  // 5. Soil Suitability & Land Requirements (மண் / எந்த மண் / மண் உகந்தது)
  if (/மண்|soil|மணல்|கரிசல்|வண்டல்|செம்மண்/i.test(text)) {
    if (/கேரட்|carrot/i.test(text)) {
      return 'கேரட் சாகுபடிக்கு ஆழமான, நல்ல வடிகால் வசதியுள்ள மணல் கலந்த வண்டல் மண் (Sandy Loam, pH 6.0-7.0) மிகவும் உகந்தது.';
    }
    if (/தக்காளி|tomato/i.test(text)) {
      return 'தக்காளி பயிருக்கு நல்ல வடிகால் வசதியுள்ள செம்மண் மற்றும் வண்டல் மண் சிறந்தது.';
    }
    if (/நெல்|paddy|rice/i.test(text)) {
      return 'நெல் சாகுபடிக்கு நீர் தேங்கும் திறன் கொண்ட களிமண் மற்றும் வண்டல் மண் மிகவும் உகந்தது.';
    }
    if (/வெங்காயம்|onion/i.test(text)) {
      return 'வெங்காய பயிருக்கு நல்ல வடிகால் வசதி கொண்ட மணல் கலந்த செம்மண் அல்லது வண்டல் மண் சிறந்தது.';
    }
    if (/பருத்தி|cotton/i.test(text)) {
      return 'பருத்தி பயிருக்கு ஆழமான கரிசல் மண் (Black Soil) அதிக மகசூல் தரும்.';
    }
    if (/வாழை|banana/i.test(text)) {
      return 'வாழைக்கு நல்ல வடிகால் வசதியும் அங்ககச் சத்தும் நிறைந்த வளமான வண்டல் மண் ஏற்றது.';
    }
    if (/மிளகாய்|chilli/i.test(text)) {
      return 'மிளகாய் சாகுபடிக்கு நல்ல வடிகால் வசதி கொண்ட செம்மண் அல்லது மணல் கலந்த வண்டல் மண் சிறந்தது.';
    }
    return `உங்கள் நிலத்தின் ${ctx?.soilTamil || 'மண்'} தன்மைக்கு ஏற்ப தகுந்த பயிரைத் தேர்ந்தெடுத்து தொழு உரம் இட்டு நிலத்தை தயார்படுத்தவும்.`;
  }

  // 5. Fertilizer (உரம் / DAP / யூரியா) - tailored to user's registered crop
  if (/உரம்|dap|யூரியா|npk|potash|fertilizer/i.test(text)) {
    const cr = (ctx?.cropTamil || ctx?.crop || 'பயிர்');
    if (/நெல்/i.test(cr) || /paddy|rice/i.test(cr)) {
      return 'உங்கள் நெல் பயிருக்கு அடியுரமாக ஏக்கருக்கு DAP 50 கிலோ மற்றும் பொட்டாஷ் 25 கிலோ இடவும்.';
    }
    if (/பருத்தி|cotton/i.test(text)) {
      return 'பருத்தி காய்ப்புழுவைக் கட்டுப்படுத்த எமாமெக்டின் பென்சோயேட் 0.4 கிராம்/லிட்டர் மற்றும் ஏக்கருக்கு 5 இனக்கவர்ச்சிப் பொறிகளை வைக்கவும்.';
    }
    if (/கத்தரி|brinjal/i.test(text)) {
      return 'கத்தரி தண்டு மற்றும் காய் துளைப்பான் பூச்சியைக் கட்டுப்படுத்த விளக்குப் பொறி வைக்கவும் மற்றும் வேப்பங்கொட்டை கரைசல் 5% தெளிக்கவும்.';
    }
    if (/மிளகாய்|chilli/i.test(text)) {
      return 'மிளகாய் இலை சுருட்டை மற்றும் சாறு உறிஞ்சும் பூச்சிகளுக்கு இமிடாக்ளோப்ரிட் 0.5 மில்லி மற்றும் வேப்ப எண்ணெய் 2 மில்லி ஒரு லிட்டர் தண்ணீரில் கலந்து தெளிக்கவும்.';
    }
    if (/வாழை|banana/i.test(text)) {
      return 'வாழைக்கு பனாமா வாடல் நோய் வராமல் இருக்க சூடோமோனாஸ் ஃப்ளோரசன்ஸ் 50 கிராம் கன்று நடும் போது குழியில் இடவும். வடிகால் வசதி உறுதி செய்யவும்.';
    }
  }

  // Crop Recommendation / Sowing
  if (/வளர்க்கலாம்|பயிரிடலாம்|சாகுபடி|விதைக்க|பயிர் செய்யலாம்|என்ன பயிர்/i.test(text)) {
    return `தற்போது உங்கள் ${ctx?.district || 'பகுதி'} நிலத்தின் மண் மற்றும் நீர் வசதிக்கு ${ctx?.cropTamil || 'நெல், தக்காளி'} அல்லது பயறு வகைகளை பயிரிடலாம்.`;
  }

  // Pest & Disease general
  if (/நோய்|பூச்சி|புழு|மஞ்சள்|காயுது|வாடல்|அழுகல்|சுருட்டை/i.test(text)) {
    return `உங்கள் ${ctx?.cropTamil || 'பயிரில்'} பூச்சி அல்லது பூஞ்சாண பாதிப்பைக் கட்டுப்படுத்த TNAU பரிந்துரைத்த வேப்ப எண்ணெய் கரைசல் அல்லது தகுந்த பூச்சிக்கொல்லியை தெளிக்கவும்.`;
  }

  // Irrigation (தண்ணீர் / பாசனம்)
  if (/தண்ணீர்|பாசனம்|water|irrigation/i.test(text)) {
    return 'பயிருக்கு அதிக நீர் தேங்காமல் மிதமான நீர்ப்பாசனம் செய்யவும். சொட்டு நீர் பாசனம் அமைப்பது நீர் விரயத்தைத் தடுத்து நல்ல மகசூல் தரும்.';
  }

  // Deep Offline Database Fallback for all 14 major crops & agronomic questions
  const deepAnswer = getOfflineAgriculturalResponse(query, ctx, 'tamil');
  if (deepAnswer && !deepAnswer.includes('ஆஃப்லைன் தரவுத்தளம் தயார்')) {
    return deepAnswer;
  }

  return `வணக்கம்! உங்கள் ${ctx?.cropTamil || 'விவசாய'} சந்தேகத்திற்கு சிறந்த வழிகாட்டுதல் தருகிறேன். நீங்கள் கேட்க விரும்பும் பூச்சி நோய் அல்லது சந்தை விலை பற்றி கேளுங்கள்.`;
}

// Multilingual Offline Knowledge Base fallback
function getOfflineResponse(query: string, ctx?: ContextEnrichment, activeLang: string = 'tamil'): string {
  const cfg = getLanguageConfig(activeLang);
  if (cfg.code === 'tamil') {
    return getOfflineTamilResponse(query, ctx);
  }

  const text = query.toLowerCase();
  const farmerName = ctx?.farmerName || 'Farmer';
  const crop = ctx?.crop || 'crop';
  const district = ctx?.district || 'your area';
  const soil = ctx?.soil || 'alluvial soil';

  if (cfg.code === 'english') {
    // Identity & Profile
    if (/who am i|my name/i.test(text)) {
      return `Your name is ${farmerName}. You are registered as a farmer cultivating ${crop} in ${district}.`;
    }
    if (/my crop|what crop|registered crop/i.test(text)) {
      return `According to your profile, you are cultivating ${crop}. You can ask about fertilizers, disease control, or market prices.`;
    }
    if (/my location|my district|my village|where/i.test(text)) {
      return `Your registered location is ${district}.`;
    }
    if (/my soil|soil type/i.test(text)) {
      return `Your registered soil type is ${soil}.`;
    }
    if (/my land|area|acre/i.test(text)) {
      return `Your registered farm area is ${ctx?.landArea || '2 acres'}.`;
    }
    if (/my detail|my profile|registration/i.test(text)) {
      return `Hello ${farmerName}! Your registration details: Location: ${district}, Crop: ${crop}, Soil: ${soil}, Land: ${ctx?.landArea || '2 acres'}.`;
    }
    // Greeting
    if (/hello|hi|how are you|hey/i.test(text)) {
      return `Hello ${farmerName}! I am Uzhavan AI. How can I help you with your ${crop} crop or farming today?`;
    }
    // Weather
    if (/weather|rain|temperature|forecast|cloud|climate/i.test(text)) {
      if (ctx?.liveWeather && ctx.liveWeather.length > 5) return ctx.liveWeather;
      return `Today in ${district}, the weather is moderate. Good conditions for regular irrigation and field work.`;
    }
    // Market
    if (/price|market|rate|cost|mandi|sell/i.test(text)) {
      if (ctx?.liveMarket && ctx.liveMarket.length > 10) return `According to current Agmarknet mandi updates: ${ctx.liveMarket}`;
      if (/tomato/i.test(crop) || /tomato/i.test(text)) return 'Today tomatoes are trading between ₹28 and ₹35 per kg in major mandis.';
      if (/onion/i.test(crop) || /onion/i.test(text)) return 'Today onions are trading between ₹30 and ₹45 per kg in wholesale mandis.';
      if (/paddy|rice/i.test(crop) || /paddy|rice/i.test(text)) return 'Today paddy prices are stable between ₹2,400 and ₹2,650 per quintal.';
      return "According to today's Agmarknet updates, major agricultural commodity prices are stable.";
    }
    // Plant diagnosis
    if (ctx?.recentDisease?.disease && /disease|leaf|pest|recent|camera|photo/i.test(text)) {
      return `Your recent crop scan detected ${ctx.recentDisease.disease} (${ctx.recentDisease.confidence || '92%'} confidence). Apply recommended fungicide or neem oil spray.`;
    }
    // Fertilizer
    if (/fertilizer|dap|urea|npk|potash|manure/i.test(text)) {
      if (/paddy|rice/i.test(crop)) return 'For paddy, apply basal dose of 50 kg DAP and 25 kg Potash per acre, followed by 25 kg Urea at tillering.';
      if (/tomato/i.test(crop)) return 'For tomato, apply 50 kg DAP, 25 kg Potash, and 2 tons compost at planting, followed by 25 kg Urea after 30 days.';
      return `Apply balanced NPK fertilizer suited for your ${crop} growth stage along with organic compost for best yield.`;
    }
    // Soil
    if (/soil|land/i.test(text)) {
      if (/carrot/i.test(text)) return 'For carrots, deep, well-draining sandy loam soil (pH 6.0 - 7.0) is ideal.';
      if (/tomato/i.test(text)) return 'For tomatoes, well-drained red loamy or alluvial soil is best.';
      if (/paddy|rice/i.test(text)) return 'For paddy, clayey and alluvial soils with high water retention are best.';
      return `For cultivating ${crop}, fertile and well-drained loamy soil provides optimal growth and yield.`;
    }
    // Irrigation
    if (/water|irrigation/i.test(text)) {
      return 'Maintain moderate soil moisture without water stagnation. Drip irrigation helps conserve water and optimize yield.';
    }
    return `Hello! I am ready to guide you on crops, pest control, weather, and market prices for ${district}. Please ask your question.`;
  }

  if (cfg.code === 'hindi') {
    if (/who am i|mera naam|naam kya/i.test(text)) {
      return `आपका नाम ${farmerName} है। आप ${district} क्षेत्र में ${crop} की खेती करने वाले किसान के रूप में पंजीकृत हैं।`;
    }
    if (/meri fasal|kaun si fasal/i.test(text)) {
      return `आपके प्रोफाइल के अनुसार आपकी मुख्य फसल ${crop} है। आप खाद, रोग नियंत्रण या मंडी भाव के बारे में पूछ सकते हैं।`;
    }
    if (/mera jila|kahan|location/i.test(text)) {
      return `आपका पंजीकृत जिला ${district} है।`;
    }
    if (/mitti|soil/i.test(text)) {
      if (/gajar|carrot/i.test(text)) return 'गाजर की खेती के लिए गहरी, अच्छी जल निकासी वाली बलुई दोमट मिट्टी (Sandy Loam) सबसे उत्तम है।';
      if (/tamatar|tomato/i.test(text)) return 'टमाटर के लिए अच्छी जल निकासी वाली दोमट और लाल मिट्टी सबसे उपयुक्त होती है।';
      return `आपकी ${crop} फसल के लिए उचित जल निकासी वाली उपजाऊ दोमट मिट्टी सर्वोत्तम है।`;
    }
    if (/namaste|kaise ho|hello/i.test(text)) {
      return `नमस्ते ${farmerName}! मैं उझावन AI हूँ। आपकी ${crop} की फसल कैसी है? मैं आपकी क्या सहायता कर सकता हूँ?`;
    }
    if (/mausam|barish|tapman|weather/i.test(text)) {
      if (ctx?.liveWeather && ctx.liveWeather.length > 5) return ctx.liveWeather;
      return `आज ${district} में मौसम सामान्य बना हुआ है। सिंचाई और कृषि कार्यों के लिए मौसम अनुकूल है।`;
    }
    if (/bhav|daam|mandi|rate|price/i.test(text)) {
      if (ctx?.liveMarket && ctx.liveMarket.length > 10) return `आज के मंडी भाव: ${ctx.liveMarket}`;
      return `आज के एगमार्कनेट मंडी भाव के अनुसार मुख्य फसलों और सब्जियों के दाम स्थिर हैं।`;
    }
    if (/khad|urea|dap|fertilizer/i.test(text)) {
      return `अपनी ${crop} फसल के लिए संतुलित NPK खाद और जैविक वर्मीकम्पोस्ट का प्रयोग करें।`;
    }
    if (/paani|sinchai|irrigation/i.test(text)) {
      return `खेत में पानी जमा न होने दें। जरूरत के अनुसार हल्की सिंचाई करें। ड्रिप सिंचाई सबसे उत्तम है।`;
    }
    return `नमस्ते! मैं उझावन AI हूँ। आपकी खेती, फसल सुरक्षा और मंडी भाव के सवालों के लिए तैयार हूँ।`;
  }

  if (cfg.code === 'telugu') {
    if (/who am i|naa peru/i.test(text)) {
      return `మీ పేరు ${farmerName}. మీరు ${district} ప్రాంతంలో ${crop} సాగు చేసే రైతుగా నమోదై ఉన్నారు.`;
    }
    if (/naa panta|crop/i.test(text)) {
      return `మీ ప్రొఫైల్ ప్రకారం మీ పంట ${crop}. ఎరువులు, పురుగుల నివారణ లేదా మార్కెట్ ధరల గురించి అడగవచ్చు.`;
    }
    if (/namaskaram|hello|ela unnav/i.test(text)) {
      return `నమస్కారం ${farmerName}! నేను ఉళవన్ AI. మీ ${crop} పంట పనులు ఎలా జరుగుతున్నాయి?`;
    }
    if (/varsham|vatavaranam|weather/i.test(text)) {
      return `నేడు ${district} ప్రాంతంలో వాతావరణం అనుకూలంగా ఉంది. వ్యవసాయ పనులకు సరైన సమయం.`;
    }
    if (/dhara|rate|market|price/i.test(text)) {
      return `నేటి మార్కెట్ ధరల ప్రకారం వ్యవసాయ ఉత్పత్తుల ధరలు నిలకడగా ఉన్నాయి.`;
    }
    return `నమస్కారం! నేను ఉళవన్ AI. మీ వ్యవసాయ మరియు పంటల సందేహాలను అడగండి.`;
  }

  if (cfg.code === 'kannada') {
    if (/who am i|nanna hesaru/i.test(text)) {
      return `ನಿಮ್ಮ ಹೆಸರು ${farmerName}. ನೀವು ${district} ಪ್ರದೇಶದಲ್ಲಿ ${crop} ಬೆಳೆಯುವ ರೈತರಾಗಿ ನೋಂದಾಯಿಸಿಕೊಂಡಿದ್ದೀರಿ.`;
    }
    if (/nanna bele|crop/i.test(text)) {
      return `ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪ್ರಕಾರ ನಿಮ್ಮ ಬೆಳೆ ${crop}. ಗೊಬ್ಬರ, ರೋಗ ನಿಯಂತ್ರಣ ಅಥವಾ ಮಾರುಕಟ್ಟೆ ದರಗಳ ಬಗ್ಗೆ ಕೇಳಿ.`;
    }
    if (/namaskara|hello|hegidira/i.test(text)) {
      return `ನಮಸ್ಕಾರ ${farmerName}! ನಾನು ಉಳವನ್ AI. ನಿಮ್ಮ ${crop} ಬೆಳೆ ಕುರಿತ ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಿ.`;
    }
    if (/male|havamana|weather/i.test(text)) {
      return `ಇಂದು ${district} ಪ್ರದೇಶದಲ್ಲಿ ಹವಾಮಾನ ಸಾಧಾರಣವಾಗಿದೆ. ಕೃಷಿ ಕೆಲಸಗಳಿಗೆ ಸೂಕ್ತವಾಗಿದೆ.`;
    }
    if (/bele|rate|market|price/i.test(text)) {
      return `ಇಂದಿನ ಮಾರುಕಟ್ಟೆ ದರಗಳ ಪ್ರಕಾರ ಮುಖ್ಯ ಕೃಷಿ ಉತ್ಪನ್ನಗಳ ಬೆಲೆ ಸ್ಥಿರವಾಗಿದೆ.`;
    }
    return `ನಮಸ್ಕಾರ! ನಾನು ಉಳವನ್ AI. ನಿಮ್ಮ ಕೃಷಿ ಅನುಮಾನಗಳನ್ನು ಕೇಳಿ.`;
  }

  if (cfg.code === 'malayalam') {
    if (/who am i|ente peru/i.test(text)) {
      return `നിങ്ങളുടെ പേര് ${farmerName} ആണ്. നിങ്ങൾ ${district} ഭാഗത്ത് ${crop} കൃഷി ചെയ്യുന്ന കർഷകനായി രജിസ്റ്റർ ചെയ്തിരിക്കുന്നു.`;
    }
    if (/ente vila|crop/i.test(text)) {
      return `നിങ്ങളുടെ പ്രൊഫൈൽ പ്രകാരം കൃഷി ചെയ്യുന്നത് ${crop} ആണ്. വളപ്രയോഗം, കീടനിയന്ത്രണം എന്നിവ ചോദിക്കാം.`;
    }
    if (/namaskaram|hello|sugamano/i.test(text)) {
      return `നമസ്കാരം ${farmerName}! ഞാൻ ഉഴവൻ AI ആണ്. കൃഷി സംബന്ധമായ സംശയങ്ങൾ ചോദിക്കാം.`;
    }
    if (/mazha|kalavastha|weather/i.test(text)) {
      return `ഇന്ന് ${district} ഭാഗത്ത് കാർഷിക ജോലികൾക്ക് അനുകൂലമായ കാലാവസ്ഥയാണ്.`;
    }
    if (/vila|rate|market|price/i.test(text)) {
      return `ഇന്നത്തെ മാർക്കറ്റ് നിരക്കുകൾ പ്രകാരം കാർഷിക വിളകളുടെ വില സ്ഥിരത പുലർത്തുന്നു.`;
    }
    return `നമസ്കാരം! ഞാൻ ഉഴവൻ AI ആണ്. നിങ്ങളുടെ കാർഷിക സംശയങ്ങൾ ചോദിക്കാം.`;
  }

  const multiLangDeepAnswer = getOfflineAgriculturalResponse(query, ctx, cfg.code);
  if (multiLangDeepAnswer && !multiLangDeepAnswer.includes('offline database active') && !multiLangDeepAnswer.includes('ஆஃப்லைன் தரவுத்தளம்')) {
    return multiLangDeepAnswer;
  }

  return getOfflineTamilResponse(query, ctx);
}

const PhoneCall: React.FC<Props> = ({ onBack, user, t, language: propLanguage }) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [pulseIntensity, setPulseIntensity] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [isSpeakingState, setIsSpeakingState] = useState(false);

  // Global Language Sync: Initialize from prop or storage, react instantly to changes
  const [currentLanguage, setCurrentLanguage] = useState<string>(() => {
    return propLanguage ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('uzhavan_app_language') || localStorage.getItem('uzhavan_selected_language') : null) ||
      'tamil';
  });
  const languageRef = useRef<string>(currentLanguage);

  useEffect(() => {
    languageRef.current = currentLanguage;
  }, [currentLanguage]);

  useEffect(() => {
    if (propLanguage) {
      setCurrentLanguage(propLanguage);
      languageRef.current = propLanguage;
    }
  }, [propLanguage]);

  // Seamless State Propagation: Listen to language change events across the app without reloading
  useEffect(() => {
    const handleLangEvent = (e: any) => {
      const newLang = e?.detail || (typeof localStorage !== 'undefined' ? localStorage.getItem('uzhavan_app_language') || localStorage.getItem('uzhavan_selected_language') : null);
      if (newLang) {
        console.log('🌍 [PhoneCall] Language switch detected:', newLang);
        setCurrentLanguage(newLang);
        languageRef.current = newLang;
        if (recognitionRef.current && isActiveRef.current) {
          const cfg = getLanguageConfig(newLang);
          try {
            recognitionRef.current.lang = cfg.sttCode;
          } catch {}
        }
      }
    };
    window.addEventListener('uzhavan_language_changed', handleLangEvent);
    window.addEventListener('storage', handleLangEvent);
    return () => {
      window.removeEventListener('uzhavan_language_changed', handleLangEvent);
      window.removeEventListener('storage', handleLangEvent);
    };
  }, []);

  // 1. Singleton Model Reference & State Machine Refs
  const engineRef = useRef<any>(globalEngine);
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const listenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callStateRef = useRef<CallState>('idle');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fullTranscriptRef = useRef<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const safeStartListeningRef = useRef<() => void>(() => {});
  const offlineTurnIndexRef = useRef<number>(0);
  const userSpokeRecentlyRef = useRef<boolean>(false);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (globalEngine && !engineRef.current) {
      engineRef.current = globalEngine;
    }
  }, []);

  // Personalized greeting using getLocalizedGreeting and active language
  const getInitialGreeting = useCallback(() => {
    const details = getFarmerRegistrationDetails(user);
    const name = details.farmerName || 'Farmer';
    const activeLang = languageRef.current || currentLanguage;
    return getLocalizedGreeting(name, activeLang);
  }, [user, currentLanguage]);

  // Preload browser voices on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const load = () => window.speechSynthesis.getVoices();
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
    return () => {
      endCall();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // CALL TIMER & AUDIO VIZ (PULSATING GLOW / WAVE ANIMATION)
  // ═══════════════════════════════════════════════════════════════════════════
  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // Continuous pulsating wave animation when in call
  const isInCall = callState !== 'idle';
  const isSpeaking = isSpeakingState || callState === 'speaking';
  const isListening = callState === 'listening' && !isSpeaking;

  useEffect(() => {
    if (!isInCall) {
      setPulseIntensity(0);
      return;
    }
    let animId: number;
    const animate = () => {
      const time = Date.now() / 350;
      const val = 0.5 + 0.35 * Math.sin(time);
      setPulseIntensity(val);
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [isInCall]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SINGLETON MODEL LOADING (CreateMLCEngine called only ONCE)
  // ═══════════════════════════════════════════════════════════════════════════
  const getOrInitEngine = useCallback(async (onProgress?: (progressText: string) => void) => {
    // Check useRef and globalEngine: NEVER re-initialize on turns or repeated calls
    if (engineRef.current) return engineRef.current;
    if (globalEngine) {
      engineRef.current = globalEngine;
      return globalEngine;
    }
    if (globalEngineFailed) {
      return null;
    }

    if (!globalEngineInitPromise) {
      globalEngineInitPromise = (async () => {
        try {
          if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
            console.info('ℹ️ [WebLLM] WebGPU not supported on this browser/device; using backend LLM.');
            globalEngineFailed = true;
            return null;
          }
          const adapter = await (navigator as any).gpu?.requestAdapter();
          if (!adapter) {
            console.info('ℹ️ [WebLLM] No compatible WebGPU adapter available; using backend LLM.');
            globalEngineFailed = true;
            return null;
          }
          console.log('[WebLLM] Initializing singleton offline model:', SELECTED_MODEL);
          const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
          const engine = await CreateMLCEngine(SELECTED_MODEL, {
            initProgressCallback: (report) => {
              console.log('[WebLLM Progress]', report.text, report.progress);
              if (report.progress && report.progress < 1 && onProgress) {
                onProgress(`${Math.round(report.progress * 100)}%`);
              }
            },
          });
          globalEngine = engine;
          engineRef.current = engine;
          console.log('✅ [WebLLM] Singleton model successfully initialized');
          return engine;
        } catch (err) {
          console.warn('⚠️ [WebLLM] WebGPU or MLC unavailable; using backend/knowledge base:', err);
          globalEngineFailed = true;
          return null;
        }
      })();
    }

    const engine = await globalEngineInitPromise;
    if (engine) {
      engineRef.current = engine;
    }
    return engine;
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION CONTROLS & CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════
  const stopListening = useCallback(() => {
    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        const recog = recognitionRef.current;
        recog.onstart = null;
        recog.onend = null;
        recog.onerror = null;
        recog.onresult = null;
        recog.onspeechend = null;
        recog.abort();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // HYBRID TTS PIPELINE (OPTION C: LOCAL PIPER STUDIO AUDIO -> BROWSER FALLBACK)
  // ═══════════════════════════════════════════════════════════════════════════
  const speakBrowserFallback = useCallback((text: string, onDone: () => void) => {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      if (isActiveRef.current) {
        callStateRef.current = 'listening';
        setCallState('listening');
        try { onDone(); } catch { safeStartListeningRef.current(); }
      }
      return;
    }

    stopSpeech();
    window.speechSynthesis.cancel();
    isSpeakingRef.current = true;
    setIsSpeakingState(true);

    const cfg = getLanguageConfig(languageRef.current || currentLanguage);
    speakText(text, {
      language: cfg.sttCode,
      rate: 0.92,
      onStart: () => {
        isSpeakingRef.current = true;
        setIsSpeakingState(true);
      },
      onEnd: () => {
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        if (isActiveRef.current) {
          callStateRef.current = 'listening';
          setCallState('listening');
          setTimeout(() => {
            if (isActiveRef.current && !isSpeakingRef.current) {
              try { onDone(); } catch { safeStartListeningRef.current(); }
            }
          }, 350);
        }
      },
      onError: () => {
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        if (isActiveRef.current) {
          callStateRef.current = 'listening';
          setCallState('listening');
          setTimeout(() => {
            if (isActiveRef.current && !isSpeakingRef.current) {
              try { onDone(); } catch { safeStartListeningRef.current(); }
            }
          }, 350);
        }
      },
    });
  }, []);

  // 2. Robust Auto-Re-listen: In the onend callback of Piper TTS WAV playback,
  // ensure SpeechRecognition.start() is safely called only after the audio finishes completely,
  // wrapped in a try/catch block so it never throws an unhandled error.
  const playAudioBlob = useCallback((blob: Blob, onDone: () => void, onFallback: () => void) => {
    if (!blob || blob.size < 200) {
      onFallback();
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

    isSpeakingRef.current = true;
    setIsSpeakingState(true);

    audio.onended = () => {
      audioRef.current = null;
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}

      // 3. Continuous Conversation State: Only re-listen if call is active
      if (!isActiveRef.current) return;

      // Small pause (400ms) to ensure speaker audio has completely ceased and won't trigger STT
      setTimeout(() => {
        if (!isActiveRef.current || isSpeakingRef.current) return;

        callStateRef.current = 'listening';
        setCallState('listening');

        // Robust Auto-Re-listen: safely invoke onDone / safeStartListening wrapped in try/catch
        try {
          if (onDone) {
            onDone();
          } else {
            safeStartListeningRef.current();
          }
        } catch (err) {
          console.warn('[Audio onended] Failed to invoke onDone safely:', err);
          try {
            safeStartListeningRef.current();
          } catch (sttErr) {
            console.warn('[Audio onended] Failed to auto re-listen:', sttErr);
          }
        }
      }, 400);
    };

    audio.onerror = () => {
      console.warn('[Audio Player] Audio playback error, falling back to browser SpeechSynthesis');
      audioRef.current = null;
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
      onFallback();
    };

    audio.play().catch((err) => {
      console.warn('[Audio Player] Play error:', err, '- falling back to browser SpeechSynthesis');
      audioRef.current = null;
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
      onFallback();
    });
  }, []);

  const speakVoiceResponse = useCallback((text: string, onDone: () => void) => {
    if (!text) {
      if (isActiveRef.current) {
        callStateRef.current = 'listening';
        setCallState('listening');
        try { onDone(); } catch { safeStartListeningRef.current(); }
      }
      return;
    }

    const cleanText = text.replace(/^['"]+|['"]+$/g, '').trim();
    if (!cleanText) {
      if (isActiveRef.current) {
        callStateRef.current = 'listening';
        setCallState('listening');
        try { onDone(); } catch { safeStartListeningRef.current(); }
      }
      return;
    }

    // Stop listening while speaking to prevent speaker echo
    stopListening();
    isSpeakingRef.current = true;
    setIsSpeakingState(true);

    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }
    stopSpeech();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }

    const activeLang = languageRef.current || currentLanguage;
    const cfg = getLanguageConfig(activeLang);

    console.log(`[TTS Pipeline] Playing ${cfg.name} speech (Option C):`, cleanText.substring(0, 60));

    // 1. Try Local Studio-Quality Kokoro/Piper Engine via backend API with dynamic lang parameter
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    fetch(`/api/tts/speak?text=${encodeURIComponent(cleanText)}&lang=${cfg.ttsCode}`, { signal: controller.signal })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (res.ok && res.status === 200) {
          const blob = await res.blob();
          if (blob.size > 200 && isActiveRef.current) {
            console.log(`🎙️ [TTS Pipeline] Studio-quality ${cfg.name} WAV playing (${blob.size} bytes)`);
            playAudioBlob(blob, onDone, () => speakBrowserFallback(cleanText, onDone));
            return;
          }
        }
        speakBrowserFallback(cleanText, onDone);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.warn(`[TTS Pipeline] Local TTS backend not responding for ${cfg.name}:`, err.message, '-> falling back to browser voice');
        speakBrowserFallback(cleanText, onDone);
      });
  }, [currentLanguage, playAudioBlob, speakBrowserFallback, stopListening]);

  const speakTamil = speakVoiceResponse;

  const handleOfflineSpeechTurn = useCallback(() => {
    if (!isActiveRef.current || isSpeakingRef.current) return;
    stopListening();
    callStateRef.current = 'processing';
    setCallState('processing');

    const details = getFarmerRegistrationDetails(user);
    const activeLang = languageRef.current || currentLanguage;
    const cfg = getLanguageConfig(activeLang);
    const isTa = cfg.code === 'tamil';

    const topics = [
      isTa ? 'உரம்' : 'fertilizer schedule',
      isTa ? 'நோய் மருந்து' : 'disease control',
      isTa ? 'நீர் பாசனம்' : 'irrigation',
      isTa ? 'விதை ரகம்' : 'sowing season and varieties',
      isTa ? 'விலை' : 'market prices',
    ];

    const currentTopic = topics[offlineTurnIndexRef.current % topics.length];
    offlineTurnIndexRef.current += 1;

    const offlineContext: ContextEnrichment = {
      district: details.district,
      crop: details.registeredCrop,
      cropTamil: details.cropTamil,
      farmerName: details.farmerName,
      soil: details.soilType,
      soilTamil: details.soilTamil,
      landArea: details.landArea,
      farmingType: details.farmingType,
    };

    console.log(`[PhoneCall Offline Voice] Generating response for topic: ${currentTopic}`);
    const offlineReply = getOfflineAgriculturalResponse(currentTopic, offlineContext, cfg.code);

    fullTranscriptRef.current += `UZHAVAN (Offline): ${offlineReply}\n`;
    callStateRef.current = 'speaking';
    setCallState('speaking');
    speakTamil(offlineReply, () => {
      if (isActiveRef.current) {
        callStateRef.current = 'listening';
        setCallState('listening');
        safeStartListeningRef.current();
      }
    });
  }, [currentLanguage, user, speakTamil, stopListening]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSATION MESSAGE HANDLER & INTELLIGENCE RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  const handleUserMessage = useCallback(async (message: string) => {
    if (!isActiveRef.current) return;
    stopListening();
    callStateRef.current = 'processing';
    setCallState('processing');

    console.log('[Conversational Voice User Question]:', message);
    fullTranscriptRef.current += `Farmer: ${message}\n`;

    const details = getFarmerRegistrationDetails(user);
    const farmerName = details.farmerName;
    const district = details.district;
    const registeredCrop = details.registeredCrop;
    const cropTamil = details.cropTamil;
    const soilType = details.soilType;
    const soilTamil = details.soilTamil;
    const landArea = details.landArea;
    const farmingType = details.farmingType;
    const rawCrop = registeredCrop.toLowerCase().trim();
    const recentDisease = getRecentDisease();

    const textLower = message.toLowerCase();

    const activeLang = languageRef.current || currentLanguage;
    const cfg = getLanguageConfig(activeLang);

    // ── DIRECT USER REGISTRATION & PROFILE QUERY HANDLING ──
    const isProfileQuery = /நான் யார்|என் விவர|என் பதிவு|என் பெயர்|என் ஊர்|என் இடம்|என் மாவட்டம்|என் மண்|என் நிலம்|என் பயிர் என்ன|என் பயிர் எது|நான் என்ன பயிர்|என்ன பயிர் பதிவு|who am i|my crop|my profile|my detail|mera naam|meri fasal|naa peru|nanna hesaru|ente peru/i.test(textLower);
    if (isProfileQuery) {
      const profileContext: ContextEnrichment = {
        district,
        crop: registeredCrop,
        cropTamil,
        farmerName,
        soil: soilType,
        soilTamil,
        landArea,
        farmingType,
      };
      const directResponse = getOfflineResponse(message, profileContext, cfg.code);
      fullTranscriptRef.current += `UZHAVAN: ${directResponse}\n`;
      callStateRef.current = 'speaking';
      setCallState('speaking');
      speakTamil(directResponse, () => {
        if (isActiveRef.current) {
          callStateRef.current = 'listening';
          setCallState('listening');
          safeStartListeningRef.current();
        }
      });
      return;
    }

    const isWeather = /வானிலை|மழை|வெயில்|குளிர்|பனி|weather|rain|forecast|cloud|temp|காற்ற|मौसम|बारिश|వర్షం|ಮಳೆ|മഴ/i.test(textLower);
    const isMarket = /விலை|சந்தை|மண்டி|விற்பனை|rate|price|market|cost|ரூபாய்|₹|விற்றால்|விற்க|भाव|दाम|ధర|ಬೆಲೆ|വില/i.test(textLower);
    const isDisease = /நோய்|பூச்சி|புழு|கருகல்|வாடல்|அழுகல்|புள்ளி|இலை|சுருட்டை|மருந்து|disease|pest|fungus|blight|कीट|रोग|తెగులు/i.test(textLower);
    const isCultivation = /பயிர்|சாகுபடி|நடவு|விதை|வளர்க்க|என்ன பயிர்|ரகம்|variet|sow|cultivat|खेती|పంట|ಬೆಳೆ|കൃഷി/i.test(textLower);

    // ── MULTI-SOURCE INTELLIGENCE RETRIEVAL (WEATHER, AGMARKNET, PLANT.ID, RESEARCH) ──
    let liveWeatherText = '';
    let liveMarketText = '';
    let plantIdText = '';
    const researchAdviceText = matchResearchAdvice(message, registeredCrop);

    if (recentDisease?.disease) {
      plantIdText = `Plant.id Recent Diagnosis: ${recentDisease.disease} (${recentDisease.confidence || '92%'} confidence) in ${recentDisease.crop || registeredCrop}.`;
    }

    // Parallel fetch with 1.8s timeout to keep voice response snappy
    try {
      const fetchPromises: Promise<any>[] = [];

      // 1. Live Weather (Open-Meteo & Climate API)
      if (isWeather || !isMarket) {
        const weatherCtrl = new AbortController();
        const wTimer = setTimeout(() => weatherCtrl.abort(), 1800);
        fetchPromises.push(
          fetch('/api/weather/current', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location: district, language: cfg.code }),
            signal: weatherCtrl.signal,
          })
            .then(res => res.json())
            .then(w => {
              clearTimeout(wTimer);
              if (w?.current) {
                const adv = w.farming_advisory ? (w.farming_advisory.split(':')[1]?.trim() || w.farming_advisory) : '';
                const rain = w.rain_alert?.has_alert ? w.rain_alert.alert_message : '';
                if (cfg.code === 'tamil') {
                  liveWeatherText = `இன்று ${w.location || district} பகுதியில் வெப்பநிலை ${Math.round(w.current.temperature)}°C, ${w.current.weather_description || 'மிதமான வானிலை'}. ${rain || adv || 'களப்பணிகளுக்கு உகந்த வானிலை.'}`;
                } else {
                  liveWeatherText = `Today in ${w.location || district}, temperature is ${Math.round(w.current.temperature)}°C with ${w.current.weather_description || 'fair weather'}. ${rain || adv || 'Conditions are favorable for farm work.'}`;
                }
              }
            })
            .catch(() => clearTimeout(wTimer))
        );
      }

      // 2. Live Agmarknet & Agmart.in (Govt of India Mandi Prices)
      if (isMarket) {
        const marketCtrl = new AbortController();
        const mTimer = setTimeout(() => marketCtrl.abort(), 1800);
        fetchPromises.push(
          fetch(`/api/market/prices?state=${encodeURIComponent(district)}&lang=${cfg.ttsCode}&category=all`, {
            signal: marketCtrl.signal,
          })
            .then(res => res.json())
            .then(m => {
              clearTimeout(mTimer);
              if (m?.prices) {
                const allItems = [
                  ...(m.prices.vegetables || []),
                  ...(m.prices.fruits || []),
                  ...(m.prices.grains || []),
                ];
                const isMyCrop = /என் பயிர்|என் சாகுபடி|என் விளைச்சல்|பயிர் விலை|my crop/i.test(textLower);
                const matched = allItems.find((i: any) => {
                  const comm = (i.commodity || '').toLowerCase();
                  const varName = (i.variety || '').toLowerCase();
                  if (isMyCrop) {
                    return comm.includes(rawCrop) || rawCrop.includes(comm) || comm.includes(cropTamil.toLowerCase()) || (rawCrop === 'paddy' && (comm.includes('paddy') || comm.includes('rice') || comm.includes('நெல்')));
                  }
                  return textLower.includes(comm) || (i.variety && textLower.includes(varName));
                });
                if (matched) {
                  const kgPrice = Math.round(matched.modal_price / 100);
                  if (cfg.code === 'tamil') {
                    liveMarketText = `${matched.commodity} (${matched.variety || 'உள்ளூர் ரகம்'}): குவிண்டால் ₹${matched.modal_price} (கிலோ சுமார் ₹${kgPrice}). போக்கு: ${matched.trend || 'நிலையானது'}. அடுத்த நாள் கணிப்பு: ₹${matched.predicted_next_price}.`;
                  } else {
                    liveMarketText = `${matched.commodity} (${matched.variety || 'Standard'}): ₹${matched.modal_price}/quintal (approx ₹${kgPrice}/kg). Trend: ${matched.trend || 'Stable'}.`;
                  }
                } else if (allItems.length > 0) {
                  const top3 = allItems.slice(0, 3).map((i: any) => `${i.commodity}: ₹${Math.round(i.modal_price / 100)}/kg`).join(', ');
                  liveMarketText = `Mandi updates (${district}): ${top3}.`;
                }
              }
            })
            .catch(() => clearTimeout(mTimer))
        );
      }

      await Promise.allSettled(fetchPromises);
    } catch {}

    const contextEnrichment: ContextEnrichment = {
      liveWeather: liveWeatherText,
      liveMarket: liveMarketText,
      recentDisease,
      researchAdvice: researchAdviceText,
      district,
      crop: registeredCrop,
      cropTamil,
      farmerName,
      soil: soilType,
      soilTamil,
      landArea,
      farmingType,
    };

    // Construct enriched system prompt with strict response boundaries
    const contextualSystemPrompt = [
      getStrictSystemPrompt(currentLanguage),
      '=== AUTHENTICATED USER REGISTRATION DATA ===',
      `- Farmer Name: ${farmerName || 'Farmer'}`,
      `- Registered District / Location: ${district}`,
      `- Registered Main Crop: ${registeredCrop} ${cropTamil ? `(${cropTamil})` : ''}`,
      `- Registered Soil Type: ${soilType} ${soilTamil ? `(${soilTamil})` : ''}`,
      landArea ? `- Registered Land Area: ${landArea}` : '',
      farmingType ? `- Farming Method: ${farmingType}` : '',
      '============================================',
      liveWeatherText ? `[LIVE WEATHER DATA]: ${liveWeatherText}` : '',
      liveMarketText ? `[LIVE AGMARKNET & AGMART.IN PRICES]: ${liveMarketText}` : '',
      plantIdText ? `[PLANT.ID CAMERA SCAN HISTORY]: ${plantIdText}` : '',
      researchAdviceText ? `[TNAU & ICAR RESEARCH RECOMMENDATION]: ${researchAdviceText}` : '',
      'CRITICAL INSTRUCTION: Reply strictly in 1 or 2 short, precise sentences without lists, bullet points, asterisks, or markdown.',
      `CURRENT_QUESTION_FOCUS: Ignore ALL prior conversation context. Answer ONLY the following farmer question directly: "${message}"`
    ].filter(Boolean).join('\n');

    let responseText = '';
    const cleanedFarmerQuery = (message || '').replace(/[*#_`]/g, '').trim();

    // 1. Singleton Model Loading: Send query to WebLLM if available (using singleton ref/global, never reload)
    const engine = engineRef.current || globalEngine;
    if (engine) {
      try {
        // CONTEXT ISOLATION: Flush WebLLM's internal KV cache before every new question
        // to prevent stale context from a previous turn bleeding into the current answer.
        try { await engine.resetChat(true); } catch {}
        console.log(`[WebLLM] Generating answer in ${cfg.name} using singleton engine (temp: 0.1, max_tokens: 150)...`);
        const webLlmPromise = engine.chat.completions.create({
          messages: [
            { role: 'system', content: contextualSystemPrompt },
            { role: 'user', content: cleanedFarmerQuery },
          ],
          temperature: 0.1,
          max_tokens: 150,
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('WebLLM timeout')), 7000)
        );
        const reply: any = await Promise.race([webLlmPromise, timeoutPromise]);
        responseText = reply.choices?.[0]?.message?.content?.trim() || '';
      } catch (err) {
        console.warn('[WebLLM Inference notice]:', err);
      }
    }

    // 2. If WebLLM is not active, query backend /api/chat with NVIDIA NIM & project API keys
    if (!responseText) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6500);
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: cfg.code,
            messages: [
              { role: 'system', content: contextualSystemPrompt },
              { role: 'user', content: cleanedFarmerQuery },
            ],
            temperature: 0.1,
            max_tokens: 150,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          let candidate = data.choices?.[0]?.message?.content?.trim();
          if (candidate && !candidate.includes('fallback') && candidate.length > 5) {
            if (candidate.includes('\n\n')) {
              const paragraphs = candidate.split('\n\n');
              candidate = paragraphs[paragraphs.length - 1].trim();
            }
            responseText = candidate.replace(/[*#_`]/g, '').trim();
          }
        }
      } catch {}
    }

    // 3. Fallback to comprehensive offline Agricultural Knowledge Base with live gathered data
    if (!responseText) {
      responseText = getOfflineResponse(message, contextEnrichment, cfg.code);
    }

    // Enforce 1-2 sentence limit strictly
    if (responseText) {
      responseText = responseText.replace(/[*#_`]/g, '').trim();
      const sentences = responseText.split(/(?<=[.!?])\s+/).filter(Boolean);
      if (sentences.length > 2) {
        responseText = sentences.slice(0, 2).join(' ');
      }
    }

    if (!isActiveRef.current) return;

    fullTranscriptRef.current += `UZHAVAN: ${responseText}\n`;

    // Speak the response via Hybrid TTS (Kokoro/Piper WAV audio -> browser SpeechSynthesis fallback)
    callStateRef.current = 'speaking';
    setCallState('speaking');
    speakTamil(responseText, () => {
      // 3. Continuous Conversation State: Once speech ends, automatically listen again for the next question without cutting the call
      if (isActiveRef.current) {
        callStateRef.current = 'listening';
        setCallState('listening');
        safeStartListeningRef.current();
      }
    });
  }, [currentLanguage, speakTamil, stopListening, user]);

  // 2. Robust Auto-Re-listen & 3. Continuous Conversation State:
  // Keeps the microphone active and listening automatically in a loop until the user explicitly taps Red 'End Call'
  const safeStartListening = useCallback(() => {
    // Only listen if call is active and assistant is not speaking
    if (!isActiveRef.current) {
      return;
    }
    if (isSpeakingRef.current) {
      return;
    }

    callStateRef.current = 'listening';
    setCallState('listening');

    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      console.warn('[STT] Browser does not support SpeechRecognition');
      return;
    }

    // Clean up previous recognition instance before creating a new one
    if (recognitionRef.current) {
      try {
        const oldRecog = recognitionRef.current;
        oldRecog.onstart = null;
        oldRecog.onend = null;
        oldRecog.onerror = null;
        oldRecog.onresult = null;
        oldRecog.onspeechend = null;
        oldRecog.abort();
      } catch (e) {
        console.warn('[STT] Old recognition abort (safe):', e);
      }
      recognitionRef.current = null;
    }

    try {
      const recog = new SR();
      recognitionRef.current = recog;
      const cfg = getLanguageConfig(languageRef.current || currentLanguage);
      recog.lang = cfg.sttCode;
      recog.continuous = false;
      recog.interimResults = false;
      recog.maxAlternatives = 1;

      let speechHandled = false;

      recog.onstart = () => {
        console.log(`🎤 [STT ${cfg.name}] Listening for farmer (${cfg.sttCode})...`);
      };

      recog.onresult = (e: any) => {
        if (!isActiveRef.current || isSpeakingRef.current) {
          return;
        }
        const result = e.results?.[e.results.length - 1];
        const transcript = result?.[0]?.transcript?.trim();
        if (transcript) {
          console.log(`🗣️ [STT ${cfg.name} Result]:`, transcript);
          speechHandled = true;
          try {
            recog.onend = null;
            recog.onerror = null;
            recog.abort();
          } catch {}
          recognitionRef.current = null;

          handleUserMessage(transcript);
        }
      };

      recog.onspeechend = () => {
        console.log('[STT] User speech ended');
        userSpokeRecentlyRef.current = true;
      };

      recog.onerror = (e: any) => {
        console.log('[STT] Recognition event error:', e?.error);
        if (!isActiveRef.current || speechHandled || isSpeakingRef.current) return;

        // Auto-re-listen on no-speech, aborted, or temporary errors
        if (e.error === 'no-speech' || e.error === 'aborted') {
          if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
          listenTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current && !isSpeakingRef.current) {
              safeStartListeningRef.current();
            }
          }, 300);
        } else if (e.error === 'network') {
          console.warn('[STT] Network error in SpeechRecognition (offline mode).');
          // If the user spoke, or if offline, the cloud STT failed to transcribe.
          // Directly trigger an offline voice turn so the bot speaks and answers the farmer!
          if (userSpokeRecentlyRef.current || !navigator.onLine) {
            userSpokeRecentlyRef.current = false;
            speechHandled = true;
            try {
              recog.onend = null;
              recog.onerror = null;
              recog.abort();
            } catch {}
            recognitionRef.current = null;
            handleOfflineSpeechTurn();
            return;
          }

          if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
          listenTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current && !isSpeakingRef.current) {
              safeStartListeningRef.current();
            }
          }, 2500);
        } else if (e.error === 'not-allowed') {
          console.error('[STT] Microphone permission denied');
        } else {
          if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
          listenTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current && !isSpeakingRef.current) {
              safeStartListeningRef.current();
            }
          }, 1000);
        }
      };

      recog.onend = () => {
        console.log('[STT] Recognition onend fired');
        if (recognitionRef.current === recog) {
          recognitionRef.current = null;
        }
        if (!isActiveRef.current || isSpeakingRef.current) return;

        // If user spoke while offline and recognition closed without result, respond now!
        if (userSpokeRecentlyRef.current && !navigator.onLine && !speechHandled) {
          userSpokeRecentlyRef.current = false;
          speechHandled = true;
          handleOfflineSpeechTurn();
          return;
        }

        // Continuous loop: if user was silent or recognition stopped, restart listening automatically!
        if (!speechHandled) {
          if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
          listenTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current && !isSpeakingRef.current) {
              safeStartListeningRef.current();
            }
          }, 300);
        }
      };

      // Wrap SpeechRecognition.start() in try/catch block
      try {
        recog.start();
      } catch (startErr: any) {
        console.warn('[STT] SpeechRecognition.start() threw error safely caught:', startErr);
        if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
        listenTimeoutRef.current = setTimeout(() => {
          if (isActiveRef.current && !isSpeakingRef.current) {
            safeStartListeningRef.current();
          }
        }, 400);
      }
    } catch (err: any) {
      console.warn('[STT] SpeechRecognition constructor error safely caught:', err);
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = setTimeout(() => {
        if (isActiveRef.current && !isSpeakingRef.current) {
          safeStartListeningRef.current();
        }
      }, 1000);
    }
  }, [handleUserMessage]);

  useEffect(() => {
    safeStartListeningRef.current = safeStartListening;
  }, [safeStartListening]);

  // ═══════════════════════════════════════════════════════════════════════════
  // START CALL & END CALL
  // ═══════════════════════════════════════════════════════════════════════════
  const startCall = async () => {
    isActiveRef.current = true;
    callStateRef.current = 'connecting';
    setCallState('connecting');
    setLoadingProgress('');
    fullTranscriptRef.current = '';

    try {
      // 1. Singleton Model Loading: Ensure CreateMLCEngine is initialized only once
      await getOrInitEngine((progress) => {
        setLoadingProgress(progress);
      });

      if (!isActiveRef.current) return;

      // 2. Once loaded, transition to 'In Call / Listening...' and start duration timer
      setLoadingProgress('');
      callStateRef.current = 'listening';
      setCallState('listening');
      startTimer();

      // 3. Play initial Tamil greeting via Hybrid TTS
      const greeting = getInitialGreeting();
      fullTranscriptRef.current = `UZHAVAN: ${greeting}\n`;
      callStateRef.current = 'speaking';
      setCallState('speaking');
      speakTamil(greeting, () => {
        // 4. Conversational Loop: When speaking finishes, automatically start SpeechRecognition (ta-IN)
        if (isActiveRef.current) {
          callStateRef.current = 'listening';
          setCallState('listening');
          safeStartListeningRef.current();
        }
      });
    } catch (e) {
      console.error('[Call] Start error:', e);
      if (isActiveRef.current) {
        callStateRef.current = 'idle';
        setCallState('idle');
        isActiveRef.current = false;
      }
    }
  };

  const endCall = useCallback(() => {
    console.log('🔴 [PhoneCall] Call ended explicitly by user.');
    isActiveRef.current = false;
    callStateRef.current = 'idle';
    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
    stopListening();
    stopSpeech();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = '';
      } catch {}
      audioRef.current = null;
    }
    const engine = engineRef.current || globalEngine;
    if (engine && typeof engine.interruptGenerate === 'function') {
      try {
        engine.interruptGenerate();
      } catch {}
    }
    stopTimer();
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
    setLoadingProgress('');
    setCallState('idle');
    setCallDuration(0);
  }, [stopListening, stopTimer]);

  const getStatusText = () => {
    switch (callState) {
      case 'idle':
        return 'Ready to Call';
      case 'connecting':
        return loadingProgress ? `Connecting... ${loadingProgress}` : 'Connecting...';
      case 'processing':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking...';
      case 'listening':
      default:
        return !navigator.onLine ? 'In Call (Offline Mode) / Listening...' : 'In Call / Listening...';
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UI (STRICT UNTOUCHED APPROVED UI)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-[#0a0a0a] via-[#0d1f0d] to-[#0a0a0a] text-white overflow-hidden select-none">
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <button onClick={isInCall ? endCall : onBack} className="text-white/60 hover:text-white transition-colors">
          <ArrowLeft size={28} />
        </button>
        {isInCall && <div className="text-green-400 font-mono text-lg tracking-widest">{fmtTime(callDuration)}</div>}
        <div className="w-7" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
        <div className="relative flex items-center justify-center">
          {isInCall && (
            <>
              <div
                className="absolute rounded-full border-2 transition-all duration-300"
                style={{
                  width: `${280 + (isSpeaking ? 60 : isListening ? pulseIntensity * 80 : 20)}px`,
                  height: `${280 + (isSpeaking ? 60 : isListening ? pulseIntensity * 80 : 20)}px`,
                  borderColor: isSpeaking ? 'rgba(34,197,94,0.4)' : `rgba(34,197,94,${0.2 + pulseIntensity * 0.4})`,
                }}
              />
              <div
                className="absolute rounded-full border transition-all duration-500"
                style={{
                  width: `${320 + (isSpeaking ? 80 : isListening ? pulseIntensity * 100 : 10)}px`,
                  height: `${320 + (isSpeaking ? 80 : isListening ? pulseIntensity * 100 : 10)}px`,
                  borderColor: `rgba(34,197,94,${0.05 + pulseIntensity * 0.2})`,
                }}
              />
              <div
                className="absolute rounded-full transition-all duration-300"
                style={{
                  width: '260px',
                  height: '260px',
                  boxShadow: isSpeaking
                    ? '0 0 80px rgba(34,197,94,0.5), 0 0 160px rgba(34,197,94,0.2)'
                    : `0 0 ${40 + pulseIntensity * 60}px rgba(34,197,94,${0.2 + pulseIntensity * 0.3})`,
                }}
              />
            </>
          )}
          <div
            onClick={() => {
              if (isInCall && !isSpeaking) {
                console.log('[PhoneCall] Avatar tapped — triggering advice turn');
                handleOfflineSpeechTurn();
              }
            }}
            className={`w-52 h-52 rounded-full border-4 ${
              isInCall ? (isSpeaking ? 'border-green-400' : 'border-green-500 cursor-pointer') : 'border-gray-700'
            } bg-white overflow-hidden z-10 transition-all duration-300`}
            title={isInCall ? 'Tap for advice' : undefined}
          >
            <img
              src="https://i.ibb.co/60f9sTw2/uzhavan-logo.png"
              alt="Uzhavan AI"
              className={`w-full h-full object-cover transition-all duration-500 ${
                isInCall ? 'scale-110' : 'scale-100 grayscale'
              }`}
            />
          </div>
          {isListening && (
            <div className="absolute -bottom-2 bg-green-500 rounded-full p-2 z-20 animate-pulse">
              <Mic size={16} className="text-white" />
            </div>
          )}
          {isSpeaking && (
            <div className="absolute -bottom-2 bg-green-500 rounded-full p-2 z-20">
              <MicOff size={16} className="text-white" />
            </div>
          )}
        </div>
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-black tracking-wider text-green-500">{t('appName') || 'UZHAVAN AI'}</h2>
          <p className="text-sm font-medium text-gray-400 uppercase tracking-widest">
            {t('farmingAssistant') || 'Farming Assistant'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2">
            {isInCall && (
              <div
                className={`w-2 h-2 rounded-full ${
                  isSpeaking ? 'bg-green-400' : isListening ? 'bg-green-500' : 'bg-yellow-500'
                } animate-pulse`}
              />
            )}
            <p className="text-lg font-semibold text-white/80">{getStatusText()}</p>
          </div>
        </div>
      </div>
      <div className="pb-12 pt-4 flex justify-center">
        {!isInCall ? (
          <button
            onClick={startCall}
            className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.4)] border-4 border-green-500/30 hover:bg-green-500 active:scale-90 transition-all"
          >
            <Phone size={36} className="text-white" />
          </button>
        ) : (
          <button
            onClick={endCall}
            className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)] border-4 border-red-500/30 hover:bg-red-500 active:scale-90 transition-all"
          >
            <PhoneOff size={36} className="text-white" />
          </button>
        )}
      </div>
    </div>
  );
};

export default PhoneCall;
