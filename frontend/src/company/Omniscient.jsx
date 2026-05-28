import React, { useState } from 'react';
import axios from 'axios';
import './Omniscient.css';

const Omniscient = ({ isSidebarOpen, onToggleSidebar }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [activeFilter, setActiveFilter] = useState('all'); // all, code, memory, docs
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        try {
            const res = await axios.post('http://localhost:8000/api/knowledge/search', {
                query: searchQuery
            });
            if (res.data.status === 'success') {
                setSearchResults(res.data.data.results);
            } else {
                console.error("Search Error:", res.data.message);
            }
        } catch (err) {
            console.error('Failed to perform unified search', err);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="omniscient-container">
            <div className={`omniscient-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <h3>Sources</h3>
                    <button onClick={onToggleSidebar} className="toggle-btn">
                        {isSidebarOpen ? '◀' : '▶'}
                    </button>
                </div>
                {isSidebarOpen && (
                    <div className="sidebar-filters">
                        <button className={activeFilter === 'all' ? 'active' : ''} onClick={() => setActiveFilter('all')}>
                            🌐 All Knowledge
                        </button>
                        <button className={activeFilter === 'code' ? 'active' : ''} onClick={() => setActiveFilter('code')}>
                            💻 GitNexus Code
                        </button>
                        <button className={activeFilter === 'memory' ? 'active' : ''} onClick={() => setActiveFilter('memory')}>
                            💬 Chat Memory
                        </button>
                        <button className={activeFilter === 'docs' ? 'active' : ''} onClick={() => setActiveFilter('docs')}>
                            📄 Local Docs
                        </button>
                        
                        <div className="gitnexus-status">
                            <h4>GitNexus Status</h4>
                            <div className="status-indicator online">Online (Port 4747)</div>
                            <button onClick={() => window.open('http://localhost:4747', '_blank')}>
                                Open GitNexus UI
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="omniscient-main">
                <div className="search-header">
                    <h2>Omniscient Search</h2>
                    <form onSubmit={handleSearch} className="unified-search-bar">
                        <input 
                            type="text" 
                            placeholder="Ask anything about code, past conversations, or docs..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" disabled={isSearching}>
                            {isSearching ? 'Searching...' : 'Search'}
                        </button>
                    </form>
                </div>

                <div className="search-results">
                    {!searchResults && !isSearching && (
                        <div className="empty-state">
                            <p>Enter a query to search across the unified knowledge hub.</p>
                        </div>
                    )}
                    
                    {isSearching && <div className="loading-state">Mining knowledge...</div>}

                    {searchResults && (
                        <div className="results-container">
                            {(activeFilter === 'all' || activeFilter === 'code') && searchResults.code && searchResults.code.length > 0 && (
                                <div className="result-section">
                                    <h3>💻 Code Context (GitNexus)</h3>
                                    {searchResults.code.map((item, i) => (
                                        <div key={`code-${i}`} className="result-card">
                                            <p>{item.content}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(activeFilter === 'all' || activeFilter === 'memory') && searchResults.memory && searchResults.memory.length > 0 && (
                                <div className="result-section">
                                    <h3>💬 Chat Memory</h3>
                                    {searchResults.memory.map((item, i) => (
                                        <div key={`mem-${i}`} className="result-card">
                                            <p>{item}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(activeFilter === 'all' || activeFilter === 'docs') && searchResults.docs && searchResults.docs.length > 0 && (
                                <div className="result-section">
                                    <h3>📄 Local Documents</h3>
                                    {searchResults.docs.map((item, i) => (
                                        <div key={`doc-${i}`} className="result-card">
                                            <p>{item.content}</p>
                                            <small>Relevance: {(item.score).toFixed(2)}</small>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Omniscient;
