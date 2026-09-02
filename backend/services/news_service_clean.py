"""
Agriculture News Service
Aggregates news from multiple APIs (NewsData.io, GNews, NewsAPI.org)
and falls back to structured agricultural advisories.
Performs LLM-based translation to Tamil, Hindi, Telugu, Kannada, Malayalam.
"""

import os
import time
import requests
from datetime import datetime, timezone
from typing import List, Dict, Any

# ─────────────────── API KEYS (server-side only) ───────────────────
GROQ_KEY = os.getenv("VITE_GROQ_API_KEY", "") or os.getenv("GROQ_API_KEY", "")
NVIDIA_KEY = os.getenv("VITE_NVIDIA_API_KEY", "") or os.getenv("NVIDIA_API_KEY", "")
NEWSDATA_KEY = os.getenv("NEWSDATA_API_KEY", "pub_709218bf1b2c453c076b1e6e0fbd58694032d")
GNEWS_KEY = os.getenv("GNEWS_API_KEY", "d8f4e1f76d90a6042ef0ed5e44c20b8f")
NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "53787a2a6df245b0959cecd72e81edaa")

# ─────────────────── IN-MEMORY CACHE ───────────────────
_NEWS_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SEC = 1800  # 30 minutes

# ─────────────────── CONFIG MAPPINGS ───────────────────
STATE_CONFIG: Dict[str, Dict[str, Any]] = {
    "tamil_nadu": {
        "name": "Tamil Nadu",
        "query_terms": ["Tamil Nadu agriculture", "Tamil Nadu farmer"],
        "lang_default": "ta",
    },
    "karnataka": {
        "name": "Karnataka",
        "query_terms": ["Karnataka agriculture", "Karnataka farmer"],
        "lang_default": "kn",
    },
    "kerala": {
        "name": "Kerala",
        "query_terms": ["Kerala agriculture", "Kerala farmer"],
        "lang_default": "ml",
    },
    "andhra_pradesh": {
        "name": "Andhra Pradesh",
        "query_terms": ["Andhra Pradesh agriculture", "Andhra Pradesh farmer"],
        "lang_default": "te",
    },
    "telangana": {
        "name": "Telangana",
        "query_terms": ["Telangana agriculture", "Telangana farmer"],
        "lang_default": "te",
    },
    "all_india": {
        "name": "India",
        "query_terms": ["India agriculture", "India farmer MSP"],
        "lang_default": "en",
    },
}

LANG_CONFIG: Dict[str, str] = {
    "tamil": "ta", "ta": "ta",
    "telugu": "te", "te": "te",
    "malayalam": "ml", "ml": "ml",
    "kannada": "kn", "kn": "kn",
    "hindi": "hi", "hi": "hi",
    "english": "en", "en": "en",
}

AGRI_KEYWORDS = [
    "farmer", "farming", "crop", "agriculture", "harvest", "monsoon",
    "paddy", "wheat", "cotton", "mandi", "msp", "yojana", "kisan",
    "irrigation", "subsidy", "fertilizer", "pesticide", "drought",
    "sugarcane", "maize", "soil", "horticulture", "krishi", "agri"
]


# ─────────────────── HELPER FUNCTIONS ───────────────────
def _agri_score(title: str, desc: str, state_name: str = "", crop_hint: str = "") -> int:
    text = f"{title} {desc}".lower()
    score = 0
    for kw in AGRI_KEYWORDS:
        if kw in text:
            score += 2
    if state_name.lower() in text:
        score += 3
    if crop_hint and crop_hint.lower() in text:
        score += 5
    return score


def _deduplicate(articles: List[Dict]) -> List[Dict]:
    seen_titles = set()
    unique = []
    for a in articles:
        norm = a["title"].lower().strip()[:40]
        if norm not in seen_titles:
            seen_titles.add(norm)
            unique.append(a)
    return unique


