import React, { useState, useEffect } from 'react';
import axios from 'axios';
import NotesSidebar from './NotesSidebar';
import NoteEditor from './NoteEditor';
import KnowledgeGraph from './KnowledgeGraph';
import AgentOffice from './AgentOffice';
import TeamStats from './TeamStats';
import './CompanyMode.css';

const CompanyMode = ({ onBack }) => {
    const [selectedNote, setSelectedNote] = useState(null);
    const [view, setView] = useState('editor'); // 'editor' or 'graph'
    const [activeTab, setActiveTab] = useState('visual'); // 'tasks', 'memory', 'docs', 'visual', etc.
    const [notes, setNotes] = useState([]);
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [isNotesSidebarOpen, setIsNotesSidebarOpen] = useState(true);

    useEffect(() => {
        fetchNotes();
        fetchGraph();
    }, []);

    const fetchNotes = async () => {
        try {
            const res = await axios.get('http://localhost:8000/api/notes');
            setNotes(res.data.notes || []);
        } catch (err) {
            console.error('Failed to fetch notes', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchGraph = async () => {
        try {
            const res = await axios.get('http://localhost:8000/api/notes/graph');
            setGraphData(res.data);
        } catch (err) {
            console.error('Failed to fetch graph data', err);
        }
    };

    const handleNoteSelect = (note) => {
        setSelectedNote(note);
        setView('editor');
    };

    const handleSaveNote = async (id, content) => {
        try {
            await axios.put(`http://localhost:8000/api/notes/${id}`, { content });
            fetchNotes(); // Refresh list
            fetchGraph(); // Refresh graph since links might change
        } catch (err) {
            console.error('Failed to save note', err);
        }
    };

    const handleCreateNote = async (title) => {
        try {
            const res = await axios.post('http://localhost:8000/api/notes', { title });
            const newNote = res.data;
            setNotes([...notes, newNote]);
            setSelectedNote(newNote);
            setView('editor');
            fetchGraph();
        } catch (err) {
            console.error('Failed to create note', err);
        }
    };

    const navItems = [
        { id: 'tasks', label: 'Tasks', icon: '📋' },
        { id: 'content', label: 'Content', icon: '🎨' },
        { id: 'calendar', label: 'Calendar', icon: '📅' },
        { id: 'projects', label: 'Projects', icon: '🚀' },
        { id: 'memory', label: 'Memory', icon: '🧠' },
        { id: 'docs', label: 'Docs', icon: '📄' },
        { id: 'team', label: 'Team', icon: '👥' },
        { id: 'visual', label: 'Visual', icon: '👁️' },
    ];

    return (
        <div className="company-mode-container">
            <aside className="company-sidebar">
                <div className="sidebar-logo" onClick={onBack}>
                    <div className="logo-icon">PK</div>
                    <div className="logo-text">MISSION CONTROL</div>
                </div>
                
                <nav className="sidebar-nav">
                    {navItems.map(item => (
                        <button 
                            key={item.id}
                            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab(item.id);
                                // Set default view per tab
                                if (item.id === 'memory') setView('graph');
                                else if (item.id === 'docs') setView('editor');
                            }}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-profile">
                        <div className="user-avatar"></div>
                        <div className="user-info">
                            <div className="username">Preceptor</div>
                            <div className="user-status">Online</div>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="company-content">
                <header className="content-header">
                    <div className="header-title">
                        <h2>{navItems.find(i => i.id === activeTab)?.label.toUpperCase()}</h2>
                        <span className="breadcrumb">HOME / {activeTab.toUpperCase()}</span>
                    </div>
                    {activeTab === 'docs' && (
                        <div className="view-toggle">
                            <button 
                                className={view === 'editor' ? 'active' : ''} 
                                onClick={() => setView('editor')}
                            >
                                📝 Editor
                            </button>
                        </div>
                    )}
                    {activeTab === 'memory' && (
                        <div className="view-toggle">
                            <button 
                                className={view === 'graph' ? 'active' : ''} 
                                onClick={() => setView('graph')}
                            >
                                🕸 Graph
                            </button>
                            <button 
                                className={view === 'editor' ? 'active' : ''} 
                                onClick={() => setView('editor')}
                            >
                                📝 Editor
                            </button>
                        </div>
                    )}
                </header>

                <main className="content-body">
                    {activeTab === 'visual' && <AgentOffice />}
                    {activeTab === 'team' && <TeamStats />}
                    
                    {/* === MEMORY TAB — Knowledge Graph + Deep Search === */}
                    {activeTab === 'memory' && (
                        <div className="docs-layout">
                            <NotesSidebar 
                                notes={notes} 
                                selectedNote={selectedNote} 
                                onSelect={handleNoteSelect}
                                onCreate={handleCreateNote}
                                isOpen={isNotesSidebarOpen}
                                onToggle={() => setIsNotesSidebarOpen(!isNotesSidebarOpen)}
                            />
                            
                            <div className="docs-main">
                                {view === 'editor' ? (
                                    selectedNote ? (
                                        <NoteEditor 
                                            note={selectedNote} 
                                            onSave={handleSaveNote}
                                        />
                                    ) : (
                                        <div className="empty-state">
                                            <h2>Neural Link Standby</h2>
                                            <p>Select a data node or initiate a Deep Search to begin exploration.</p>
                                            <button className="create-big-btn" onClick={() => handleCreateNote('New Intel')}>
                                                + Initialize New Data Node
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    <KnowledgeGraph 
                                        data={graphData} 
                                        onNodeClick={(id) => {
                                            const note = notes.find(n => n.id === id || n.path === id);
                                            if (note) handleNoteSelect(note);
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {/* === DOCS TAB — Notes Editor Only === */}
                    {activeTab === 'docs' && (
                        <div className="docs-layout">
                            <NotesSidebar 
                                notes={notes} 
                                selectedNote={selectedNote} 
                                onSelect={handleNoteSelect}
                                onCreate={handleCreateNote}
                                isOpen={isNotesSidebarOpen}
                                onToggle={() => setIsNotesSidebarOpen(!isNotesSidebarOpen)}
                            />
                            
                            <div className="docs-main">
                                {selectedNote ? (
                                    <NoteEditor 
                                        note={selectedNote} 
                                        onSave={handleSaveNote}
                                    />
                                ) : (
                                    <div className="empty-state">
                                        <h2>Document Station</h2>
                                        <p>Select or create a document to start writing.</p>
                                        <button className="create-big-btn" onClick={() => handleCreateNote('New Document')}>
                                            + Create New Document
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab !== 'visual' && activeTab !== 'team' && activeTab !== 'docs' && activeTab !== 'memory' && (
                        <div className="coming-soon">
                            <div className="glitch-text" data-text="SYSTEM_UNDER_DEVELOPMENT">SYSTEM_UNDER_DEVELOPMENT</div>
                            <p>This module is currently being calibrated by the Software Team.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default CompanyMode;
