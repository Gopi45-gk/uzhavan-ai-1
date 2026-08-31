/**
 * UZHAVAN AI - Cloud Functions API Service
 * =========================================
 * Secure frontend service layer that calls Firebase Cloud Functions.
 * NO API keys are exposed in this file.
 * All external API calls go through the backend Cloud Functions.
 */

import { auth } from './firebase';

// ============== CONFIG ==============
// Cloud Functions base URL - update after deployment
const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_URL || 'https://us-central1-uzhavan-ai.cloudfunctions.net';

// For local development with emulator:
// const FUNCTIONS_BASE = 'http://localhost:5001/uzhavan-ai/us-central1';

// ============== AUTH HELPER ==============
async function getAuthHeaders(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');

    const token = await user.getIdToken();
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

// ============== API FUNCTIONS ==============

/**
 * Feature 1: Disease Detection via Camera
 * Sends image to Cloud Function → Plant.id → Gemini → localized result
 */
export async function detectDiseaseSecure(imageBase64: string): Promise<{
    disease_name: string;
    confidence: string;
    symptoms: string;
    causes: string;
    treatment: string;
    prevention: string;
}> {
    const headers = await getAuthHeaders();

    const response = await fetch(`${FUNCTIONS_BASE}/detectDisease`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64 }),
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
}

/**
 * Feature 2: Mushroom Identification
 * Sends image to Cloud Function → Mushroom.id → Gemini → localized result
 */
export async function identifyMushroomSecure(imageBase64: string): Promise<{
    species_name: string;
    confidence: string;
    is_edible: boolean;
    is_toxic: boolean;
    description: string;
    safety_warning: string;
    usage: string;
}> {
    const headers = await getAuthHeaders();

    const response = await fetch(`${FUNCTIONS_BASE}/identifyMushroom`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64 }),
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
}

/**
 * Feature 3: Crop Disease List (based on registered crop)
 * Fetches diseases for user's registered crop, translated to their language
 */
export async function getCropDiseasesSecure(): Promise<{
    crop: string;
    diseases: Array<{
        name: string;
        symptoms: string;
        causes: string;
        organic_remedy: string;
        chemical_remedy: string;
        prevention: string;
    }>;
}> {
    const headers = await getAuthHeaders();

    const response = await fetch(`${FUNCTIONS_BASE}/getCropDiseases`, {
        method: 'POST',
        headers,
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return { crop: result.crop, diseases: result.diseases };
}

/**
 * Feature 4: Market Prices
 * Fetches from data.gov.in via Cloud Function with caching
 */
export async function getMarketPricesSecure(
    state: string = 'Tamil Nadu',
    lang: string = 'en',
    category: string = 'all'
): Promise<{
    prices: Array<{
        commodity: string;
        market: string;
        district: string;
        min_price: number;
        max_price: number;
        modal_price: number;
        arrival_date: string;
    }>;
    cached: boolean;
}> {
    const params = new URLSearchParams({ state, lang, category });

    const response = await fetch(`${FUNCTIONS_BASE}/getMarketPrices?${params}`, {
        method: 'GET',
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return { prices: result.prices, cached: result.cached };
}

/**
 * Feature 5: Agriculture News
 * Fetches PIB RSS via Cloud Function, translated to user's language
 */
export async function getAgriNewsSecure(lang: string = 'en'): Promise<{
    articles: Array<{
        title: string;
        description: string;
        link: string;
        pubDate: string;
        source: string;
    }>;
    cached: boolean;
}> {
    const params = new URLSearchParams({ lang });

    const response = await fetch(`${FUNCTIONS_BASE}/getAgriNews?${params}`, {
        method: 'GET',
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return { articles: result.articles, cached: result.cached };
}

/**
 * Feature 6: AI Chatbot
 * Sends message to Gemini via Cloud Function, localized response
 */
export async function chatSecure(
    message: string,
    imageBase64?: string
): Promise<string> {
    const headers = await getAuthHeaders();

    const response = await fetch(`${FUNCTIONS_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, imageBase64 }),
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.response;
}
