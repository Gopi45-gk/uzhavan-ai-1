import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { User } from '../types';
import { getAuth } from 'firebase/auth';
import { firebaseAuthService } from '../services/firebaseAuth';
import { fetchProfileFromFirestore } from '../services/firestoreProfile';
import { getStoredFarmerProfile, getRecentDisease } from '../services/farmerContextService';
import { speakText, stopSpeech, sanitizeTextForSpeech, splitTextIntoSentences } from '../services/ttsService';
import { getApiBaseUrl } from '../services/api';
import { OFFLINE_CROP_DATABASE, OFFLINE_DOMAIN_KNOWLEDGE, CropData } from '../services/offlineIntelligenceService';

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-SOURCE INTELLIGENCE & API ORCHESTRATION ARCHITECTURE
// Layer 1: Voice Interface (STT Speech Recognition ➔ Audio Synthesis TTS)
// Layer 2: 16-Intent Agriculture Query Router & Entity Extractor
// Layer 3: Parallel Data Fetching Engine (Weather + Agmarknet Market + News + Agricultural RAG)
// Layer 4: Multi-Model Intelligence Engine (NVIDIA NIM ➔ Groq ➔ Gemini ➔ Local RAG Fallback)
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE_URL = getApiBaseUrl();
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
// LAYER 2: MULTILINGUAL CROP CATALOG & 16-INTENT AGRICULTURE ROUTER
// ═══════════════════════════════════════════════════════════════════════════
interface CropCatalogEntry {
  canonical: string;
  dbKey: string;
  tamilName: string;
  aliases: string[];
}

const CROP_CATALOG: CropCatalogEntry[] = [
  {
    canonical: 'Brinjal',
    dbKey: 'brinjal',
    tamilName: 'கத்தரிக்காய்',
    aliases: ['கத்தரிக்காய்', 'கத்தரி', 'கத்திரி', 'brinjal', 'eggplant', 'baingan', 'बैंगन', 'వంకాయ', 'ಬದನೆಕಾಯಿ', 'വഴുതന', 'aubergine']
  },
  {
    canonical: 'Tomato',
    dbKey: 'tomato',
    tamilName: 'தக்காளி',
    aliases: ['தக்காளி', 'tomato', 'tamatar', 'टमाटर', 'టమోటా', 'ಟೊಮೆಟೊ', 'തക്കാളി']
  },
  {
    canonical: 'Paddy',
    dbKey: 'paddy',
    tamilName: 'நெல்',
    aliases: ['நெல்லு', 'நெல்', 'அரிசி', 'paddy', 'rice', 'dhan', 'వరి', 'ಭತ್ತ', 'നെല്ല്', 'चावल', 'धान']
  },
  {
    canonical: 'Onion',
    dbKey: 'onion',
    tamilName: 'வெங்காயம்',
    aliases: ['சின்ன வெங்காயம்', 'பெரிய வெங்காயம்', 'வெங்காயம்', 'onion', 'shallot', 'shallots', 'pyaz', 'प्याज', 'ఉల్లిపాయ', 'ಈರುಳ್ಳಿ', 'ഉള്ളി']
  },
  {
    canonical: 'Okra',
    dbKey: 'okra',
    tamilName: 'வெண்டைக்காய்',
    aliases: ['வெண்டைக்காய்', 'வெண்டை', 'வெண்டக்காய்', 'okra', "lady's finger", 'ladies finger', 'ladyfinger', 'bhindi', 'भिंडी', 'బెండకాయ', 'ಬೆಂಡೇಕಾಯಿ', 'വെണ്ടയ്ക്ക']
  },
  {
    canonical: 'Cabbage',
    dbKey: 'cabbage',
    tamilName: 'முட்டைக்கோஸ்',
    aliases: ['முட்டைக்கோஸ்', 'முட்டை கோஸ்', 'கோஸ்', 'cabbage', 'patta gobhi', 'पत्ता गोभी', 'క్యాబேజీ', 'ಕೋಸು', 'കാബേജ്']
  },
  {
    canonical: 'Cauliflower',
    dbKey: 'cauliflower',
    tamilName: 'காலிஃபிளவர்',
    aliases: ['காலிஃபிளவர்', 'பூக்கோஸ்', 'cauliflower', 'phool gobhi', 'फूल गोभी', 'కాలీఫ్లవర్', 'ಹೂಕೋಸು', 'കോളിഫ്ലവർ']
  },
  {
    canonical: 'Potato',
    dbKey: 'potato',
    tamilName: 'உருளைக்கிழங்கு',
    aliases: ['உருளைக்கிழங்கு', 'உருளை', 'potato', 'potatoes', 'aloo', 'aalu', 'आलू', 'బంగాళాదుంప', 'ಆಲೂಗಡ್ಡೆ', 'ഉരുളക്കിഴങ്ങ്']
  },
  {
    canonical: 'Chilli',
    dbKey: 'chilli',
    tamilName: 'மிளகாய்',
    aliases: ['பச்சை மிளகாய்', 'வற்றல் மிளகாய்', 'மிளகாயில்', 'மிளகாய்க்கு', 'மிளகாயின்', 'மிளகாயை', 'மிளகாய', 'மிளகாய்', 'chilli', 'chili', 'chillies', 'mirch', 'मिर्च', 'మిరప', 'ಮೆಣಸಿನಕಾಯಿ', 'മുളക്', 'pepper']
  },
  {
    canonical: 'Cotton',
    dbKey: 'cotton',
    tamilName: 'பருத்தி',
    aliases: ['பருத்தி', 'cotton', 'kapas', 'कपास', 'పత్తి', 'ಹತ್ತಿ', 'പരുത്തി']
  },
  {
    canonical: 'Banana',
    dbKey: 'banana',
    tamilName: 'வாழை',
    aliases: ['வாழைக்காய்', 'வாழைப்பழம்', 'வாழை', 'banana', 'plantain', 'kela', 'केला', 'అరటి', 'ಬಾಳೆ', 'വാഴ']
  },
  {
    canonical: 'Carrot',
    dbKey: 'carrot',
    tamilName: 'கேரட்',
    aliases: ['கேரட்', 'carrot', 'gajar', 'गाजर', 'క్యారెట్', 'ಕ್ಯಾರೆಟ್', 'കാരറ്റിന്', 'കാരറ്റ', 'കാരറ്റ്']
  },
  {
    canonical: 'Sugarcane',
    dbKey: 'sugarcane',
    tamilName: 'கரும்பு',
    aliases: ['கரும்பு', 'sugarcane', 'cane', 'ganna', 'गन्ना', 'చెరకు', 'ಕಬ್ಬು', 'കരിമ്പ്']
  },
  {
    canonical: 'Maize',
    dbKey: 'maize',
    tamilName: 'மக்காச்சோளம்',
    aliases: ['மக்காச்சோளம்', 'மக்கா சோளம்', 'மக்காச்சோள', 'மக்கா சோள', 'மக்கச்சோளம்', 'சோளப்பயிர்', 'சோளம்', 'சோளத்', 'maize', 'corn', 'makka', 'bhutta', 'मक्का', 'भुट्टा', 'మొక్కజొన్న', 'ಮೆಕ್ಕೆಜೋಳ', 'ചോളം']
  },
  {
    canonical: 'Millets',
    dbKey: 'millets',
    tamilName: 'கம்பு மற்றும் கேழ்வரகு (தானியங்கள்)',
    aliases: ['கம்பு', 'கேழ்வரகு', 'திணை', 'சாமை', 'குதிரைவாலி', 'வரகு', 'ராகி', 'bajra', 'ragi', 'millet', 'millets', 'pearl millet', 'finger millet', 'बाजरा', 'रागी', 'సజ్జలు', 'రాగులు', 'ಸಜ್ಜೆ', 'ರಾಗಿ', 'കമ്പം', 'റാഗി']
  },
  {
    canonical: 'Groundnut',
    dbKey: 'groundnut',
    tamilName: 'நிலக்கடலை',
    aliases: ['நிலக்கடலை', 'மணிலா', 'வேர்க்கடலை', 'கடலை', 'groundnut', 'peanut', 'mungfali', 'मूंगफली', 'వేరుశెనగ', 'ಕಡಲೆಕಾಯಿ', 'നിലക്കடല']
  },
  {
    canonical: 'Turmeric',
    dbKey: 'turmeric',
    tamilName: 'மஞ்சள்',
    aliases: ['மஞ்சள்', 'turmeric', 'haldi', 'हल्दी', 'పసుపు', 'ಅரிಶಿನ', 'മഞ്ഞൾ']
  },
  {
    canonical: 'Coconut',
    dbKey: 'coconut',
    tamilName: 'தென்னை',
    aliases: ['தென்னை மரம்', 'தென்னை', 'தேங்காய்', 'coconut', 'nariyal', 'नारियल', 'కొబ్బரி', 'ತೆಂಗಿನಕಾಯಿ', 'തെങ്ങ്', 'thennai', 'thengai']
  },
  {
    canonical: 'Wheat',
    dbKey: 'wheat',
    tamilName: 'கோதுமை',
    aliases: ['கோதுமை', 'wheat', 'gehu', 'गेहूं', 'గోధుమ', 'ಗೋಧಿ', 'ಗೋതമ്പ്']
  },
  {
    canonical: 'Mango',
    dbKey: 'mango',
    tamilName: 'மாங்காய்',
    aliases: ['மாம்பழம்', 'மாங்காய்', 'மாமரம்', 'mango', 'aam', 'आम', 'మామిడి', 'ಮಾವು', 'മാങ്ങ', 'maangai', 'mambazham']
  },
  {
    canonical: 'Blackgram',
    dbKey: 'blackgram',
    tamilName: 'உளுந்து',
    aliases: ['உளுந்து', 'பயறு', 'black gram', 'blackgram', 'urad', 'उड़द', 'మినుములు', 'ಉದ್ದು', 'ഉഴുന്ന്', 'ulundu']
  },
  {
    canonical: 'Greengram',
    dbKey: 'greengram',
    tamilName: 'பாசிப்பயறு',
    aliases: ['பாசிப்பயறு', 'பச்சைப்பயறு', 'பயறு', 'green gram', 'greengram', 'moong', 'मूंग', 'పెసలు', 'ಹೆಸರುಕಾಳು', 'ചെറുപയർ']
  },
  {
    canonical: 'Chickpea',
    dbKey: 'chickpea',
    tamilName: 'கொண்டைக்கடலை',
    aliases: ['கொண்டைக்கடலை', 'சுண்டல்', 'சென்னா', 'chickpea', 'bengal gram', 'chana', 'चना', 'శనగలు', 'ಕಡಲೆ', 'കടല']
  },
  {
    canonical: 'Jasmine',
    dbKey: 'jasmine',
    tamilName: 'மல்லிகை',
    aliases: ['மல்லிகை', 'குண்டுமல்லி', 'மல்லி', 'jasmine', 'chameli', 'चमेली', 'మల్లె', 'ಮಲ್ಲಿಗೆ', 'മുല്ല', 'malli', 'gundumalli']
  }
];

