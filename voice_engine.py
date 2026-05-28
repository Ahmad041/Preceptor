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

def generate_voice_bocchi(text: str, emotion: str = "Neutral") -> bytes:
    """Generate audio WAV bytes dari teks menggunakan Qwen3-TTS."""
    from main import QWEN_TTS_MODEL  # Import dynamically to share instance
    
    if not QWEN_TTS_MODEL or QWEN_TTS_MODEL == "fallback":
        print("[TTS] Qwen3-TTS tidak tersedia, menggunakan fallback (no audio)")
        return b""
        
    # Pilih file referensi berdasarkan emosi, fallback ke default jika tidak ada
    emotion_file = f"bocchi_{emotion.lower()}.wav"
    if os.path.exists(emotion_file):
        ref_audio = emotion_file
    elif os.path.exists(REFERENSI_SUARA):
        ref_audio = REFERENSI_SUARA
    else:
        ref_audio = None
        
    if not ref_audio:
        print(f"[WARNING] File referensi suara tidak ditemukan untuk emosi {emotion} atau default!")
        
    try:
        from main import sanitize_for_tts
        clean_text = sanitize_for_tts(text)
        print(f"[TTS] Menghasilkan suara Voice Clone: '{clean_text}' dengan emosi {emotion} (File: {ref_audio})")
        wavs, sample_rate = QWEN_TTS_MODEL.generate_voice_clone(
            text=clean_text,
            ref_audio=ref_audio,
            x_vector_only_mode=True,
            language="Auto",
        )
        
        # Save to buffer
        buffer = BytesIO()
        sf.write(buffer, wavs[0], sample_rate, format='WAV')
        return buffer.getvalue()
    except Exception as e:
        print(f"[WARNING] Gagal generate TTS: {e}")
        return b""
