"""
Uzhavan AI — Real-Time Agricultural News Intelligence Service
=============================================================
Sources (priority order):
  1. NewsData.io  (NEWSDATA_API_KEY)
  2. GNews API    (GNEWS_API_KEY)
  3. NewsAPI.org  (NEWSAPI_ORG_KEY)

Features:
  - State-specific Indian agricultural news
  - Multi-language support (Tamil, Telugu, Malayalam, Kannada, Hindi, English)
  - Agriculture relevance filtering & ranking
  - Duplicate detection
  - Per-state+language cache with 30-min TTL
  - Graceful fallback: if one API fails, try next
  - LLM is NEVER used as news source – only for optional translation
"""

import os
import re
import time
import hashlib
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

# ─────────────────── API KEYS (server-side only) ───────────────────
NEWSDATA_KEY  = os.getenv("NEWSDATA_API_KEY", "")
GNEWS_KEY     = os.getenv("GNEWS_API_KEY", "")
NEWSAPI_KEY   = os.getenv("NEWSAPI_ORG_KEY", "")
NVIDIA_KEY    = os.getenv("VITE_NVIDIA_API_KEY", "")

# ─────────────────── IN-MEMORY CACHE ───────────────────
_NEWS_CACHE: Dict[str, Dict] = {}
CACHE_TTL_SEC = 30 * 60  # 30 minutes


# ─────────────────── STATE CONFIG ───────────────────
STATE_CONFIG: Dict[str, Dict] = {
    "tamil_nadu":      {"name": "Tamil Nadu",       "lang_code": "ta", "query_terms": ["Tamil Nadu agriculture", "Tamil Nadu farmers", "Tamil Nadu crop", "Tamil Nadu farming", "தமிழ்நாடு விவசாயம்"]},
    "karnataka":       {"name": "Karnataka",         "lang_code": "kn", "query_terms": ["Karnataka agriculture", "Karnataka farmers", "Karnataka farming", "Karnataka crop"]},
    "kerala":          {"name": "Kerala",             "lang_code": "ml", "query_terms": ["Kerala agriculture", "Kerala farmers", "Kerala farming", "Kerala crop"]},
    "andhra_pradesh":  {"name": "Andhra Pradesh",    "lang_code": "te", "query_terms": ["Andhra Pradesh agriculture", "Andhra Pradesh farmers", "AP farming", "Andhra Pradesh crop"]},
    "telangana":       {"name": "Telangana",          "lang_code": "te", "query_terms": ["Telangana agriculture", "Telangana farmers", "Telangana farming", "Telangana crop"]},
    "maharashtra":     {"name": "Maharashtra",        "lang_code": "mr", "query_terms": ["Maharashtra agriculture", "Maharashtra farmers", "Maharashtra farming", "Maharashtra crop"]},
    "gujarat":         {"name": "Gujarat",            "lang_code": "gu", "query_terms": ["Gujarat agriculture", "Gujarat farmers", "Gujarat farming", "Gujarat crop"]},
    "rajasthan":       {"name": "Rajasthan",          "lang_code": "hi", "query_terms": ["Rajasthan agriculture", "Rajasthan farmers", "Rajasthan farming"]},
    "madhya_pradesh":  {"name": "Madhya Pradesh",    "lang_code": "hi", "query_terms": ["Madhya Pradesh agriculture", "MP farmers", "MP farming", "MP crop"]},
    "uttar_pradesh":   {"name": "Uttar Pradesh",     "lang_code": "hi", "query_terms": ["Uttar Pradesh agriculture", "UP farmers", "UP farming", "UP crop"]},
    "bihar":           {"name": "Bihar",              "lang_code": "hi", "query_terms": ["Bihar agriculture", "Bihar farmers", "Bihar farming"]},
    "west_bengal":     {"name": "West Bengal",       "lang_code": "bn", "query_terms": ["West Bengal agriculture", "WB farmers", "Bengal farming"]},
    "punjab":          {"name": "Punjab",             "lang_code": "pa", "query_terms": ["Punjab agriculture", "Punjab farmers", "Punjab farming", "Punjab crop"]},
    "haryana":         {"name": "Haryana",            "lang_code": "hi", "query_terms": ["Haryana agriculture", "Haryana farmers", "Haryana farming"]},
    "odisha":          {"name": "Odisha",             "lang_code": "or", "query_terms": ["Odisha agriculture", "Odisha farmers", "Odisha farming"]},
    "all_india":       {"name": "India",              "lang_code": "hi", "query_terms": ["India agriculture news", "Indian farmers", "Indian farming", "krishi", "MSP India"]},
}

