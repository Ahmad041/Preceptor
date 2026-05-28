import os
import base64
from PIL import Image, ImageDraw
from dotenv import load_dotenv

# Load env variables
load_dotenv()

from vision_loop import vision_engine

print("Running vision fallback test...")

# Create a temporary dummy image
img = Image.new('RGB', (400, 300), color = (73, 109, 137))
d = ImageDraw.Draw(img)
d.text((10,10), "Hello World", fill=(255,255,0))
temp_path = "scratch/temp_dummy.png"
os.makedirs("scratch", exist_ok=True)
img.save(temp_path)

with open(temp_path, "rb") as f:
    b64_image = base64.b64encode(f.read()).decode()

# Force provider to gemini or auto to test fallback
print("Testing with provider = auto...")
vision_engine.set_provider("auto")
analysis, provider = vision_engine._analyze_vision(b64_image, temp_path)

print(f"Analysis result from provider '{provider}':")
print(analysis)

# Clean up
if os.path.exists(temp_path):
    os.remove(temp_path)