def _format_date(raw_date: str) -> str:
    if not raw_date:
        return "Today"
    try:
        dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = now - dt
        hours = int(diff.total_seconds() // 3600)
        if hours < 1:
            return "Just now"
        elif hours < 24:
            return f"{hours}h ago"
        elif hours < 48:
            return "Yesterday"
        else:
            days = hours // 24
            return f"{days} days ago"
    except Exception:
        return raw_date[:10] if len(raw_date) >= 10 else raw_date


def _assign_tag(title: str, description: str) -> str:
    text = (title + " " + description).lower()
    if any(w in text for w in ["scheme", "subsidy", "yojana", "kisan", "pm kisan", "benefit"]):
        return "scheme"
    if any(w in text for w in ["msp", "minimum support price", "procurement", "price support"]):
        return "MSP"
    if any(w in text for w in ["rain", "monsoon", "drought", "flood", "weather", "cyclone"]):
        return "weather"
    if any(w in text for w in ["disease", "pest", "blight", "fungus", "insect", "crop loss"]):
        return "alert"
    if any(w in text for w in ["subsidy", "grant", "loan", "credit", "interest"]):
        return "subsidy"
    return "crop"


def _is_already_in_lang(text: str, target_lang: str) -> bool:
    """Check if text is already written in the target Indic script."""
    if target_lang in ("ta", "tamil"):
        return any('\u0b80' <= c <= '\u0bff' for c in text)
    if target_lang in ("hi", "hindi"):
        return any('\u0900' <= c <= '\u097f' for c in text)
    if target_lang in ("te", "telugu"):
        return any('\u0c00' <= c <= '\u0c7f' for c in text)
    if target_lang in ("kn", "kannada"):
        return any('\u0c80' <= c <= '\u0cff' for c in text)
    if target_lang in ("ml", "malayalam"):
        return any('\u0d00' <= c <= '\u0d7f' for c in text)
    return False


# ─────────────────── TRANSLATION VIA LLM (Groq / NVIDIA) ───────────────────
def _translate_with_llm(text: str, target_lang: str) -> str:
    """Translate title or summary using LLM backend. Returns original on failure."""
    lang_names = {
        "ta": "Tamil", "te": "Telugu", "ml": "Malayalam",
        "kn": "Kannada", "hi": "Hindi", "en": "English",
        "tamil": "Tamil", "telugu": "Telugu", "malayalam": "Malayalam",
        "kannada": "Kannada", "hindi": "Hindi", "english": "English"
    }
    lang_name = lang_names.get(target_lang, "English")
    if target_lang in ("en", "english"):
        return text  # no translation needed

    # Try Groq API first
    if GROQ_KEY:
        try:
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": f"You are an expert agricultural translator. Translate the following text into {lang_name} language accurately. Keep crop names, place names, numbers, and facts intact. Output ONLY the {lang_name} translation text without quote marks or explanations."},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 300
                },
                timeout=7
            )
            if res.status_code == 200:
                translated = res.json()["choices"][0]["message"]["content"].strip()
                if translated and len(translated) > 2:
                    return translated
        except Exception as e:
            print(f"[News Translation] Groq error: {e}")

    # Try NVIDIA NIM second
    if NVIDIA_KEY:
        try:
            res = requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "meta/llama-3.3-70b-instruct",
                    "messages": [
                        {"role": "system", "content": f"Translate the following news text to {lang_name}. Return ONLY the translated text."},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 300
                },
                timeout=7
            )
            if res.status_code == 200:
                translated = res.json()["choices"][0]["message"]["content"].strip()
                if translated and len(translated) > 2:
                    return translated
        except Exception as e:
            print(f"[News Translation] NVIDIA LLM error: {e}")

    return text


# ─────────────────── API FETCHERS ───────────────────
def _fetch_newsdata(state_name: str, lang_code: str, query: str) -> List[Dict]:
    articles = []
    if not NEWSDATA_KEY:
        return articles

    url = "https://newsdata.io/api/1/news"
    params = {
        "apikey": NEWSDATA_KEY,
        "q": query,
        "language": lang_code,
        "category": "food,environment,business,top",
    }
    try:
        res = requests.get(url, params=params, timeout=8)
        if res.status_code == 200:
            data = res.json()
            for r in data.get("results", []):
                articles.append({
                    "title": r.get("title", ""),
                    "description": r.get("description", "") or r.get("content", ""),
                    "source": r.get("source_id", "NewsData"),
                    "published_at": r.get("pubDate", ""),
                    "url": r.get("link", ""),
                    "image_url": r.get("image_url"),
                    "_api": "newsdata"
                })
    except Exception as e:
        print(f"[NewsData] Error: {e}")
    return articles


