/**
 * Agriculture News Intelligence Service for Indian Farmers
 * 
 * Features:
 * - Fetches localized agriculture news
 * - Supports multiple languages (Tamil, Telugu, Malayalam, Kannada, Hindi)
 * - State-based news filtering
 * - Card-style news with voice support
 * - Caching for performance
 * 
 * API: /api/news
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============= CACHE CONFIG =============
const CACHE_KEY = 'uzhavan_agri_news_cache';
const CARDS_CACHE_KEY = 'uzhavan_agri_news_cards_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const API_TIMEOUT_MS = 30000; // 30 seconds (translation takes time)

// ============= Types =============

export interface NewsItem {
    title: string;
    title_english?: string;
    summary: string;
    summary_english?: string;
    source: string;
    date: string;
    url?: string;
    image_url?: string;
}

export interface AgricultureNewsResponse {
    language: string;
    state: string;
    news_count: number;
    news: NewsItem[];
    cached: boolean;
    last_updated: string;
}

// Card-style news types
export interface NewsCard {
    title: string;
    summary: string;
    tag: 'scheme' | 'MSP' | 'weather' | 'crop' | 'subsidy' | 'alert';
    source: string;
    date: string;
    voice_available: boolean;
    image_url?: string;
}

export interface NewsCardsResponse {
    screen: string;
    view: string;
    language: string;
    state: string;
    daily_update: boolean;
    voice_enabled: boolean;
    notification_enabled: boolean;
    cards: NewsCard[];
    empty_message?: string;
    last_updated: string;
}

export interface DailyNotification {
    has_news: boolean;
    notification_title: string;
    notification_body?: string;
    tag?: string;
    source?: string;
    language: string;
    state: string;
    timestamp?: string;
}

export interface IndianState {
    id: string;
    name: string;
    name_tamil: string;
}

export interface SupportedLanguage {
    id: string;
    name: string;
    native_name: string;
}

// ============= Supported Languages =============

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
    { id: 'tamil', name: 'Tamil', native_name: 'தமிழ்' },
    { id: 'telugu', name: 'Telugu', native_name: 'తెలుగు' },
    { id: 'malayalam', name: 'Malayalam', native_name: 'മലയാളം' },
    { id: 'kannada', name: 'Kannada', native_name: 'ಕನ್ನಡ' },
    { id: 'hindi', name: 'Hindi', native_name: 'हिंदी' },
    { id: 'english', name: 'English', native_name: 'English' }
];

// ============= Indian States =============

export const INDIAN_STATES: IndianState[] = [
    { id: 'all_india', name: 'All India', name_tamil: 'அனைத்து இந்தியா' },
    { id: 'tamil_nadu', name: 'Tamil Nadu', name_tamil: 'தமிழ்நாடு' },
    { id: 'karnataka', name: 'Karnataka', name_tamil: 'கர்நாடகா' },
    { id: 'kerala', name: 'Kerala', name_tamil: 'கேரளா' },
    { id: 'andhra_pradesh', name: 'Andhra Pradesh', name_tamil: 'ஆந்திரப் பிரதேசம்' },
    { id: 'telangana', name: 'Telangana', name_tamil: 'தெலங்கானா' },
    { id: 'maharashtra', name: 'Maharashtra', name_tamil: 'மகாராஷ்டிரா' },
    { id: 'gujarat', name: 'Gujarat', name_tamil: 'குஜராத்' },
    { id: 'rajasthan', name: 'Rajasthan', name_tamil: 'ராஜஸ்தான்' },
    { id: 'madhya_pradesh', name: 'Madhya Pradesh', name_tamil: 'மத்திய பிரதேசம்' },
    { id: 'uttar_pradesh', name: 'Uttar Pradesh', name_tamil: 'உத்தர பிரதேசம்' },
    { id: 'bihar', name: 'Bihar', name_tamil: 'பீஹார்' },
    { id: 'west_bengal', name: 'West Bengal', name_tamil: 'மேற்கு வங்கம்' },
    { id: 'punjab', name: 'Punjab', name_tamil: 'பஞ்சாப்' },
    { id: 'haryana', name: 'Haryana', name_tamil: 'ஹரியானா' },
    { id: 'odisha', name: 'Odisha', name_tamil: 'ஒடிசா' }
];

// ============= Cache Helpers =============

interface CachedNews {
    data: AgricultureNewsResponse;
    timestamp: number;
    state: string;
    language: string;
}

function getCacheKey(state: string, language: string): string {
    return `${CACHE_KEY}_${state}_${language}`;
}

function getCachedNews(state: string, language: string): AgricultureNewsResponse | null {
    try {
        const key = getCacheKey(state, language);
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const parsed: CachedNews = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;

        if (age < CACHE_TTL_MS) {
            console.log('📦 Using cached agriculture news');
            return { ...parsed.data, cached: true };
        } else {
            console.log('⏰ Agriculture news cache expired');
            return null;
        }
    } catch {
        return null;
    }
}

function setCachedNews(state: string, language: string, data: AgricultureNewsResponse): void {
    try {
        const key = getCacheKey(state, language);
        const cached: CachedNews = {
            data,
            timestamp: Date.now(),
            state,
            language
        };
        localStorage.setItem(key, JSON.stringify(cached));
        console.log('✅ Agriculture news cached');
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

// ============= Helper Functions =============

function getEmptyMessage(language: string): string {
    const messages: Record<string, string> = {
        tamil: 'இன்று புதிய விவசாய செய்திகள் இல்லை',
        telugu: 'ఈ రోజు వ్యవసాయ వార్తలు లేవు',
        malayalam: 'ഇന്ന് പുതിയ കൃഷി വാർത്തകൾ ഇല്ല',
        kannada: 'ಇಂದು புதிய ಕೃಷಿ ಸುದ್ದಿಗಳಿಲ್ಲ',
        hindi: 'आज कोई नई कृषि समाचार नहीं हैं',
        english: 'No new agriculture news today'
    };
    return messages[language] || messages.english;
}

// ============= Agriculture News Service =============

export const agricultureNewsService = {
    /**
     * Get agriculture news for farmers
     * 
     * @param language - Target language (tamil, telugu, malayalam, kannada, hindi, english)
     * @param state - Indian state for localized news (tamil_nadu, karnataka, etc.)
     */
    getNews: async (
        language: string = 'tamil',
        state: string = 'tamil_nadu'
    ): Promise<AgricultureNewsResponse> => {
        // Try cache first
        const cached = getCachedNews(state, language);

        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/news/news?language=${encodeURIComponent(language)}&state=${encodeURIComponent(state)}`
            );

            if (!response.ok) {
                throw new Error('News API error');
            }

            const data: AgricultureNewsResponse = await response.json();

            // Update cache
            setCachedNews(state, language, data);

            return data;
        } catch (error) {
            console.error('Agriculture news fetch error:', error);

            // Return cached data if available
            if (cached) {
                console.log('⚠️ Using cached news due to error');
                return cached;
            }

            // Return empty response
            return {
                language,
                state,
                news_count: 0,
                news: [],
                cached: false,
                last_updated: new Date().toISOString()
            };
        }
    },

    /**
     * Get agriculture news in CARD format for mobile display
     * 
     * Features:
     * - Card-style layout with title, summary, tag
     * - Voice button support (text-to-speech ready)
     * - Daily updates with Today/Yesterday labels
     * - Farmer-friendly, translated content
     * 
     * @param language - Target language
     * @param state - Indian state for localized news
     */
    getNewsCards: async (
        language: string = 'tamil',
        state: string = 'tamil_nadu'
    ): Promise<NewsCardsResponse> => {
        // Try cache first
        try {
            const cacheKey = `${CARDS_CACHE_KEY}_${state}_${language}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                const age = Date.now() - parsed.timestamp;
                if (age < CACHE_TTL_MS) {
                    console.log('📦 Using cached news cards');
                    return parsed.data;
                }
            }
        } catch { /* ignore */ }

        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/news/cards?language=${encodeURIComponent(language)}&state=${encodeURIComponent(state)}`
            );

            if (!response.ok) {
                throw new Error('Cards API error');
            }

            const data: NewsCardsResponse = await response.json();

            // Cache the response
            try {
                const cacheKey = `${CARDS_CACHE_KEY}_${state}_${language}`;
                localStorage.setItem(cacheKey, JSON.stringify({
                    data,
                    timestamp: Date.now()
                }));
            } catch { /* ignore cache error */ }

            return data;
        } catch (error) {
            console.error('News cards fetch error:', error);

            // Return empty response
            return {
                screen: 'news',
                view: 'card',
                language,
                state,
                daily_update: true,
                voice_enabled: true,
                notification_enabled: true,
                cards: [],
                empty_message: getEmptyMessage(language),
                last_updated: new Date().toISOString()
            };
        }
    },

    /**
     * Get the most important news for daily notification
     * 
     * @param language - Target language
     * @param state - Indian state
     */
    getDailyNotification: async (
        language: string = 'tamil',
        state: string = 'tamil_nadu'
    ): Promise<DailyNotification> => {
        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/news/notification?language=${encodeURIComponent(language)}&state=${encodeURIComponent(state)}`
            );

            if (!response.ok) {
                throw new Error('Notification API error');
            }

            return await response.json();
        } catch (error) {
            console.error('Daily notification fetch error:', error);

            return {
                has_news: false,
                notification_title: getEmptyMessage(language),
                language,
                state
            };
        }
    },

    /**
     * Get available Indian states
     */
    getStates: async (): Promise<IndianState[]> => {
        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/news/states`
            );

            if (!response.ok) {
                return INDIAN_STATES;
            }

            const data = await response.json();
            return data.states || INDIAN_STATES;
        } catch {
            return INDIAN_STATES;
        }
    },

    /**
     * Get supported languages
     */
    getLanguages: async (): Promise<SupportedLanguage[]> => {
        try {
            const response = await fetchWithTimeout(
                `${API_BASE_URL}/api/news/languages`
            );

            if (!response.ok) {
                return SUPPORTED_LANGUAGES;
            }

            const data = await response.json();
            return data.languages || SUPPORTED_LANGUAGES;
        } catch {
            return SUPPORTED_LANGUAGES;
        }
    },

    /**
     * Get state name in selected language
     */
    getStateName: (stateId: string, language: string): string => {
        const state = INDIAN_STATES.find(s => s.id === stateId);
        if (!state) return stateId;

        if (language === 'tamil') {
            return state.name_tamil;
        }
        return state.name;
    },

    /**
     * Get language native name
     */
    getLanguageName: (languageId: string): string => {
        const lang = SUPPORTED_LANGUAGES.find(l => l.id === languageId);
        return lang?.native_name || languageId;
    },

    /**
     * Format news date for display
     */
    formatDate: (dateStr: string, locale: string = 'ta-IN'): string => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString(locale, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    },

    /**
     * Get time since publication
     */
    getTimeSince: (dateStr: string, language: string = 'tamil'): string => {
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);

            const timeLabels: Record<string, { justNow: string; hoursAgo: (h: number) => string; yesterday: string; daysAgo: (d: number) => string }> = {
                tamil: {
                    justNow: 'சற்று முன்',
                    hoursAgo: (h) => `${h} மணி நேரம் முன்`,
                    yesterday: 'நேற்று',
                    daysAgo: (d) => `${d} நாட்களுக்கு முன்`
                },
                hindi: {
                    justNow: 'अभी',
                    hoursAgo: (h) => `${h} घंटे पहले`,
                    yesterday: 'कल',
                    daysAgo: (d) => `${d} दिन पहले`
                },
                telugu: {
                    justNow: 'ఇప్పుడే',
                    hoursAgo: (h) => `${h} గంటల క్రితం`,
                    yesterday: 'నిన్న',
                    daysAgo: (d) => `${d} రోజుల క్రితం`
                },
                kannada: {
                    justNow: 'ಈಗಷ್ಟೇ',
                    hoursAgo: (h) => `${h} ಗಂಟೆಗಳ ಹಿಂದೆ`,
                    yesterday: 'ನಿನ್ನೆ',
                    daysAgo: (d) => `${d} ದಿನಗಳ ಹಿಂದೆ`
                },
                malayalam: {
                    justNow: 'ഇപ്പോൾ',
                    hoursAgo: (h) => `${h} മണിക്കൂർ മുമ്പ്`,
                    yesterday: 'ഇന്നലെ',
                    daysAgo: (d) => `${d} ദിവസം മുമ്പ്`
                },
                english: {
                    justNow: 'Just now',
                    hoursAgo: (h) => `${h} hours ago`,
                    yesterday: 'Yesterday',
                    daysAgo: (d) => `${d} days ago`
                }
            };

            const labels = timeLabels[language] || timeLabels.english;

            if (diffHours < 1) return labels.justNow;
            if (diffHours < 24) return labels.hoursAgo(diffHours);
            if (diffDays === 1) return labels.yesterday;
            return labels.daysAgo(diffDays);
        } catch {
            return dateStr;
        }
    },

    /**
     * Clear news cache
     */
    clearCache: (): void => {
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(CACHE_KEY)) {
                    localStorage.removeItem(key);
                }
            });
            console.log('🗑️ Agriculture news cache cleared');
        } catch {
            // Ignore
        }
    },

    /**
     * Get default language and state based on user's profile or location
     */
    getDefaults: (): { language: string; state: string } => {
        // Try to get from localStorage (user preference)
        try {
            const savedLanguage = localStorage.getItem('uzhavan_news_language');
            const savedState = localStorage.getItem('uzhavan_news_state');

            return {
                language: savedLanguage || 'tamil',
                state: savedState || 'tamil_nadu'
            };
        } catch {
            return { language: 'tamil', state: 'tamil_nadu' };
        }
    },

    /**
     * Save user preferences
     */
    savePreferences: (language: string, state: string): void => {
        try {
            localStorage.setItem('uzhavan_news_language', language);
            localStorage.setItem('uzhavan_news_state', state);
        } catch {
            // Ignore
        }
    }
};

export default agricultureNewsService;
