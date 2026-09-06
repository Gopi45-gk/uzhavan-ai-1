/**
 * Agriculture News Screen - Card Style with Voice Support
 * 
 * Features:
 * - Daily updated agriculture news in card format
 * - Multi-language support (Tamil, Telugu, Malayalam, Kannada, Hindi)
 * - State-based filtering
 * - Voice button for text-to-speech
 * - Category tags (scheme, MSP, weather, crop, subsidy, alert)
 * - Mobile-friendly, farmer-first design
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowLeft,
    Volume2,
    VolumeX,
    RefreshCw,
    Newspaper,
    Tag,
    Clock,
    MapPin,
    Globe,
    AlertCircle,
    TrendingUp,
    Cloud,
    Leaf,
    Gift,
    Bell
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { speakText, stopSpeech, isSpeaking } from '../services/ttsService';

// ==================== TYPES ====================

interface NewsCard {
    title: string;
    summary: string;
    tag: 'scheme' | 'MSP' | 'weather' | 'crop' | 'subsidy' | 'alert' | string;
    source: string;
    date: string;
    voice_available: boolean;
    image_url?: string;
    video_url?: string;  // optional direct YouTube URL field
    link_url?: string;   // optional article/video link field
}

interface NewsCardsResponse {
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

interface Props {
    onBack: () => void;
    language: string;
    t: (key: string) => string;
    userLocation?: string;
    userState?: string;
}

// ==================== CONSTANTS ====================

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const STATES = [
    { id: 'all_india', name: 'All India', name_tamil: 'அனைத்து இந்தியா' },
    { id: 'tamil_nadu', name: 'Tamil Nadu', name_tamil: 'தமிழ்நாடு' },
    { id: 'karnataka', name: 'Karnataka', name_tamil: 'கர்நாடகா' },
    { id: 'kerala', name: 'Kerala', name_tamil: 'கேரளா' },
    { id: 'andhra_pradesh', name: 'Andhra Pradesh', name_tamil: 'ஆந்திர பிரதேசம்' },
    { id: 'telangana', name: 'Telangana', name_tamil: 'தெலங்கானா' },
];

const LANGUAGES = [
    { id: 'tamil', name: 'Tamil', native: 'தமிழ்' },
    { id: 'telugu', name: 'Telugu', native: 'తెలుగు' },
    { id: 'malayalam', name: 'Malayalam', native: 'മലയാളം' },
    { id: 'kannada', name: 'Kannada', native: 'கன்னட' },
    { id: 'hindi', name: 'Hindi', native: 'हिंदी' },
];

// Tag colors and icons
const TAG_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
    scheme: { color: '#1e88e5', bg: '#e3f2fd', icon: Gift },
    MSP: { color: '#43a047', bg: '#e8f5e9', icon: TrendingUp },
    weather: { color: '#0288d1', bg: '#e1f5fe', icon: Cloud },
    crop: { color: '#558b2f', bg: '#f1f8e9', icon: Leaf },
    subsidy: { color: '#7b1fa2', bg: '#f3e5f5', icon: Gift },
    alert: { color: '#d32f2f', bg: '#ffebee', icon: AlertCircle },
};

// ==================== YOUTUBE EMBED HELPERS ====================

/**
 * Extracts a YouTube video ID from any of these URL formats:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://www.youtube.com/live/VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://m.youtube.com/watch?v=VIDEO_ID
 * Returns null if no YouTube URL is found.
 */
const extractYouTubeId = (url: string): string | null => {
    if (!url) return null;
    // Standard watch URL
    const watchMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];
    // Live / short path URL: youtube.com/live/ID or youtu.be/ID
    const pathMatch = url.match(/(?:youtube\.com\/(?:live|embed|shorts)|youtu\.be)\/([A-Za-z0-9_-]{11})/);
    if (pathMatch) return pathMatch[1];
    return null;
};

/**
 * Searches a block of text for any YouTube URL and returns the first video ID found.
 * Returns null if no YouTube URL exists in the text.
 */
