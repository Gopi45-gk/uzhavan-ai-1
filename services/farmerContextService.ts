/**
 * Farmer Context Service (Frontend)
 * Reads current farmer profile from localStorage / Firebase, combines with live weather and market data,
 * and builds a dynamic Farmer Context prompt string for Gemini & LLM RAG pipelines.
 */

import { getApiBaseUrl } from './api';

const API_BASE_URL = getApiBaseUrl();

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
  state?: string;
  land_area?: string;
}

export interface DiseaseContextData {
  disease: string;
  confidence: string;
  crop?: string;
  timestamp?: string;
}

const CACHE_KEY = 'uzhavan_user_profile';
const DISEASE_KEY = 'uzhavan_recent_disease';
const WEATHER_CACHE_KEY = 'uzhavan_live_weather';
const MARKET_CACHE_KEY = 'uzhavan_live_market';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for live data

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

// ─────────────────── LIVE WEATHER DATA FOR CONTEXT ───────────────────
export const fetchLiveWeatherForContext = async (location: string): Promise<string> => {
  try {
    // Check cache first
    const cached = localStorage.getItem(WEATHER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    }

    const res = await fetch(`${API_BASE_URL}/api/weather/current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 13.0827, longitude: 80.2707, language: 'english' }),
    });

    if (res.ok) {
      const weather = await res.json();
      const summary = `Current Weather in ${weather.location || location}: Temperature ${weather.current?.temperature || weather.temperature || '31'}°C, Humidity ${weather.current?.humidity || weather.humidity || '68'}%, Wind ${weather.current?.windspeed || weather.wind_speed || '14'} km/h, Condition: ${weather.current?.weather_description || weather.description || 'Clear'}, Precipitation: ${weather.current?.precipitation || '0'} mm. Farming Advisory: ${weather.farming_advisory || 'Suitable for field work.'}`;
      try {
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data: summary, timestamp: Date.now() }));
      } catch { }
      return summary;
    }
  } catch (err) {
    console.warn('[FarmerContext] Weather fetch failed:', err);
  }
  return 'Live weather data active — unable to fetch current details.';
};

// ─────────────────── LIVE MARKET DATA FOR CONTEXT ───────────────────
export const fetchLiveMarketForContext = async (crop: string, location: string): Promise<string> => {
  try {
    // Check cache first
    const cached = localStorage.getItem(MARKET_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    }

    const res = await fetch(`${API_BASE_URL}/api/market/prices?state=${encodeURIComponent(location)}&lang=en&category=all`);
    if (res.ok) {
      const market = await res.json();
      const prices = market.prices || {};
      const allItems = [...(prices.vegetables || []), ...(prices.fruits || []), ...(prices.grains || [])];
      
      // Find the farmer's registered crop in the market data
      const cropLower = (crop || '').toLowerCase();
      const matchedCrop = allItems.find((item: any) => 
        item.commodity?.toLowerCase().includes(cropLower) || cropLower.includes(item.commodity?.toLowerCase())
      );

      let summary = `Market Data for ${market.location || location} (Source: ${market.source || 'Agmarknet'}):`;
      if (matchedCrop) {
        summary += ` ${matchedCrop.commodity} (${matchedCrop.variety}): Min ₹${matchedCrop.min_price}/Qtl, Modal ₹${matchedCrop.modal_price}/Qtl, Max ₹${matchedCrop.max_price}/Qtl at ${matchedCrop.market}. Trend: ${matchedCrop.trend || 'stable'}. Next Day Prediction: ₹${matchedCrop.predicted_next_price}/Qtl (${matchedCrop.percentage_change > 0 ? '+' : ''}${matchedCrop.percentage_change}%).`;
      }
      // Add top 3 commodities for general awareness
      const top3 = allItems.slice(0, 3);
      summary += ' Top commodities: ' + top3.map((item: any) => `${item.commodity}: ₹${item.modal_price}/Qtl`).join(', ') + '.';

      try {
        localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({ data: summary, timestamp: Date.now() }));
      } catch { }
      return summary;
    }
  } catch (err) {
    console.warn('[FarmerContext] Market fetch failed:', err);
  }
  return 'Agmarknet live mandi prices active — unable to fetch current details.';
};

// ─────────────────── LIVE NEWS DATA FOR CONTEXT ───────────────────
export const fetchLiveNewsForContext = async (state: string, language: string): Promise<string> => {
  try {
    const stateSlug = (state || 'tamil_nadu').toLowerCase().replace(/\s+/g, '_');
    const res = await fetch(`${API_BASE_URL}/api/news/cards?language=${encodeURIComponent(language)}&state=${stateSlug}&crop=`);
    if (res.ok) {
      const news = await res.json();
      const cards = news.cards || [];
      if (cards.length > 0) {
        const topNews = cards.slice(0, 3).map((c: any) => `"${c.title}" (${c.source}, ${c.date})`).join('; ');
        return `Latest Agriculture News: ${topNews}`;
      }
    }
  } catch (err) {
    console.warn('[FarmerContext] News fetch failed:', err);
  }
  return '';
};

// ─────────────────── ORIGINAL CONTEXT BUILDER (preserved) ───────────────────
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
  const state = profile.state || 'Tamil Nadu';

  const diseaseBlock = disease?.disease
    ? `Recent Crop Diagnosis (${disease.crop || crop}): ${disease.disease} (Confidence: ${disease.confidence})`
    : 'No active disease diagnosis recorded recently.';

  return `
==================================================
AUTHENTICATED FARMER RUNTIME CONTEXT (AUTOMATICALLY INJECTED)
==================================================
Farmer Name: ${name}
Registered Location / District: ${district}
State: ${state}
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

// ─────────────────── ENRICHED CONTEXT (with live data) ───────────────────
export const buildEnrichedContextPrompt = async (): Promise<string> => {
  const profile = getStoredFarmerProfile();
  const district = profile.location || profile.district || 'Thanjavur';
  const crop = profile.crop_type || 'Paddy';
  const language = profile.language || 'english';
  const state = profile.state || 'Tamil Nadu';

  // Fetch live data in parallel
  const [weatherSummary, marketSummary] = await Promise.all([
    fetchLiveWeatherForContext(district),
    fetchLiveMarketForContext(crop, district),
  ]);

  return buildFarmerContextPrompt(profile, weatherSummary, marketSummary);
};
