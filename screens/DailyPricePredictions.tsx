import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Calendar, Tag } from 'lucide-react';

interface Props {
    onBack: () => void;
    language: string;
    userLocation?: string;
    t: (key: string) => string;
}

interface MarketPrice {
    commodity: string;
    variety: string;
    modal_price: number;
    min_price: number;
    max_price: number;
    market: string;
    arrival_date: string;
    unit: string;
    predicted_next_price?: number;
    trend?: string;
    percentage_change?: number;
}

// ==================== DETERMINISTIC ICON MAPPING ====================
// Using Twemoji (Twitter Emoji) for consistent, fast-loading produce icons
// Each commodity maps to a specific emoji code point

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";

// Emoji code mappings for fruits
const FRUIT_EMOJI_MAP: Record<string, string> = {
    'lemon': '1f34b',           // 🍋
    'lime': '1f34b',            // 🍋
    'orange': '1f34a',          // 🍊
    'mosambi': '1f34a',         // 🍊 (sweet lime)
    'banana': '1f34c',          // 🍌
    'apple': '1f34e',           // 🍎
    'green apple': '1f34f',     // 🍏
    'mango': '1f96d',           // 🥭
    'watermelon': '1f349',      // 🍉
    'grape': '1f347',           // 🍇
    'grapes': '1f347',          // 🍇
    'pineapple': '1f34d',       // 🍍
    'coconut': '1f965',         // 🥥
    'peach': '1f351',           // 🍑
    'pear': '1f350',            // 🍐
    'cherry': '1f352',          // 🍒
    'cherries': '1f352',        // 🍒
    'strawberry': '1f353',      // 🍓
    'kiwi': '1f95d',            // 🥝
    'pomegranate': '1f9c3',     // 🧃 (closest representation)
    'papaya': '1f96d',          // 🥭 (similar tropical)
    'guava': '1f95d',           // 🥝 (green fruit)
    'fig': '1f352',             // 🍒 (similar shape)
    'jackfruit': '1f96d',       // 🥭 (tropical)
    'sapota': '1f95d',          // 🥝 (brown fruit)
    'melon': '1f348',           // 🍈
    'muskmelon': '1f348',       // 🍈
    'cantaloupe': '1f348',      // 🍈
};

// Emoji code mappings for vegetables
const VEGETABLE_EMOJI_MAP: Record<string, string> = {
    'tomato': '1f345',          // 🍅
    'onion': '1f9c5',           // 🧅
    'garlic': '1f9c4',          // 🧄
    'potato': '1f954',          // 🥔
    'carrot': '1f955',          // 🥕
    'corn': '1f33d',            // 🌽
    'maize': '1f33d',           // 🌽
    'pepper': '1f336-fe0f',     // 🌶️
    'chilli': '1f336-fe0f',     // 🌶️
    'chili': '1f336-fe0f',      // 🌶️
    'green chilli': '1f336-fe0f', // 🌶️
    'capsicum': '1fad1',        // 🫑
    'bell pepper': '1fad1',     // 🫑
    'broccoli': '1f966',        // 🥦
    'cucumber': '1f952',        // 🥒
    'lettuce': '1f96c',         // 🥬
    'cabbage': '1f96c',         // 🥬
    'leafy': '1f96c',           // 🥬
    'spinach': '1f96c',         // 🥬
    'eggplant': '1f346',        // 🍆
    'brinjal': '1f346',         // 🍆
    'aubergine': '1f346',       // 🍆
    'mushroom': '1f344',        // 🍄
    'peanut': '1f95c',          // 🥜
    'groundnut': '1f95c',       // 🥜
    'beans': '1fad8',           // 🫘
    'peas': '1fad8',            // 🫘
    'ginger': '1fada',          // 🫛
    'radish': '1f955',          // 🥕 (similar root)
    'beetroot': '1f955',        // 🥕 (root vegetable)
    'cauliflower': '1f966',     // 🥦 (similar)
    'ladyfinger': '1f952',      // 🥒 (similar shape)
    'okra': '1f952',            // 🥒 (similar shape)
    'bhindi': '1f952',          // (okra)
    'bitter gourd': '1f952',    // 🥒
    'bottle gourd': '1f952',    // 🥒
    'ridge gourd': '1f952',     // 🥒
    'ash gourd': '1f952',       // 🥒
    'snake gourd': '1f952',     // 🥒
    'pumpkin': '1f383',         // 🎃
    'sweet potato': '1f360',    // 🍠
};

