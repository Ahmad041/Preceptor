import os
import torch
import soundfile as sf
import base64
from io import BytesIO
from faster_whisper import WhisperModel

# Global model references
WHISPER_MODEL = None
QWEN_TTS_MODEL = None
REFERENSI_SUARA = "bocchi_referensi.wav"

def get_whisper_model():
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        print("[SISTEM] Inisialisasi Faster-Whisper (base)...")
        # Run on CPU with int8 quantization for speed and low RAM usage
        device = "cpu"
        WHISPER_MODEL = WhisperModel("base", device=device, compute_type="int8")
        print("[SISTEM] [OK] Faster-Whisper siap!")
    return WHISPER_MODEL

def transcribe_audio_bytes(audio_bytes: bytes) -> str:
    """Mentranskripsikan audio bytes (wav/webm/mp3) menjadi teks menggunakan Faster-Whisper."""
    model = get_whisper_model()
    
    # Save temporary file
    temp_path = "temp_transcribe.wav"
    with open(temp_path, "wb") as f:
        f.write(audio_bytes)
        
    try:
        segments, info = model.transcribe(temp_path, beam_size=5)
        text = "".join([seg.text for seg in segments]).strip()
        print(f"[STT] Transkripsi ({info.language}): {text}")
        return text
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# Emotion-to-reference-audio mapping
# Setiap emosi dipetakan ke file .wav referensi yang memiliki intonasi sesuai.
# Jika file tidak ada, fallback ke REFERENSI_SUARA default.
EMOTION_MAP = {
    "neutral": "bocchi_referensi.wav",
    "happy": "bocchi_happy.wav",
    "sad": "bocchi_sad.wav",
    "angry": "bocchi_angry.wav",
    "excited": "bocchi_happy.wav",   # fallback ke happy
    "calm": "bocchi_referensi.wav",  # fallback ke neutral
    "serious": "bocchi_angry.wav",   # fallback ke angry (tegas)
    "shy": "bocchi_referensi.wav",   # fallback ke neutral (pemalu = netral lembut)
}

def _resolve_emotion_audio(emotion: str) -> str:
    """Resolve emotion string ke path file audio referensi yang tersedia."""
    emotion_key = emotion.lower().strip()
    
    # Coba file dari EMOTION_MAP
    candidate = EMOTION_MAP.get(emotion_key)
    if candidate and os.path.exists(candidate):
        return candidate
    
    # Coba file konvensi bocchi_{emotion}.wav
    direct_file = f"bocchi_{emotion_key}.wav"
    if os.path.exists(direct_file):
        return direct_file
    
    # Fallback ke file referensi default
    if os.path.exists(REFERENSI_SUARA):
        print(f"[TTS] File emosi '{emotion_key}' tidak ditemukan, menggunakan referensi default: {REFERENSI_SUARA}")
        return REFERENSI_SUARA
    
    print(f"[WARNING] Tidak ada file referensi suara yang ditemukan (emosi: {emotion_key})!")
    return None


def generate_voice_bocchi(text: str, emotion: str = "Neutral") -> bytes:
    """Generate audio WAV bytes dari teks menggunakan Qwen3-TTS dengan dukungan emosi."""
    import time
    from main import QWEN_TTS_MODEL  # Import dynamically to share instance
    
    start_time = time.time()
    
    if not QWEN_TTS_MODEL or QWEN_TTS_MODEL == "fallback":
        print("[TTS] Qwen3-TTS tidak tersedia, menggunakan fallback (no audio)")
        return b""
        
    # Resolve file referensi berdasarkan emosi
    ref_audio = _resolve_emotion_audio(emotion)
    
    if not ref_audio:
        print(f"[WARNING] Tidak bisa generate TTS: tidak ada file referensi suara!")
        return b""
        
    try:
        from main import sanitize_for_tts
        clean_text = sanitize_for_tts(text)
        print(f"[TTS] Menghasilkan suara Voice Clone: '{clean_text[:80]}...' dengan emosi {emotion} (File: {ref_audio})")
        
        with torch.inference_mode():
            wavs, sample_rate = QWEN_TTS_MODEL.generate_voice_clone(
                text=clean_text,
                ref_audio=ref_audio,
                x_vector_only_mode=True,
                language="Auto",
            )
        
        # Save to buffer
        buffer = BytesIO()
        sf.write(buffer, wavs[0], sample_rate, format='WAV')
        
        elapsed = time.time() - start_time
        audio_duration = len(wavs[0]) / sample_rate
        print(f"[TTS] Selesai dalam {elapsed:.2f}s | Audio: {audio_duration:.1f}s | RTF: {elapsed/audio_duration:.2f}x")
        
        return buffer.getvalue()
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"[WARNING] Gagal generate TTS ({elapsed:.2f}s): {e}")
        return b""
