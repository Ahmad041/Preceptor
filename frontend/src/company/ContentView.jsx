import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ContentView.css';

const ContentView = () => {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ideas, setIdeas] = useState([]);
    const [newIdea, setNewIdea] = useState('');

    useEffect(() => {
        fetchDocs();
        const savedIdeas = localStorage.getItem('contentIdeas');
        if (savedIdeas) setIdeas(JSON.parse(savedIdeas));
    }, []);

    const fetchDocs = async () => {
        try {
            const res = await axios.get('http://localhost:8000/api/docx/list');
            setDocs(res.data.docs || []);
        } catch (err) {
            console.error('Failed to fetch docs', err);
        } finally {
            setLoading(false);
        }
    };

    const addIdea = () => {
        if (!newIdea.trim()) return;
        const updated = [...ideas, { id: Date.now(), text: newIdea, status: 'Draft' }];
        setIdeas(updated);
        localStorage.setItem('contentIdeas', JSON.stringify(updated));
        setNewIdea('');
    };

    const deleteIdea = (id) => {
        const updated = ideas.filter(i => i.id !== id);
        setIdeas(updated);
        localStorage.setItem('contentIdeas', JSON.stringify(updated));
    };

    return (
        <div className="content-view-container">
            <div className="content-section">
                <h2>SOCIAL MEDIA PLANNER</h2>
                <div className="idea-input">
                    <input 
                        type="text" 
                        value={newIdea} 
                        onChange={e => setNewIdea(e.target.value)}
                        placeholder="New content idea..."
                        onKeyDown={e => e.key === 'Enter' && addIdea()}
                    />
                    <button onClick={addIdea}>ADD IDEA</button>
                </div>
                <div className="ideas-grid">
                    {ideas.map(idea => (
                        <div key={idea.id} className="idea-card">
                            <span className="idea-text">{idea.text}</span>
                            <span className="idea-status">{idea.status}</span>
                            <button onClick={() => deleteIdea(idea.id)}>×</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="content-section">
                <h2>GENERATED DOCUMENTS (DOCX)</h2>
                {loading ? <p>Loading documents...</p> : (
                    <div className="docs-grid">
                        {docs.length === 0 ? <p>No documents generated yet.</p> : docs.map(doc => (
                            <div key={doc.filename} className="doc-card">
                                <span className="doc-icon">📄</span>
                                <div className="doc-info">
                                    <span className="doc-name">{doc.filename}</span>
                                    <span className="doc-date">{new Date(doc.created_at * 1000).toLocaleString()}</span>
                                </div>
                                <a href={`http://localhost:8000/api/docx/download/${doc.filename}`} target="_blank" rel="noreferrer" className="download-btn">DOWNLOAD</a>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContentView;