interface FlatCropMatch {
  alias: string;
  canonical: string;
  dbKey: string;
}

const SORTED_CROP_ENTRIES: FlatCropMatch[] = CROP_CATALOG
  .flatMap(entry => entry.aliases.map(alias => ({
    alias: alias.toLowerCase(),
    canonical: entry.canonical,
    dbKey: entry.dbKey,
  })))
  .sort((a, b) => b.alias.length - a.alias.length);

const PRONOUN_FOLLOWUP_MARKERS = [
  'அதுக்கு', 'அதற்கு', 'அதில்', 'அதன்', 'இந்த பயிருக்கு', 'அந்த பயிருக்கு', 'அதை', 'இதற்கு', 'இதில்', 'இதன்', 'இந்த பயிர்',
  'for it', 'to it', 'in it', 'for this crop', 'this crop', 'that crop', 'its', 'about it',
  'उसमें', 'उसके लिए', 'इसके लिए', 'इसमें', 'इस फसल', 'उस फसल',
  'దానికి', 'దీనికి', 'ఈ పంటకు', 'ఆ పంటకు',
  'ಅದಕ್ಕೆ', 'ಇದಕ್ಕೆ', 'ಈ ಬೆಳೆಗೆ',
  'അതിന്', 'ഇതിന്', 'ഈ വിളയ്ക്ക്'
];

function identifyCropDbKey(cropName: string | null | undefined): string {
  if (!cropName) return 'paddy';
  const c = cropName.toLowerCase().trim();
  for (const item of CROP_CATALOG) {
    if (item.canonical.toLowerCase() === c || item.dbKey === c || item.aliases.some(a => a.toLowerCase() === c || c.includes(a.toLowerCase()))) {
      return item.dbKey;
    }
  }
  return 'paddy';
}

