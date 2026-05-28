import torch
import soundfile as sf
import os
from qwen_tts import Qwen3TTSModel
from main import EMOSI_INSTRUKSI

def test_tts():
    print("Memuat model Qwen3-TTS-12Hz-1.7B-VoiceDesign... (Ini mungkin memakan waktu jika model sedang didownload)")
    device_tts = "cuda" if torch.cuda.is_available() else "cpu"
    try:
        model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
            device_map=device_tts,
            torch_dtype=torch.bfloat16,
            attn_implementation="sdpa",
        )
    except Exception as e:
        print(f"Gagal pakai SDPA, mencoba fallback: {e}")
        model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
            device_map=device_tts,
            torch_dtype=torch.bfloat16,
        )
    
    text = "Selamat Pagi Sayang..."
    emotion = "Joy"
    instruct = EMOSI_INSTRUKSI.get(emotion)
    
    print(f"Mulai generate suara: '{text}'")
    print(f"Instruksi emosi ({emotion}): {instruct}")
    
    wavs, sample_rate = model.generate_voice_design(
        text=text,
        instruct=instruct,
        language="Auto",
    )
    
    out_path = "test_selamat_pagi.wav"
    sf.write(out_path, wavs[0], sample_rate, format='WAV')
    print(f"Sukses! Audio telah disimpan di: {os.path.abspath(out_path)}")

if __name__ == "__main__":
    test_tts()
