import os
try:
    import chromadb
    print("[SUCCESS] chromadb imported successfully!")
    print(f"ChromaDB version: {chromadb.__version__}")
    
    # Initialize a test client
    db_path = os.path.join(".", "data", "test_chromadb")
    os.makedirs(db_path, exist_ok=True)
    client = chromadb.PersistentClient(path=db_path)
    
    # Get or create a collection (without default embedding function)
    collection = client.get_or_create_collection("test_collection_manual")
    
    # Add a document with manual embedding (e.g. 4 dimensions for testing)
    collection.upsert(
        documents=["This is a test document"],
        embeddings=[[0.1, 0.2, 0.3, 0.4]],
        metadatas=[{"category": "test"}],
        ids=["id1"]
    )
    
    # Query with manual embedding
    results = collection.query(
        query_embeddings=[[0.1, 0.2, 0.3, 0.4]],
        n_results=1
    )
    print("Query results:", results)
    print("[SUCCESS] ChromaDB manual embedding test passed perfectly!")
except Exception as e:
    print(f"[ERROR] Failed to run ChromaDB: {e}")