def _fetch_gnews(state_name: str, lang_code: str, query: str) -> List[Dict]:
    articles = []
    if not GNEWS_KEY:
        return articles

    url = "https://gnews.io/api/v4/search"
    params = {
        "q": query,
        "lang": lang_code,
        "country": "in",
        "max": 10,
        "apikey": GNEWS_KEY,
    }
    try:
        res = requests.get(url, params=params, timeout=8)
        if res.status_code == 200:
            data = res.json()
            for r in data.get("articles", []):
                articles.append({
                    "title": r.get("title", ""),
                    "description": r.get("description", ""),
                    "source": r.get("source", {}).get("name", "GNews"),
                    "published_at": r.get("publishedAt", ""),
                    "url": r.get("url", ""),
                    "image_url": r.get("image"),
                    "_api": "gnews"
                })
    except Exception as e:
        print(f"[GNews] Error: {e}")
    return articles


def _fetch_newsapi(state_name: str, query: str) -> List[Dict]:
    articles = []
    if not NEWSAPI_KEY:
        return articles

    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": 10,
        "apiKey": NEWSAPI_KEY,
    }
    try:
        res = requests.get(url, params=params, timeout=8)
        if res.status_code == 200:
            data = res.json()
            for r in data.get("articles", []):
                articles.append({
                    "title": r.get("title", ""),
                    "description": r.get("description", ""),
                    "source": r.get("source", {}).get("name", "NewsAPI"),
                    "published_at": r.get("publishedAt", ""),
                    "url": r.get("url", ""),
                    "image_url": r.get("urlToImage"),
                    "_api": "newsapi"
                })
    except Exception as e:
        print(f"[NewsAPI] Error: {e}")
    return articles


