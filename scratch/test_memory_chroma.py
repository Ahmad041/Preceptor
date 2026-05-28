import sys, os
sys.path.insert(0, '.')

print('=== TEST memory_system.py ChromaDB ===')
from memory_system import MemorySystem

ms = MemorySystem()
print('ChromaDB available:', ms._chroma_available)
print('LTM entries loaded:', len(ms.long_term_memory))

# Test add
print()
print('--- Test add_to_long_term_memory ---')
ms.add_to_long_term_memory('Test', 'Ini adalah memori test ChromaDB baru', [0.1]*768)
print('LTM count setelah add:', len(ms.long_term_memory))

# Test get_all_memories_with_ids
print()
print('--- Test get_all_memories_with_ids ---')
mems = ms.get_all_memories_with_ids()
last = mems[-1] if mems else None
if last:
    print('Last entry nama:', last['nama'])
    print('Last entry chroma_id:', last['chroma_id'])

# Test search
print()
print('--- Test search ChromaDB ---')
results = ms.search_relevant_chunks('memori test', top_k=3)
print('Search results count:', len(results))
if results:
    print(results[0][:120])

# Test delete
if last and last.get('chroma_id'):
    print()
    print('--- Test delete ---')
    ok = ms.delete_memory_by_id(last['chroma_id'])
    print('Delete result:', ok)
    print('LTM count setelah delete:', len(ms.long_term_memory))

print()
print('=== SEMUA TEST SELESAI ===')
