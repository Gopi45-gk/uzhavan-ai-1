import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Volume2, Mic, Paperclip, X, Image as ImageIcon, Clock, Trash2 } from 'lucide-react';
import { getFarmerChatResponse } from '../services/geminiService';
import { ChatMessage } from '../types';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

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
    setMessages([{
      id: '1',
      sender: 'ai',
      text: t('askAnything') + '!'
    }]);
  }, [language]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Backend gTTS proxy – unlimited, free, all 6 languages
  const GTTS_LANG: Record<string, string> = {
    tamil: 'ta', english: 'en', hindi: 'hi', telugu: 'te', kannada: 'kn', malayalam: 'ml',
  };

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const playAudioResponse = (text: string) => {
    if (!text?.trim()) return;
    // Stop any current playback
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }

    const gttsLang = GTTS_LANG[language] || language.split('-')[0] || 'ta';
    const url = `${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(text.substring(0, 500))}&lang=${gttsLang}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Audio fetch failed');
        return res.blob();
      })
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);
        audio.volume = 1.0;
        ttsAudioRef.current = audio;

        audio.onended = () => {
          ttsAudioRef.current = null;
          URL.revokeObjectURL(objectUrl);
        };
        audio.onerror = () => {
          console.warn('[TTS] Playback failed');
          ttsAudioRef.current = null;
          URL.revokeObjectURL(objectUrl);
        };
        audio.play().catch(e => {
          console.warn('[TTS] Play error:', e);
          URL.revokeObjectURL(objectUrl);
        });
      })
      .catch(err => {
        console.warn('[TTS] Fetch failed:', err);
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
      const responseText = await getFarmerChatResponse(
        currentText || t('analyzeImage') || "Analyze this image",
        language,
        currentImage?.split(',')[1]
      );

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), sender: 'ai', text: responseText };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
      playAudioResponse(responseText);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: t('chatError') || 'Sorry, please try again.'
      }]);
      setIsTyping(false);
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'tamil' ? 'ta-IN' : language === 'hindi' ? 'hi-IN' : language === 'telugu' ? 'te-IN' : language === 'kannada' ? 'kn-IN' : language === 'malayalam' ? 'ml-IN' : 'en-IN';
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
    <div className="flex flex-col h-screen bg-[#f1f8f3] overflow-hidden font-['Inter']">
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
          <h2 className="text-xl font-[1000] italic uppercase tracking-tight leading-none">{t('home_ai')}</h2>
          <span className="text-[10px] font-black text-green-300 uppercase tracking-widest mt-1">{t('onlineExpert')}</span>
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
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
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
                    <p className="text-sm font-semibold text-gray-800" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.text}</p>
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
              <div className="leading-relaxed whitespace-pre-line text-sm font-normal">
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
            <span className="text-xs font-black italic text-emerald-600 uppercase tracking-tighter">{t('thinking')}</span>
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
            <span className="text-[10px] font-black uppercase text-emerald-700 italic">{t('readyToAnalyze')}</span>
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
              className="flex-1 bg-transparent focus:outline-none font-bold italic text-emerald-950 text-sm py-2"
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
