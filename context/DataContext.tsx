import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

export const DataProvider: React.FC<DataProviderProps> = ({ children, userCoords, userState = "Tamil Nadu", language = 'english' }) => {
    const [data, setData] = useState<DashboardResponse | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading immediately
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Default to Chennai if no coords provided
            const lat = userCoords?.lat || 13.0827;
            const lon = userCoords?.lon || 80.2707;

            // Convert language name to code
            const langCode = LANGUAGE_CODE_MAP[language.toLowerCase()] || 'en';

            // Use default state if not provided
            const state = userState || "Tamil Nadu";

            // Use environment variable for API URL (production ready)
            const apiUrl = import.meta.env.VITE_API_URL || '';

            const response = await fetch(`${apiUrl}/api/v1/dashboard/?lat=${lat}&lon=${lon}&state=${encodeURIComponent(state)}&lang=${langCode}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result: DashboardResponse = await response.json();

            setData(result);

            if (result.status === 'partial') {
                setError(result.message); // Show warning but keep data
            }

        } catch (err: any) {
            console.error("Dashboard fetch error:", err);
            setError(err.message || 'Failed to fetch data');
            // Set empty data to avoid null checks failing downstream
            setData({
                status: 'error',
                message: 'Failed to load data.',
                weather: null,
                mandi_prices: [],
                news: null,
                meta: {}
            });
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