function extractCropEntity(
  message: string,
  history: string,
  activeSessionCrop: string | null,
  isGeneralQuery: boolean,
  profileCrop: string
): string | null {
  const text = message.toLowerCase();

  // 1. Direct greedy alias search in the message
  for (const entry of SORTED_CROP_ENTRIES) {
    if (text.includes(entry.alias)) {
      return entry.canonical;
    }
  }

  // 2. Anaphora / pronoun check
  const hasPronoun = PRONOUN_FOLLOWUP_MARKERS.some(marker => text.includes(marker));
  if (hasPronoun && activeSessionCrop) {
    return activeSessionCrop;
  }

  // 3. Explicit reference to farmer's own crop ("என் பயிர்", "my crop", "என் தோட்டம்")
  const refersToOwnCrop = /என் பயிர்|எங்க பயிர்|my crop|our crop|मेरी फसल|నా పంట|ನನ್ನ ಬೆಳೆ|എന്റെ വിള/i.test(text);
  if (refersToOwnCrop) {
    return profileCrop || activeSessionCrop || null;
  }

  // 4. If this is a general topic (weather, rain, schemes, livestock, loan, storage, soil testing), return null
  if (isGeneralQuery) {
    return null;
  }

  // 5. Short follow-up without pronoun, ONLY if active conversation has a crop AND the query is specifically a crop metric (dosage/spacing/variety/price)
  // and NOT a standalone topic question (rain, weather, market general, etc.)
  const isGenericTopic = /மழை|வானிலை|திட்டம்|மானியம்|மாடு|பால்|கால்நடை|சேமிப்பு|வங்கி|கடன்/i.test(text);
  if (!isGenericTopic && activeSessionCrop && (text.length < 35 && /எவ்வளவு|அளவு|rate|விலை|உரம்|மருந்து/i.test(text))) {
    return activeSessionCrop;
  }

  return null;
}

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
  profile: FarmerContext,
  activeSessionCrop: string | null = null,
  activeSessionTopic: string | null = null,
  activeSessionEntity: string | null = null
): Promise<MultiSourceAnalysis> {
  const text = message.toLowerCase();

  // Categorized triggers with strict prioritization across 5 Indian languages
  const isFertilizer = /fertilizer|உரம்|உரங்கள்|உர அளவு|npk|dap|urea|யூரியா|பொட்டாஷ்|தழைச்சத்து|சாம்பல் சத்து|மணிச்சத்து|தொழுவுரம்|கம்போஸ்ட்|micronutrient|நுண்ணூட்டம்|போரான்|துத்தநாகம்|boron|zinc|குறைபாடு|deficiency|போட வேண்டும்|இட வேண்டும்|khad|खाद|उर्वरक|डीएपी|यूरिया|manure|poshak|ఎరువు|ఎరువులు|యూరియా|గೊಬ್ಬರ|ರಸಗೊಬ್ಬರ|ವளம்|രാസവളം/i.test(text);
  const isPostHarvest = /தானிய சேமிப்பு|சேமிப்பு|தானியங்களை|தானியம்|cold storage|shelf life|குளிர்பதன|மூட்டை|ஈரப்பதம்|வண்டு வராமல்|storage|godown|ధాన్యాల నిల్వ|ಧಾನ್ಯ ಸಂಗ್ರಹ|ധാന്യ സംഭരണം/i.test(text);
  const isWeeds = /களை|களைகள்|களைக்கொல்லி|களை மேலாண்மை|weed\b|weeds\b|herbicide|కలుపు|ಕಳೆ|കള/i.test(text);
  const isIrrigation = /irrigation|பாசனம்|சொட்டு நீர்|நீர் பாய்ச்ச|தண்ணீர் பாய்ச்ச|watering|drip irrigation|sprinkler|தண்ணீர் விட|சிஞ்சாயி|నీరు|నీటిపారుదల|తడి|ನೀರು|ನೀರಾವರಿ|ಹನಿ ನೀರಾವರಿ|വെള്ളം|നനയ്ക്കൽ|ജലസೇചനം|पानी|सिंचाई|ड्रिप/i.test(text);
  const isSoilTesting = /மண் பரிசோதனை|மண் ஆய்வு|soil test|soil health|மாதிரி எடுக்க|மாதிரி சேகரிக்க|నేల పరీక్ష|మట్టి పరీక్ష|ಮಣ್ಣು ಪರೀಕ್ಷೆ|മണ്ണ് പരിശോധന|मिट्टी परीक्षण/i.test(text);
  const isSoil = (isSoilTesting || /மண்|மண் வகை|மணல்|கரிசல் மண்|வண்டல் மண்|செம்மண்|நிலம்|soil\b|ph\b|mitti\b|నేల|మట్టి|మట్టి రకం|ಮಣ್ಣು|ಮಣ್ಣಿನ ವಿಧ|ನೆಲ|മണ്ണ്|മണ്ണിന്റെ|നിലം|मिट्टी|मृदा|भूमि/i.test(text)) && !isFertilizer;
  const isDisease = (/disease|நோய்|blight|rot|spot|wilt|fungus|virus|symptom|அறிகுறி|பாதிப்பு|காயுது|புழு|வண்டு|பூச்சி|அழுகல்|சுருட்டை|infection|pest\b|attack|తెగులు|పురుగు|రోగం|మచ్చ|కుళ్ళు|ರೋಗ|ಕೀಟ|ಹುಳು|ಕೊಳೆರೋಗ|ಬೂದಿರೋಗ|രോഗം|കീടം|പുഴു|ചീയൽ|വാട്ടം|कीट|रोग|झुलसा|सड़न|इल्ली/i.test(text) || (/குறைபாடு/i.test(text) && !isFertilizer)) && !isPostHarvest;
  const isChemical = /chemical|pesticide|fungicide|மருந்து|தெளிக்க|spray\b|dose\b|மருந்தடிக்க|பூச்சிக்கொல்லி|మందు|స్ప్రే|పిచికారీ|పురుగుమందు|ಔಷಧ|ಸಿಂಪಡಣೆ|ಕೀಟನಾಶಕ|മരുന്ന്|തളിക്കാൻ|കീടനാശിനി|दवा|दवाई|छिड़काव|कीटनाशक/i.test(text) && !isFertilizer;
  const isPrevention = /prevention|தடுப்பது|தடுக்க|control|வராமல்|avoid|protect|முன்னெச்சரிக்கை|నివారణ|ತಡೆಗಟ್ಟುವಿಕೆ|തടയാൻ|रोकथाम/i.test(text) && !isPostHarvest;
  const isNatural = /natural|organic|இயற்கை|மூலிகை|வேப்ப|வேப்பண்ணெய்|neem|home remedy|பஞ்சகவ்யா|panchagavya|ஜீவாமிர்தம்|மண்புழு|சாணம்|సేంద్రీయ|సహజ|సಾವಯವ|ಜೈವಿಕ|ജൈവ|जैविक/i.test(text);
  const isRecommendation = /which crop|என்ன பயிர்|grow\b|sow\b|பயிரிடலாம்|பயிர் தேர்வு|விதைக்கலாம்|எந்த பயிர்|suitable crop|பயிரிடலாமா|ఏ పంట|సాగు చేయవచ్చా|ಯಾವ ಬೆಳೆ|ಬೆಳೆಯಬಹುದಾ|ഏത് വിള|कौन सी फसल/i.test(text);
  const isSeasonAndVarieties = /பருவம்|எந்த பருவம்|உகந்த பருவம்|பருவத்தில்|variet|ரகம்|ரகங்கள்|விதை நேர்த்தி|seed treatment|seed rate|రకాలు|విత్తన శుద్ధి|విత్తే కాలం|ತಳಿಗಳು|ಬಿತ್ತನೆ ಸಮಯ|ಬೀಜೋಪಚಾರ|ഇനങ്ങൾ|വിത്തുചികിത്സ|किस्में|बुवाई का समय|बीज उपचार/i.test(text);
  const isCultivation = /நடவு|சாகுபடி|விதைப்பு|spacing|இடைவெளி|transplant|உழவு|நிலம் தயாரிக்க|harvest|அறுவடை|cultivation|సాగు విధానం|ನಾಟಿ|ಬೆಳೆಯುವ ವಿಧಾನ|കൃഷി രീതി|रोपाई|खेती विधि/i.test(text);
  const isWeather = /weather|மழை|வானிலை|rain\b|forecast|मौसम|வருமா|மழையா|குளிர்|வெப்பநிலை|மழை பெய்யுமா|மழை பெய்தால்|மழை வந்தா|వర్షం|వాతావరణం|ಮಳೆ|ಹವಾಮಾನ|മഴ|കാലാവസ്ഥ|बारिश|मौसम|वर्षा/i.test(text);
  const isBusiness = /selling|sales|business|உழவர் சந்தை|e-nam|enam|நேரடி கொள்முதல்|வியாபாரி|buyer|రైతు బజార్|రైతు సಂತೆ|കർഷക വിപണി|किसान मंडी/i.test(text);
  const isMarket = /price|விலை|rate\b|market|சந்தை|மண்டி|cost|quintal|ரூபாய்|₹|mandi price|rate enna|விலை என்ன|ధర|రేటు|మార్కెట్|బెలె|ದರ|ಮಾರುಕಟ್ಟೆ|വില|വിപണി|भाव|दाम|मंडी/i.test(text) && !isBusiness;
  const isSchemes = /scheme|subsid|திட்டம்|மானியம்|pm kisan|பிஎம் கிசான்|காப்பீடு|insurance|கிசான்|pmfby|పథకం|రాయితీ|ಯೋಜನೆ|ಸಹಾಯಧನ|പദ്ധതി|സബ്‌സിഡി|योजना|सब्सिडी/i.test(text);
  const isLivestock = /cow|goat|cattle|buffalo|sheep|மாடு|ஆடு|கால்நடை|பால்|தீவனம்|மடிநோய்|கோமாரி|dairy|milk yield|கறவை|பசும்பால்|పాడి|పశువులు|పాలు|ಆಕಳು|ಹಸು|ಹಾಲು|പശു|പാൽ|गाय|भैंस|दूध|पशु/i.test(text);
  const isNews = /news|செய்தி|செய்திகள்|update|அறிவிப்பு|latest|today news|వార్తలు|ಸುದ್ದಿ|വാർത്തകൾ|समाचार/i.test(text);
  const isLoan = /loan|வங்கி கடன்|credit|kisan credit|kcc|வட்டி|கடனுதவி|రుణం|ಸಾಲ|വായ്പ|ऋण|कर्ज/i.test(text);
  const isInstitutions = /helpline|ஹெல்ப்லைன்|உதவி எண்|kisan call centre|1800|tnau|அலுவலர்|kvk|సహాయ కేంద్రం|ಸಹಾಯವಾಣಿ|സഹായ നമ്പർ|हेल्पलाइन/i.test(text);

  const isDosageQuery = /எவ்வளவு அளவு|அளவு என்ன|dosage|how much quantity|எவ்வளவு போடணும்|எவ்வளவு தெளிக்கணும்|dose|quantity/i.test(text);

  const detectedIntents: string[] = [];

  // PUSH IN STRICT LOGICAL PRIORITY:
  if (isFertilizer) detectedIntents.push('fertilizer');
  if (isIrrigation) detectedIntents.push('irrigation');
  if (isPostHarvest) detectedIntents.push('post_harvest');
  if (isWeeds) detectedIntents.push('weeds');
  if (isSoilTesting) detectedIntents.push('soil_testing');
  else if (isSoil) detectedIntents.push('soil');
  if (isDisease) detectedIntents.push('disease');
  if (isChemical) detectedIntents.push('chemical_remedy');
  if (isNatural) detectedIntents.push('natural_remedy');
  if (isPrevention) detectedIntents.push('prevention');
  if (isRecommendation) detectedIntents.push('crop_recommendation');
  if (isSeasonAndVarieties) detectedIntents.push('seeds_and_varieties');
  if (isCultivation) detectedIntents.push('crop_cultivation');
  if (isWeather) detectedIntents.push('weather');
  if (isBusiness) detectedIntents.push('farmer_business');
  if (isMarket) detectedIntents.push('market');
  if (isSchemes) detectedIntents.push('government_schemes');
  if (isLivestock) detectedIntents.push('livestock');
  if (isLoan) detectedIntents.push('loan_credit');
  if (isInstitutions) detectedIntents.push('institutions_helplines');
  if (isNews) detectedIntents.push('news');

  // Handle follow-up queries that depend on previous context
  if (isDosageQuery) {
    if (activeSessionTopic === 'fertilizer' || activeSessionTopic === 'fertilizer_dosage') {
      if (!detectedIntents.includes('fertilizer')) detectedIntents.unshift('fertilizer');
    } else if (activeSessionTopic === 'chemical_remedy' || activeSessionTopic === 'disease') {
      if (!detectedIntents.includes('chemical_remedy')) detectedIntents.unshift('chemical_remedy');
    }
  }

  if (detectedIntents.length === 0) detectedIntents.push('general_farming');

  const isGeneralQuery = (isWeather || isSchemes || isNews || isLoan || isInstitutions || isLivestock || isPostHarvest || isSoilTesting || (isSoil && !isFertilizer && !isDisease)) && !activeSessionCrop;
  const extractedCrop = extractCropEntity(message, history, activeSessionCrop, isGeneralQuery, profile.crop_type);

  // Extended Location entity extraction across Tamil Nadu districts
  const districts = [
    'thanjavur', 'தஞ்சாவூர்', 'madurai', 'மதுரை', 'coimbatore', 'கோயம்புத்தூர்',
    'salem', 'சேலம்', 'trichy', 'திருச்சி', 'tirunelveli', 'திருநெல்வேலி',
    'vellore', 'வேலூர்', 'erode', 'ஈரோடு', 'dindigul', 'திண்டுக்கல்',
    'theni', 'தேனி', 'kanchipuram', 'காஞ்சிபுரம்', 'tiruppur', 'திருப்பூர்',
    'nagapattinam', 'நாகப்பட்டினம்', 'cuddalore', 'கடலூர்', 'dharmapuri', 'தர்மபுரி',
    'krishnagiri', 'கிருஷ்ணகிரி', 'villupuram', 'விழுப்புரம்', 'ramanathapuram', 'ராமநாதபுரம்',
    'chennai', 'சென்னை', 'tamil nadu', 'தமிழ்நாடு'
  ];
  let extractedLocation: string | null = null;
  for (const d of districts) {
    if (text.includes(d)) { extractedLocation = d; break; }
  }

  const requires_weather = isWeather || detectedIntents.includes('weather');
  const requires_market = isMarket || detectedIntents.includes('market');
  const requires_news = isNews || detectedIntents.includes('news');
  const requires_disease_rag = isDisease || isPrevention || isNatural || isChemical;

  // Fast AI extraction via NVIDIA NIM router if available
  try {
    const prompt = `Analyze this farmer voice query.
User Language: ${userLang}
Farmer Registered Profile: Crop: ${profile.crop_type}, District: ${profile.district}
Active Discussed Crop: ${activeSessionCrop || 'None'}
Active Discussed Topic: ${activeSessionTopic || 'None'}
Detected Crop: ${extractedCrop || 'None'}
Detected Intent Candidate: ${detectedIntents[0]}
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
      let content = data.choices?.[0]?.message?.content?.trim() || '';
      content = content.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(content);
      const nimCrop = parsed.query_crop && !['null', 'none', 'undefined'].includes(String(parsed.query_crop).toLowerCase())
        ? String(parsed.query_crop).trim()
        : null;

      const finalCrop = extractedCrop || (nimCrop && nimCrop.toLowerCase() !== 'null' ? nimCrop : null);

      return {
        primary_intent: parsed.primary_intent || detectedIntents[0],
        intents: detectedIntents,
        emotion: parsed.emotion || (isDisease ? 'worried' : 'normal'),
        language: userLang,
        query_crop: finalCrop,
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
    query_crop: extractedCrop,
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
    if (!res.ok) return `Live Weather: Forecast data for ${location} is temporarily unavailable from the weather service.`;
    const data = await res.json();
    const temp = data.current?.temperature;
    const humidity = data.current?.humidity;
    const wind = data.current?.windspeed;
    const alert = data.rain_alert?.alert_message || data.rain_alert || 'No heavy rainfall alert today';
    const advisory = data.farming_advisory || 'Clear for field operations.';

    let report = `Live Weather Forecast for ${location}: `;
    if (temp !== undefined && temp !== null) report += `Temperature ${temp}°C, `;
    if (humidity !== undefined && humidity !== null) report += `Humidity ${humidity}%, `;
    if (wind !== undefined && wind !== null) report += `Wind ${wind} km/h. `;
    report += `Rainfall Status: ${alert}. Field Advisory: ${advisory}`;
    return report;
  } catch {
    return `Live Weather: Forecast data for ${location} is temporarily unavailable.`;
  }
}

async function fetchMarket(crop: string | null, location: string): Promise<string> {
  const targetCrop = crop || 'Paddy';
  const targetLoc = location || 'Tamil Nadu';
  try {
    const res = await fetch(`${API_BASE_URL}/api/market/prices?state=${encodeURIComponent(targetLoc)}&commodity=${encodeURIComponent(targetCrop)}`);
    if (res.ok) {
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
    }
  } catch { }

  const cropKey = identifyCropDbKey(targetCrop);
  const benchmark = OFFLINE_CROP_DATABASE[cropKey]?.marketBenchmark;
  return `Agmarknet Market Notice: Today's live arrival price for ${targetCrop} in ${targetLoc} is currently not updated on the Agmarknet portal.${benchmark ? ` (Historical benchmark: ${benchmark})` : ''}`;
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
  const crop = analysis.query_crop;
  const recentDisease = getRecentDisease();

  let ragInfo = '';

  if (crop) {
    const cropKey = identifyCropDbKey(crop);
    const dbData = OFFLINE_CROP_DATABASE[cropKey];

    if (dbData) {
      ragInfo += `Agricultural Scientific Grounding for Crop "${crop}":\n`;

      if (analysis.intents.includes('fertilizer') || /உரம்|fertilizer|npk|dap|urea/i.test(query)) {
        ragInfo += `- Scientifically Verified NPK Dosage: ${dbData.npk}\n`;
      }
      if (analysis.requires_disease_rag || analysis.requires_prevention || analysis.requires_chemical_remedy || analysis.requires_natural_remedy) {
        ragInfo += `- Pests & Common Diseases: ${dbData.pestsAndDiseases}\n`;
        ragInfo += `- Organic / Biological Remedy: ${dbData.organicRemedy}\n`;
        ragInfo += `- Chemical Treatment & Specific Dosage: ${dbData.chemicalDosage}\n`;
      }
      if (analysis.intents.includes('irrigation')) {
        ragInfo += `- Irrigation Guidelines: ${dbData.irrigation}\n`;
      }
      if (analysis.intents.includes('soil')) {
        ragInfo += `- Soil Requirements: ${dbData.soil}\n`;
      }
      if (analysis.intents.includes('seeds_and_varieties') || analysis.intents.includes('crop_recommendation') || analysis.intents.includes('crop_cultivation')) {
        ragInfo += `- Recommended Sowing / Season: ${dbData.sowingTime}\n`;
        ragInfo += `- Suitable Varieties: ${dbData.varieties.join(', ')}\n`;
      }
      if (analysis.requires_market) {
        ragInfo += `- Mandi Market Benchmark: ${dbData.marketBenchmark}\n`;
      }
      // If none of the specific subtopics triggered, include core profile
      if (!analysis.intents.some(i => ['fertilizer', 'disease', 'chemical_remedy', 'natural_remedy', 'irrigation', 'soil', 'seeds_and_varieties', 'crop_cultivation'].includes(i))) {
        ragInfo += `- Sowing / Season: ${dbData.sowingTime}\n`;
        ragInfo += `- Fertilizer: ${dbData.npk}\n`;
        ragInfo += `- Protection: ${dbData.organicRemedy}; ${dbData.chemicalDosage}\n`;
      }
    }
  }

  if (recentDisease?.disease && crop && recentDisease.crop?.toLowerCase() === crop.toLowerCase()) {
    ragInfo += `- Recent Farm Disease Scan Context: ${recentDisease.disease} (Confidence: ${recentDisease.confidence})\n`;
  }

  if (analysis.requires_schemes) {
    ragInfo += `- Government Schemes: PM-KISAN (₹6,000/year direct financial support in 3 installments), PM Fasal Bima Yojana (Crop Insurance against weather damage), Tamil Nadu Kalaignarin All Village Integrated Agriculture Development Programme, and Subsidized Drip Irrigation.\n`;
  }

  if ((analysis.intents.includes('soil_testing') || analysis.intents.includes('soil')) && !crop) {
    ragInfo += `- Soil Testing Guidance: Take V-shaped samples from 8-10 points across the field at 15cm depth, mix thoroughly, shade dry 500g, and submit to the nearest Block Agriculture Extension Centre (உழவர் மையம்) for NPK, pH, and electrical conductivity testing.\n`;
  }

  if (analysis.intents.includes('loan_credit')) {
    ragInfo += `- Credit / Loan Guidance: Kisan Credit Card (KCC) provides institutional credit up to ₹3 lakh at 4% interest rate with prompt repayment. Available via Primary Agricultural Credit Societies (PACCS) or nationalized banks.\n`;
  }

  if (analysis.intents.includes('livestock') || /மாடு|ஆடு|பால்|livestock|cow|cattle|goat/i.test(query)) {
    ragInfo += `- Livestock & Dairy Guidance: Cattle feeding requires green fodder (Co-4, Co-5, Azolla), dry straw, and 50g mineral mixture/day to boost milk yield. Provide 70-80L clean drinking water. Prevent mastitis with strict udder hygiene before milking. For veterinary emergencies or severe illness, advise immediately contacting a qualified veterinarian.\n`;
  }

  if (analysis.intents.includes('natural_remedy') || /organic|இயற்கை|பஞ்சகவ்யா|panchagavya|ஜீவாமிர்தம்/i.test(query)) {
    ragInfo += `- Organic & Natural Farming Guidance: Panchagavya 3% foliar spray (300 ml in 10 L water) at 15-day intervals boosts immunity and prevents flower drop. Apply vermicompost @ 2 tonnes/acre. Spray 5% Neem Seed Kernel Extract (NSKE) or 3% neem oil for organic pest management.\n`;
  }

  if (analysis.intents.includes('seeds_and_varieties') && !crop) {
    ragInfo += `- Seed Treatment Guidance: Treat seeds with Trichoderma viride @ 4g/kg or Pseudomonas fluorescens @ 10g/kg to prevent damping-off and root rot. Coat seeds with Azospirillum & Phosphobacteria biofertilizers @ 200g each per acre.\n`;
  }

  if (analysis.intents.includes('post_harvest') || /storage|சேமிப்பு|cold storage|தானிய/i.test(query)) {
    ragInfo += `- Post-Harvest Management: Sun-dry grains to below 10-12% moisture before bagging. Mix dried neem leaves (2% w/w) in gunny bags to deter weevils. Airtight Hermetic Super Grain Bags prevent moisture and pest ingress for over 12 months.\n`;
  }

  if (analysis.intents.includes('institutions_helplines') || /helpline|ஹெல்ப்லைன்|1800|kcc|tnau|உதவி எண்/i.test(query)) {
    ragInfo += `- Official Institutions & Helplines: Kisan Call Centre toll-free 1800-180-1551 (6 AM to 10 PM daily in Tamil and Indian languages). TNAU Agritech Portal and local Block Assistant Agricultural Officer (AAO) provide official advisory.\n`;
  }

  if (analysis.intents.includes('farmer_business') || /uzhavan santhai|உழவர் சந்தை|e-nam|விலைக்கு விற்க|buyer/i.test(query)) {
    ragInfo += `- Agricultural Marketing & Business: Sell vegetables directly at Uzhavan Santhai with zero middleman commissions. Register on e-NAM (National Agriculture Market) for competitive multi-state bidding. Paddy and pulses can be sold at Government Direct Purchase Centres (DPC) at MSP.\n`;
  }

  if (analysis.intents.includes('weeds')) {
    ragInfo += `- Weed Management: Perform manual hand weeding at 20 and 40 days after sowing or apply pre-emergence herbicide under adequate soil moisture to prevent nutrient competition.\n`;
  }

  if (/மழை வந்தா|மழை பெய்தால்|if it rains/i.test(query)) {
    ragInfo += `- Rainy Weather Advisory: Ensure clear drainage channels to prevent waterlogging. Avoid spraying any fertilizers or pesticides right before or during rain as they will wash off and waste chemicals.\n`;
  }

  return ragInfo;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4: MULTI-MODEL INTELLIGENCE ENGINE (NVIDIA NIM ➔ GROQ ➔ GEMINI ➔ RAG)
// ═══════════════════════════════════════════════════════════════════════════

function detectLanguageFromMessage(message: string): 'ta' | 'te' | 'kn' | 'ml' | 'hi' | null {
  if (/[\u0C80-\u0CFF]/.test(message)) return 'kn'; // Kannada script
  if (/[\u0C00-\u0C7F]/.test(message)) return 'te'; // Telugu script
  if (/[\u0D00-\u0D7F]/.test(message)) return 'ml'; // Malayalam script
  if (/[\u0900-\u097F]/.test(message)) return 'hi'; // Devanagari (Hindi) script
  if (/[\u0B80-\u0BFF]/.test(message)) return 'ta'; // Tamil script
  return null;
}

function isScriptConsistent(text: string | null | undefined, lang: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 3) return false;
  const hasTamil = /[\u0B80-\u0BFF]/.test(t);
  const hasKannada = /[\u0C80-\u0CFF]/.test(t);
  const hasTelugu = /[\u0C00-\u0C7F]/.test(t);
  const hasMalayalam = /[\u0D00-\u0D7F]/.test(t);
  const hasHindi = /[\u0900-\u097F]/.test(t);

  if (lang === 'kn') return hasKannada && !hasTamil;
  if (lang === 'te') return hasTelugu && !hasTamil;
  if (lang === 'ml') return hasMalayalam && !hasTamil;
  if (lang === 'hi') return hasHindi && !hasTamil;
  if (lang === 'ta') return hasTamil && !hasKannada && !hasTelugu && !hasMalayalam;
  if (lang === 'en') return !hasTamil && !hasKannada && !hasTelugu && !hasMalayalam && !hasHindi;
  return true;
}

function buildSystemPrompt(profile: FarmerContext, selectedLang: string, queryCrop: string | null): string {
  const langConfig: Record<string, { name: string; script: string; instructions: string }> = {
    ta: {
      name: 'Tamil (தமிழ்)',
      script: 'தமிழ் எழுத்துக்கள் (Tamil Script)',
      instructions: 'நேரடி, எளிய, அக்கறையான உழவர் பேச்சு நடை. உரம், பூச்சி மருந்து, பாசனம், ஏக்கர்/லிட்டர் அளவுகளை துல்லியமாகக் கூறவும். பிற மொழி சொற்களைத் தவிர்க்கவும்.'
    },
    te: {
      name: 'Telugu (తెలుగు)',
      script: 'తెలుగు లిపి (Telugu Script EXCLUSIVELY)',
      instructions: 'రైతులకు సులభంగా అర్థమయ్యే సహజమైన, ఆప్యాయమైన వ్యవసాయ సంభాషణ శైలి. ఎరువులు, పురుగు మందులు, నీటి పారుదల, ఎకరా/లీటరు వివరాలు స్పష్టంగా చెప్పండి. ఖచ్చితంగా తమిళం లేదా హిందీ పదాలు వాడవద్దు.'
    },
    kn: {
      name: 'Kannada (ಕನ್ನಡ)',
      script: 'ಕನ್ನಡ ಲಿಪಿ (Kannada Script EXCLUSIVELY)',
      instructions: 'ರೈತರಿಗೆ ಸುಲಭವಾಗಿ ಅರ್ಥವಾಗುವ ನೈಸರ್ಗಿಕ, ಸರಳ ಮತ್ತು ಸೌಹಾರ್ದಯುತ ಆಡುಮಾತಿನ ಶೈಲಿ. ರಸಗೊಬ್ಬರ, ಕೀಟನಾಶಕ, ನೀರಾವರಿ, ಎಕರೆ/ಲೀಟರ್ ಪ್ರಮಾಣವನ್ನು ನೇರವಾಗಿ ತಿಳಿಸಿ. ಯಾವುದೇ ಕಾರಣಕ್ಕೂ ತಮಿಳು ಅಥವಾ ಹಿಂದಿ ಪದಗಳನ್ನು ಬಳಸಬೇಡಿ.'
    },
    ml: {
      name: 'Malayalam (മലയാളം)',
      script: 'മലയാള ലിപി (Malayalam Script EXCLUSIVELY)',
      instructions: 'കർഷകർക്ക് എളുപ്പത്തിൽ മനസ്സിലാകുന്ന സ്വാഭാവികവും ലളിതവുമായ സംഭാഷണ ശൈലി. വളം, കീടനാശിനി, നനയ്ക്കൽ, ഏക്കർ/ലിറ്റർ അളവുകൾ വ്യക്തമായി പറയുക. യാതൊരു കാരണവശാലും തമിഴ് വാക്കുകൾ കലർത്തരുത്.'
    },
    hi: {
      name: 'Hindi (हिंदी)',
      script: 'देवनागरी लिपि (Devanagari Script EXCLUSIVELY)',
      instructions: 'किसान भाइयों के लिए सहज, व्यावहारिक और सम्मानजनक बोलचाल की भाषा। खाद/उर्वरक, कीटनाशक, सिंचाई, एकड़/लीटर की मात्रा स्पष्ट बताएं। किसी भी स्थिति में तमिल शब्द न लिखें।'
    },
    en: {
      name: 'English',
      script: 'English Alphabet',
      instructions: 'Direct, clear, practical agricultural extension officer voice. Keep measurements accurate and simple.'
    }
  };

  const current = langConfig[selectedLang] || langConfig.ta;

  return `You are UZHAVAN AI (உழவன் AI), an empathetic, expert agricultural voice assistant on a live phone call with an Indian farmer.

ACTIVE CONVERSATION LANGUAGE: ${current.name}
MANDATORY SCRIPT: ${current.script}
LANGUAGE GUIDELINES: ${current.instructions}

AUTHENTICATED FARMER PROFILE:
- Farmer Name: ${profile.name}
- Registered Location: ${profile.district}
- Registered Profile Crop: ${profile.crop_type}
- Soil Type: ${profile.soil_type}

STRICT INSTRUCTIONS FOR ACCURACY AND CONTEXT:
1. ANSWER THE EXACT QUESTION FIRST:
   - Provide the direct, specific answer immediately in the very first sentence.
   - For fertilizer or chemical dosage: state exact quantity (ml/L, g/L, or per acre/hectare) right away.
   - For soil questions: state the suitable soil texture and drainage requirements immediately.
   - For weather: state current rain/weather status immediately.
   - For market: state current mandi rates or benchmark prices immediately.
2. STRICT TOPIC & CROP ISOLATION:
   ${queryCrop ? `- The farmer is inquiring SPECIFICALLY about "${queryCrop}". Answer STRICTLY and ONLY for "${queryCrop}".
   - NEVER mention the farmer's registered profile crop ("${profile.crop_type}") or provide advice meant for "${profile.crop_type}".` : `- The farmer asked a general question with NO specific crop. Do NOT force or assume any crop name (such as "${profile.crop_type}"). Answer the general question directly.`}
3. EVIDENCE-BASED SCIENTIFIC GROUNDING:
   - Ground your answer strictly in the provided LIVE RETRIEVED DATA and AGRICULTURAL SCIENTIFIC GROUNDING.
   - Preserve exact figures: NPK dosages, chemical application rates (ml/L or g/L), market prices, temperatures. NEVER fabricate numbers.
4. STRICT LANGUAGE CONSISTENCY & NO TAMIL LEAKAGE:
   - You MUST generate your response EXCLUSIVELY in ${current.name} using ${current.script}.
   - CRITICAL: When the active language is ${current.name}, NEVER output Tamil script (தமிழ்) or accidental Tamil sentences.
5. SPOKEN VOICE CALL FORMAT:
   - Speak in natural, spoken conversational style like an experienced agriculture officer on a live phone call.
   - STRICT LENGTH: Respond in exactly 1 or 2 concise, clear, and actionable spoken sentences.
   - NO EMOJIS, NO BULLET POINTS, NO NUMBERED LISTS, NO MARKDOWN HEADERS. This text will be converted to audio via TTS.
   - Output ONLY the final spoken words in ${current.script}. Never provide thinking, translation notes, or English preamble.`;
}

async function callMultiModelEngine(
  analysis: MultiSourceAnalysis,
  profile: FarmerContext,
  liveDataCombined: string,
  history: string,
  message: string,
  selectedLang: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(profile, selectedLang, analysis.query_crop);
  const userPrompt = `Selected Spoken Language: ${selectedLang}
Detected Query Intent: ${analysis.intents.join(', ')}
Query Crop: ${analysis.query_crop || 'None (General Query)'}
Location: ${analysis.query_location || profile.district}

LIVE RETRIEVED DATA & SCIENTIFIC KNOWLEDGE:
${liveDataCombined || 'No external live data available.'}

CONVERSATION CONTEXT:
${history ? history.slice(-400) : 'New call session.'}

FARMER'S QUESTION:
"${message}"

INSTRUCTION: Speak the direct answer in ${selectedLang} in 1-2 natural spoken sentences. Start speaking immediately:`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const sanitizeCallBotResponse = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    let t = raw.trim();

    // Remove markdown headers, bolding, bullet points, and think tags
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    t = t.replace(/^[#*>\-\d.)\s]+/gm, '').trim();
    t = t.replace(/[*_~`]/g, '').trim();

    // If English chain-of-thought or meta preamble is present, extract native script blocks
    if (/(?:we need to|the user asks|the user is asking|according to|meaning\s*["']|thinking process|so answer:|let'?s craft|so respond|here is the response)/i.test(t)) {
      const scriptRegexes: Record<string, RegExp> = {
        ta: /[\u0B80-\u0BFF][^\n"]*/g,
        te: /[\u0C00-\u0C7F][^\n"]*/g,
        kn: /[\u0C80-\u0CFF][^\n"]*/g,
        ml: /[\u0D00-\u0D7F][^\n"]*/g,
        hi: /[\u0900-\u097F][^\n"]*/g,
      };
      const reg = scriptRegexes[selectedLang];
      if (reg) {
        const blocks = t.match(reg);
        if (blocks && blocks.length > 0) {
          const valid = blocks
            .map(b => b.replace(/^[\s"']+|[\s"']+$/g, ''))
            .filter(b => b.length > 8 && !b.includes('meaning') && !b.includes('answer:'));
          if (valid.length > 0) {
            return valid.slice(0, 2).join(' ').slice(0, 250).trim();
          }
        }
      }
    }
    return t;
  };

  // 1. Primary: NVIDIA NIM Proxy
  try {
    const res = await fetch(`${API_BASE_URL}/api/nvidia/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        temperature: 0.3,
        max_tokens: 300,
        messages,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const rawText = data.choices?.[0]?.message?.content?.trim();
      const text = sanitizeCallBotResponse(rawText);
      if (text && isScriptConsistent(text, selectedLang) && !text.includes('fallback') && text !== '[]') {
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
          temperature: 0.3,
          max_tokens: 300,
          messages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const rawText = data.choices?.[0]?.message?.content?.trim();
        const text = sanitizeCallBotResponse(rawText);
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
              generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          const text = sanitizeCallBotResponse(rawText);
          if (text && isScriptConsistent(text, selectedLang)) {
            console.log('[CallBot Engine] Gemini OK');
            return text;
          }
        }
      } catch { }
    }
  }

  // 4. Local RAG Offline Generator (Ensures 100% reliability, no crashes, no hallucinations)
  console.log('[CallBot Engine] Local RAG Generator Fallback');
  const resolvedCrop = analysis.query_crop;
  const cropKey = resolvedCrop ? identifyCropDbKey(resolvedCrop) : null;
  const cropData = cropKey ? OFFLINE_CROP_DATABASE[cropKey] : null;
  const cropDisplayName = cropData ? (cropData.name[selectedLang] || cropData.name['ta'] || resolvedCrop || 'பயிர்') : 'பயிர்';
  const loc = analysis.query_location || profile.district || 'உங்கள் பகுதி';

  if (analysis.intents.includes('fertilizer') || /உரம்|fertilizer/i.test(message)) {
    if (!resolvedCrop || !cropData) {
      const responses: Record<string, string> = {
        ta: 'எந்த பயிருக்கு உரம் தேவை என்று குறிப்பிட்டால், துல்லியமான NPK உர அளவை உடனடியாக கூறுகிறேன்.',
        en: 'If you specify which crop you need fertilizer advice for, I will give you the exact NPK dosage immediately.',
        hi: 'यदि आप बताएंगे कि किस फसल के लिए खाद चाहिए, तो मैं तुरंत सही उर्वरक मात्रा बता दूंगा।',
      };
      return responses[selectedLang] || responses['ta'];
    }
    const responses: Record<string, string> = {
      ta: `${cropDisplayName} பயிருக்கு பரிந்துரைக்கப்படும் உர அளவு: ${cropData.npk}. நிலம் தயாரிக்கும் போது நன்கு மக்கிய தொழுவுரத்தை அடியுரமாக இடவும்.`,
      en: `For ${cropDisplayName}, the recommended fertilizer dosage is: ${cropData.npk}. Apply well-decomposed farmyard manure during land preparation.`,
      hi: `${cropDisplayName} के लिए अनुशंसित उर्वरक मात्रा: ${cropData.npk} है। बुवाई से पहले अच्छी तरह सड़ी हुई गोबर की खाद डालें।`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.requires_disease_rag || analysis.requires_prevention || analysis.requires_natural_remedy || analysis.requires_chemical_remedy) {
    if (!resolvedCrop || !cropData) {
      const responses: Record<string, string> = {
        ta: 'பயிரில் பூச்சி அல்லது நோய் பாதிப்பு என்ன என்பதை குறிப்பிட்டால், உடனடி பாதுகாப்பு முறையை கூறுகிறேன்.',
        en: 'Please specify which crop and pest symptoms you are observing, and I will recommend the immediate remedy.',
        hi: 'कृपया बताएं कि किस फसल में कौन से कीट या रोग के लक्षण हैं, ताकि मैं सही उपचार बता सकूं।',
      };
      return responses[selectedLang] || responses['ta'];
    }
    const responses: Record<string, string> = {
      ta: `${cropDisplayName} பயிரில் பாதிப்புக்கு: இயற்கை முறையில் ${cropData.organicRemedy} தீவிர நோய்க்கட்டுப்பாட்டுக்கு ${cropData.chemicalDosage}.`,
      en: `For ${cropDisplayName} protection: Organically, ${cropData.organicRemedy} For chemical control, ${cropData.chemicalDosage}.`,
      hi: `${cropDisplayName} में सुरक्षा के लिए: जैविक रूप से ${cropData.organicRemedy} रासायनिक उपचार के लिए ${cropData.chemicalDosage}.`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.intents.includes('irrigation')) {
    const responses: Record<string, string> = {
      ta: `${cropDisplayName} பயிருக்கான பாசன வழிகாட்டுதல்: ${cropData.irrigation}`,
      en: `Irrigation guidance for ${cropDisplayName}: ${cropData.irrigation}`,
      hi: `${cropDisplayName} के लिए सिंचाई सलाह: ${cropData.irrigation}`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.requires_market) {
    const responses: Record<string, string> = {
      ta: `${loc} சந்தையில் ${cropDisplayName} விலை நிலவரம்: ${cropData.marketBenchmark}. இன்றைய நேரடி மண்டி விலை இணையதளத்தில் புதுப்பிக்கப்படவில்லை.`,
      en: `Market reference for ${cropDisplayName} in ${loc}: ${cropData.marketBenchmark}. Today's live arrival rate is not updated on the Agmarknet portal.`,
      hi: `${loc} में ${cropDisplayName} का संदर्भ भाव: ${cropData.marketBenchmark}। आज का ताजा मंडी भाव पोर्टल पर अपडेट नहीं है।`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.requires_weather) {
    const responses: Record<string, string> = {
      ta: `${loc} பகுதியில் தற்போதைய நேரடி வானிலை முன்னறிவிப்பு தகவல் கிடைக்கவில்லை. உள்ளூர் வானிலை மைய அறிவிப்பை கவனிக்கவும்.`,
      en: `Live weather forecast for ${loc} is temporarily unavailable. Please check local advisory.`,
      hi: `${loc} के लिए लाइव मौसम पूर्वानुमान अभी उपलब्ध नहीं है। स्थानीय कृषि सलाह का पालन करें।`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.requires_schemes) {
    const responses: Record<string, string> = {
      ta: `விவசாயிகளுக்கு பிஎம்-கிசான் ஆண்டுக்கு ₹6,000 நிதி உதவி, பிரதம மந்திரி பயிர் காப்பீட்டுத் திட்டம் மற்றும் சொட்டுநீர் பாசன மானியம் அரசு வழங்கப்படுகிறது.`,
      en: `Key government schemes include PM-KISAN (₹6,000/year assistance), PM Fasal Bima Yojana crop insurance, and subsidized drip irrigation.`,
      hi: `किसानों के लिए मुख्य योजनाएं पीएम-किसान (₹6,000 प्रति वर्ष), फसल बीमा योजना और सब्सिडी वाली ड्रिप सिंचाई हैं।`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.intents.includes('soil')) {
    const responses: Record<string, string> = {
      ta: `மண் பரிசோதனை செய்ய நிலத்தில் 8 முதல் 10 இடங்களில் வி வடிவ குழியெடுத்து மண் சேகரித்து அருகிலுள்ள உழவர் மையத்தில் சமர்ப்பிக்கவும்.`,
      en: `For soil testing, collect V-shaped soil samples from 8-10 points across your field and submit them to the nearest Block Agriculture Centre.`,
      hi: `मिट्टी परीक्षण के लिए, खेत में 8-10 स्थानों से वी-आकार में नमूने एकत्र करें और निकटतम कृषि कार्यालय में जमा करें।`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.intents.includes('livestock') || /மாடு|ஆடு|பால்|livestock|cow|dairy/i.test(message)) {
    const d = OFFLINE_DOMAIN_KNOWLEDGE.livestock_dairy;
    const responses: Record<string, string> = {
      ta: `${d.summary.ta} ${d.action.ta}`,
      en: `${d.summary.en} ${d.action.en}`,
      hi: `${d.summary.hi} ${d.action.hi}`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.intents.includes('seeds_and_varieties') || /விதை நேர்த்தி|seed treatment/i.test(message)) {
    const d = OFFLINE_DOMAIN_KNOWLEDGE.seed_treatment;
    const responses: Record<string, string> = {
      ta: `${d.summary.ta} ${d.action.ta}`,
      en: `${d.summary.en} ${d.action.en}`,
      hi: `${d.summary.hi} ${d.action.hi}`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.intents.includes('post_harvest') || /storage|சேமிப்பு/i.test(message)) {
    const d = OFFLINE_DOMAIN_KNOWLEDGE.post_harvest;
    const responses: Record<string, string> = {
      ta: `${d.summary.ta} ${d.action.ta}`,
      en: `${d.summary.en} ${d.action.en}`,
      hi: `${d.summary.hi} ${d.action.hi}`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.intents.includes('institutions_helplines') || /helpline|ஹெல்ப்லைன்|1800/i.test(message)) {
    const d = OFFLINE_DOMAIN_KNOWLEDGE.institutions_helplines;
    const responses: Record<string, string> = {
      ta: `${d.summary.ta} ${d.action.ta}`,
      en: `${d.summary.en} ${d.action.en}`,
      hi: `${d.summary.hi} ${d.action.hi}`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (analysis.intents.includes('farmer_business') || /uzhavan santhai|உழவர் சந்தை|விற்பனை/i.test(message)) {
    const d = OFFLINE_DOMAIN_KNOWLEDGE.farmer_business;
    const responses: Record<string, string> = {
      ta: `${d.summary.ta} ${d.action.ta}`,
      en: `${d.summary.en} ${d.action.en}`,
      hi: `${d.summary.hi} ${d.action.hi}`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (/மழை வந்தா|மழை பெய்தால்|மழை/i.test(message)) {
    const cropPart = resolvedCrop && cropData ? `${cropDisplayName} ` : '';
    const responses: Record<string, string> = {
      ta: `மழை பெய்யும் போது ${cropPart}வயலில் தேங்கும் தண்ணீரை உடனடியாக வடிய வைக்கவும்; மழை நேரத்தில் பூச்சி மருந்தோ உரமோ தெளிக்க வேண்டாம்.`,
      en: `If it rains, ensure proper drainage in your ${cropPart}field immediately; avoid spraying fertilizers or pesticides during rain.`,
      hi: `बारिश के समय ${cropPart}खेत में जल निकासी सुनिश्चित करें और बारिश के दौरान कीटनाशक या खाद का छिड़काव न करें।`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  if (resolvedCrop) {
    const responses: Record<string, string> = {
      ta: `${cropDisplayName} பயிரிட ஏற்ற பருவம்: ${cropData.sowingTime}. ஏற்ற மண்: ${cropData.soil}. உங்களுக்கு வேறு என்ன வழிகாட்டுதல் தேவை?`,
      en: `Optimal sowing season for ${cropDisplayName} is ${cropData.sowingTime}, and recommended soil is ${cropData.soil}. How else can I assist you?`,
      hi: `${cropDisplayName} की बुवाई के लिए उपयुक्त समय: ${cropData.sowingTime} और उपयुक्त मिट्टी: ${cropData.soil} है। आप और क्या जानना चाहते हैं?`,
    };
    return responses[selectedLang] || responses['ta'];
  }

  const defaultResponses: Record<string, string> = {
    ta: `வணக்கம் உழவரே, உங்கள் பயிர் பாதுகாப்பு, உரம், வானிலை அல்லது அரசு திட்டங்கள் குறித்து நீங்கள் கேட்கலாம்.`,
    en: `Hello farmer, you can ask me about crop management, fertilizer dosage, weather forecasts, or government schemes.`,
    hi: `नमस्ते किसान भाई, आप फसल सुरक्षा, उर्वरक, मौसम या सरकारी योजनाओं के बारे में पूछ सकते हैं।`,
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
  const ttsSessionIdRef = useRef<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fullTranscriptRef = useRef<string>('');
  const callStartTimeRef = useRef<string>('');
  const lastDiscussedCropRef = useRef<string | null>(null);
  const activeSessionLangRef = useRef<string>('ta');
  const lastDiscussedTopicRef = useRef<string | null>(null);
  const lastDiscussedEntityRef = useRef<string | null>(null);

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
    let clean = sanitizeTextForSpeech(text);
    clean = clean.replace(/^['"]+|['"]+$/g, '').trim();
    if (!clean) { onDone(); return; }

    const sessionId = ++ttsSessionIdRef.current;
    console.log('[TTS] Speaking:', clean.substring(0, 80), '| lang:', langCode);
    stopListening();
    stopSpeech();
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }

    const sentences = splitTextIntoSentences(clean);
    if (sentences.length === 0) { onDone(); return; }

    const shortLang = LANG_SHORT[langCode] || langCode.split('-')[0] || 'ta';

    const fetchSentenceAudio = (sentenceText: string): Promise<Blob> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const targetUrl = `${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(sentenceText)}&lang=${shortLang}`;
      return fetch(targetUrl, { signal: controller.signal })
        .then(res => {
          clearTimeout(timeoutId);
          if (!res.ok) throw new Error(`TTS status ${res.status}`);
          return res.blob();
        })
        .catch(err => {
          clearTimeout(timeoutId);
          throw err;
        });
    };

    const prefetchMap = new Map<number, Promise<Blob>>();
    const getOrPrefetch = (idx: number): Promise<Blob> => {
      if (idx >= sentences.length) return Promise.reject(new Error('Out of bounds'));
      if (!prefetchMap.has(idx)) {
        prefetchMap.set(idx, fetchSentenceAudio(sentences[idx]));
      }
      return prefetchMap.get(idx)!;
    };

    // Pre-fetch sentence 0 immediately
    getOrPrefetch(0);
    // Pre-fetch sentence 1 in parallel if available
    if (sentences.length > 1) {
      getOrPrefetch(1);
    }

    let currentIndex = 0;

    const playNextSentence = () => {
      if (!isActiveRef.current || ttsSessionIdRef.current !== sessionId) return;

      if (currentIndex >= sentences.length) {
        if (isActiveRef.current && ttsSessionIdRef.current === sessionId) {
          onDone();
        }
        return;
      }

      const segText = sentences[currentIndex];
      const thisIdx = currentIndex;
      currentIndex++;

      // Trigger prefetch for upcoming sentence
      if (currentIndex < sentences.length) {
        getOrPrefetch(currentIndex);
      }

      getOrPrefetch(thisIdx)
        .then(blob => {
          if (!isActiveRef.current || ttsSessionIdRef.current !== sessionId) return;
          playAudioBlob(
            blob,
            () => {
              if (isActiveRef.current && ttsSessionIdRef.current === sessionId) {
                playNextSentence();
              }
            },
            () => {
              if (!isActiveRef.current || ttsSessionIdRef.current !== sessionId) return;
              speakBrowserFallback(segText, langCode, () => {
                if (isActiveRef.current && ttsSessionIdRef.current === sessionId) {
                  playNextSentence();
                }
              });
            }
          );
        })
        .catch(() => {
          if (!isActiveRef.current || ttsSessionIdRef.current !== sessionId) return;
          speakBrowserFallback(segText, langCode, () => {
            if (isActiveRef.current && ttsSessionIdRef.current === sessionId) {
              playNextSentence();
            }
          });
        });
    };

    playNextSentence();
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
    // Dynamic script detection: if farmer speaks in Kannada, Telugu, Malayalam, Hindi, or Tamil script, prioritize it immediately
    const detectedScript = detectLanguageFromMessage(message);
    const userLangCode = detectedScript || activeSessionLangRef.current || APP_LANG_MAP[appLanguage || farmerProfile.language || 'tamil'] || 'ta';
    activeSessionLangRef.current = userLangCode;
    console.log('[Language Session Track]: Active =', userLangCode, '(Script Detected =', detectedScript || 'none', ')');

    // Step 1: Intelligent Intent Classification & Entity Extraction
    const analysis = await analyzeQueryIntents(
      message,
      conversationHistory,
      userLangCode,
      farmerProfile,
      lastDiscussedCropRef.current,
      lastDiscussedTopicRef.current,
      lastDiscussedEntityRef.current
    );
    if (analysis.query_crop) {
      lastDiscussedCropRef.current = analysis.query_crop;
    }
    if (analysis.primary_intent) {
      lastDiscussedTopicRef.current = analysis.primary_intent;
    }
    console.log('[Router Analysis]', JSON.stringify(analysis));

    // Step 2: Parallel Multi-Source Data Retrieval (Weather, Market, News, RAG)
    const dataPromises: Promise<string>[] = [];
    if (analysis.requires_weather) {
      dataPromises.push(fetchWeather(analysis.query_location || farmerProfile.district));
    }
    if (analysis.requires_market) {
      dataPromises.push(fetchMarket(analysis.query_crop || (analysis.intents.includes('market') ? farmerProfile.crop_type : null), analysis.query_location || farmerProfile.district));
    }
    if (analysis.requires_news) {
      dataPromises.push(fetchNews(userLangCode, analysis.query_location || farmerProfile.district));
    }
    if (
      analysis.requires_disease_rag ||
      analysis.requires_prevention ||
      analysis.requires_natural_remedy ||
      analysis.requires_chemical_remedy ||
      analysis.requires_schemes ||
      analysis.intents.includes('fertilizer') ||
      analysis.intents.includes('soil') ||
      analysis.intents.includes('irrigation') ||
      analysis.intents.includes('crop_recommendation') ||
      analysis.intents.includes('crop_cultivation') ||
      analysis.intents.includes('livestock') ||
      analysis.intents.includes('seeds_and_varieties') ||
      analysis.intents.includes('post_harvest') ||
      analysis.intents.includes('institutions_helplines') ||
      analysis.intents.includes('farmer_business') ||
      Boolean(analysis.query_crop)
    ) {
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
    lastDiscussedCropRef.current = null;
    lastDiscussedTopicRef.current = null;
    lastDiscussedEntityRef.current = null;

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
    ttsSessionIdRef.current++;
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
    lastDiscussedCropRef.current = null;
    lastDiscussedTopicRef.current = null;
    lastDiscussedEntityRef.current = null;
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