// Emoji code mappings for grains
const GRAIN_EMOJI_MAP: Record<string, string> = {
    'rice': '1f35a',            // 🍚
    'paddy': '1f33e',           // 🌾
    'wheat': '1f33e',           // 🌾
    'barley': '1f33e',          // 🌾
    'millet': '1f33e',          // 🌾
    'jowar': '1f33e',           // 🌾
    'bajra': '1f33e',           // 🌾
    'ragi': '1f33e',            // 🌾
    'maize': '1f33d',           // 🌽
    'corn': '1f33d',            // 🌽
    'gram': '1fad8',            // 🫘
    'dal': '1fad8',             // 🫘
    'lentil': '1fad8',          // 🫘
    'pulse': '1fad8',           // 🫘
    'cereal': '1f33e',          // 🌾
    'soybean': '1fad8',         // 🫘
    'soya': '1fad8',            // 🫘
};

// Default fallback icon (herb/plant emoji)
const DEFAULT_ICON = `${TWEMOJI_BASE}/1f33f.png`;

// Category keywords for classification
const FRUIT_KEYWORDS = ["Banana", "Apple", "Mango", "Orange", "Grape", "Pomegranate", "Papaya", "Watermelon", "Guava", "Lemon", "Pineapple", "Sapota", "Jackfruit", "Kiwi", "Mosambi", "Pear", "Fig", "Melon", "Coconut", "Cherry", "Peach", "Strawberry", "Lime"];
const GRAIN_KEYWORDS = ["Paddy", "Rice", "Wheat", "Maize", "Jowar", "Bajra", "Ragi", "Millet", "Barley", "Gram", "Dal", "Pulse", "Cereal", "Lentil", "Soybean"];

// Normalize commodity name for lookup
const normalizeCommodityName = (commodity: string): string => {
    if (!commodity) return "";
    return commodity.toLowerCase()
        .split('(')[0]        // Remove parenthetical info
        .split('-')[0]        // Remove variety suffix
        .replace(/[^a-z\s]/g, '')  // Keep only letters and spaces
        .trim();
};

// Determine category based on keywords
const getImageCategory = (commodity: string): 'fruit' | 'vegetable' | 'grain' => {
    const name = commodity.toLowerCase();
    if (FRUIT_KEYWORDS.some(k => name.includes(k.toLowerCase()))) return 'fruit';
    if (GRAIN_KEYWORDS.some(k => name.includes(k.toLowerCase()))) return 'grain';
    return 'vegetable';
};

// DETERMINISTIC Icon resolver - same item ALWAYS gets same icon
const getCropIcon = (commodity: string): string => {
    if (!commodity) return DEFAULT_ICON;

    const normalized = normalizeCommodityName(commodity);
    if (!normalized) return DEFAULT_ICON;

    // Check each emoji map for exact or partial match
    // Priority: exact match > partial match > category default

    // Try fruits first
    for (const [key, emoji] of Object.entries(FRUIT_EMOJI_MAP)) {
        if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
            return `${TWEMOJI_BASE}/${emoji}.png`;
        }
    }

    // Try vegetables
    for (const [key, emoji] of Object.entries(VEGETABLE_EMOJI_MAP)) {
        if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
            return `${TWEMOJI_BASE}/${emoji}.png`;
        }
    }

    // Try grains
    for (const [key, emoji] of Object.entries(GRAIN_EMOJI_MAP)) {
        if (normalized === key || normalized.includes(key) || key.includes(normalized)) {
            return `${TWEMOJI_BASE}/${emoji}.png`;
        }
    }

    // Fallback to category-based default icons
    const category = getImageCategory(commodity);
    if (category === 'fruit') {
        return `${TWEMOJI_BASE}/1f34e.png`; // 🍎 Red Apple as fruit default
    } else if (category === 'grain') {
        return `${TWEMOJI_BASE}/1f33e.png`; // 🌾 Sheaf of Rice as grain default
    } else {
        return `${TWEMOJI_BASE}/1f966.png`; // 🥦 Broccoli as vegetable default
    }
};

