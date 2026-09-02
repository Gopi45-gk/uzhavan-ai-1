"""
Uzhavan AI — Kokoro TTS Integration Engine
Provides local open-source Kokoro Text-to-Speech with graceful fallback to gTTS.
"""

import io
import re
import os
import sys
from typing import Optional

# Global Kokoro Pipeline Singleton
_KOKORO_PIPELINE = None
_KOKORO_FAILED = False

def clean_text_for_speech(text: str) -> str:
    if not text:
        return ""
    cleaned = text
    # Remove JSON structures
    cleaned = re.sub(r'\{[\s\S]*?\}', '', cleaned)
    cleaned = re.sub(r'\[[\s\S]*?\]', '', cleaned)
    # Remove URLs
    cleaned = re.sub(r'https?://\S+', '', cleaned)
    # Remove Markdown formatting
    cleaned = re.sub(r'[*_~`#>-]', ' ', cleaned)
    cleaned = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', cleaned)
    # Remove technical IDs & keys
    cleaned = re.sub(r'\b[0-9a-fA-F]{12,}\b', '', cleaned)
    cleaned = re.sub(r'api_key|uid|token|error|stack|trace|http|www', '', cleaned, flags=re.IGNORECASE)
    # Clean whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def get_kokoro_voice(lang: str) -> str:
    lang = lang.lower().strip()
    # Map languages to best available Kokoro voices
    if lang in ["en", "english", "en-in"]:
        return "af_heart"
    elif lang in ["hi", "hindi", "hi-in"]:
        return "hf_alpha"
    elif lang in ["ta", "tamil", "ta-in"]:
        return "af_bella"
    elif lang in ["te", "telugu", "te-in"]:
        return "af_nicole"
    elif lang in ["kn", "kannada", "kn-in"]:
        return "am_adam"
    elif lang in ["ml", "malayalam", "ml-in"]:
        return "af_sky"
    return "af_heart"

def init_kokoro():
    global _KOKORO_PIPELINE, _KOKORO_FAILED
    if _KOKORO_PIPELINE is not None or _KOKORO_FAILED:
        return _KOKORO_PIPELINE

    try:
        # Check for kokoro or kokoro_onnx library
        try:
            from kokoro_onnx import Kokoro
            # Look for model files in local model path if present
            model_path = os.environ.get("KOKORO_MODEL_PATH", "kokoro-v0_19.onnx")
            voices_path = os.environ.get("KOKORO_VOICES_PATH", "voices.json")
            if os.path.exists(model_path) and os.path.exists(voices_path):
                _KOKORO_PIPELINE = Kokoro(model_path, voices_path)
                print("✅ [Kokoro TTS Engine] Loaded kokoro-onnx model successfully")
                return _KOKORO_PIPELINE
        except ImportError:
            pass

        try:
            from kokoro import KPipeline
            # Initialize PyTorch Kokoro pipeline
            _KOKORO_PIPELINE = KPipeline(lang_code='a')
            print("✅ [Kokoro TTS Engine] Loaded PyTorch Kokoro pipeline successfully")
            return _KOKORO_PIPELINE
        except Exception as e:
            print(f"ℹ️ [Kokoro TTS Engine] Kokoro native initialization notice: {e}")

    except Exception as e:
        print(f"⚠️ [Kokoro TTS Engine] Kokoro init notice: {e}")
        _KOKORO_FAILED = True

    return None

def generate_kokoro_speech(text: str, lang: str = "ta") -> Optional[bytes]:
    cleaned = clean_text_for_speech(text)
    if not cleaned:
        return None

    pipeline = init_kokoro()
    if pipeline is not None:
        try:
            voice = get_kokoro_voice(lang)
            # Try Kokoro ONNX inference
            if hasattr(pipeline, "create"):
                samples, sample_rate = pipeline.create(cleaned, voice=voice, speed=1.0, lang=lang)
                import soundfile as sf
                fp = io.BytesIO()
                sf.write(fp, samples, sample_rate, format='WAV')
                fp.seek(0)
                return fp.read()
            # Try Kokoro PyTorch pipeline inference
            elif hasattr(pipeline, "__call__"):
                generator = pipeline(cleaned, voice=voice, speed=0.95)
                import soundfile as sf
                fp = io.BytesIO()
                all_samples = []
                sample_rate = 24000
                for _, _, audio in generator:
                    all_samples.append(audio)
                if all_samples:
                    import numpy as np
                    full_audio = np.concatenate(all_samples)
                    sf.write(fp, full_audio, sample_rate, format='WAV')
                    fp.seek(0)
                    return fp.read()
        except Exception as err:
            print(f"⚠️ [Kokoro TTS Engine] Speech generation fallback to gTTS notice: {err}")

    # Seamless Fallback to gTTS for 100% Reliability
    try:
        from gtts import gTTS
        gtts_lang = lang.split('-')[0].lower()
        if gtts_lang not in ['ta', 'te', 'ml', 'kn', 'hi', 'en']:
            gtts_lang = 'ta'
        tts = gTTS(text=cleaned[:500], lang=gtts_lang, slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return fp.read()
    except Exception as e:
        print(f"❌ [TTS Fallback Engine] gTTS error: {e}")
        return None
