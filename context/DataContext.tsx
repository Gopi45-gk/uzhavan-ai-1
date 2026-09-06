import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getApiBaseUrl } from '../services/api';

// Interfaces matching backend response
export interface WeatherData {
    location: string;
    latitude: number;
    longitude: number;
    current: {
        temperature: number;
        humidity: number;
        windspeed: number;
        cloudcover: number;
        precipitation: number;
        weather_description: string;
    };
    daily_forecast: Array<{
        date: string;
        temp_max: number;
        temp_min: number;
        precipitation_sum: number;
        rain_sum: number;
        weather_description: string;
    }>;
    rain_alert: {
        has_alert: boolean;
        alert_level: string;
        alert_message: string;
        rain_days: any[];
    };
    farming_advisory: string;
    last_updated: string;
    raw_data?: any;
}

export interface MandiPrice {
    id: number;
    commodity: string;
    state: string;
    district: string;
    market: string;
    modal_price: number;
    min_price: number;
    max_price: number;
    arrival_date: string;
    variety?: string;
    unit?: string;
}

export interface NewsCard {
    title: string;
    summary: string;
    tag: string;
    source: string;
    date: string;
    image_url?: string;
}

export interface NewsData {
    cards: NewsCard[];
    empty_message?: string;
    last_updated: string;
}

export interface DashboardResponse {
    status: 'success' | 'partial' | 'error';
    message: string;
    weather: WeatherData | null;
    mandi_prices: MandiPrice[];
    news: NewsData | null;
    meta: any;
}

interface DataContextType {
    data: DashboardResponse | null;
    isLoading: boolean;
    error: string | null;
    refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};

interface DataProviderProps {
    children: ReactNode;
    userCoords?: { lat: number; lon: number };
    userState?: string;
    language?: string;
}

// Language name to code mapping
const LANGUAGE_CODE_MAP: Record<string, string> = {
    'english': 'en',
    'tamil': 'ta',
    'telugu': 'te',
    'malayalam': 'ml',
    'kannada': 'kn',
    'hindi': 'hi',
    'en': 'en',
    'ta': 'ta',
    'te': 'te',
    'ml': 'ml',
    'kn': 'kn',
    'hi': 'hi',
};

const DASHBOARD_CACHE_KEY = 'uzhavan_cached_dashboard';

