/**
 * Uzhavan AI — Free Human-Like Speech Engine
 * Uses Browser Web Speech API (window.speechSynthesis)
 * Supports Tamil, Telugu, Malayalam, Kannada, Hindi, and English (India).
 */

export const LANG_CODE_MAP: Record<string, string> = {
  tamil: 'ta-IN',
  ta: 'ta-IN',
  'ta-in': 'ta-IN',
  telugu: 'te-IN',
  te: 'te-IN',
  'te-in': 'te-IN',
  malayalam: 'ml-IN',
  ml: 'ml-IN',
  'ml-in': 'ml-IN',
  kannada: 'kn-IN',
  kn: 'kn-IN',
  'kn-in': 'kn-IN',
  hindi: 'hi-IN',
  hi: 'hi-IN',
  'hi-in': 'hi-IN',
  english: 'en-IN',
  en: 'en-IN',
  'en-in': 'en-IN',
};

let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  cachedVoices = window.speechSynthesis.getVoices();
  return cachedVoices;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
  };
}

/**
 * Sanitizes technical, JSON, markdown, or API artifacts from text prior to speech.
 */
export function sanitizeTextForSpeech(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // Remove JSON objects/arrays
  cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '');
  cleaned = cleaned.replace(/\[[\s\S]*?\]/g, '');

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '');

  // Remove Markdown symbols (*, #, `, _, ~)
  cleaned = cleaned.replace(/[*_~`#>-]/g, ' ');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove Technical keywords and IDs
  cleaned = cleaned.replace(/\b[0-9a-fA-F]{12,}\b/g, '');
  cleaned = cleaned.replace(/api_key|uid|token|error|stack|trace|http|www/gi, '');

  // Clean extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Splits text into natural, sentence-length segments for smooth, natural speech flow.
 */
export function splitTextIntoSentences(text: string): string[] {
  const cleaned = sanitizeTextForSpeech(text);
  if (!cleaned) return [];

  // Split on sentence boundaries (. ! ? or newline)
  const rawSegments = cleaned.split(/(?<=[.!?|\n])\s+/);

  const sentences: string[] = [];
  for (const seg of rawSegments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    if (trimmed.length > 140) {
      // Split long sentences at commas or pauses
      const subParts = trimmed.split(/(?<=[,;:،])\s+/);
      for (const sub of subParts) {
        if (sub.trim()) sentences.push(sub.trim());
      }
    } else {
      sentences.push(trimmed);
    }
  }

  return sentences.length > 0 ? sentences : [cleaned];
}

/**
 * Finds the best available browser voice matching the requested language.
 */
export function getBestVoiceForLanguage(lang: string): SpeechSynthesisVoice | null {
  const voices = cachedVoices.length > 0 ? cachedVoices : loadVoices();
  if (!voices || voices.length === 0) return null;

  const targetLang = (LANG_CODE_MAP[lang.toLowerCase()] || lang || 'ta-IN').toLowerCase();
  const shortLang = targetLang.split('-')[0];

  // 1. Exact match (e.g. ta-IN)
  let voice = voices.find(v => v.lang.toLowerCase() === targetLang);
  if (voice) return voice;

  // 2. Same language prefix (e.g. ta)
  voice = voices.find(v => v.lang.toLowerCase().startsWith(shortLang));
  if (voice) return voice;

  // 3. Indian English fallback if regional accent unavailable
  if (shortLang !== 'en') {
    voice = voices.find(v => v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().includes('india'));
    if (voice) return voice;
  }

  // 4. Browser default voice as final fallback
  return voices.find(v => v.default) || voices[0] || null;
}

let isSpeakingActive = false;

/**
 * Immediately stops any ongoing speech.
 */
export function stopSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {}
  isSpeakingActive = false;
}

/**
 * Checks if speech synthesis is active.
 */
export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return window.speechSynthesis.speaking || isSpeakingActive;
}

export interface SpeakOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

/**
 * Speaks text using the best free browser voice for the selected language.
 */
export function speakText(text: string, options: SpeakOptions = {}): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (options.onEnd) options.onEnd();
    return;
  }

  // Stop any active speech before starting new speech
  stopSpeech();

  const sentences = splitTextIntoSentences(text);
  if (sentences.length === 0) {
    if (options.onEnd) options.onEnd();
    return;
  }

  const lang = options.language || 'tamil';
  const targetLangCode = LANG_CODE_MAP[lang.toLowerCase()] || 'ta-IN';
  const voice = getBestVoiceForLanguage(lang);

  isSpeakingActive = true;
  if (options.onStart) options.onStart();

  let index = 0;

  const speakNextSegment = () => {
    if (!isSpeakingActive || index >= sentences.length) {
      isSpeakingActive = false;
      if (options.onEnd) options.onEnd();
      return;
    }

    const currentText = sentences[index];
    const utterance = new SpeechSynthesisUtterance(currentText);
    utterance.lang = targetLangCode;
    utterance.rate = options.rate ?? 0.92; // Slightly slower, natural farmer tempo
    utterance.pitch = options.pitch ?? 1.0;
    utterance.volume = options.volume ?? 1.0;

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      index++;
      // Short 120ms natural pause between sentences
      setTimeout(() => {
        if (isSpeakingActive) {
          speakNextSegment();
        }
      }, 120);
    };

    utterance.onerror = (e) => {
      console.warn('[TTS Engine] Sentence playback warning:', e);
      index++;
      if (index < sentences.length && isSpeakingActive) {
        speakNextSegment();
      } else {
        isSpeakingActive = false;
        if (options.onEnd) options.onEnd();
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[TTS Engine] Speak error:', err);
      isSpeakingActive = false;
      if (options.onEnd) options.onEnd();
    }
  };

  speakNextSegment();
}