# ─────────────────── LANGUAGE CONFIG ───────────────────
LANG_CONFIG: Dict[str, str] = {
    "tamil":     "ta",
    "telugu":    "te",
    "malayalam": "ml",
    "kannada":   "kn",
    "hindi":     "hi",
    "english":   "en",
}

# ─────────────────── AGRICULTURE KEYWORDS (relevance filter) ───────────────────
AGRI_KEYWORDS = {
    "crop", "crops", "agriculture", "agricultural", "farming", "farmer", "farmers",
    "paddy", "rice", "wheat", "maize", "corn", "cotton", "sugarcane", "jute",
    "pulses", "lentil", "dal", "groundnut", "soybean", "sunflower", "mustard",
    "coconut", "banana", "mango", "tomato", "onion", "potato", "brinjal",
    "chilli", "pepper", "turmeric", "ginger", "cardamom", "cashew",
    "irrigation", "rainfall", "drought", "flood", "monsoon",
    "fertilizer", "pesticide", "insecticide", "fungicide", "herbicide",
    "mandi", "apmc", "market price", "msp", "minimum support price",
    "subsidy", "scheme", "kisan", "krishi", "agri", "horticulture",
    "harvest", "sowing", "planting", "yield", "productivity",
    "soil", "organic", "sustainable", "greenhouse",
    "tractor", "harvester", "drip", "sprinkler",
    "icar", "agriculture department", "agriculture ministry",
    "crop insurance", "pm kisan", "soil health card",
    "seed", "seedling", "nursery", "grafting",
    "dairy", "poultry", "fishery", "aquaculture",
    "water conservation", "micro irrigation",
    "நெல்", "கோதுமை", "விவசாய", "உழவர்", "பயிர்", "மண்",
    "వ్యవసాయ", "రైతు", "పంట",
    "ಕೃಷಿ", "ರೈತ", "ಬೆಳೆ",
    "കൃഷി", "കർഷകൻ", "വിള",
    "कृषि", "किसान", "फसल", "खेती",
}

# ─────────────────── REJECT KEYWORDS (non-agriculture) ───────────────────
REJECT_KEYWORDS = {
    "cricket", "ipl", "bollywood", "film", "cinema", "movie",
    "election", "political party", "politician", "bjp", "congress", "aiadmk",
    "murder", "crime", "robbery", "theft", "police",
    "stock market", "sensex", "nifty", "share market",
    "sports", "football", "kabaddi",
}


def _agri_score(title: str, description: str, state_name: str, crop_hint: str = "") -> int:
    """Compute relevance score. Higher = more relevant to show first."""
    text = (title + " " + description).lower()
    score = 0

    # State name match (highest priority)
    if state_name.lower() in text:
        score += 50

    # Agriculture keyword matches
    for kw in AGRI_KEYWORDS:
        if kw.lower() in text:
            score += 3

    # Crop-specific match (farmer profile personalization)
    if crop_hint and crop_hint.lower() in text:
        score += 15

    # Reject keywords kill the score
    for kw in REJECT_KEYWORDS:
        if kw in text:
            score -= 100

    return score


def _normalize_title(title: str) -> str:
    """For duplicate detection – lowercase & strip punctuation."""
    return re.sub(r"[^a-z0-9 ]", "", title.lower()).strip()


def _deduplicate(articles: List[Dict]) -> List[Dict]:
    seen: set = set()
    unique = []
    for a in articles:
        key = _normalize_title(a.get("title", ""))[:80]
        if key and key not in seen:
            seen.add(key)
            unique.append(a)
    return unique


