import os
import json
import glob
import re

anim_dir = "frontend/public/animations/FACE_LAYER"
output_file = "frontend/src/data/animation_curves.json"

result = {}

for anim_file in glob.glob(os.path.join(anim_dir, "*.anim")):
    anim_name = os.path.basename(anim_file).replace(".anim", "")
    result[anim_name] = {}
    
    with open(anim_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    current_attr = None
    current_curve = []
    current_keyframe = None
    in_float_curves = False
    
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        
        if line.startswith("  m_FloatCurves:"):
            in_float_curves = True
            i += 1
            continue
            
        if line.startswith("  m_PPtrCurves:") or line.startswith("  m_SampleRate:"):
            in_float_curves = False
            
        if in_float_curves:
            # start of a new keyframe
            if line.startswith("      - serializedVersion:"):
                if current_keyframe is not None:
                    current_curve.append(current_keyframe)
                current_keyframe = {}
                
            time_match = re.match(r"^\s+time:\s+([eE\d\.-]+)", line)
            if time_match and current_keyframe is not None:
                current_keyframe['time'] = float(time_match.group(1))
                
            value_match = re.match(r"^\s+value:\s+([eE\d\.-]+)", line)
            if value_match and current_keyframe is not None:
                current_keyframe['value'] = float(value_match.group(1))
                
            inslope_match = re.match(r"^\s+inSlope:\s+([eE\d\.-]+)", line)
            if inslope_match and current_keyframe is not None:
                current_keyframe['inSlope'] = float(inslope_match.group(1))
                
            outslope_match = re.match(r"^\s+outSlope:\s+([eE\d\.-]+)", line)
            if outslope_match and current_keyframe is not None:
                current_keyframe['outSlope'] = float(outslope_match.group(1))
                
            attr_match = re.match(r"^\s+attribute:\s+(.+)$", line)
            if attr_match:
                if current_keyframe is not None:
                    current_curve.append(current_keyframe)
                    current_keyframe = None
                
                current_attr = attr_match.group(1).strip()
                if current_attr and current_curve:
                    result[anim_name][current_attr] = current_curve
                
                current_attr = None
                current_curve = []
                
        i += 1
        
    if current_attr and current_curve:
        result[anim_name][current_attr] = current_curve
        
os.makedirs(os.path.dirname(output_file), exist_ok=True)
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2)

print(f"Exported curves to {output_file}")
