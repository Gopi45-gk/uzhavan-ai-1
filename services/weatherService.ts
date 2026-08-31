/**
 * Weather Intelligence Service for Farmers
 * 
 * Complete weather intelligence system with:
 * - Day/Night detection using sunrise/sunset from API
 * - Weather code to icon mapping (Lucide React)
 * - Tamil farmer advice
 * - 3-day/7-day rain alerts
 * - Caching for performance (15 minutes)
 * - Error handling with fallback
 * 
 * Uses Open-Meteo API via backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============= CACHE CONFIG =============
const CACHE_KEY = 'uzhavan_weather_cache';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const API_TIMEOUT_MS = 10000; // 10 seconds

// ============= Types =============

export interface SunTimes {
    sunrise: string;
    sunset: string;
    is_day: boolean;
    time_of_day: 'day' | 'night';
}

export interface WeatherIcon {
    icon_name: string;  // Lucide icon name: "sun", "moon", "cloud", etc.
    emoji: string;      // Fallback emoji
    description: string;
}

export interface CurrentWeather {
    temperature: number;
    feels_like: number;
    humidity: number;
    wind_speed: number;
    cloud_cover: number;
    precipitation: number;
    weather_code: number;
    weather_condition: string;
    weather_description: string;
    is_day: boolean;
    time_of_day: 'day' | 'night';
    icon: WeatherIcon;
    sun_times: SunTimes;
}

export interface DailyForecast {
    date: string;
    day_name: string;
    temp_max: number;
    temp_min: number;
    precipitation_sum: number;
    rain_sum: number;
    weather_code: number;
    weather_condition: string;
    weather_description: string;
    icon: WeatherIcon;
}

export interface RainAlertDay {
    day_number: number;
    date: string;
    day_name: string;
    rain_mm: number;
}

export interface RainAlert {
    has_alert: boolean;
    alert_level: 'none' | 'light' | 'moderate' | 'heavy';
    alert_message: string;
    alert_message_tamil: string;
    rain_days: RainAlertDay[];
    total_rain_mm: number;
}

export interface FarmerAdvice {
    advice_tamil: string;
    advice_english: string;
    weather_based: boolean;
    alert_based: boolean;
}

export interface WeatherIntelligenceResponse {
    location: string;
    latitude: number;
    longitude: number;
    timezone: string;
    current: CurrentWeather;
    daily_forecast: DailyForecast[];
    rain_alert: RainAlert;
    farmer_advice: FarmerAdvice;
    last_updated: string;
    cached: boolean;
}

// Legacy types for backward compatibility
export interface WeatherCurrent {
    temperature: number;
    humidity: number;
    windspeed: number;
    cloudcover: number;
    precipitation: number;
    weather_description: string;
}

export interface WeatherDaily {
    date: string;
    temp_max: number;
    temp_min: number;
    precipitation_sum: number;
    rain_sum: number;
    weather_description: string;
}

export interface WeatherResponse {
    location: string;
    latitude: number;
    longitude: number;
    current: WeatherCurrent;
    daily_forecast: WeatherDaily[];
    rain_alert: RainAlert;
    farming_advisory: string;
    last_updated: string;
}

// ============= Cache Helpers =============

interface CachedWeather {
    data: WeatherIntelligenceResponse;
    timestamp: number;
    location: string;
}

function getCacheKey(location: string): string {
    return `${CACHE_KEY}_${location.toLowerCase()}`;
}

function getCachedWeather(location: string): WeatherIntelligenceResponse | null {
    try {
        const key = getCacheKey(location);
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const parsed: CachedWeather = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;

        if (age < CACHE_TTL_MS) {
            console.log('📦 Using cached weather data');
            return { ...parsed.data, cached: true };
        } else {
            console.log('⏰ Weather cache expired');
            return null;
        }
    } catch {
        return null;
    }
}

function setCachedWeather(location: string, data: WeatherIntelligenceResponse): void {
    try {
        const key = getCacheKey(location);
        const cached: CachedWeather = {
            data,
            timestamp: Date.now(),
            location: location.toLowerCase()
        };
        localStorage.setItem(key, JSON.stringify(cached));
        console.log('✅ Weather data cached');
    } catch {
        // Ignore cache errors
    }
}

// ============= Fetch with Timeout =============

async function fetchWithTimeout(
    url: string,
    timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

// ============= Weather Icon Helpers =============

/**
 * Get Lucide React icon component name based on weather condition and time
 * This can be used with dynamic icon imports
 */