// Handle image load errors with consistent fallback
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    if (img.src === DEFAULT_ICON) return; // Prevent infinite loop
    img.src = DEFAULT_ICON;
};

// Multilingual Commodity & Market Dictionary for full language synchronization
const COMMODITY_TRANSLATION_MAP: Record<string, Record<string, string>> = {
    'banana': { tamil: 'வாழைப்பழம்', hindi: 'केला', telugu: 'అరటిపండు', kannada: 'ಬಾಳೆಹಣ್ಣು', malayalam: 'വാഴപ്പഴം', english: 'BANANA' },
    'mango': { tamil: 'மாம்பழம்', hindi: 'आम', telugu: 'మామిడిపండు', kannada: 'ಮಾವಿನಹಣ್ಣು', malayalam: 'മാമ്പഴം', english: 'MANGO' },
    'watermelon': { tamil: 'தர்பூசணி', hindi: 'तरबूज', telugu: 'పుచ్చకాయ', kannada: 'ಕಲ್ಲಂಗಡಿ', malayalam: 'തണ്ണിമത്തൻ', english: 'WATERMELON' },
    'pomegranate': { tamil: 'மாதுளை', hindi: 'अनार', telugu: 'దానిమ్మ', kannada: 'ದಾಳಿಂಬೆ', malayalam: 'മാതളനാരങ്ങ', english: 'POMEGRANATE' },
    'papaya': { tamil: 'பப்பாளி', hindi: 'पपीता', telugu: 'బొప్పాయి', kannada: 'ಪಪಾಯಿ', malayalam: 'പപ്പായ', english: 'PAPAYA' },
    'guava': { tamil: 'கொய்யா', hindi: 'अमरूद', telugu: 'జామపండు', kannada: 'ಸೀಬೆಹಣ್ಣು', malayalam: 'പേരയ്ക്ക', english: 'GUAVA' },
    'lemon': { tamil: 'எலுமிச்சை', hindi: 'नींबू', telugu: 'నిమ్మకాయ', kannada: 'ನಿಂಬೆಹಣ್ಣು', malayalam: 'നാരങ്ങ', english: 'LEMON' },
    'tomato': { tamil: 'தக்காளி', hindi: 'टमाटर', telugu: 'టమోటా', kannada: 'ಟೊಮೆಟೊ', malayalam: 'തക്കാளி', english: 'TOMATO' },
    'onion': { tamil: 'வெங்காயம்', hindi: 'प्याज', telugu: 'ఉల్లిపాయ', kannada: 'ఈరుಳ್ಳಿ', malayalam: 'സവാള', english: 'ONION' },
    'potato': { tamil: 'உருளைக்கிழங்கு', hindi: 'आलू', telugu: 'బంగాళాదుంప', kannada: 'ಆಲೂಗಡ್ಡೆ', malayalam: 'ഉരുളക്കിഴങ്ങ്', english: 'POTATO' },
    'green chilli': { tamil: 'பச்சை மிளகாய்', hindi: 'हरी मिर्च', telugu: 'పచ్చిమిర్చి', kannada: 'ಹಸಿರು ಮೆಣಸಿನಕಾಯಿ', malayalam: 'പച്ചമുളക്', english: 'GREEN CHILLI' },
    'brinjal': { tamil: 'கத்தரிக்காய்', hindi: 'बैंगन', telugu: 'వంకాయ', kannada: 'ಬದನೆಕಾಯಿ', malayalam: 'വഴുതനങ്ങ', english: 'BRINJAL' },
    'lady finger': { tamil: 'வெண்டைக்காய்', hindi: 'भिंडी', telugu: 'బెండకాయ', kannada: 'ಬೆಂಡೇಕಾಯಿ', malayalam: 'വെണ്ടയ്ക്ക', english: 'LADY FINGER' },
    'carrot': { tamil: 'கேரட்', hindi: 'गाजर', telugu: 'క్యారెట్', kannada: 'ಕ್ಯಾರೆಟ್', malayalam: 'காரட்', english: 'CARROT' },
    'paddy (dhan)': { tamil: 'நெல்', hindi: 'धान', telugu: 'వరి', kannada: 'ಭತ್ತ', malayalam: 'നെല്ല്', english: 'PADDY (DHAN)' },
    'wheat': { tamil: 'கோதுமை', hindi: 'गेहूं', telugu: 'గోధుమలు', kannada: 'ಗೋಧಿ', malayalam: 'ഗോതമ്പ്', english: 'WHEAT' },
    'maize': { tamil: 'மக்காச்சோளம்', hindi: 'मक्का', telugu: 'మొక్కజొన్న', kannada: 'ಮೆಕ್ಕೆಜೋಳ', malayalam: 'ചോളം', english: 'MAIZE' },
    'cotton': { tamil: 'பருத்தி', hindi: 'कपास', telugu: 'పత్తి', kannada: 'ಹತ್ತಿ', malayalam: 'പരുത്തി', english: 'COTTON' },
    'groundnut': { tamil: 'நிலக்கடலை', hindi: 'मूंगफली', telugu: 'వేరుశెனగ', kannada: 'ಕಡಲೆಕಾಯಿ', malayalam: 'നിലക്കടല', english: 'GROUNDNUT' }
};

