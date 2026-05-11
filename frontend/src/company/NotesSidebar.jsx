import React, { useState } from 'react';

const NotesSidebar = ({ notes, selectedNote, onSelect, onCreate, isOpen = true, onToggle }) => {
    const [search, setSearch] = useState('');

    const filteredNotes = notes.filter(note => 
        note.title.toLowerCase().includes(search.toLowerCase()) ||
        (note.tags && note.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase())))
    );

    // Group by folder (source)
    const groupedNotes = filteredNotes.reduce((acc, note) => {
        const source = note.source || 'Other';
        if (!acc[source]) acc[source] = [];
        acc[source].push(note);
        return acc;
    }, {});

    return (
        <aside className={`notes-sidebar ${isOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-toggle-container">
                <button className="sidebar-toggle-btn" onClick={onToggle} title={isOpen ? "Close Sidebar" : "Open Sidebar"}>
                    {isOpen ? '◀' : '▶'}
                </button>
            </div>
            <div className="sidebar-inner-content">
                <div className="sidebar-search">
                <input 
                    type="text" 
                    placeholder="Search notes or tags..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="sidebar-actions">
                <button className="new-note-btn" onClick={() => onCreate('New Note')}>
                    + New Note
                </button>
            </div>

            <div className="notes-list-container">
                {Object.entries(groupedNotes).map(([source, group]) => (
                    <div key={source} className="note-group">
                        <div className="group-header">
                            <span className="folder-icon">📁</span>
                            <span className="folder-name">{source}</span>
                        </div>
                        <ul className="notes-list">
                            {group.map(note => (
                                <li 
                                    key={note.path} 
                                    className={`note-item ${selectedNote?.path === note.path ? 'active' : ''}`}
                                    onClick={() => onSelect(note)}
                                >
                                    <div className="note-title">{note.title}</div>
                                    <div className="note-meta">
                                        {note.tags && note.tags.slice(0, 2).map(tag => (
                                            <span key={tag} className="tag-pill">#{tag}</span>
                                        ))}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            </div>
            <style>{`
                .notes-sidebar {
                    width: ${isOpen ? '280px' : '40px'};
                    background: transparent;
                    border-right: 1px solid rgba(244, 114, 182, 0.1);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    backdrop-filter: blur(5px);
                    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    flex-shrink: 0;
                }

                .sidebar-toggle-container {
                    padding: ${isOpen ? '10px 10px 0' : '10px 0 0'};
                    display: flex;
                    justify-content: ${isOpen ? 'flex-end' : 'center'};
                }

                .sidebar-toggle-btn {
                    background: rgba(244, 114, 182, 0.1);
                    border: 1px solid rgba(244, 114, 182, 0.2);
                    color: #f472b6;
                    border-radius: 4px;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 0.7rem;
                    transition: all 0.2s;
                }

                .sidebar-toggle-btn:hover {
                    background: rgba(244, 114, 182, 0.25);
                }

                .sidebar-inner-content {
                    width: 280px;
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    opacity: ${isOpen ? 1 : 0};
                    pointer-events: ${isOpen ? 'auto' : 'none'};
                    transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    transition-delay: ${isOpen ? '0.1s' : '0s'};
                    overflow: hidden;
                }

                .sidebar-search {
                    padding: 16px;
                }

                .sidebar-search input {
                    width: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    border: 1px solid rgba(244, 114, 182, 0.2);
                    padding: 10px 14px;
                    border-radius: 8px;
                    color: white;
                    font-size: 0.85rem;
                    outline: none;
                    transition: all 0.3s;
                }

                .sidebar-search input:focus {
                    border-color: #f472b6;
                    box-shadow: 0 0 10px rgba(244, 114, 182, 0.2);
                }

                .sidebar-actions {
                    padding: 0 16px 12px;
                }

                .new-note-btn {
                    width: 100%;
                    background: rgba(244, 114, 182, 0.05);
                    border: 1px dashed rgba(244, 114, 182, 0.4);
                    color: #f472b6;
                    padding: 10px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 700;
                    font-size: 0.8rem;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    transition: all 0.2s;
                }

                .new-note-btn:hover {
                    background: rgba(244, 114, 182, 0.15);
                    border-style: solid;
                    transform: translateY(-1px);
                }

                .notes-list-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0 12px 20px;
                }

                .notes-list-container::-webkit-scrollbar {
                    width: 4px;
                }

                .notes-list-container::-webkit-scrollbar-thumb {
                    background: rgba(244, 114, 182, 0.2);
                    border-radius: 2px;
                }

                .note-group {
                    margin-bottom: 24px;
                }

                .group-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px;
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: #f472b6;
                    opacity: 0.6;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }

                .notes-list {
                    list-style: none;
                    padding: 0;
                    margin: 8px 0 0;
                }

                .note-item {
                    padding: 12px 14px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-bottom: 4px;
                    border: 1px solid transparent;
                }

                .note-item:hover {
                    background: rgba(255, 255, 255, 0.03);
                    border-color: rgba(255, 255, 255, 0.05);
                }

                .note-item.active {
                    background: rgba(244, 114, 182, 0.1);
                    border-color: rgba(244, 114, 182, 0.3);
                }

                .note-title {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #eee;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .note-meta {
                    display: flex;
                    gap: 6px;
                    margin-top: 6px;
                    overflow: hidden;
                }

                .tag-pill {
                    font-size: 0.65rem;
                    color: #f472b6;
                    background: rgba(244, 114, 182, 0.1);
                    padding: 1px 8px;
                    border-radius: 10px;
                    white-space: nowrap;
                    border: 1px solid rgba(244, 114, 182, 0.1);
                }
            `}</style>
        </aside>
    );
};

export default NotesSidebar;
