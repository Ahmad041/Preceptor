import chromadb
from chromadb import EmbeddingFunction

# Test what EmbeddingFunction interface looks like in 1.5.9
print('EmbeddingFunction:', EmbeddingFunction)
print()

# Test creating collection with embedding_function
client = chromadb.PersistentClient(path='data/chromadb_test')

class TestEF(EmbeddingFunction):
    def __call__(self, input):
        return [[0.1, 0.2, 0.3] for _ in input]

ef = TestEF()
print('EF callable:', callable(ef))
print('EF type:', type(ef))

try:
    col = client.get_or_create_collection('test_col', embedding_function=ef)
    print('Collection created OK:', col.name)
    col.add(ids=['id1'], documents=['hello world'])
    print('Add OK')
    results = col.query(query_texts=['hello'], n_results=1)
    print('Query OK:', results['documents'])
    client.delete_collection('test_col')
    print('Delete OK')
except Exception as e:
    print('ERROR:', e)
    import traceback
    traceback.print_exc()