def _format_date(raw_date: str) -> str:
    """Return Today / Yesterday / n days ago string."""
    if not raw_date:
        return "Today"
    try:
        dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = now - dt
        hours = diff.total_seconds() / 3600
        if hours < 24:
            return "Today"
        elif hours < 48:
            return "Yesterday"
        else:
            return dt.strftime("%d %b %Y")
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


# ─────────────────── TRANSLATION VIA NVIDIA NIM (optional, on-demand) ───────────────────
def _translate_with_llm(text: str, target_lang: str) -> str:
    """Translate title or summary using NVIDIA NIM backend proxy. Returns original on failure."""
    lang_names = {
        "ta": "Tamil", "te": "Telugu", "ml": "Malayalam",
        "kn": "Kannada", "hi": "Hindi", "en": "English"
    }
    lang_name = lang_names.get(target_lang, "English")
    if target_lang == "en":
        return text  # no translation needed

    try:
        if NVIDIA_KEY:
            res = requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "meta/llama-3.3-70b-instruct",
                    "messages": [
                        {"role": "system", "content": f"You are a translator. Translate the following agricultural news text accurately to {lang_name}. Keep factual details intact. Return ONLY the translated text, nothing else."},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 300
                },
                timeout=8
            )
            if res.status_code == 200:
                translated = res.json()["choices"][0]["message"]["content"].strip()
                if translated:
                    return translated
    except Exception as e:
        print(f"[News Translation] NVIDIA LLM error: {e}")
    return text  # fallback: original text


