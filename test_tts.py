import sys
import os
import torch
import soundfile as sf
import time
import transformers

# Mute transformers warnings to avoid console spam slowing down generation
transformers.logging.set_verbosity_error()
import warnings
warnings.filterwarnings("ignore")

print("[SISTEM] Adding Qwen3-TTS to sys.path...")
sys.path.append(os.path.join(os.path.dirname(__file__), "Qwen3-TTS"))
import os
import torch
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel

os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'

# --- Device & dtype setup ---
if torch.cuda.is_available():
    device = "cuda"
    dtype = torch.bfloat16  # RTX 5050 supports fp16 natively
    print(f"[SISTEM] GPU terdeteksi: {torch.cuda.get_device_name(0)}")
    print(f"[SISTEM] VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    print(f"[SISTEM] Mode: GPU (bfloat16)")
else:
    device = "cpu"
    dtype = torch.float32
    print("[SISTEM] GPU tidak terdeteksi, menggunakan CPU (float32)")

print(f"[SISTEM] Memuat Qwen3-TTS model ke {device}...")
start_load = time.time()

QWEN_TTS_MODEL = Qwen3TTSModel.from_pretrained(
    'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
    torch_dtype=dtype,
    device_map=device,  # "cuda" = full GPU, atau "auto" untuk hybrid GPU+CPU
    attn_implementation="sdpa"
)

load_time = time.time() - start_load
print(f"[SISTEM] Model dimuat dalam {load_time:.1f} detik")

if device == "cuda":
    vram_used = torch.cuda.memory_allocated() / 1024**3
    print(f"[SISTEM] VRAM terpakai: {vram_used:.2f} GB")

print("[TTS] Menghasilkan suara Bocchi...")
start_gen = time.time()

with torch.inference_mode():
    wavs, sample_rate = QWEN_TTS_MODEL.generate_voice_clone(
        text='Halo! Ini adalah suara hasil generate dari Qwen3-TTS setelah diperbaiki. Semoga harimu menyenangkan!',
        ref_audio="bocchi_referensi.wav",
        x_vector_only_mode=True,
        language="Auto",
    )

gen_time = time.time() - start_gen
print(f"[TTS] Generate selesai dalam {gen_time:.1f} detik")

sf.write('sample_audio.wav', wavs[0], sample_rate, format='WAV')
audio_duration = len(wavs[0]) / sample_rate
print(f"[TTS] Audio saved to sample_audio.wav ({audio_duration:.1f} detik)")
print(f"[TTS] RTF (Real-Time Factor): {gen_time/audio_duration:.2f}x")