export function getLucideIconName(
    weatherCode: number,
    isDay: boolean
): string {
    // Clear (0)
    if (weatherCode === 0) {
        return isDay ? 'Sun' : 'Moon';
    }
    // Partly cloudy (1, 2)
    if (weatherCode === 1 || weatherCode === 2) {
        return isDay ? 'CloudSun' : 'CloudMoon';
    }
    // Cloudy (3)
    if (weatherCode === 3) {
        return 'Cloud';
    }
    // Fog (45, 48)
    if (weatherCode === 45 || weatherCode === 48) {
        return 'CloudFog';
    }
    // Drizzle (51-57)
    if (weatherCode >= 51 && weatherCode <= 57) {
        return 'CloudDrizzle';
    }
    // Rain (61-67)
    if (weatherCode >= 61 && weatherCode <= 67) {
        return 'CloudRain';
    }
    // Heavy rain (80-82)
    if (weatherCode >= 80 && weatherCode <= 82) {
        return 'CloudRainWind';
    }
    // Thunderstorm (95-99)
    if (weatherCode >= 95 && weatherCode <= 99) {
        return 'CloudLightning';
    }
    // Snow (71-77, 85-86)
    if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) {
        return 'Snowflake';
    }
    // Default
    return isDay ? 'Sun' : 'Moon';
}

/**
 * Get emoji icon for fallback display
 */
export function getWeatherEmoji(
    weatherCode: number,
    isDay: boolean
): string {
    // Clear (0)
    if (weatherCode === 0) {
        return isDay ? '☀️' : '🌙';
    }
    // Partly cloudy (1, 2)
    if (weatherCode === 1 || weatherCode === 2) {
        return isDay ? '⛅' : '☁️🌙';
    }
    // Cloudy (3)
    if (weatherCode === 3) {
        return '☁️';
    }
    // Fog (45, 48)
    if (weatherCode === 45 || weatherCode === 48) {
        return '🌫️';
    }
    // Drizzle (51-57)
    if (weatherCode >= 51 && weatherCode <= 57) {
        return '🌦️';
    }
    // Rain (61-67)
    if (weatherCode >= 61 && weatherCode <= 67) {
        return '🌧️';
    }
    // Heavy rain (80-82)
    if (weatherCode >= 80 && weatherCode <= 82) {
        return '🌧️💨';
    }
    // Thunderstorm (95-99)
    if (weatherCode >= 95 && weatherCode <= 99) {
        return '⛈️';
    }
    // Snow
    if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) {
        return '❄️';
    }
    return isDay ? '🌤️' : '☁️';
}

// ============= Day/Night Detection (Client-side Fallback) =============

/**
 * Determine if it's day or night using sunrise/sunset times
 * This is used as a fallback if API doesn't provide is_day
 */
export function isDayTime(
    currentTime: string | Date,
    sunrise: string,
    sunset: string
): boolean {
    try {
        const current = typeof currentTime === 'string'
            ? new Date(currentTime)
            : currentTime;

        const sunriseDate = new Date(sunrise);
        const sunsetDate = new Date(sunset);

        // Rule: current >= sunrise AND current < sunset → DAY
        return current >= sunriseDate && current < sunsetDate;
    } catch {
        // Fallback: assume day between 6 AM and 6 PM
        const hour = new Date().getHours();
        return hour >= 6 && hour < 18;
    }
}

// ============= Weather Intelligence Service =============

