import os
import torch
import soundfile as sf
import warnings
warnings.filterwarnings("ignore")

# Add paths if needed or directly import from qwen_tts
try:
    from qwen_tts import Qwen3TTSModel
    
    print("Loading Qwen3-TTS...")
    model = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        device_map="cuda",
        torch_dtype=torch.bfloat16,
        attn_implementation="sdpa"
    )
    
    print("Model loaded successfully. Synthesizing test audio...")
    text = "Halo, ini adalah pengujian suara dari sistem Qwen 3 TTS."
    
    # Check if bocchi_referensi.wav exists
    ref_audio = "bocchi_referensi.wav" if os.path.exists("bocchi_referensi.wav") else None
    
    wavs, sample_rate = model.generate_voice_clone(
        text=text,
        ref_audio=ref_audio,
        x_vector_only_mode=True,
        language="Auto"
    )
    
    sf.write("test_qwen_output.wav", wavs[0], sample_rate)
    print("SUCCESS: test_qwen_output.wav created successfully!")
    
except Exception as e:
    print(f"FAILED: {e}")