const VARIETY_TRANSLATION_MAP: Record<string, Record<string, string>> = {
    'poovan': { tamil: 'பூவன்', hindi: 'पूवन', telugu: 'పూవన్', kannada: 'ಪೂವನ್', malayalam: 'പൂവൻ', english: 'POOVAN' },
    'sevvazhai (red)': { tamil: 'செவ்வாழை', hindi: 'लाल केला', telugu: 'ఎర్ర అరటి', kannada: 'ಕೆಂபு ಬಾಳೆ', malayalam: 'ചെങ്കദളി', english: 'SEVVAZHAI (RED)' },
    'alphonso': { tamil: 'அல்போன்சா', hindi: 'अल्फ़ॉन्सो', telugu: 'అల్ఫోన్సో', kannada: 'ಅಲ್ಪೋನ್ಸೋ', malayalam: 'അൽഫോൻസോ', english: 'ALPHONSO' },
    'hybrid': { tamil: 'ஹைப்ரிட்', hindi: 'हाइब्रिड', telugu: 'హైబ్రిడ్', kannada: 'ಹೈಬ್ರಿಡ್', malayalam: 'ഹൈബ്രിഡ്', english: 'HYBRID' },
    'small / shallot': { tamil: 'சின்ன வெங்காயம்', hindi: 'छोटा प्याज', telugu: 'చిన్న ఉల్లిపాయ', kannada: 'ಸಣ್ಣ ಈರುಳ್ಳಿ', malayalam: 'ചെറിയ ഉള്ളി', english: 'SMALL / SHALLOT' },
    'big (nashik)': { tamil: 'பெரிய வெங்காயம்', hindi: 'बड़ा प्याज', telugu: 'పెద్ద ఉల్లిపాయ', kannada: 'ದೊಡ್ಡ ಈರುಳ್ಳಿ', malayalam: 'വലിയ ഉള്ളി', english: 'BIG (NASHIK)' },
    'jyoti': { tamil: 'ஜோதி', hindi: 'ज्योति', telugu: 'జ్యోతి', kannada: 'ಜ್ಯೋತಿ', malayalam: 'ജ്യോതി', english: 'JYOTI' },
    'local': { tamil: 'உள்ளூர்', hindi: 'स्थानीय', telugu: 'స్థానిక', kannada: 'ಸ್ಥಳೀಯ', malayalam: 'പ്രാദേശികം', english: 'LOCAL' },
    'adt 43 / ponni': { tamil: 'பொன்னி / ADT 43', hindi: 'पोंनी / एडीटी 43', telugu: 'పొన్ని / ADT 43', kannada: 'ಪೊನ್ನಿ / ADT 43', malayalam: 'പൊന്നി / ADT 43', english: 'PONNI / ADT 43' },
    'sharbati': { tamil: 'சர்பதி', hindi: 'शरबती', telugu: 'శరబతి', kannada: 'ಶರಬತಿ', malayalam: 'ശർബതി', english: 'SHARBATI' }
};

const getTranslatedCommodity = (commodity: string, lang: string): string => {
    if (!commodity) return '';
    const norm = commodity.toLowerCase().trim();
    const l = lang.toLowerCase();
    return COMMODITY_TRANSLATION_MAP[norm]?.[l] || COMMODITY_TRANSLATION_MAP[norm]?.['english'] || commodity.toUpperCase();
};