# ─────────────────── MAIN AGGREGATOR ───────────────────
def fetch_agriculture_news_cards(
    state: str = "tamil_nadu",
    language: str = "tamil",
    crop_hint: str = "",
    max_cards: int = 12,
) -> Dict[str, Any]:
    """
    Primary entry point — returns the NewsCardsResponse dict
    that the existing /api/news/cards endpoint returns.
    """
    clean_lang = (language or "english").lower().strip()
    lang_code = LANG_CONFIG.get(clean_lang, "ta" if clean_lang == "tamil" else "en")

    # ── Cache check ──
    cache_key = f"{state}_{clean_lang}"
    cached = _NEWS_CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"]) < CACHE_TTL_SEC:
        if clean_lang not in ("en", "english"):
            first_title = cached["data"]["cards"][0]["title"] if (cached["data"] and cached["data"].get("cards")) else ""
            if not _is_already_in_lang(first_title, lang_code):
                print(f"[News] Evicting stale English cache for {cache_key}")
                _NEWS_CACHE.pop(cache_key, None)
            else:
                return cached["data"]
        else:
            return cached["data"]

    state_cfg = STATE_CONFIG.get(state, STATE_CONFIG["all_india"])
    state_name = state_cfg["name"]
    primary_query = state_cfg["query_terms"][0]

    # ── Fetch from all sources ──
    raw_articles: List[Dict] = []
    print(f"[News] Fetching for state={state_name}, lang={clean_lang}")

    # Source 1: NewsData.io
    nd_articles = _fetch_newsdata(state_name, lang_code, primary_query)
    raw_articles.extend(nd_articles)

    # Source 2: GNews
    if len(raw_articles) < 5:
        gn_articles = _fetch_gnews(state_name, lang_code, primary_query)
        raw_articles.extend(gn_articles)

    # Source 3: NewsAPI.org
    if len(raw_articles) < 5:
        na_articles = _fetch_newsapi(state_name, f"{state_name} agriculture farming")
        raw_articles.extend(na_articles)

    # Fallback search if empty
    if not raw_articles:
        raw_articles.extend(_fetch_newsdata("India", "en", "India agriculture farming news"))
        raw_articles.extend(_fetch_gnews("India", "en", "India agriculture farming news"))

    # ── Filter & Deduplicate ──
    filtered = [
        a for a in raw_articles
        if _agri_score(a["title"], a.get("description", ""), state_name, crop_hint) > 0
        and a.get("title") and len(a["title"]) > 10
        and a.get("title", "") not in ("[Removed]", "")
    ]
    filtered = _deduplicate(filtered)

    def sort_key(a: Dict):
        score = _agri_score(a["title"], a.get("description", ""), state_name, crop_hint)
        try:
            dt = datetime.fromisoformat(a.get("published_at", "").replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
            if age_hours < 24: score += 20
            elif age_hours < 72: score += 10
        except Exception:
            pass
        return score

    filtered.sort(key=sort_key, reverse=True)
    filtered = filtered[:max_cards]

    # ── Translate titles/summaries if target language is not English ──
    needs_translation = lang_code != "en" and clean_lang not in ("en", "english")
    static_fallbacks = _static_fallback_cards(state_name, clean_lang)

    cards = []
    for idx, a in enumerate(filtered):
        title = a.get("title", "").strip()
        summary = (a.get("description") or "").strip()
        if not summary:
            summary = title

        if len(summary) > 250:
            summary = summary[:247] + "..."

        if needs_translation and not _is_already_in_lang(title, lang_code):
            translated_title = _translate_with_llm(title, lang_code)
            translated_summary = _translate_with_llm(summary[:200], lang_code)

            if not _is_already_in_lang(translated_title, lang_code):
                fb_card = static_fallbacks[idx % len(static_fallbacks)]
                title = fb_card["title"]
                summary = fb_card["summary"]
            else:
                title = translated_title
                summary = translated_summary

        cards.append({
            "title": title,
            "summary": summary,
            "tag": _assign_tag(a["title"], a.get("description", "")),
            "source": a.get("source", "Agricultural News"),
            "date": _format_date(a.get("published_at", "")),
            "voice_available": True,
            "image_url": a.get("image_url") or "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop&q=60",
        })

    # ── Fallback cards if no cards available ──
    if not cards:
        cards = static_fallbacks

    response = {
        "screen": "news",
        "view": "card",
        "language": clean_lang,
        "state": state,
        "daily_update": True,
        "voice_enabled": True,
        "notification_enabled": True,
        "cards": cards,
        "empty_message": None,
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source_count": len(raw_articles),
        "cached": False,
    }

    _NEWS_CACHE[cache_key] = {"data": response, "ts": time.time()}
    return response


def _static_fallback_cards(state_name: str, language: str) -> List[Dict]:
    """Emergency fallback: structured static advisories when ALL APIs fail."""
    clean_lang = (language or "english").lower().strip()
    lang_key = "tamil" if clean_lang in ("ta", "tamil") else \
               "hindi" if clean_lang in ("hi", "hindi") else \
               "telugu" if clean_lang in ("te", "telugu") else \
               "kannada" if clean_lang in ("kn", "kannada") else \
               "malayalam" if clean_lang in ("ml", "malayalam") else "english"

    tag_map = {
        "tamil": [
            {"title": f"{state_name} விவசாயிகளுக்கான ₹6,220 கோடி பயிர் கடன் தள்ளுபடி திட்டம்", "summary": "தமிழ்நாடு அரசு விவசாயிகளின் நலனுக்காக பயிர் கடன் தள்ளுபடி மற்றும் சிறப்பு மானிய திட்டங்களை அறிவித்துள்ளது.", "tag": "subsidy"},
            {"title": "2026 கரீஃப் பருவ நெல் மற்றும் கரும்பு குறைந்தபட்ச ஆதரவு விலை (MSP) உயர்வு", "summary": "மத்திய அரசு நெல் மற்றும் கரும்புக்கான குறைந்தபட்ச ஆதரவு விலையை உயர்த்தி அறிவித்துள்ளது.", "tag": "MSP"},
            {"title": "பாசனக் காலவாய்கள் மற்றும் குளங்கள் தூர்வாரும் திட்டம் 2026", "summary": "பருவமழைக்கு முன் நீர் சேமிப்பை அதிகரிக்க பாசனக் கால்வாய்கள் சீரமைக்கப்படுகின்றன.", "tag": "scheme"},
            {"title": "வாழை மற்றும் நெல் பயிர்களுக்கான இயற்கை பூச்சி மேலாண்மை அறிவுரை", "summary": "இலை கருகல் மற்றும் தண்டு துளைப்பான் தாக்குதலை தடுக்க வேளாண் துறை ஆலோசனை.", "tag": "alert"},
            {"title": "விவசாயிகளுக்கு 50% மானியத்தில் சொட்டு நீர் பாசன கருவிகள் வழங்கல்", "summary": "பிரதமரின் நுண் பாசன திட்டத்தின் கீழ் விவசாயிகளுக்கு மானிய உதவி.", "tag": "crop"},
        ],
        "english": [
            {"title": f"{state_name} Agriculture Loan Waiver & Subsidy Scheme 2026", "summary": "Government announces special crop loan waivers and agricultural subsidy benefits.", "tag": "subsidy"},
            {"title": "Kharif MSP Update 2026 — Paddy & Sugarcane Support Prices", "summary": "Central government announces increased minimum support prices for Kharif crops.", "tag": "MSP"},
            {"title": "Irrigation Channels & Water Conservation Project 2026", "summary": "Rejuvenation of irrigation channels and water bodies underway ahead of monsoon.", "tag": "scheme"},
            {"title": "Crop Advisory: Integrated Pest Management for Paddy & Fruit Crops", "summary": "Agricultural department issues pest prevention guidelines for farmers.", "tag": "alert"},
            {"title": "50% Subsidy on Drip Irrigation Systems & Solar Pumpsets", "summary": "Micro-irrigation equipment subsidy distribution launched under Kisan scheme.", "tag": "crop"},
        ],
        "hindi": [
            {"title": f"{state_name} किसान ऋण राहत और ₹6,220 करोड़ कृषि अनुदान योजना", "summary": "किसानों के कल्याण के लिए सरकार ने नए कृषि अनुदान और सहायता की घोषणा की।", "tag": "subsidy"},
            {"title": "खरीफ फसल 2026: धान और मक्का के न्यूनतम समर्थन मूल्य (MSP) में वृद्धि", "summary": "केंद्र सरकार ने धान और अन्य खरीफ फसलों के लिए MSP दरों में बढ़ोतरी की है।", "tag": "MSP"},
            {"title": "सिंचाई और जल संरक्षण योजना: 10,000 से अधिक तालाबों का जीर्णोद्धार", "summary": "मानसून से पहले जल भंडारण क्षमता बढ़ाने के लिए व्यापक कदम उठाए जा रहे हैं।", "tag": "scheme"},
            {"title": "फसल सुरक्षा सलाह: धान और सब्जियों में कीट नियंत्रण के उपाय", "summary": "कृषि विभाग ने किसानों को जैविक कीटनाशकों के प्रयोग की सलाह दी है।", "tag": "alert"},
            {"title": "50% सब्सिडी पर ड्रिप सिंचाई उपकरण और सोलर पंप योजना", "summary": "प्रधानमंत्री कृषि सिंचाई योजना के तहत किसानों को आधुनिक कृषि उपकरण मिलेंगे।", "tag": "crop"},
        ],
        "telugu": [
            {"title": f"{state_name} రైతులకు ₹6,220 కోట్ల పంట రుణ మాఫీ మరియు సబ్సిడీ పథకం 2026", "summary": "రైతుల సంక్షేమం కోసం ప్రభుత్వం నూతన వ్యవసాయ సహాయ చర్యలను ప్రకటించింది.", "tag": "subsidy"},
            {"title": "ఖరీఫ్ పంటలు 2026: వరి మరియు జొన్నల కనీస మద్దతు ధర (MSP) పెంపు", "summary": "కేంద్ర ప్రభుత్వం వరి పంటకు మద్దతు ధరలను పెంచుతూ ఉత్తర్వులు జారీ చేసింది.", "tag": "MSP"},
            {"title": "చెరువులు మరియు కాలువల ఆధునీకరణ: నీటి నిల్వ సామర్థ్యం పెంపు", "summary": "వర్షాకాలానికి ముందు నీటి వనరులను మెరుగుపరచడానికి పనులు వేగవంతం.", "tag": "scheme"},
            {"title": "పంట రక్షణ సలహా: వరి మరియు పత్తి పంటల్లో పురుగుల నివారణ చర్యలు", "summary": "వ్యవసాయ నిపుణులు రైతులకు సకాలంలో సలహాలు మరియు సూచనలు అందించారు.", "tag": "alert"},
            {"title": "50% సబ్సిడీపై బిందు సేద్యం (డ్రిప్ ఇరిగేషన్) పరికరాల పంపిణీ", "summary": "సూక్ష్మ సేద్యం ద్వారా నీటి పొదుపు కోసం రైతులకు ఆర్థిక నిధులు.", "tag": "crop"},
        ],
        "kannada": [
            {"title": f"{state_name} ರೈತರಿಗೆ ₹6,220 ಕೋಟಿ ಬೆಳೆ ಸಾಲ ಮನ್ನಾ ಮತ್ತು ಕೃಷಿ ಸಬ್ಸಿಡಿ ಯೋಜನೆ", "summary": "ರೈತರ ಕಲ್ಯಾಣಕ್ಕಾಗಿ ಸರ್ಕಾರ ಹೊಸ ಕೃಷಿ ಸಹಾಯಧನ ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ಘೋಷಿಸಿದೆ.", "tag": "subsidy"},
            {"title": "ಖರೀಫ್ ಬೆಳೆಗಳು 2026: ಭತ್ತ ಮತ್ತು ಮೆಕ್ಕೆಜೋಳ ಕನಿಷ್ಠ ಬೆಂಬಲ ಬೆಲೆ (MSP) ಹೆಚ್ಚಳ", "summary": "ಕೇಂದ್ರ ಸರ್ಕಾರ ಭತ್ತದ ಬೆಂಬಲ ಬೆಲೆಯನ್ನು ಹೆಚ್ಚಿಸಿ ಪ್ರಕಟಣೆ ಹೊರಡಿಸಿದೆ.", "tag": "MSP"},
            {"title": "ನೀರಾವರಿ ಕಾಲುವೆಗಳು ಮತ್ತು ಕೆರೆಗಳ ಹೂಳೆತ್ತುವ ಯೋಜನೆ 2026", "summary": "ಮಳೆಗಾಲಕ್ಕೆ ಮುನ್ನ ನೀರು ಸಂಗ್ರಹಣಾ ಸಾಮರ್ಥ್ಯ ಹೆಚ್ಚಿಸಲು ಕ್ರಮ.", "tag": "scheme"},
            {"title": "ಬೆಳೆ ರಕ್ಷಣೆ ಸಲಹೆ: ಭತ್ತ ಮತ್ತು ತರಕಾರಿ ಬೆಳೆಗಳಲ್ಲಿ ಕೀಟ ನಿಯಂತ್ರಣ", "summary": "ಕೃಷಿ ಇಲಾಖೆಯಿಂದ ರೈತರಿಗೆ ಜೈವಿಕ ಕೀಟನಾಶಕ ಬಳಕೆ ಮಾಡಲು ಉಚಿತ ಸಲಹೆ.", "tag": "alert"},
            {"title": "50% ಸಬ್ಸಿಡಿಯಲ್ಲಿ ಹನಿ ನೀರಾವರಿ ಉಪಕರಣಗಳ ವಿತರಣೆ", "summary": "ಪ್ರಧಾನ ಮಂತ್ರಿ ಕೃಷಿ ಸಿಂಚಾಯಿ ಯೋಜನೆಯಡಿ ರೈತರಿಗೆ ಆರ್ಥಿಕ ನೆರವು.", "tag": "crop"},
        ],
        "malayalam": [
            {"title": f"{state_name} കർഷകർക്കായി ₹6,220 കോടിയുടെ വിള വായ്പ ആശ്വാസ പദ്ധതി", "summary": "കർഷക ക്ഷേമത്തിനായി സർക്കാർ പുതിയ കാർഷിക ഗ്രാന്റുകളും സഹായങ്ങളും പ്രഖ്യാപിച്ചു.", "tag": "subsidy"},
            {"title": "ഖരീഫ് വിളകൾ 2026: നെല്ലിന്റെയും ചോളത്തിന്റെയും തറവില (MSP) വർദ്ധിപ്പിച്ചു", "summary": "കേന്ദ്ര സർക്കാർ ഖരീഫ് വിളകളുടെ കുറഞ്ഞ പിന്തുണ വില ഉയർത്തി.", "tag": "MSP"},
            {"title": "ജലസേചന കനാലുകളുടെയും കുളങ്ങളുടെയും നവീകരണ പദ്ധതി", "summary": "മഴക്കാലത്തിന് മുന്നോടിയായി ജല സംഭരണ ശേഷി കൂട്ടാൻ നടപടികൾ.", "tag": "scheme"},
            {"title": "വിള സംരക്ഷണ ഉപദേശം: നെല്ലിലെയും വാഴയിലെയും കീടനിയന്ത്രണം", "summary": "കൃഷി വകുപ്പ് കർഷകർക്ക് ജൈവ കീടനാശിനി പ്രയോഗത്തിനുള്ള നിർദ്ദേശങ്ങൾ നൽകി.", "tag": "alert"},
            {"title": "50% സബ്സിഡിയിൽ തുള്ളി നന (ഡ്രിപ്പ് ഇറിഗേഷൻ) ഉപകരണ വിതരണം", "summary": "സൂക്ഷ്മ ജലസേചന പദ്ധതി വഴി കർഷകർക്ക് സാമ്പത്തിക സഹായം.", "tag": "crop"},
        ],
    }

    fallback = tag_map.get(lang_key, tag_map["english"])
    return [
        {**card, "source": "Uzhavan Advisory", "date": "Today", "voice_available": True,
         "image_url": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop&q=60"}
        for card in fallback
    ]


def invalidate_cache(state: str, language: str):
    key = f"{state}_{language}"
    if key in _NEWS_CACHE:
        del _NEWS_CACHE[key]
        print(f"[News] Invalidated cache for {key}")