# ─────────────────── SOURCE 1: NewsData.io ───────────────────
def _fetch_newsdata(state_name: str, lang_code: str, query: str) -> List[Dict]:
    if not NEWSDATA_KEY:
        return []
    articles = []
    try:
        params = {
            "apikey": NEWSDATA_KEY,
            "q": query,
            "language": lang_code if lang_code in ("ta", "te", "ml", "kn", "hi", "en") else "en",
            "category": "business,science,technology",
            "size": 10,
        }
        res = requests.get("https://newsdata.io/api/1/news", params=params, timeout=8)
        if res.status_code == 200:
            data = res.json()
            for item in data.get("results", []):
                articles.append({
                    "title": item.get("title", ""),
                    "description": item.get("description") or item.get("content", ""),
                    "source": item.get("source_name") or item.get("source_id", "NewsData"),
                    "published_at": item.get("pubDate", ""),
                    "url": item.get("link", ""),
                    "image_url": item.get("image_url", ""),
                    "_api": "newsdata"
                })
        else:
            print(f"[NewsData] Status {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"[NewsData] Error: {e}")
    return articles


# ─────────────────── SOURCE 2: GNews ───────────────────
def _fetch_gnews(state_name: str, lang_code: str, query: str) -> List[Dict]:
    if not GNEWS_KEY:
        return []
    articles = []
    try:
        # GNews supports: en, fr, de, ar, zh, es, it, pt, ru, nl (limited Indian langs)
        gnews_lang = lang_code if lang_code in ("en", "hi") else "en"
        params = {
            "q": query,
            "lang": gnews_lang,
            "country": "in",
            "max": 10,
            "apikey": GNEWS_KEY,
        }
        res = requests.get("https://gnews.io/api/v4/search", params=params, timeout=8)
        if res.status_code == 200:
            for item in res.json().get("articles", []):
                articles.append({
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                    "source": item.get("source", {}).get("name", "GNews"),
                    "published_at": item.get("publishedAt", ""),
                    "url": item.get("url", ""),
                    "image_url": item.get("image", ""),
                    "_api": "gnews"
                })
        else:
            print(f"[GNews] Status {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"[GNews] Error: {e}")
    return articles


# ─────────────────── SOURCE 3: NewsAPI.org ───────────────────
def _fetch_newsapi(state_name: str, query: str) -> List[Dict]:
    if not NEWSAPI_KEY:
        return []
    articles = []
    try:
        params = {
            "q": query,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 10,
            "apiKey": NEWSAPI_KEY,
        }
        res = requests.get("https://newsapi.org/v2/everything", params=params, timeout=8)
        if res.status_code == 200:
            for item in res.json().get("articles", []):
                articles.append({
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                    "source": item.get("source", {}).get("name", "NewsAPI"),
                    "published_at": item.get("publishedAt", ""),
                    "url": item.get("url", ""),
                    "image_url": item.get("urlToImage", ""),
                    "_api": "newsapi"
                })
        else:
            print(f"[NewsAPI] Status {res.status_code}: {res.text[:200]}")
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
    # ── Cache check ──
    cache_key = f"{state}_{language}"
    cached = _NEWS_CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"]) < CACHE_TTL_SEC:
        print(f"[News] Returning cached news for {cache_key}")
        return cached["data"]

    state_cfg = STATE_CONFIG.get(state, STATE_CONFIG["all_india"])
    state_name = state_cfg["name"]
    lang_code = LANG_CONFIG.get(language, "en")
    primary_query = state_cfg["query_terms"][0]  # e.g. "Tamil Nadu agriculture"

    # ── Fetch from all sources ──
    raw_articles: List[Dict] = []
    print(f"[News] Fetching for state={state_name}, lang={language}")

    # Source 1: NewsData.io
    nd_articles = _fetch_newsdata(state_name, lang_code, primary_query)
    raw_articles.extend(nd_articles)

    # Source 2: GNews (English fallback query)
    if len(raw_articles) < 5:
        gn_articles = _fetch_gnews(state_name, lang_code, primary_query)
        raw_articles.extend(gn_articles)

    # Source 3: NewsAPI.org (always English)
    if len(raw_articles) < 5:
        na_articles = _fetch_newsapi(state_name, f"{state_name} agriculture farming")
        raw_articles.extend(na_articles)

    # If still empty from all APIs: broader Indian agriculture fallback
    if not raw_articles:
        raw_articles.extend(_fetch_newsdata("India", "en", "India agriculture farming news"))
        raw_articles.extend(_fetch_gnews("India", "en", "India agriculture farming news"))

    # ── Filter: must be agriculture-related ──
    filtered = [
        a for a in raw_articles
        if _agri_score(a["title"], a.get("description", ""), state_name, crop_hint) > 0
        and a.get("title") and len(a["title"]) > 10
        and a.get("title", "") not in ("[Removed]", "")
    ]

    # ── Deduplicate ──
    filtered = _deduplicate(filtered)

    # ── Sort by relevance score (desc) then recency ──
    def sort_key(a: Dict):
        score = _agri_score(a["title"], a.get("description", ""), state_name, crop_hint)
        # Recency bonus: articles published within 24h get +20
        try:
            dt = datetime.fromisoformat(a.get("published_at", "").replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
            if age_hours < 24:
                score += 20
            elif age_hours < 72:
                score += 10
        except Exception:
            pass
        return score

    filtered.sort(key=sort_key, reverse=True)
    filtered = filtered[:max_cards]

    # ── Translate titles/summaries if needed ──
    needs_translation = lang_code not in ("en",) and language != "english"

    cards = []
    for a in filtered:
        title = a.get("title", "").strip()
        summary = (a.get("description") or "").strip()
        if not summary:
            summary = title

        # Truncate long summaries
        if len(summary) > 250:
            summary = summary[:247] + "..."

        # Optional translation (only if needed & not already in target language)
        if needs_translation:
            # Only translate English articles
            detected_eng = all(ord(c) < 128 for c in title[:20])
            if detected_eng:
                title = _translate_with_llm(title, lang_code)
                summary = _translate_with_llm(summary[:200], lang_code)

        cards.append({
            "title": title,
            "summary": summary,
            "tag": _assign_tag(a["title"], a.get("description", "")),
            "source": a.get("source", "Agricultural News"),
            "date": _format_date(a.get("published_at", "")),
            "voice_available": True,
            "image_url": a.get("image_url") or "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop&q=60",
        })

    # ── Fallback cards if all APIs failed ──
    if not cards:
        cards = _static_fallback_cards(state_name, language)

    response = {
        "screen": "news",
        "view": "card",
        "language": language,
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

    # ── Store in cache ──
    _NEWS_CACHE[cache_key] = {"data": response, "ts": time.time()}

    return response


def _static_fallback_cards(state_name: str, language: str) -> List[Dict]:
    """Emergency fallback: structured static advisories when ALL APIs fail. Not fake news — generic advisories."""
    tag_map = {
        "tamil": [
            {"title": f"{state_name} விவசாயிகளுக்கு விவசாய அறிவுரை 2026", "summary": "இன்றைய விவசாய நடவடிக்கைகளுக்கு பருவகால வழிகாட்டுதல்கள்.", "tag": "crop"},
            {"title": "MSP விலை புதுப்பிப்பு — கரும்பு மற்றும் நெல்", "summary": "2026 கரீஃப் பருவத்திற்கு மத்திய அரசு குறைந்தபட்ச ஆதரவு விலையை அறிவித்துள்ளது.", "tag": "MSP"},
        ],
        "english": [
            {"title": f"{state_name} Agriculture Advisory 2026", "summary": "Seasonal farming guidelines for agricultural activities in your district.", "tag": "crop"},
            {"title": "Kharif MSP Update — Paddy & Maize", "summary": "Central government announces minimum support prices for Kharif crops 2026.", "tag": "MSP"},
        ],
        "hindi": [
            {"title": f"{state_name} कृषि सलाह 2026", "summary": "अपने जिले में कृषि गतिविधियों के लिए मौसमी दिशानिर्देश।", "tag": "crop"},
            {"title": "खरीफ MSP अपडेट — धान और मक्का", "summary": "केंद्र सरकार ने खरीफ फसलों 2026 के लिए न्यूनतम समर्थन मूल्य घोषित किया।", "tag": "MSP"},
        ],
        "telugu": [
            {"title": f"{state_name} వ్యవసాయ సలహా 2026", "summary": "మీ జిల్లాలో వ్యవసాయ కార్యకలాపాలకు సీజనల్ మార్గదర్శకాలు.", "tag": "crop"},
            {"title": "ఖరీఫ్ MSP అప్‌డేట్ — వడ్లు మరియు మక్కజొన్న", "summary": "కేంద్ర ప్రభుత్వం ఖరీఫ్ పంటలు 2026 కోసం కనీస మద్దతు ధరలను ప్రకటించింది.", "tag": "MSP"},
        ],
        "kannada": [
            {"title": f"{state_name} ಕೃಷಿ ಸಲಹೆ 2026", "summary": "ನಿಮ್ಮ ಜಿಲ್ಲೆಯಲ್ಲಿ ಕೃಷಿ ಚಟುವಟಿಕೆಗಳಿಗೆ ಋತುಮಾನ ಮಾರ್ಗದರ್ಶನ.", "tag": "crop"},
            {"title": "ಖರೀಫ್ MSP ಅಪ್‌ಡೇಟ್ — ಭತ್ತ ಮತ್ತು ಮೆಕ್ಕೆಜೋಳ", "summary": "ಕೇಂದ್ರ ಸರ್ಕಾರ ಖರೀಫ್ ಬೆಳೆಗಳು 2026 ಗಾಗಿ ಕನಿಷ್ಠ ಬೆಂಬಲ ಬೆಲೆಯನ್ನು ಪ್ರಕಟಿಸಿದೆ.", "tag": "MSP"},
        ],
        "malayalam": [
            {"title": f"{state_name} കാർഷിക ഉപദേശം 2026", "summary": "നിങ്ങളുടെ ജില്ലയിലെ കൃഷി പ്രവർത്തനങ്ങൾക്കുള്ള സീസൺ മാർഗ്ഗനിർദ്ദേശങ്ങൾ.", "tag": "crop"},
            {"title": "ഖരീഫ് MSP അപ്‌ഡേറ്റ് — നെല്ലും ചോളവും", "summary": "ഖരീഫ് 2026 വിളകൾക്ക് കേന്ദ്ര സർക്കാർ ന്യൂനതമ പ്രൈസ് പ്രഖ്യാപിച്ചു.", "tag": "MSP"},
        ],
    }

    fallback = tag_map.get(language, tag_map["english"])
    return [
        {**card, "source": "Uzhavan Advisory", "date": "Today", "voice_available": True,
         "image_url": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&auto=format&fit=crop&q=60"}
        for card in fallback
    ]


def invalidate_cache(state: str, language: str):
    key = f"{state}_{language}"
    _NEWS_CACHE.pop(key, None)
