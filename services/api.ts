/**
 * Uzhavan AI - API Service
 * Connects frontend to FastAPI backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Token management
let authToken: string | null = localStorage.getItem('authToken');

export const setAuthToken = (token: string | null) => {
    authToken = token;
    if (token) {
        localStorage.setItem('authToken', token);
    } else {
        localStorage.removeItem('authToken');
    }
};

export const getAuthToken = () => authToken;

// Generic fetch wrapper with auth
async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (authToken) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

// ============= Auth API =============

export interface UserData {
    id: number;
    phone: string;
    name: string;
    user_type: string;
    language: string;
    location: string | null;
    created_at: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    user: UserData;
}

export const authAPI = {
    register: async (data: {
        phone: string;
        name: string;
        password: string;
        user_type: string;
        language: string;
        location?: string;
    }): Promise<AuthResponse> => {
        const response = await apiFetch<AuthResponse>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        setAuthToken(response.access_token);
        return response;
    },

    login: async (phone: string, password: string): Promise<AuthResponse> => {
        const response = await apiFetch<AuthResponse>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password }),
        });
        setAuthToken(response.access_token);
        return response;
    },

    logout: () => {
        setAuthToken(null);
    },

    getMe: async (): Promise<UserData> => {
        return apiFetch<UserData>('/api/auth/me');
    },
};

// ============= Chat API =============

export interface ChatMessage {
    id: string;
    message: string;
    response: string;
    language: string;
    timestamp: string;
}

export const chatAPI = {
    sendMessage: async (
        message: string,
        language: string = 'english',
        imageBase64?: string
    ): Promise<ChatMessage> => {
        return apiFetch<ChatMessage>('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({
                message,
                language,
                image_base64: imageBase64,
            }),
        });
    },

    getHistory: async (limit: number = 50): Promise<ChatMessage[]> => {
        return apiFetch<ChatMessage[]>(`/api/chat/history?limit=${limit}`);
    },
};

// ============= Disease API =============

export interface DiseaseResult {
    disease_name: string;
    confidence: number;
    description: string;
    symptoms: string[];
    treatment: string[];
    prevention: string[];
    organic_solutions: string[];
}

export const diseaseAPI = {
    predict: async (
        imageBase64: string,
        language: string = 'english',
        cropName?: string
    ): Promise<DiseaseResult> => {
        return apiFetch<DiseaseResult>('/api/disease/predict', {
            method: 'POST',
            body: JSON.stringify({
                image_base64: imageBase64,
                language,
                crop_name: cropName,
            }),
        });
    },

    getHistory: async (limit: number = 20) => {
        return apiFetch(`/api/disease/history?limit=${limit}`);
    },
};

// ============= Weather API =============

export interface WeatherData {
    location: string;
    temperature: number;
    feels_like: number;
    humidity: number;
    description: string;
    icon: string;
    wind_speed: number;
    forecast: Array<{
        date: string;
        temperature: number;
        description: string;
        icon: string;
    }>;
    farming_advisory: string;
}

export const weatherAPI = {
    getCurrent: async (
        latitude: number,
        longitude: number,
        language: string = 'english'
    ): Promise<WeatherData> => {
        return apiFetch<WeatherData>('/api/weather/current', {
            method: 'POST',
            body: JSON.stringify({ latitude, longitude, language }),
        });
    },

    getAlerts: async (latitude: number, longitude: number) => {
        return apiFetch(`/api/weather/alerts?latitude=${latitude}&longitude=${longitude}`);
    },
};

// ============= Market API =============

export interface MarketPrice {
    market: string;
    min_price: number;
    max_price: number;
    modal_price: number;
    arrival_date: string;
}

export interface MarketData {
    crop_name: string;
    prices: MarketPrice[];
    trend: string;
    recommendation: string;
}

export const marketAPI = {
    getPrices: async (
        cropName: string,
        language: string = 'english',
        state?: string,
        district?: string
    ): Promise<MarketData> => {
        return apiFetch<MarketData>('/api/market/prices', {
            method: 'POST',
            body: JSON.stringify({
                crop_name: cropName,
                language,
                state,
                district,
            }),
        });
    },

    getAvailableCrops: async () => {
        return apiFetch<{ crops: string[] }>('/api/market/crops');
    },

    getTrending: async () => {
        return apiFetch('/api/market/trending');
    },
};

// ============= Crop Recommendation API =============

export interface CropRecommendation {
    name: string;
    suitability_score: number;
    expected_yield: string;
    water_requirement: string;
    growth_duration: string;
    market_demand: string;
    tips: string[];
}

export interface CropRecommendationResult {
    recommended_crops: CropRecommendation[];
    soil_health_tips: string[];
    seasonal_advice: string;
}

export const cropAPI = {
    getRecommendations: async (
        soilType: string,
        location: string,
        season: string,
        language: string = 'english',
        waterAvailability: string = 'moderate',
        budget: string = 'medium'
    ): Promise<CropRecommendationResult> => {
        return apiFetch<CropRecommendationResult>('/api/crop/recommend', {
            method: 'POST',
            body: JSON.stringify({
                soil_type: soilType,
                location,
                season,
                language,
                water_availability: waterAvailability,
                budget,
            }),
        });
    },

    getSoilTypes: async () => {
        return apiFetch('/api/crop/soil-types');
    },

    getSeasons: async () => {
        return apiFetch('/api/crop/seasons');
    },

    getHistory: async (limit: number = 10) => {
        return apiFetch(`/api/crop/history?limit=${limit}`);
    },
};

// ============= Voice Call API =============

export interface CallResponse {
    response_text: string;
    audio_base64?: string;
    language: string;
}

export const callAPI = {
    sendQuery: async (
        query: string,
        language: string = 'english'
    ): Promise<CallResponse> => {
        return apiFetch<CallResponse>('/api/call/query', {
            method: 'POST',
            body: JSON.stringify({ query, language }),
        });
    },

    getSupportedLanguages: async () => {
        return apiFetch('/api/call/supported-languages');
    },

    getQuickQuestions: async (language: string = 'english') => {
        return apiFetch(`/api/call/quick-questions?language=${language}`);
    },
};

// ============= Health Check =============

export const healthCheck = async (): Promise<{ status: string }> => {
    return apiFetch('/health');
};

// Export all APIs
export default {
    auth: authAPI,
    chat: chatAPI,
    disease: diseaseAPI,
    weather: weatherAPI,
    market: marketAPI,
    crop: cropAPI,
    call: callAPI,
    healthCheck,
};