const extractYouTubeIdFromText = (text: string): string | null => {
    if (!text) return null;
    const urlMatch = text.match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/);
    if (urlMatch) return extractYouTubeId(urlMatch[0]);
    return null;
};

/**
 * Strips raw YouTube URLs from a summary string so they aren't displayed as plain text
 * after the video is embedded.
 */
const stripYouTubeUrls = (text: string): string =>
    text.replace(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s]*/g, '').replace(/\s{2,}/g, ' ').trim();

// ==================== VOICE SERVICE ====================

class VoiceService {
    speak(text: string, language: string): Promise<void> {
        return new Promise((resolve) => {
            speakText(text, {
                language,
                onEnd: () => resolve(),
                onError: () => resolve(),
            });
        });
    }

    stop() {
        stopSpeech();
    }

    isSpeaking(): boolean {
        return isSpeaking();
    }
}

const voiceService = new VoiceService();

// ==================== MAIN COMPONENT ====================

const AgricultureNews: React.FC<Props> = ({
    onBack,
    language,
    t,
    userLocation,
    userState = 'tamil_nadu'
}) => {
    const { data: contextData } = useData();

    // Local state for filters
    const [selectedState, setSelectedState] = useState(userState);
    const [selectedLanguage, setSelectedLanguage] = useState(language || 'tamil');
    const [speakingCardIndex, setSpeakingCardIndex] = useState<number | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    // Sync selectedLanguage with prop when parent language changes
    useEffect(() => {
        if (language) {
            setSelectedLanguage(language);
        }
    }, [language]);

    // Data state
    const [newsData, setNewsData] = useState<NewsCardsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Auto-fetch whenever state or language changes
    useEffect(() => {
        fetchNews();
    }, [selectedState, selectedLanguage]);

    // ==================== FETCH NEWS ====================

    const getErrorMessage = (lang: string): string => {
        const messages: Record<string, string> = {
            tamil: 'செய்திகளை பெற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
            telugu: 'వార్తలను పొందలేకపోయాము. మళ్ళీ ప్రయత్నించండి.',
            malayalam: 'വാർത്തകൾ ലഭിച്ചില്ല. വീണ്ടും ശ്രമിക്കുക.',
            kannada: 'ಸುದ್ಧಿಗಳನ್ನು ಪಡೆಯಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
            hindi: 'समाचार प्राप्त नहीं हो सके। फिर से प्रयास करें',
        };
        return messages[lang] || 'Could not fetch news. Please try again.';
    };

    const fetchNews = useCallback(async (forceRefresh: boolean = false) => {
        setLoading(true);
        setError(null);

        // Read farmer profile crop from localStorage for personalization
        let cropHint = '';
        try {
            const rawProfile = localStorage.getItem('uzhavan_user_profile');
            if (rawProfile) {
                const parsed = JSON.parse(rawProfile);
                cropHint = (parsed.profile?.crop_type || parsed.crop_type || '').toLowerCase();
            }
        } catch { }

        try {
            const params = new URLSearchParams({
                language: selectedLanguage,
                state: selectedState,
                ...(cropHint ? { crop: cropHint } : {}),
                ...(forceRefresh ? { refresh: 'true' } : {}),
            });

            const response = await fetch(
                `${API_BASE_URL}/api/news/cards?${params.toString()}`,
                {
                    signal: AbortSignal.timeout(35000) // 35s timeout (translation can take time)
                }
            );

            if (!response.ok) {
                throw new Error('Failed to fetch news');
            }

            const data: NewsCardsResponse = await response.json();
            setNewsData(data);
        } catch (err) {
            console.error('News fetch error:', err);
            setError(getErrorMessage(selectedLanguage));
        } finally {
            setLoading(false);
        }
    }, [selectedLanguage, selectedState]);

    // ==================== VOICE HANDLING ====================

    const handleVoiceClick = async (card: NewsCard, index: number) => {
        if (speakingCardIndex === index) {
            // Stop speaking
            voiceService.stop();
            setSpeakingCardIndex(null);
            return;
        }

        // Stop any current speech
        voiceService.stop();
        setSpeakingCardIndex(index);

        try {
            const textToSpeak = `${card.title}. ${card.summary}`;
            await voiceService.speak(textToSpeak, selectedLanguage);
        } catch (err) {
            console.error('Voice error:', err);
        } finally {
            setSpeakingCardIndex(null);
        }
    };

    // ==================== HELPER FUNCTIONS ====================

    const getTagLabel = (tag: string, lang: string): string => {
        const labels: Record<string, Record<string, string>> = {
            scheme: { tamil: 'திட்டம்', telugu: 'పథకం', malayalam: 'പദ്ധതി', kannada: 'ಯೋಜನೆ', hindi: 'योजना' },
            MSP: { tamil: 'MSP', telugu: 'MSP', malayalam: 'MSP', kannada: 'MSP', hindi: 'MSP' },
            weather: { tamil: 'வானிலை', telugu: 'వాతావరణం', malayalam: 'കാലാവസ്ഥ', kannada: 'ಹವಾಮಾನ', hindi: 'मौसम' },
            crop: { tamil: 'பயிர்', telugu: 'పంట', malayalam: 'വിള', kannada: 'ಬೆಳೆ', hindi: 'फसल' },
            subsidy: { tamil: 'மானியம்', telugu: 'సబ్సిడీ', malayalam: 'സബ്‌സിഡി', kannada: 'ಸಬ್ಸಿಡಿ', hindi: 'सब्सिडी' },
            alert: { tamil: 'எச்சரிக்கை', telugu: 'హెచ్చరిక', malayalam: 'അലേർട്ട്', kannada: 'எச்சரிக்கை', hindi: 'चेतावनी' },
        };
        return labels[tag]?.[lang] || tag.toUpperCase();
    };

    const getDateLabel = (date: string, lang: string): string => {
        if (date === 'Today') {
            const labels: Record<string, string> = {
                tamil: 'இன்று',
                telugu: 'ఈ రోజు',
                malayalam: 'ഇന്ന്',
                kannada: 'ಇಂದು',
                hindi: 'आज',
            };
            return labels[lang] || 'Today';
        }
        if (date === 'Yesterday') {
            const labels: Record<string, string> = {
                tamil: 'நேற்று',
                telugu: 'నిన్న',
                malayalam: 'ഇന്നലെ',
                kannada: 'ನಿನ್ನೆ',
                hindi: 'कल',
            };
            return labels[lang] || 'Yesterday';
        }
        return date;
    };

    const getHeaderTitle = (lang: string): string => {
        const titles: Record<string, string> = {
            tamil: 'விவசாய செய்திகள்',
            telugu: 'వ్యవసాయ వార్తలు',
            malayalam: 'കാർഷിക വാർത്തകൾ',
            kannada: 'ಕೃಷಿ ಸುದ್ದಿಗಳು',
            hindi: 'कृषि समाचार',
        };
        return titles[lang] || 'Agriculture News';
    };

    // ==================== RENDER ====================

    return (
        <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#e8f5e9] to-[#c8e6c9]">
            {/* HEADER */}
            <header className="sticky top-0 z-30 bg-white shadow-md">
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <ArrowLeft size={24} className="text-gray-800" />
                    </button>

                    <h1 className="text-lg font-black text-[#2e7d32] uppercase tracking-tight flex items-center gap-2">
                        <Newspaper size={20} />
                        {getHeaderTitle(selectedLanguage)}
                    </h1>

                    <button
                        onClick={() => fetchNews(true)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        disabled={loading}
                    >
                        <RefreshCw
                            size={20}
                            className={`text-gray-600 ${loading ? 'animate-spin' : ''}`}
                        />
                    </button>
                </div>

                {/* FILTER BAR */}
                <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
                    {/* State Filter */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#e8f5e9] rounded-full text-sm font-medium text-[#2e7d32] whitespace-nowrap"
                    >
                        <MapPin size={14} />
                        {STATES.find(s => s.id === selectedState)?.name || 'All India'}
                    </button>

                    {/* Language Filter */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#fff3e0] rounded-full text-sm font-medium text-[#e65100] whitespace-nowrap"
                    >
                        <Globe size={14} />
                        {LANGUAGES.find(l => l.id === selectedLanguage)?.native || 'தமிழ்'}
                    </button>

                    {/* Daily Update Badge */}
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-[#e3f2fd] rounded-full text-sm font-medium text-[#1565c0] whitespace-nowrap">
                        <Clock size={14} />
                        {selectedLanguage === 'tamil' ? 'தினசரி' :
                         selectedLanguage === 'hindi' ? 'दैनिक' :
                         selectedLanguage === 'telugu' ? 'రోజూ' :
                         selectedLanguage === 'kannada' ? 'ದೈನಂದಿನ' :
                         selectedLanguage === 'malayalam' ? 'ദിനംപ്രതി' : 'Daily'}
                    </div>
                </div>

                {/* FILTER DROPDOWN */}
                {showFilters && (
                    <div className="absolute top-full left-0 right-0 bg-white shadow-lg z-40 p-4 space-y-4 border-t">
                        {/* State Selection */}
                        <div>
                            <label className="text-sm font-bold text-gray-600 mb-2 block">
                                {selectedLanguage === 'tamil' ? 'மாநிலம்' :
                                 selectedLanguage === 'hindi' ? 'राज्य' :
                                 selectedLanguage === 'telugu' ? 'రాష్ట్రం' :
                                 selectedLanguage === 'kannada' ? 'ರಾಜ್ಯ' :
                                 selectedLanguage === 'malayalam' ? 'സംസ്ഥാനം' : 'State'}
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {STATES.map(state => (
                                    <button
                                        key={state.id}
                                        onClick={() => {
                                            setSelectedState(state.id);
                                            setShowFilters(false);
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedState === state.id
                                            ? 'bg-[#2e7d32] text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        {state.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Language Selection */}
                        <div>
                            <label className="text-sm font-bold text-gray-600 mb-2 block">
                                {selectedLanguage === 'tamil' ? 'மொழி' :
                                 selectedLanguage === 'hindi' ? 'भाषा' :
                                 selectedLanguage === 'telugu' ? 'భాష' :
                                 selectedLanguage === 'kannada' ? 'ಭಾಷೆ' :
                                 selectedLanguage === 'malayalam' ? 'ഭാഷ' : 'Language'}
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {LANGUAGES.map(lang => (
                                    <button
                                        key={lang.id}
                                        onClick={() => {
                                            setSelectedLanguage(lang.id);
                                            setShowFilters(false);
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedLanguage === lang.id
                                            ? 'bg-[#e65100] text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        {lang.native}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* CONTENT */}
            <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-20">
                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-16 h-16 border-4 border-[#2e7d32] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#2e7d32] font-bold animate-pulse">
                            {t('fetching_news')}
                        </p>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="text-red-500" size={24} />
                            <div>
                                <p className="text-red-700 font-medium">{error}</p>
                                <button
                                    onClick={fetchNews}
                                    className="mt-2 text-sm text-red-600 underline"
                                >
                                    {t('tryAgain') || (selectedLanguage === 'tamil' ? 'மீண்டும் முயற்சிக்கவும்' :
                                                       selectedLanguage === 'hindi' ? 'पुनः प्रयास करें' :
                                                       selectedLanguage === 'telugu' ? 'మళ్ళీ ప్రయత్నించండి' :
                                                       selectedLanguage === 'kannada' ? 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' :
                                                       selectedLanguage === 'malayalam' ? 'വീണ്ടും ശ്രമിക്കുക' : 'Try again')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && newsData?.cards.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Newspaper size={64} className="text-gray-300" />
                        <p className="text-gray-500 font-medium text-center">
                            {newsData.empty_message || 'No news available today'}
                        </p>
                    </div>
                )}

                {/* News Cards */}
                {!loading && !error && newsData?.cards.map((card, index) => {
                    // Fallback to crop tag if unknown
                    const tagKey = (card.tag in TAG_CONFIG) ? card.tag : 'crop';
                    const tagConfig = TAG_CONFIG[tagKey];
                    const TagIcon = tagConfig.icon;

                    // ── YouTube Embed Detection ──
                    // Priority: card.video_url > card.link_url > URL found inside summary
                    const youtubeId =
                        extractYouTubeId(card.video_url || '') ||
                        extractYouTubeId(card.link_url || '') ||
                        extractYouTubeIdFromText(card.summary || '');

                    // If a video is embedded, strip raw YouTube URLs from the displayed summary
                    const displaySummary = youtubeId
                        ? stripYouTubeUrls(card.summary)
                        : card.summary;

                    return (
                        <div
                            key={index}
                            className="bg-white rounded-2xl shadow-lg overflow-hidden transform transition-all duration-200 hover:shadow-xl active:scale-[0.98]"
                        >
                            {/* Card Header with Tag */}
                            <div className="flex items-center justify-between px-4 pt-4">
                                <div
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                                    style={{
                                        backgroundColor: tagConfig.bg,
                                        color: tagConfig.color
                                    }}
                                >
                                    <TagIcon size={12} />
                                    {getTagLabel(card.tag, selectedLanguage)}
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Date */}
                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <Clock size={12} />
                                        {getDateLabel(card.date, selectedLanguage)}
                                    </span>

                                    {/* Voice Button */}
                                    {card.voice_available && (
                                        <button
                                            onClick={() => handleVoiceClick(card, index)}
                                            className={`p-2 rounded-full transition-all ${speakingCardIndex === index
                                                ? 'bg-[#2e7d32] text-white animate-pulse'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            aria-label="Read aloud"
                                        >
                                            {speakingCardIndex === index ? (
                                                <VolumeX size={18} />
                                            ) : (
                                                <Volume2 size={18} />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Card Content */}
                            <div className="px-4 py-3">
                                <h3 className="text-base font-bold text-gray-900 leading-tight mb-2">
                                    {card.title}
                                </h3>
                                {displaySummary && (
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        {displaySummary}
                                    </p>
                                )}
                            </div>

                            {/* YouTube Embed — shown only when a video ID is detected */}
                            {youtubeId && (
                                <div className="px-4 pb-3">
                                    <div
                                        style={{
                                            position: 'relative',
                                            paddingBottom: '56.25%', /* 16:9 aspect ratio */
                                            height: 0,
                                            overflow: 'hidden',
                                            borderRadius: '12px',
                                        }}
                                    >
                                        <iframe
                                            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`}
                                            title={card.title}
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                            allowFullScreen
                                            loading="lazy"
                                            referrerPolicy="strict-origin-when-cross-origin"
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: '100%',
                                                border: 'none',
                                                borderRadius: '12px',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Card Footer */}
                            <div className="px-4 pb-4 flex items-center justify-between">
                                <span className="text-xs text-gray-400">
                                    {card.source}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </main>

            {/* Voice Indicator (Fixed Bottom) */}
            {speakingCardIndex !== null && (
                <div className="fixed bottom-4 left-4 right-4 bg-[#2e7d32] text-white rounded-full py-3 px-4 flex items-center justify-between shadow-lg z-50">
                    <div className="flex items-center gap-3">
                        <Volume2 size={20} className="animate-pulse" />
                        <span className="font-medium">
                            {t('reading')}
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            voiceService.stop();
                            setSpeakingCardIndex(null);
                        }}
                        className="px-4 py-1 bg-white/20 rounded-full text-sm font-medium"
                    >
                        {t('stop')}
                    </button>
                </div>
            )}

            <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
        </div>
    );
};

export default AgricultureNews;