const getTranslatedVariety = (variety: string, lang: string): string => {
    if (!variety) return '';
    const norm = variety.toLowerCase().trim();
    const l = lang.toLowerCase();
    return VARIETY_TRANSLATION_MAP[norm]?.[l] || VARIETY_TRANSLATION_MAP[norm]?.['english'] || variety.toUpperCase();
};

const getTranslatedMarket = (market: string, lang: string): string => {
    if (!market) return '';
    const l = lang.toLowerCase();
    if (l === 'tamil') {
        return market.replace(/APMC Fruit Market|Fruit Wholesale Mandi|APMC Market|Wholesale Market|Regulated Market|Mandi|Direct Purchase Centre \(DPC\)|Grain APMC/gi, 'சந்தை');
    } else if (l === 'hindi') {
        return market.replace(/APMC Fruit Market|Fruit Wholesale Mandi|APMC Market|Wholesale Market|Regulated Market|Mandi|Direct Purchase Centre \(DPC\)|Grain APMC/gi, 'मंडी');
    } else if (l === 'telugu') {
        return market.replace(/APMC Fruit Market|Fruit Wholesale Mandi|APMC Market|Wholesale Market|Regulated Market|Mandi|Direct Purchase Centre \(DPC\)|Grain APMC/gi, 'మార్కెట్');
    } else if (l === 'kannada') {
        return market.replace(/APMC Fruit Market|Fruit Wholesale Mandi|APMC Market|Wholesale Market|Regulated Market|Mandi|Direct Purchase Centre \(DPC\)|Grain APMC/gi, 'ಮಾರುಕಟ್ಟೆ');
    } else if (l === 'malayalam') {
        return market.replace(/APMC Fruit Market|Fruit Wholesale Mandi|APMC Market|Wholesale Market|Regulated Market|Mandi|Direct Purchase Centre \(DPC\)|Grain APMC/gi, 'മാർക്കറ്റ്');
    }
    return market.toUpperCase();
};

