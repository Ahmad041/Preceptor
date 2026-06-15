import sys, os, torch

sys.path.append('Qwen3-TTS')
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel

def check_nan():
    print("[1] Loading model...")
    model = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-0.6B-Base', torch_dtype=torch.float16, device_map='cpu')
    print("[2] Model loaded. Checking weights...")
    has_nan = False
    for name, param in model.model.named_parameters():
        if torch.isnan(param).any():
            print(f"NaN found in {name}!")
            has_nan = True
        if torch.isinf(param).any():
            print(f"Inf found in {name}!")
            has_nan = True
    if not has_nan:
        print("[3] All parameters are finite and NaN-free.")

if __name__ == "__main__":
    check_nan()
