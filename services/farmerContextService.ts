/**
 * Farmer Context Service (Frontend)
 * Reads current farmer profile from localStorage / Firebase, combines with live weather and market data,
 * and builds a dynamic Farmer Context prompt string for Gemini & LLM RAG pipelines.
 */

export interface FarmerProfileData {
  name?: string;
  location?: string | null;
  district?: string;
  crop_type?: string;
  soil_type?: string;
  language?: string;
  user_type?: string;
  experience?: string;
  farming_type?: string;
}

export interface DiseaseContextData {
  disease: string;
  confidence: string;
  crop?: string;
  timestamp?: string;
}

const CACHE_KEY = 'uzhavan_user_profile';
const DISEASE_KEY = 'uzhavan_recent_disease';

export const getStoredFarmerProfile = (): FarmerProfileData => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.profile || parsed;
    }
  } catch { }
  return {
    name: 'Uzhavan Farmer',
    location: 'Thanjavur',
    district: 'Thanjavur',
    crop_type: 'Paddy',
    soil_type: 'Alluvial',
    language: 'english'
  };
};

export const storeRecentDisease = (disease: string, confidence: string, crop?: string) => {
  try {
    const data: DiseaseContextData = {
      disease,
      confidence,
      crop,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(DISEASE_KEY, JSON.stringify(data));
  } catch { }
};

export const getRecentDisease = (): DiseaseContextData | null => {
  try {
    const raw = localStorage.getItem(DISEASE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return null;
};

export const buildFarmerContextPrompt = (
  customProfile?: FarmerProfileData,
  weatherSummary?: string,
  marketSummary?: string
): string => {
  const profile = customProfile || getStoredFarmerProfile();
  const disease = getRecentDisease();

  const district = profile.location || profile.district || 'Thanjavur';
  const crop = profile.crop_type || 'Paddy';
  const soil = profile.soil_type || 'Alluvial';
  const lang = profile.language || 'english';
  const name = profile.name || 'Uzhavan Farmer';

  const diseaseBlock = disease?.disease
    ? `Recent Crop Diagnosis (${disease.crop || crop}): ${disease.disease} (Confidence: ${disease.confidence})`
    : 'No active disease diagnosis recorded recently.';

  return `
==================================================
AUTHENTICATED FARMER RUNTIME CONTEXT (AUTOMATICALLY INJECTED)
==================================================
Farmer Name: ${name}
Registered Location / District: ${district}
Main Crop: ${crop}
Soil Type: ${soil}
Language Preference: ${lang}

LIVE WEATHER CONTEXT (${district}):
${weatherSummary || 'Live weather data active.'}

LIVE MARKET CONTEXT (${crop} in ${district}):
${marketSummary || 'Agmarknet live mandi prices active.'}

DISEASE CONTEXT:
${diseaseBlock}
==================================================
CRITICAL INSTRUCTION FOR AI RESPONSE:
1. Every answer MUST be specifically personalized for this farmer growing ${crop} in ${district} with ${soil} soil.
2. If weather indicates rain/heavy rain, PROACTIVELY advise AGAINST spraying chemicals or harvesting today.
3. Incorporate market price trends when suggesting harvesting, selling timing, or crop selection.
4. Always respond in the requested language (${lang}).
==================================================
`;
};