const DailyPricePredictions: React.FC<Props> = ({ onBack, language, userLocation, t }) => {
    const [marketData, setMarketData] = useState<{ fruits: MarketPrice[], vegetables: MarketPrice[], grains: MarketPrice[] }>({
        fruits: [],
        vegetables: [],
        grains: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<string>('');
    const [lastUpdated, setLastUpdated] = useState<string>('');

    // Fetch directly from unified market prices API
    const fetchMarketPrices = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const langMap: Record<string, string> = {
                'english': 'en', 'tamil': 'ta', 'hindi': 'hi',
                'telugu': 'te', 'kannada': 'kn', 'malayalam': 'ml'
            };
            const langCode = langMap[language.toLowerCase()] || 'en';
            const state = userLocation || 'Tamil Nadu';
            const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

            const response = await fetch(
                `${apiUrl}/api/market/prices?state=${encodeURIComponent(state)}&lang=${langCode}&category=all`,
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.prices) {
                setMarketData({
                    fruits: (result.prices.fruits || []).map(mapToMarketPrice),
                    vegetables: (result.prices.vegetables || []).map(mapToMarketPrice),
                    grains: (result.prices.grains || []).map(mapToMarketPrice)
                });
                setDataSource(result.source || 'Agmark (Govt of India)');
                setLastUpdated(result.date || new Date().toISOString().split('T')[0]);
            }

        } catch (err: any) {
            console.error('Market prices fetch error:', err);
            setError(err.message || 'Failed to fetch prices');
        } finally {
            setIsLoading(false);
        }
    };

    // Map API response to MarketPrice interface
    const mapToMarketPrice = (item: any): MarketPrice => ({
        commodity: item.commodity || '',
        variety: item.variety || 'Local',
        modal_price: item.modal_price || 0,
        min_price: item.min_price || 0,
        max_price: item.max_price || 0,
        market: item.market || 'Unknown',
        arrival_date: item.arrival_date || '',
        unit: item.unit || 'Quintal',
        predicted_next_price: item.predicted_next_price,
        trend: item.trend,
        percentage_change: item.percentage_change
    });

    useEffect(() => {
        fetchMarketPrices();
    }, [language, userLocation]);

    const renderCategory = (title: string, items: MarketPrice[]) => {
        if (items.length === 0) return null;

        return (
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h3 className="text-xl font-black italic text-[#2da95c] uppercase tracking-tighter mb-4 flex items-center gap-2">
                    {t(title.toLowerCase()) || title}
                </h3>
                <div className="grid grid-cols-1 gap-4">
                    {items.map((item, index) => (
                        <div key={`${item.commodity}-${item.variety}-${index}`} className="bg-white rounded-[20px] p-5 shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-4 flex-1">
                                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 overflow-hidden relative">
                                    <img
                                        src={getCropIcon(item.commodity)}
                                        alt={item.commodity}
                                        onError={handleImageError}
                                        className="w-10 h-10 object-contain"
                                    />
                                    <div className="absolute inset-0 rounded-full border border-emerald-100/50"></div>
                                </div>

                                <div>
                                    <h4 className="text-lg font-[900] text-gray-800 uppercase tracking-tight">{getTranslatedCommodity(item.commodity, language)}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full uppercase tracking-wide">{getTranslatedVariety(item.variety, language)}</span>
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
                                            <MapPin size={10} strokeWidth={3} /> {getTranslatedMarket(item.market, language)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-end">
                                <span className="text-2xl font-[1000] text-[#2da95c] tracking-tighter">₹{item.modal_price}</span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t('per')} {t('quintal') || item.unit?.toUpperCase() || "QUINTAL"}</span>
                                {item.predicted_next_price && (
                                    <div className={`mt-[2px] flex items-baseline gap-1 px-2 py-0.5 rounded border ${item.trend === 'rising' ? 'bg-red-50 border-red-100 text-red-600' :
                                        item.trend === 'falling' ? 'bg-green-50 border-green-100 text-[#2da95c]' : 'bg-gray-50 border-gray-200 text-gray-600'
                                        }`}>
                                        <span className="text-[9px] font-[900] uppercase tracking-wider shrink-0 opacity-80">{t('predict') || "PREDICT"}:</span>
                                        <span className="text-[14px] font-[1000] tracking-tighter">₹{item.predicted_next_price}</span>
                                        {item.percentage_change !== undefined && (
                                            <span className="text-[9px] font-[800] ml-0.5 opacity-90">({item.percentage_change > 0 ? '+' : ''}{item.percentage_change.toFixed(1)}%)</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-white font-['Inter'] relative w-full overflow-hidden">
            <div className="relative pt-6 px-6 pb-4 flex items-center justify-between bg-white z-10">
                <button
                    onClick={onBack}
                    className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-95 transition-all shadow-sm border border-gray-100"
                >
                    <ArrowLeft size={24} strokeWidth={2.5} />
                </button>
                <h1 className="text-2xl font-[1000] text-black italic uppercase tracking-tighter">
                    {t('daily_market_prices') || 'DAILY MARKET PRICES'}
                </h1>
                <div className="w-12" />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
                {isLoading && marketData.fruits.length === 0 && marketData.vegetables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                        <div className="w-12 h-12 border-4 border-[#2da95c] border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-[#2da95c] font-bold italic animate-pulse tracking-widest uppercase">
                            {t('loading_prices') || "Loading Prices..."}
                        </p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                            <Tag size={32} className="text-red-500" />
                        </div>
                        <p className="text-red-500 font-bold mb-4">{error}</p>
                        <button
                            onClick={fetchMarketPrices}
                            className="px-6 py-2 bg-[#2da95c] text-white rounded-full font-bold shadow-lg hover:bg-[#258e4d] transition-all"
                        >
                            {t('retry') || 'Retry'}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="mb-6 bg-green-50 rounded-2xl p-4 border border-green-100 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                <MapPin size={20} className="text-green-700" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('market_location')}</p>
                                <p className="text-sm font-black text-gray-800">{userLocation || "Tamil Nadu"}</p>
                            </div>
                        </div>

                        {renderCategory('FRUITS', marketData.fruits)}
                        {renderCategory('VEGETABLES', marketData.vegetables)}
                        {renderCategory('GRAINS', marketData.grains)}

                        {!isLoading && marketData.fruits.length === 0 && marketData.vegetables.length === 0 && marketData.grains.length === 0 && (
                            <div className="flex flex-col items-center justify-center mt-20 text-center opacity-60">
                                <Calendar size={48} className="text-gray-400 mb-4" />
                                <p className="text-gray-500 font-bold">{t('noPriceData') || 'No prices available for today.'}</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default DailyPricePredictions;