export const weatherIntelligenceService = {
    /**
     * Get comprehensive weather intelligence
     * Uses cache first, then fetches from API
     * Falls back to cached data on error
     */
    getWeatherIntelligence: async (location: string): Promise<WeatherIntelligenceResponse> => {
        // Try cache first for instant display
        const cached = getCachedWeather(location);

        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/weather/v3/intelligence?location=${encodeURIComponent(location)}`
            );

            if (!response.ok) {
                throw new Error('Weather API error');
            }

            const data: WeatherIntelligenceResponse = await response.json();

            // Update cache
            setCachedWeather(location, data);

            return data;
        } catch (error) {
            console.error('Weather fetch error:', error);

            // Return cached data if available
            if (cached) {
                console.log('⚠️ Using cached weather data due to error');
                return cached;
            }

            throw new Error('வானிலை தரவை பெற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.');
        }
    },

    /**
     * Get weather intelligence with coordinates
     */
    getWeatherByCoords: async (lat: number, lon: number): Promise<WeatherIntelligenceResponse> => {
        const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
        const cached = getCachedWeather(cacheKey);

        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/weather/v3/intelligence?lat=${lat}&lon=${lon}`
            );

            if (!response.ok) {
                throw new Error('Weather API error');
            }

            const data: WeatherIntelligenceResponse = await response.json();
            setCachedWeather(cacheKey, data);
            return data;
        } catch {
            if (cached) return cached;
            throw new Error('வானிலை தரவை பெற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.');
        }
    },

    /**
     * Get just the rain alert (lightweight)
     */
    getRainAlert: async (location: string): Promise<RainAlert> => {
        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/weather/v3/rain-alert?location=${encodeURIComponent(location)}`
            );

            if (!response.ok) {
                throw new Error('Rain alert API error');
            }

            return response.json();
        } catch {
            return {
                has_alert: false,
                alert_level: 'none',
                alert_message: 'Unable to fetch rain data',
                alert_message_tamil: 'மழை தரவை பெற முடியவில்லை',
                rain_days: [],
                total_rain_mm: 0
            };
        }
    },

    /**
     * Get available locations
     */
    getLocations: async (): Promise<{ locations: string[]; total: number }> => {
        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/weather/v3/locations`
            );
            return response.json();
        } catch {
            return { locations: [], total: 0 };
        }
    },

    /**
     * Get Lucide icon component name for weather
     */
    getIconName: getLucideIconName,

    /**
     * Get emoji for weather (fallback)
     */
    getEmoji: getWeatherEmoji,

    /**
     * Check if it's day time
     */
    isDayTime: isDayTime,

    /**
     * Get alert styling based on level
     */
    getAlertStyle: (level: string): { bg: string; text: string; border: string; icon: string } => {
        switch (level) {
            case 'light':
                return {
                    bg: 'bg-blue-100',
                    text: 'text-blue-800',
                    border: 'border-blue-300',
                    icon: 'CloudDrizzle'
                };
            case 'moderate':
                return {
                    bg: 'bg-yellow-100',
                    text: 'text-yellow-800',
                    border: 'border-yellow-300',
                    icon: 'CloudRain'
                };
            case 'heavy':
                return {
                    bg: 'bg-red-100',
                    text: 'text-red-800',
                    border: 'border-red-300',
                    icon: 'CloudRainWind'
                };
            default:
                return {
                    bg: 'bg-green-100',
                    text: 'text-green-800',
                    border: 'border-green-300',
                    icon: 'Sun'
                };
        }
    },

    /**
     * Format date for display
     */
    formatDate: (dateStr: string, locale: string = 'ta-IN'): string => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString(locale, {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    },

    /**
     * Clear weather cache
     */
    clearCache: (): void => {
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(CACHE_KEY)) {
                    localStorage.removeItem(key);
                }
            });
        } catch {
            // Ignore
        }
    }
};

// ============= Legacy Weather Service (Backward Compatibility) =============

export const weatherService = {
    /**
     * Get full weather forecast with 7-day data and rain alerts
     * @deprecated Use weatherIntelligenceService.getWeatherIntelligence instead
     */
    getForecast: async (location: string): Promise<WeatherResponse> => {
        const response = await fetch(
            `${API_BASE_URL}/api/weather/v2/forecast?location=${encodeURIComponent(location)}`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch weather data');
        }

        return response.json();
    },

    /**
     * Get just the 3-day rain alert (lightweight)
     * @deprecated Use weatherIntelligenceService.getRainAlert instead
     */
    getRainAlert: async (location: string): Promise<RainAlert> => {
        const response = await fetch(
            `${API_BASE_URL}/api/weather/v2/rain-alert?location=${encodeURIComponent(location)}`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch rain alert');
        }

        return response.json();
    },

    /**
     * Get list of available locations
     */
    getLocations: async (): Promise<{ locations: string[]; total: number }> => {
        const response = await fetch(`${API_BASE_URL}/api/weather/v2/locations`);

        if (!response.ok) {
            throw new Error('Failed to fetch locations');
        }

        return response.json();
    },

    /**
     * Get weather icon based on description
     * @deprecated Use weatherIntelligenceService.getEmoji instead
     */
    getWeatherIcon: (description: string): string => {
        const desc = description.toLowerCase();

        if (desc.includes('clear') || desc.includes('sunny')) return '☀️';
        if (desc.includes('partly cloudy')) return '⛅';
        if (desc.includes('cloudy') || desc.includes('overcast')) return '☁️';
        if (desc.includes('fog')) return '🌫️';
        if (desc.includes('drizzle')) return '🌦️';
        if (desc.includes('rain') || desc.includes('shower')) return '🌧️';
        if (desc.includes('thunder')) return '⛈️';
        if (desc.includes('snow')) return '❄️';

        return '🌤️';
    },

    /**
     * Get alert color based on level
     */
    getAlertColor: (level: string): { bg: string; text: string; border: string } => {
        switch (level) {
            case 'light':
                return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' };
            case 'moderate':
                return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' };
            case 'heavy':
                return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' };
            default:
                return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' };
        }
    },

    /**
     * Format date for display
     */
    formatDate: (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }
};

export default weatherIntelligenceService;
