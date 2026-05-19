"""Crop Map.png into 3 separate floor images — v2 refined coordinates."""
from PIL import Image
import numpy as np

img = Image.open('frontend/public/office/Map.png')
w, h = img.size
print(f"Original size: {w}x{h}")

# Convert to numpy to find content boundaries better
arr = np.array(img)

# Based on visual analysis - the map has 3 distinct sections separated by dark borders
# Let me scan for vertical dividers
# The sections are visually separated in the original map

# Refined crop regions based on visual inspection:
# Floor 1 (Activity): left area including sakura trees and all rooms
floor1 = img.crop((0, 0, 580, h))

# Floor 2 (Private): middle area with bedrooms  
floor2 = img.crop((580, 0, 1060, h))

# Rooftop: rightmost narrow strip
rooftop = img.crop((1060, 0, w, h))

# Now trim dark borders from each
def auto_trim(pil_img, threshold=30):
    """Remove near-black borders."""
    arr = np.array(pil_img)
    # Check if pixels are not near-black
    mask = arr[:, :, :3].max(axis=2) > threshold
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    return pil_img.crop((cmin, rmin, cmax + 1, rmax + 1))

floor1 = auto_trim(floor1)
floor2 = auto_trim(floor2) 
rooftop = auto_trim(rooftop)

floor1.save('frontend/public/office/floor1.png')
floor2.save('frontend/public/office/floor2.png')
rooftop.save('frontend/public/office/rooftop.png')

print(f"Floor 1: {floor1.size}")
print(f"Floor 2: {floor2.size}")
print(f"Rooftop: {rooftop.size}")
print("Done!")
