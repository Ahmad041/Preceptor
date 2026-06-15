import torch
from transformers.modeling_attn_mask_utils import _prepare_4d_causal_attention_mask_with_cache_position

inputs_embeds = torch.randn(1, 2, 1024, dtype=torch.float16, device="cuda")
attention_mask = torch.tensor([[1, 1]], device="cuda")
cache_position = torch.tensor([0, 1], device="cuda")

# In 4.57.6, Qwen3TTSTalkerCodePredictorModel does this:
class DummyConfig:
    _attn_implementation = "sdpa"
    sliding_window = None

mask_kwargs = dict(
    attention_mask=attention_mask,
    input_tensor=inputs_embeds,
    cache_position=cache_position,
    past_key_values=None,
    sliding_window=None
)

# wait, we updated create_causal_mask to handle sdpa:
from transformers.modeling_attn_mask_utils import create_sliding_window_causal_mask

mask = create_sliding_window_causal_mask(
    attention_mask, 
    (1, 2), 
    inputs_embeds, 
    0, 
    cache_position, 
    sliding_window=100
)
print("Sliding mask shape:", mask.shape if mask is not None else mask)
print("Sliding mask values:", mask)

