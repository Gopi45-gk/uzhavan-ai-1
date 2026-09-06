import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Volume2, Mic, Paperclip, X, Image as ImageIcon, Clock, Trash2 } from 'lucide-react';
import { getFarmerChatResponse } from '../services/geminiService';
import { speakText, stopSpeech, isSpeaking, sanitizeTextForSpeech } from '../services/ttsService';
import { ChatMessage } from '../types';
import { getGlobalWebLlmEngine, getLanguageConfig } from './PhoneCall';
import { getLocalizedGreeting, getStrictSystemPrompt, resolveIntelligentQueryRoute } from '../services/promptConfig';
import { getStoredFarmerProfile } from '../services/farmerContextService';
import { getOfflineAgriculturalResponse, analyzePlantDiseaseOffline } from '../services/offlineIntelligenceService';
import { getApiBaseUrl } from '../services/api';

export { resolveIntelligentQueryRoute };

export const CHAT_WEBLLM_SYSTEM_PROMPT = `You are Uzhavan AI, an expert agricultural assistant.
STRICT RESPONSE BOUNDARIES (MANDATORY):
1. ZERO FLUFF & STRICT PRECISION: Answer the farmer's question directly in exactly 1 or 2 short, precise sentences. No long paragraphs, no bullet points, no markdown headers, and no conversational fillers.
2. EXACT INTENT MATCH: If the user asks a specific question (e.g., quantity, water amount, price, fertilizer dosage), answer ONLY that exact fact or number requested. Do NOT give unasked general advice or tips.
3. NO OVER-ANSWERING: Never list multiple options or ramble when a single definitive answer is expected.
4. ACTIVE LANGUAGE: Always answer strictly in the requested language.`;

const HISTORY_KEY = 'uzhavan_chat_search_history';

interface SearchHistoryItem {
  text: string;
  timestamp: string;
}

interface Props {
  onBack: () => void;
  language: string;
  t: (key: string) => string;
}