const getOfflineFallbackDashboard = (stateName: string = 'Tamil Nadu', isTa: boolean = false): DashboardResponse => ({
    status: 'success',
    message: 'Offline mode active',
    weather: {
        location: stateName,
        latitude: 13.0827,
        longitude: 80.2707,
        current: {
            temperature: 30.5,
            humidity: 68,
            windspeed: 12.4,
            cloudcover: 25,
            precipitation: 0,
            weather_description: isTa ? 'மிதமான வானிலை' : 'Partly Cloudy'
        },
        daily_forecast: [
            { date: new Date().toISOString().split('T')[0], temp_max: 33, temp_min: 24, precipitation_sum: 0, rain_sum: 0, weather_description: isTa ? 'வெயில்' : 'Sunny' },
            { date: new Date(Date.now() + 86400000).toISOString().split('T')[0], temp_max: 32, temp_min: 23, precipitation_sum: 2, rain_sum: 1, weather_description: isTa ? 'லேசான மழை' : 'Passing Showers' }
        ],
        rain_alert: {
            has_alert: false,
            alert_level: 'none',
            alert_message: isTa ? 'இன்று தீவிர மழை எச்சரிக்கை இல்லை' : 'No extreme rain alert today',
            rain_days: []
        },
        farming_advisory: isTa
            ? 'சாதகமான தட்பவெப்ப நிலை. பயிர்களுக்கு வழக்கமான நீர்ப்பாசனம் மற்றும் களையெடுப்பு செய்யலாம்.'
            : 'Favorable agricultural conditions. Continue standard irrigation and weed management.',
        last_updated: new Date().toISOString()
    },
    mandi_prices: [
        { id: 1, commodity: isTa ? 'நெல்' : 'Paddy', state: stateName, district: 'Thanjavur', market: 'Regulated Market', modal_price: 2280, min_price: 2150, max_price: 2450, arrival_date: new Date().toISOString().split('T')[0], unit: 'Quintal' },
        { id: 2, commodity: isTa ? 'தக்காளி' : 'Tomato', state: stateName, district: 'Dharmapuri', market: 'Uzhavar Sandhai', modal_price: 2800, min_price: 2400, max_price: 3200, arrival_date: new Date().toISOString().split('T')[0], unit: 'Quintal' },
        { id: 3, commodity: isTa ? 'வெங்காயம்' : 'Onion', state: stateName, district: 'Tiruppur', market: 'Dharapuram Market', modal_price: 3400, min_price: 3000, max_price: 3900, arrival_date: new Date().toISOString().split('T')[0], unit: 'Quintal' },
        { id: 4, commodity: isTa ? 'பருத்தி' : 'Cotton', state: stateName, district: 'Salem', market: 'Salem Market', modal_price: 7100, min_price: 6800, max_price: 7400, arrival_date: new Date().toISOString().split('T')[0], unit: 'Quintal' },
        { id: 5, commodity: isTa ? 'வாழை' : 'Banana', state: stateName, district: 'Trichy', market: 'Gandhi Market', modal_price: 2400, min_price: 2000, max_price: 2800, arrival_date: new Date().toISOString().split('T')[0], unit: 'Quintal' }
    ],
    news: {
        cards: [
            {
                title: isTa ? 'விவசாயிகளுக்கான சொட்டுநீர் பாசன மானியம் மற்றும் PMKSY திட்டங்கள்' : 'Micro-Irrigation Subsidy and PMKSY Support for Farmers',
                summary: isTa
                    ? 'சிறு மற்றும் குறு விவசாயிகளுக்கு 100% மானியத்தில் நுண்ணீர்ப்பாசனம் வழங்கப்படுகிறது. வட்டார வேளாண்மை அலுவலகத்தை அணுகலாம்.'
                    : '100% subsidy for micro-irrigation systems available for small and marginal farmers under PMKSY.',
                tag: 'Scheme',
                source: 'Govt Agriculture Dept',
                date: new Date().toISOString().split('T')[0]
            }
        ],
        last_updated: new Date().toISOString()
    },
    meta: { offline: true }
});

export const DataProvider: React.FC<DataProviderProps> = ({ children, userCoords, userState = "Tamil Nadu", language = 'english' }) => {
    const [data, setData] = useState<DashboardResponse | null>(() => {
        try {
            const cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
            if (cached) return JSON.parse(cached);
        } catch {}
        return null;
    });
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        const isTa = language.toLowerCase().includes('ta') || language.toLowerCase().includes('tamil');
        try {
            const lat = userCoords?.lat || 13.0827;
            const lon = userCoords?.lon || 80.2707;
            const langCode = LANGUAGE_CODE_MAP[language.toLowerCase()] || 'en';
            const state = userState || "Tamil Nadu";
            const apiUrl = getApiBaseUrl();

            const response = await fetch(`${apiUrl}/api/v1/dashboard/?lat=${lat}&lon=${lon}&state=${encodeURIComponent(state)}&lang=${langCode}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result: DashboardResponse = await response.json();
            setData(result);

            try {
                if (result && (result.status === 'success' || result.weather)) {
                    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(result));
                }
            } catch {}

            if (result.status === 'partial') {
                setError(result.message);
            }
        } catch (err: any) {
            console.warn("Dashboard fetch error, checking offline cache:", err);
            // 1. Try restoring from cache
            let restored = false;
            try {
                const cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
                if (cached) {
                    setData(JSON.parse(cached));
                    restored = true;
                }
            } catch {}

            // 2. If no valid cache, load offline fallback
            if (!restored) {
                setData(getOfflineFallbackDashboard(userState || 'Tamil Nadu', isTa));
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [userCoords?.lat, userCoords?.lon, userState, language]);

    return (
        <DataContext.Provider value={{ data, isLoading, error, refreshData: fetchData }}>
            {children}
        </DataContext.Provider>
    );
};
