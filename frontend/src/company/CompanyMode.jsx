import React, { useState, useEffect } from 'react';
import axios from 'axios';
import NotesSidebar from './NotesSidebar';
import NoteEditor from './NoteEditor';
import KnowledgeGraph from './KnowledgeGraph';
import Cortex3DGraph from './Cortex3DGraph';
import PulseLiveFeed from './PulseLiveFeed';
import AgentOffice from './AgentOffice';
import TeamStats from './TeamStats';
import Omniscient from './Omniscient';
import TasksView from './TasksView';
import ContentView from './ContentView';
import CalendarView from './CalendarView';
import ProjectsView from './ProjectsView';
import RnDView from './RnDView';
import DiscussAgent from './DiscussAgent';
import NotebookLMView from './NotebookLMView';
import SettingsView from './SettingsView';
import './CompanyMode.css';
import KnowledgeGraph3D from './KnowledgeGraph3D';

const CompanyMode = ({ onBack }) => {
    const [selectedNote, setSelectedNote] = useState(null);
    const [view, setView] = useState('editor'); // 'editor' or 'graph'
    const [activeTab, setActiveTab] = useState('visual'); // 'tasks', 'memory', 'docs', 'visual', etc.
    const [notes, setNotes] = useState([]);
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [isNotesSidebarOpen, setIsNotesSidebarOpen] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // AI Co-Writer states
    const [rightPanelWidth, setRightPanelWidth] = useState(320);
    const [isDraggingRightPanel, setIsDraggingRightPanel] = useState(false);
    const [coWriterText, setCoWriterText] = useState("Consider linking the \"Neural Link Protocol\" here, as it correlates with Class-IV reality distortions.");
    const [isGeneratingCoWriter, setIsGeneratingCoWriter] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDraggingRightPanel) return;
            const newWidth = document.body.clientWidth - e.clientX;
            if (newWidth > 200 && newWidth < 800) {
                setRightPanelWidth(newWidth);
            }
        };
        const handleMouseUp = () => {
            setIsDraggingRightPanel(false);
        };
        if (isDraggingRightPanel) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingRightPanel]);

    const handleGenerateCoWriter = async () => {
        if (!selectedNote || !selectedNote.content) return;
        setIsGeneratingCoWriter(true);
        try {
            const res = await axios.post('http://localhost:8000/api/cowriter/suggest', {
                context: selectedNote.content
            });
            if (res.data && res.data.suggestion) {
                setCoWriterText(res.data.suggestion);
            }
        } catch (err) {
            console.error("Co-writer generation failed:", err);
            setCoWriterText("System anomaly detected. Failed to generate suggestion.");
        } finally {
            setIsGeneratingCoWriter(false);
        }
    };


    useEffect(() => {
        if (activeTab !== 'visual') {
            setIsFullscreen(false);
        }
    }, [activeTab]);

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
        { id: 'tasks', label: 'Tasks', symbol: 'task' },
        { id: 'content', label: 'Content', symbol: 'palette' },
        { id: 'calendar', label: 'Jadwal', symbol: 'calendar_month' },
        { id: 'projects', label: 'Projects', symbol: 'rocket_launch' },
        { id: 'rnd', label: 'R&D', symbol: 'science' },
        { id: 'omniscient', label: 'Omniscient', symbol: 'hub' },
        { id: 'docs', label: 'Docs', symbol: 'folder_open' },
        { id: 'notebooklm', label: 'Open Notebook', symbol: 'mic' },
        { id: 'team', label: 'Team', symbol: 'group' },
        { id: 'discuss', label: 'Discuss Agent', symbol: 'smart_toy' },
        { id: 'settings', label: 'Pengaturan', symbol: 'settings' },
        { id: 'visual', label: 'Visual', symbol: 'visibility' },
    ];

    const showRightPanel = ['docs', 'omniscient'].includes(activeTab) && !(activeTab === 'omniscient' && view === 'graph');

    return (
        <div className={`h-screen bg-[#121414] text-[#e2e2e2] font-['Outfit'] overflow-hidden flex flex-col relative selection:bg-[#3a4665] selection:text-white ${isFullscreen ? 'fullscreen' : ''} ${activeTab === 'visual' ? 'immersive-3d' : ''}`}>
            {/* Scanlines Overlay */}
            <div className="absolute inset-0 scanlines"></div>

            {/* MAIN LAYOUT */}
            <div className="flex flex-1 overflow-hidden relative z-10 pl-28">
                {/* LEFT SIDEBAR (Floating glassmorphic dock) */}
                <aside className="fixed left-6 top-1/2 -translate-y-1/2 flex flex-col z-40 backdrop-blur-xl bg-[#1a1c1c]/10 p-4 rounded-xl border border-white/5 shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar w-20">
                <div className="flex flex-col gap-5 items-center w-full">
                    {navItems.map(item => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setActiveTab(item.id);
                                    if (item.id === 'omniscient') setView('graph');
                                    else if (item.id === 'docs') setView('editor');
                                }}
                                className="group flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none outline-none w-full text-center"
                            >
                                <span className={`material-symbols-outlined text-xl transition-all ${
                                    isActive 
                                    ? 'text-[#c3c0ff] drop-shadow-[0_0_8px_rgba(195,192,255,0.6)] scale-110' 
                                    : 'text-[#c7c6cc]/40 group-hover:text-[#e2e2e2]'
                                }`}>
                                    {item.symbol}
                                </span>
                                <span className={`font-['Outfit'] text-[8px] tracking-widest uppercase transition-all block w-full truncate leading-tight ${
                                    isActive 
                                    ? 'text-[#c3c0ff] font-semibold' 
                                    : 'text-[#c7c6cc]/40 group-hover:text-[#e2e2e2]'
                                }`}>
                                    {item.id === 'notebooklm' ? 'NOTEBOOK' : item.label}
                                </span>
                            </button>
                        );
                    })}

                    {/* Divider */}
                    <div className="w-10 h-px bg-white/10 my-1"></div>

                    {/* Exit / Back Button */}
                    <button
                        onClick={onBack}
                        className="group flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none outline-none w-full text-center"
                    >
                        <span className="material-symbols-outlined text-xl text-[#ffb4ab]/60 group-hover:text-[#ffb4ab] transition-all">
                            arrow_back
                        </span>
                        <span className="font-['Outfit'] text-[8px] tracking-widest uppercase transition-all block w-full truncate leading-tight text-[#ffb4ab]/60 group-hover:text-[#ffb4ab]">
                            BACK
                        </span>
                    </button>
                </div>
            </aside>

                {/* CENTER CONTENT */}
                <main className={`flex-1 flex flex-col bg-[#121414]/90 overflow-hidden ${(activeTab === 'visual' || activeTab === 'notebooklm' || (activeTab === 'omniscient' && view === 'graph')) ? 'p-0' : 'p-8'}`}>
                    {/* Header specific to Content */}
                    {activeTab !== 'visual' && activeTab !== 'notebooklm' && (
                        <div className={`mb-6 flex justify-between items-end border-b border-[#333535] pb-4 ${activeTab === 'omniscient' && view === 'graph' ? 'mx-8 mt-8 z-20' : ''}`}>
                            <div className="pointer-events-auto">
                                <div className="text-xs text-[#a9b4d9] tracking-widest mb-1">MODULE_ACTIVE</div>
                                <h2 className="text-3xl font-bold text-[#e2e2e2] tracking-wide">{navItems.find(i => i.id === activeTab)?.label.toUpperCase()}</h2>
                            </div>
                            
                            {/* View Toggles */}
                            {activeTab === 'docs' && (
                                <div className="flex gap-2 text-sm pointer-events-auto">
                                    <button 
                                        className={`px-4 py-1 border ${view === 'editor' ? 'border-[#1d00a5] text-[#c3c6d7] bg-[#1d00a5]/10' : 'border-[#46464c] text-[#777b8a] hover:text-[#c3c6d7]'}`}
                                        onClick={() => setView('editor')}
                                    >
                                        EDITOR
                                    </button>
                                </div>
                            )}
                            {activeTab === 'omniscient' && (
                                <div className="flex gap-2 text-sm pointer-events-auto">
                                    <button 
                                        className={`px-4 py-1 border ${view === 'graph' ? 'border-[#1d00a5] text-[#c3c6d7] bg-[#1d00a5]/10' : 'border-[#46464c] text-[#777b8a] hover:text-[#c3c6d7]'}`}
                                        onClick={() => setView('graph')}
                                    >
                                        GRAPH
                                    </button>
                                    <button 
                                        className={`px-4 py-1 border ${view === 'editor' ? 'border-[#1d00a5] text-[#c3c6d7] bg-[#1d00a5]/10' : 'border-[#46464c] text-[#777b8a] hover:text-[#c3c6d7]'}`}
                                        onClick={() => setView('editor')}
                                    >
                                        REGISTRY
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actual Content Rendered Here */}
                    <div className="flex-1 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-[#333535] scrollbar-track-transparent relative h-full">
                        {activeTab === 'visual' && (
                            <AgentOffice 
                                isFullscreen={isFullscreen}
                                onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
                            />
                        )}
                        {activeTab === 'team' && <TeamStats />}
                        {activeTab === 'notebooklm' && <NotebookLMView />}
                        {activeTab === 'settings' && <SettingsView />}
                        
                        {activeTab === 'omniscient' && view === 'editor' && (
                            <Omniscient 
                                isSidebarOpen={isNotesSidebarOpen}
                                onToggleSidebar={() => setIsNotesSidebarOpen(!isNotesSidebarOpen)}
                            />
                        )}
                        {activeTab === 'omniscient' && view === 'graph' && (
                            <KnowledgeGraph3D />
                        )}

                        {activeTab === 'docs' && (
                            <div className="flex h-full gap-4">
                                <NotesSidebar 
                                    notes={notes} 
                                    selectedNote={selectedNote} 
                                    onSelect={handleNoteSelect}
                                    onCreate={handleCreateNote}
                                    isOpen={isNotesSidebarOpen}
                                    onToggle={() => setIsNotesSidebarOpen(!isNotesSidebarOpen)}
                                />
                                
                                <div className="flex-1 h-full">
                                    {selectedNote ? (
                                        <NoteEditor 
                                            note={selectedNote} 
                                            onSave={handleSaveNote}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full border border-[#333535] bg-[#0c0f0f]/30">
                                            <span className="material-symbols-outlined text-4xl text-[#46464c] mb-4">note_add</span>
                                            <h2 className="text-xl text-[#909096] mb-2">DOCUMENT STATION</h2>
                                            <p className="text-[#777b8a] text-sm mb-6">Select or create a document to begin.</p>
                                            <button 
                                                className="px-6 py-2 border border-[#1d00a5] text-[#c3c6d7] hover:bg-[#1d00a5]/20 transition-colors flex items-center gap-2"
                                                onClick={() => handleCreateNote('New Document')}
                                            >
                                                <span className="material-symbols-outlined">add</span>
                                                INITIATE NEW
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'tasks' && <TasksView />}
                        {activeTab === 'content' && <ContentView />}
                        {activeTab === 'calendar' && <CalendarView />}
                        {activeTab === 'projects' && <ProjectsView />}
                        {activeTab === 'rnd' && <RnDView />}
                        {activeTab === 'discuss' && <DiscussAgent />}

                        {/* Fallback for Coming Soon tabs */}
                        {activeTab !== 'visual' && activeTab !== 'settings' && activeTab !== 'notebooklm' && activeTab !== 'team' && activeTab !== 'discuss' && activeTab !== 'docs' && activeTab !== 'cortex' && activeTab !== 'omniscient' && activeTab !== 'tasks' && activeTab !== 'content' && activeTab !== 'calendar' && activeTab !== 'projects' && activeTab !== 'rnd' && (
                            <div className="flex flex-col items-center justify-center h-full border border-[#333535] bg-[#0c0f0f]/30">
                                <div className="glitch-text text-xl text-[#ffb4ab] mb-2" data-text="SYSTEM_UNDER_DEVELOPMENT">SYSTEM_UNDER_DEVELOPMENT</div>
                                <p className="text-[#777b8a] text-sm">This module is currently being calibrated by the Software Team.</p>
                            </div>
                        )}
                    </div>
                </main>

                {/* RIGHT PANEL (Context / AI) */}
                {showRightPanel && (
                    <aside 
                        className="border-l border-[#333535] bg-[#0c0f0f]/80 backdrop-blur-md flex flex-col relative"
                        style={{ width: rightPanelWidth }}
                    >
                        {/* Resize Handle */}
                        <div 
                            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#1d00a5] z-50 transition-colors"
                            onMouseDown={() => setIsDraggingRightPanel(true)}
                        ></div>

                        <div className="p-4 border-b border-[#333535] flex items-center justify-between">
                            <h3 className="text-sm font-bold text-[#c3c6d7] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1d00a5] text-lg">auto_awesome</span>
                                AI CO-WRITER
                            </h3>
                            <span className="text-[10px] bg-[#1d00a5]/20 text-[#c3c0ff] px-2 py-0.5 rounded border border-[#1d00a5]/50">READY</span>
                        </div>
                        
                        <div className="flex-1 p-4 overflow-y-auto space-y-6">
                                                        {/* Suggestion Block */}
                            <div className="border border-[#46464c] bg-[#1a1c1c] p-4 group hover:border-[#1d00a5] transition-colors flex flex-col">
                                <h4 className="text-xs text-[#a9b4d9] mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">lightbulb</span>
                                        SUGGESTED ADDITION
                                    </div>
                                    <button 
                                        onClick={handleGenerateCoWriter}
                                        disabled={isGeneratingCoWriter}
                                        className="text-[10px] bg-[#1d00a5]/20 text-[#c3c6d7] px-2 py-1 rounded hover:bg-[#1d00a5]/40 disabled:opacity-50"
                                    >
                                        {isGeneratingCoWriter ? 'GENERATING...' : 'GENERATE'}
                                    </button>
                                </h4>
                                <p className="text-sm text-[#c7c6cc] leading-relaxed mt-2">
                                    {isGeneratingCoWriter ? (
                                        <span className="animate-pulse">Analyzing context...</span>
                                    ) : (
                                        coWriterText
                                    )}
                                </p>
                                <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        className="text-xs border border-[#1d00a5] text-[#c3c6d7] px-3 py-1 hover:bg-[#1d00a5]/20"
                                        onClick={() => {
                                            if (selectedNote && coWriterText) {
                                                // Append to editor by triggering a custom event or you can manage it via context if needed.
                                                // For now, let's just log it or handle it in a simple way
                                                console.log("Accepted text:", coWriterText);
                                            }
                                        }}
                                    >ACCEPT</button>
                                    <button className="text-xs border border-[#46464c] text-[#909096] px-3 py-1 hover:bg-[#333535]">DISMISS</button>
                                </div>
                            </div>

                            {/* Linked Nodes */}
                            <div>
                                <h4 className="text-xs text-[#909096] mb-3 tracking-widest border-b border-[#333535] pb-1">LINKED NODES</h4>
                                <ul className="space-y-2">
                                    <li className="flex items-center gap-2 text-sm text-[#777b8a] hover:text-[#c3c6d7] cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">share</span>
                                        Project_Artemis.md
                                    </li>
                                    <li className="flex items-center gap-2 text-sm text-[#777b8a] hover:text-[#c3c6d7] cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">share</span>
                                        Log_042_Anomaly.txt
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
};

export default CompanyMode;