const Chat: React.FC<Props> = ({ onBack, language, t }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState<string>(() => {
    return language ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('uzhavan_app_language') || localStorage.getItem('uzhavan_selected_language') : null) ||
      'tamil';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sync with language prop changes
  useEffect(() => {
    if (language) {
      setCurrentLanguage(language);
    }
  }, [language]);

  // Seamless State Propagation: Listen to language change events across the app
  useEffect(() => {
    const handleLangEvent = (e: any) => {
      const newLang = e?.detail || (typeof localStorage !== 'undefined' ? localStorage.getItem('uzhavan_app_language') || localStorage.getItem('uzhavan_selected_language') : null);
      if (newLang) {
        console.log('🌍 [Chatbot] Language switch detected:', newLang);
        setCurrentLanguage(newLang);
      }
    };
    window.addEventListener('uzhavan_language_changed', handleLangEvent);
    window.addEventListener('storage', handleLangEvent);
    return () => {
      window.removeEventListener('uzhavan_language_changed', handleLangEvent);
      window.removeEventListener('storage', handleLangEvent);
    };
  }, []);

  // Load search history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setSearchHistory(JSON.parse(saved));
    } catch { }
  }, []);

  // Save search history to localStorage
  const saveToHistory = (text: string) => {
    if (!text.trim()) return;
    const newItem: SearchHistoryItem = {
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };
    setSearchHistory(prev => {
      const filtered = prev.filter(h => h.text !== newItem.text);
      const updated = [newItem, ...filtered].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { }
      return updated;
    });
  };

  const clearHistory = () => {
    setSearchHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch { }
  };

  useEffect(() => {
    const profile = getStoredFarmerProfile();
    const userName = profile?.name || 'Farmer';
    setMessages([{
      id: '1',
      sender: 'ai',
      text: getLocalizedGreeting(userName, currentLanguage)
    }]);
  }, [currentLanguage]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const stopAllAudio = () => {
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.src = '';
      } catch {}
      ttsAudioRef.current = null;
    }
    stopSpeech();
  };

  const isAudioPlaying = () => {
    return Boolean(
      (ttsAudioRef.current && !ttsAudioRef.current.paused && !ttsAudioRef.current.ended) ||
      isSpeaking()
    );
  };

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  const speakBrowserFallback = (text: string) => {
    const cleanText = sanitizeTextForSpeech(text);
    speakText(cleanText || text, { language: currentLanguage || language });
  };

  // Uses the exact same studio call bot voice (/api/tts/speak Kokoro/Piper audio WAV) with browser fallback
  const playAudioResponse = (text: string) => {
    if (!text?.trim()) return;

    // Toggle behavior: If audio is currently playing, tap to stop
    if (isAudioPlaying()) {
      stopAllAudio();
      return;
    }

    const cleanText = sanitizeTextForSpeech(text);
    if (!cleanText) return;

    stopAllAudio();

    const activeLang = (currentLanguage || language || 'english').toLowerCase();
    const langCodeMap: Record<string, string> = {
      tamil: 'ta',
      ta: 'ta',
      english: 'en',
      en: 'en',
      hindi: 'hi',
      hi: 'hi',
      telugu: 'te',
      te: 'te',
      kannada: 'kn',
      kn: 'kn',
      malayalam: 'ml',
      ml: 'ml',
    };
    const langCode = langCodeMap[activeLang] || (activeLang === 'english' ? 'en' : 'ta');

    console.log(`🎙️ [Chatbot TTS] Playing response with call bot voice (lang=${langCode}, activeLanguage=${activeLang}):`, cleanText.substring(0, 50));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const apiUrl = getApiBaseUrl();
    fetch(`${apiUrl}/api/tts/speak?text=${encodeURIComponent(cleanText.substring(0, 800))}&lang=${langCode}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (res.ok && res.status === 200) {
          const blob = await res.blob();
          if (blob.size > 200) {
            console.log('🎙️ [Chatbot TTS] Studio-quality call bot voice received (' + blob.size + ' bytes)');
            if (ttsAudioRef.current) {
              try {
                ttsAudioRef.current.pause();
                ttsAudioRef.current.src = '';
              } catch {}
              ttsAudioRef.current = null;
            }

            const audioBlob = new Blob([blob], { type: 'audio/wav' });
            const objectUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(objectUrl);
            audio.volume = 1.0;
            ttsAudioRef.current = audio;

            audio.onended = () => {
              ttsAudioRef.current = null;
              try { URL.revokeObjectURL(objectUrl); } catch {}
            };

            audio.onerror = () => {
              console.warn('[Chatbot TTS] Audio playback error, falling back to browser voice');
              ttsAudioRef.current = null;
              try { URL.revokeObjectURL(objectUrl); } catch {}
              speakBrowserFallback(cleanText);
            };

            audio.play().catch((err) => {
              console.warn('[Chatbot TTS] Audio play caught error:', err, '-> browser fallback');
              ttsAudioRef.current = null;
              try { URL.revokeObjectURL(objectUrl); } catch {}
              speakBrowserFallback(cleanText);
            });
            return;
          }
        }
        speakBrowserFallback(cleanText);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.warn('[Chatbot TTS] Local voice endpoint error:', err?.message || err, '-> browser fallback');
        speakBrowserFallback(cleanText);
      });
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() && !selectedImage) return;

    const currentText = textToSend;
    const currentImage = selectedImage;

    // Save user question to history
    if (currentText.trim()) saveToHistory(currentText);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: currentText || (currentImage ? "[Image sent]" : ""),
      image: currentImage || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setSelectedImage(null);
    setIsTyping(true);
    setShowHistory(false);

    try {
      const activeLang = currentLanguage || language || (typeof localStorage !== 'undefined' ? localStorage.getItem('uzhavan_app_language') || localStorage.getItem('uzhavan_selected_language') : null) || 'tamil';
      let responseText = '';
      const cleanedQuery = (currentText || '').replace(/[*#_`]/g, '').trim();
      const profile = getStoredFarmerProfile();
      const profileDetails = {
        farmerName: profile?.name || 'Farmer',
        district: profile?.location || profile?.district || 'Tamil Nadu, India',
        registeredCrop: profile?.crop_type || 'Paddy',
        cropTamil: profile?.crop_type || 'நெல்',
        soilType: profile?.soil_type || 'Clay Loam',
        soilTamil: profile?.soil_type || 'வண்டல் மண்',
        landArea: profile?.land_area || '',
        farmingType: profile?.farming_type || ''
      };

      // ── FAST PATH: IMMEDIATE OFFLINE RESOLUTION (0ms latency, zero timeout) ──
      if (!navigator.onLine) {
        console.log('[Chatbot] Offline mode detected — resolving instantly via offline intelligence in language:', activeLang);
        if (currentImage) {
          responseText = await analyzePlantDiseaseOffline(currentImage, profileDetails.registeredCrop || 'general', activeLang);
        } else {
          responseText = getOfflineAgriculturalResponse(cleanedQuery || 'general', profileDetails, activeLang);
        }
      }

      const langNames: Record<string, string> = {
        tamil: 'Tamil (தமிழ்)', ta: 'Tamil (தமிழ்)',
        english: 'English', en: 'English',
        hindi: 'Hindi (हिंदी)', hi: 'Hindi (हिंदी)',
        telugu: 'Telugu (తెలుగు)', te: 'Telugu (తెలుగు)',
        kannada: 'Kannada (ಕನ್ನಡ)', kn: 'Kannada (ಕನ್ನಡ)',
        malayalam: 'Malayalam (മലയാളം)', ml: 'Malayalam (മലയാളം)',
      };
      const targetLang = langNames[activeLang.toLowerCase()] || (activeLang.toLowerCase().startsWith('en') ? 'English' : 'Tamil (தமிழ்)');

      const farmerContext = [
        `You are UZHAVAN AI (உழவன் AI), an expert agricultural assistant helping an Indian farmer.`,
        `FARMER CONTEXT:`,
        `- Name: ${profileDetails.farmerName}`,
        `- Location: ${profileDetails.district}`,
        `- Crop: ${profileDetails.registeredCrop}`,
        `- Soil: ${profileDetails.soilType}`,
        `MANDATORY LANGUAGE:`,
        `You MUST respond STRICTLY and ONLY in ${targetLang}. All output text must be in ${targetLang}. Do NOT output in English or any other language unless ${targetLang} is English.`,
        `RULES:`,
        `1. Provide direct, practical, and accurate farming advice for the farmer's question.`,
        `2. NEVER output meta-commentary, thinking process, translation notes, or phrases like "We need to answer", "The user asks", "According to instructions".`,
        `3. NEVER mention AI, model, API, backend, system, Groq, Gemini, or NVIDIA.`,
        `4. Give clear, actionable advice (varieties, soil preparation, planting, irrigation, fertilizer dosage, or pest management).`,
        `5. Answer concisely in 1-2 clear, helpful sentences.`
      ].join('\n');

      const promptWithAnchor = `INSTRUCTION: Begin your response IMMEDIATELY with the answer strictly in ${targetLang}. Do NOT write English thinking, do NOT write "We need to", output ONLY the final reply in ${targetLang}:\n\n${cleanedQuery}`;

      // 1. If singleton WebLLM model is already active and no image was uploaded, query WebLLM directly with timeout race
      const webLlm = getGlobalWebLlmEngine();
      if (!responseText && webLlm && !currentImage && cleanedQuery) {
        try {
          try { await webLlm.resetChat(true); } catch {}
          console.log('[Chatbot WebLLM] Generating answer with strict boundaries in ' + targetLang);
          const webLlmPromise = webLlm.chat.completions.create({
            messages: [
              { role: 'system', content: farmerContext },
              { role: 'user', content: promptWithAnchor }
            ],
            temperature: 0.2,
            max_tokens: 300,
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('WebLLM timeout')), 4500)
          );
          const completion: any = await Promise.race([webLlmPromise, timeoutPromise]);
          const candidate = completion.choices?.[0]?.message?.content?.trim() || '';
          if (candidate && candidate.length > 3 && !candidate.toLowerCase().includes('thinking')) {
            responseText = candidate;
          }
        } catch (webLlmErr) {
          console.warn('[Chatbot WebLLM notice, falling back to backend/cloud]:', webLlmErr);
        }
      }

      // 2. Query backend chat API (/api/chat) with strict isolation
      if (!responseText && !currentImage && cleanedQuery) {
        try {
          const apiUrl = getApiBaseUrl();
          console.log('[Chatbot Backend LLM] Calling /api/chat in ' + targetLang);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          const langCfg = getLanguageConfig(activeLang);
          const res = await fetch(`${apiUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              language: langCfg.code || activeLang,
              farmer_context: farmerContext,
              messages: [
                { role: 'system', content: farmerContext },
                { role: 'user', content: promptWithAnchor }
              ],
              temperature: 0.3,
              max_tokens: 300,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            const candidate = data.choices?.[0]?.message?.content?.trim();
            if (candidate && !candidate.includes('fallback') && candidate.length > 2 && !/(?:we need to answer|the user asks|according to (?:the )?instructions)/i.test(candidate)) {
              responseText = candidate.replace(/[*#_`]/g, '').trim();
            }
          }
        } catch (backendErr) {
          console.warn('[Chatbot Backend /api/chat notice, falling back to geminiService]:', backendErr);
        }
      }

      // 3. Query cloud LLM pipeline (Gemini / NVIDIA NIM proxy)
      if (!responseText) {
        try {
          const res = await getFarmerChatResponse(
            cleanedQuery || t('analyzeImage') || "Analyze this image",
            activeLang,
            currentImage?.split(',')[1]
          );
          if (res && !res.includes('மன்னிக்கவும், இப்போது') && !res.includes("don't have reliable information")) {
            responseText = res;
          }
        } catch { /* proceed to offline fallback */ }
      }

      // 4. Guaranteed Zero-Dependency Offline Intelligence
      if (!responseText) {
        if (currentImage) {
          responseText = await analyzePlantDiseaseOffline(currentImage, profileDetails.registeredCrop || 'general', activeLang);
        } else {
          responseText = getOfflineAgriculturalResponse(cleanedQuery, profileDetails, activeLang);
        }
      }

      // 5. Strict boundary enforcement, multi-language meta-thinking stripping, and cleanup
      if (responseText) {
        const langLower = activeLang.toLowerCase();
        const isTa = langLower.startsWith('ta') || langLower === 'tamil';
        const isHi = langLower.startsWith('hi') || langLower === 'hindi';
        const isTe = langLower.startsWith('te') || langLower === 'telugu';
        const isKn = langLower.startsWith('kn') || langLower === 'kannada';
        const isMl = langLower.startsWith('ml') || langLower === 'malayalam';
        const isEn = langLower.startsWith('en') || langLower === 'english';

        if (/(?:we need to answer|the user asks|the user is asking|according to (?:the )?instructions|meaning\s*["']|thinking process|so answer:|in tamil:|so respond|let'?s craft)/i.test(responseText)) {
          if (isTa) {
            const blocks = responseText.match(/[\u0B80-\u0BFF][^\n"]*/g);
            if (blocks && blocks.length > 0) {
              const valid = blocks.map(b => b.trim()).filter(l => !l.includes('meaning') && !l.includes('answer:') && l.length > 5);
              responseText = valid.length > 1 ? valid[valid.length - 1] : (valid[0] || '');
            } else { responseText = ''; }
          } else if (isHi) {
            const blocks = responseText.match(/[\u0900-\u097F][^\n"]*/g);
            if (blocks && blocks.length > 0) {
              const valid = blocks.map(b => b.trim()).filter(l => !l.includes('meaning') && !l.includes('answer:') && l.length > 5);
              responseText = valid.length > 1 ? valid[valid.length - 1] : (valid[0] || '');
            } else { responseText = ''; }
          } else if (isTe) {
            const blocks = responseText.match(/[\u0C00-\u0C7F][^\n"]*/g);
            if (blocks && blocks.length > 0) {
              const valid = blocks.map(b => b.trim()).filter(l => !l.includes('meaning') && !l.includes('answer:') && l.length > 5);
              responseText = valid.length > 1 ? valid[valid.length - 1] : (valid[0] || '');
            } else { responseText = ''; }
          } else if (isKn) {
            const blocks = responseText.match(/[\u0C80-\u0CFF][^\n"]*/g);
            if (blocks && blocks.length > 0) {
              const valid = blocks.map(b => b.trim()).filter(l => !l.includes('meaning') && !l.includes('answer:') && l.length > 5);
              responseText = valid.length > 1 ? valid[valid.length - 1] : (valid[0] || '');
            } else { responseText = ''; }
          } else if (isMl) {
            const blocks = responseText.match(/[\u0D00-\u0D7F][^\n"]*/g);
            if (blocks && blocks.length > 0) {
              const valid = blocks.map(b => b.trim()).filter(l => !l.includes('meaning') && !l.includes('answer:') && l.length > 5);
              responseText = valid.length > 1 ? valid[valid.length - 1] : (valid[0] || '');
            } else { responseText = ''; }
          } else if (isEn) {
            const sub = responseText.split(/so answer:|so respond:|let'?s craft:/i).pop() || responseText;
            const lines = sub.split(/(?<=[.!?\n])\s+/).filter(l => !/(?:the user|we need to|instructions)/i.test(l));
            responseText = lines.slice(0, 2).join(' ').trim();
          }
        }

        // Language matching validation
        const needsFallback = !responseText ||
          (isTa && !/[\u0B80-\u0BFF]/.test(responseText)) ||
          (isHi && !/[\u0900-\u097F]/.test(responseText)) ||
          (isTe && !/[\u0C00-\u0C7F]/.test(responseText)) ||
          (isKn && !/[\u0C80-\u0CFF]/.test(responseText)) ||
          (isMl && !/[\u0D00-\u0D7F]/.test(responseText)) ||
          (isEn && !/[a-zA-Z]/.test(responseText));

        if (needsFallback) {
          responseText = getOfflineAgriculturalResponse(cleanedQuery, profileDetails, activeLang);
        }

        responseText = responseText.replace(/[*#_`]/g, '').trim();
        const sentences = responseText.split(/(?<=[.!?\n])\s+/).filter(Boolean);
        if (sentences.length > 2) {
          responseText = sentences.slice(0, 2).join(' ').trim();
        }
      }

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), sender: 'ai', text: responseText };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
      playAudioResponse(responseText);
    } catch (error) {
      console.error("Chat error, using offline intelligence fallback:", error);
      const safeProfile = getStoredFarmerProfile();
      const offlineReply = getOfflineAgriculturalResponse(cleanedQuery || 'general', {
        farmerName: safeProfile?.name || 'Farmer',
        district: safeProfile?.location || safeProfile?.district || 'Tamil Nadu',
        crop: safeProfile?.crop_type || 'Paddy',
        cropTamil: safeProfile?.crop_type || 'நெல்',
      }, activeLang);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: offlineReply
      }]);
      setIsTyping(false);
      playAudioResponse(offlineReply);
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition not supported in this browser.");
      return;
    }

    const activeLang = (currentLanguage || language || 'english').toLowerCase();
    const langMap: Record<string, string> = {
      tamil: 'ta-IN',
      ta: 'ta-IN',
      english: 'en-IN',
      en: 'en-IN',
      hindi: 'hi-IN',
      hi: 'hi-IN',
      telugu: 'te-IN',
      te: 'te-IN',
      kannada: 'kn-IN',
      kn: 'kn-IN',
      malayalam: 'ml-IN',
      ml: 'ml-IN',
    };

    const recognition = new SpeechRecognition();
    recognition.lang = langMap[activeLang] || 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText(prev => prev + (prev ? " " : "") + transcript);
    };

    recognition.start();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const formatHistoryTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch { return ''; }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f1f8f3] overflow-hidden font-sans regional-font">
      {/* Header */}
      <div className="flex items-center p-5 bg-[#1b5e20] shadow-xl z-20 text-white border-b border-white/10">
        <button onClick={onBack} className="mr-4 active:scale-90 transition-transform">
          <ArrowLeft size={28} strokeWidth={3} />
        </button>
        <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center mr-3 p-1 shadow-inner overflow-hidden border-2 border-green-300">
          <img
            src="https://i.ibb.co/60f9sTw2/uzhavan-logo.png"
            alt="AI Avatar"
            className="w-[90%] h-[90%] object-contain"
          />
        </div>
        <div className="flex flex-col flex-1">
          <h2 className="text-xl font-[1000] italic uppercase tracking-tight leading-none regional-font">{t('home_ai')}</h2>
          <span className="text-[10px] font-black text-green-300 uppercase tracking-widest mt-1 regional-font">{t('onlineExpert')}</span>
        </div>

        {/* History Button */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl active:scale-90 transition-all"
          style={{ background: showHistory ? 'rgba(255,255,255,0.2)' : 'transparent' }}
        >
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center border border-white/30">
            <Clock size={18} />
          </div>
          <span className="text-[8px] font-black uppercase tracking-wider">History</span>
        </button>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute top-[76px] right-0 left-0 bottom-0 z-30 bg-white/95 backdrop-blur-sm overflow-y-auto" style={{ animation: 'fadeIn 0.2s ease' }}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 regional-font">
                <Clock size={18} className="text-green-600" />
                {t('searchHistory') || 'Search History'}
              </h3>
              <div className="flex gap-2">
                {searchHistory.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 font-semibold flex items-center gap-1"
                  >
                    <Trash2 size={12} /> {t('clear') || 'Clear'}
                  </button>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1.5 rounded-lg bg-gray-100"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </div>
            </div>

            {searchHistory.length === 0 ? (
              <div className="text-center py-12">
                <Clock size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">{t('noSearchHistory') || 'No search history yet'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchHistory.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputText(item.text);
                      setShowHistory(false);
                      handleSend(item.text);
                    }}
                    className="w-full text-left p-3 rounded-xl bg-green-50/70 hover:bg-green-100 border border-green-100 transition-colors"
                  >
                    <p
                      className="text-sm font-semibold text-gray-800 regional-font"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontFamily: "'Noto Sans Tamil', 'Noto Sans Tamil UI', 'Tamil Sangam MN', 'Tamil MN', 'Nirmala UI', 'Latha', 'Lohit Tamil', 'Inter', Arial, sans-serif"
                      }}
                    >
                      {item.text}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">{formatHistoryTime(item.timestamp)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gradient-to-b from-[#f1f8f3] to-white no-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[88%] p-5 rounded-[28px] shadow-sm text-sm font-medium relative ${msg.sender === 'user'
              ? 'bg-[#21a650] text-white rounded-tr-none border-b-4 border-[#15803d]'
              : 'bg-white text-gray-900 rounded-tl-none border border-emerald-100 shadow-md'
              }`}>
              {msg.image && (
                <div className="mb-3 rounded-2xl overflow-hidden border-2 border-white/20 shadow-md">
                  <img src={msg.image} alt="User upload" className="w-full max-h-60 object-cover" />
                </div>
              )}
              <div
                className="leading-relaxed whitespace-pre-line text-sm font-normal chat-bubble-text regional-font"
                style={{
                  fontFamily: "'Noto Sans Tamil', 'Noto Sans Tamil UI', 'Tamil Sangam MN', 'Tamil MN', 'Nirmala UI', 'Latha', 'Lohit Tamil', 'Inter', Arial, sans-serif",
                  textRendering: 'optimizeLegibility'
                }}
              >
                {msg.text.replace(/\*\*/g, '').replace(/\*/g, '')}
              </div>
              {msg.sender === 'ai' && (
                <button
                  onClick={() => playAudioResponse(msg.text)}
                  className="absolute -bottom-2 -right-2 bg-white p-2 rounded-full shadow-md text-emerald-600 border border-emerald-50 active:scale-90 transition-all"
                >
                  <Volume2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2 px-2">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            <span className="text-xs font-black italic text-emerald-600 uppercase tracking-tighter regional-font">{t('thinking')}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-emerald-50 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] flex flex-col gap-3 relative z-30">
        {selectedImage && (
          <div className="flex items-center gap-3 bg-emerald-50 p-2 rounded-2xl border border-emerald-100">
            <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white">
              <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
            </div>
            <span className="text-[10px] font-black uppercase text-emerald-700 italic regional-font">{t('readyToAnalyze')}</span>
            <button
              onClick={() => setSelectedImage(null)}
              className="ml-auto bg-white p-1.5 rounded-full shadow-sm text-red-500 active:scale-90"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#f1f8f3] rounded-[28px] px-2 py-1.5 border-2 border-emerald-100 shadow-inner flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`p-2.5 rounded-full transition-all ${selectedImage ? 'bg-emerald-500 text-white' : 'text-emerald-600 hover:bg-white'}`}
            >
              <Paperclip size={22} />
            </button>

            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('askAnything')}
              className="flex-1 bg-transparent focus:outline-none font-bold italic text-emerald-950 text-sm py-2 regional-font"
              style={{
                fontFamily: "'Noto Sans Tamil', 'Noto Sans Tamil UI', 'Tamil Sangam MN', 'Tamil MN', 'Nirmala UI', 'Latha', 'Lohit Tamil', 'Inter', Arial, sans-serif",
                textRendering: 'optimizeLegibility'
              }}
            />

            <button
              onClick={startListening}
              className={`p-2.5 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-emerald-600 hover:bg-white'}`}
            >
              <Mic size={22} />
            </button>
          </div>

          <button
            onClick={() => handleSend()}
            className="bg-[#1b5e20] p-4 rounded-full text-white shadow-[0_8px_20px_rgba(27,94,32,0.2)] active:scale-90 active:translate-y-1 transition-all border-b-4 border-[#0e3311]"
          >
            <Send size={24} strokeWidth={3} />
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default Chat;
