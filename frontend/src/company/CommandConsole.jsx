import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import './AgentOffice.css';

// Focus mode definitions with cyberpunk color themes
const FOCUS_MODES = [
    { id: 'all',      label: '🌐 Web',      color: '#a78bfa', desc: 'General search' },
    { id: 'academic', label: '🎓 Academic',  color: '#60a5fa', desc: 'Scholar, arXiv, Nature' },
    { id: 'code',     label: '💻 Code',      color: '#34d399', desc: 'GitHub, StackOverflow' },
    { id: 'youtube',  label: '📺 YouTube',   color: '#f87171', desc: 'YouTube videos' },
    { id: 'reddit',   label: '💬 Reddit',    color: '#fb923c', desc: 'Reddit threads' },
    { id: 'writing',  label: '✍️ Writing',   color: '#e879f9', desc: 'Offline composition' },
];

const CommandConsole = ({ agent, onClose, sources = [], logs = [], history = [], setHistory }) => {
    const [command, setCommand] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeModes, setActiveModes] = useState([]);
    
    // Sync logs into history if history is empty (prevents "empty" look when agent is busy)
    useEffect(() => {
        if (history.length === 0 && logs.length > 0) {
            const initialLogs = logs.map(l => ({ role: 'system', content: l }));
            setHistory(initialLogs);
        }
    }, [logs, history.length, setHistory]);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history, isProcessing]);

    // Escape key to close + refocus input after processing
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    useEffect(() => {
        if (!isProcessing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isProcessing]);

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    // Toggle a focus mode on/off
    const toggleMode = (modeId) => {
        setActiveModes(prev => {
            if (modeId === 'writing') {
                // Writing mode is exclusive — toggles off everything else
                return prev.includes('writing') ? [] : ['writing'];
            }
            if (prev.includes('writing')) {
                // Switching away from writing
                return [modeId];
            }
            if (prev.includes(modeId)) {
                return prev.filter(m => m !== modeId);
            }
            return [...prev, modeId];
        });
    };

    // Build conversation messages for context
    const buildMessages = useCallback((newCommand) => {
        const messages = [];
        for (const msg of history) {
            if (msg.role === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'agent') {
                messages.push({ role: 'assistant', content: msg.content });
            }
        }
        messages.push({ role: 'user', content: newCommand });
        return messages;
    }, [history]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!command.trim() || isProcessing) return;

        const currentCommand = command;
        const userMsg = { role: 'user', content: currentCommand };
        setHistory(prev => [...prev, userMsg]);
        setCommand('');
        setIsProcessing(true);

        try {
            const response = await axios.post('http://localhost:8000/api/agent/command', {
                agent_id: agent.id,
                command: currentCommand,
                conversation: buildMessages(currentCommand),
                focus_modes: activeModes.length > 0 ? activeModes : null
            });

            if (response.data.status === 'berhasil') {
                // Strip residual [TOOL_CALL] blocks jika ada (safety net)
                const cleanResponse = response.data.response
                    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '')
                    .trim();
                setHistory(prev => [...prev, { role: 'agent', content: cleanResponse || '(Agent sedang menggunakan tools...)' }]);
            } else {
                setHistory(prev => [...prev, { role: 'system', content: `ERROR: ${response.data.error}` }]);
            }
        } catch (error) {
            setHistory(prev => [...prev, { role: 'system', content: `CONNECTION ERROR: ${error.message}` }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteSource = async (e, sourceUrl) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await axios.delete(`http://localhost:8000/api/agent/sources/${agent.id}?url=${encodeURIComponent(sourceUrl)}`);
            // The source will disappear on the next poll from AgentOffice
        } catch (error) {
            console.error("Failed to delete source:", error);
        }
    };

    // Citation renderer: transforms [1], [2] etc. in agent messages into clickable source links
    const renderCitationContent = useCallback((text) => {
        if (!sources || sources.length === 0) return text;
        
        // Replace [N] patterns with clickable citation links
        return text.replace(/\[(\d+)\]/g, (match, numStr) => {
            const idx = parseInt(numStr, 10) - 1;
            if (idx >= 0 && idx < sources.length) {
                return `[${numStr}](${sources[idx].url} "${sources[idx].title}")`;
            }
            return match;
        });
    }, [sources]);

    // Custom markdown components with citation support
    const markdownComponents = useMemo(() => ({
        a: ({ href, title, children }) => {
            // Check if it's a citation link (from our renderCitationContent)
            const isCitation = /^\d+$/.test(String(children));
            if (isCitation) {
                return (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="citation-pill"
                        title={title || href}
                        style={{ '--citation-color': agent.color || '#a78bfa' }}
                    >
                        {children}
                    </a>
                );
            }
            return (
                <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: agent.color || '#a78bfa' }}>
                    {children}
                </a>
            );
        }
    }), [agent.color, sources]);

    return (
        <div 
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
            }}
            onClick={handleOverlayClick}
        >
            <div className={`command-console-modal ${sources.length > 0 ? 'has-sources' : ''}`} style={{ borderTop: `3px solid ${agent.color || '#888'}` }}>
                <div className="console-main-area">
                    <div className="console-header">
                        <div className="title">
                            <span className="blink">●</span> COMMAND CENTER: {agent.name.toUpperCase()}
                        </div>
                        <button className="close-btn" onClick={onClose} title="Close (Esc)">×</button>
                    </div>

                    {/* FOCUS MODE MULTI-TOGGLE BAR */}
                    <div className="focus-mode-bar">
                        {FOCUS_MODES.map(mode => {
                            const isActive = activeModes.includes(mode.id);
                            return (
                                <button
                                    key={mode.id}
                                    className={`focus-mode-toggle ${isActive ? 'active' : ''}`}
                                    onClick={() => toggleMode(mode.id)}
                                    title={mode.desc}
                                    style={{
                                        '--fm-color': mode.color,
                                        '--fm-bg': isActive ? `${mode.color}20` : 'transparent',
                                        '--fm-border': isActive ? `${mode.color}60` : 'rgba(255,255,255,0.08)',
                                        '--fm-shadow': isActive ? `0 0 12px ${mode.color}30` : 'none',
                                    }}
                                >
                                    <span className="focus-mode-icon">{mode.label.split(' ')[0]}</span>
                                    <span className="focus-mode-label">{mode.label.split(' ').slice(1).join(' ')}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="console-history" ref={scrollRef}>
                        <div className="system-msg">Establishing secure link to {agent.name}...</div>
                        <div className="system-msg">Persona loaded: {agent.role}</div>
                        <div className="system-msg">Session ready. Type a directive below.</div>
                        {history.map((msg, idx) => (
                            <div key={idx} className={`msg-block ${msg.role}`}>
                                <span className="prefix">
                                    {msg.role === 'user' ? '> SENPAI@MISSION_CONTROL:' : 
                                     msg.role === 'agent' ? `> ${agent.id.toUpperCase()}@AGENT_UNIT:` : 
                                     '> [SYS]:'}
                                </span>
                                <div className="content">
                                    {msg.role === 'agent' ? (
                                        <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]}
                                            components={markdownComponents}
                                        >
                                            {renderCitationContent(msg.content)}
                                        </ReactMarkdown>
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                            </div>
                        ))}
                        {isProcessing && (
                            <div className="msg-block system">
                                <span className="prefix"> {'>'} [SYS]:</span>
                                <div className="content processing">Processing command... <span className="typing-cursor">_</span></div>
                            </div>
                        )}
                    </div>

                    <form className="console-input-area" onSubmit={handleSubmit}>
                        <span className="input-prefix"> {">>>"} </span>
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={command} 
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder={isProcessing ? "Waiting for agent..." : "Enter directive..."}
                            autoFocus
                            disabled={isProcessing}
                        />
                    </form>

                    <div className="console-footer">
                        <span>STATUS: {isProcessing ? 'BUSY' : 'READY'}</span>
                        <span>
                            {activeModes.length > 0 
                                ? `FOCUS: ${activeModes.map(m => m.toUpperCase()).join(' + ')}` 
                                : 'FOCUS: DEFAULT'
                            }
                        </span>
                        <span>ESC TO CLOSE</span>
                    </div>
                </div>

                {/* SOURCES SIDEBAR */}
                {sources.length > 0 && (
                    <div className="console-sources-sidebar">
                        <div className="sources-header">
                            SOURCES ({sources.length})
                        </div>
                        <div className="sources-list">
                            {sources.map((source, idx) => (
                                <div key={idx} className="source-item-wrapper">
                                    <a 
                                        href={source.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="source-item"
                                        title={source.url}
                                    >
                                        <div className="source-index" style={{ background: `${agent.color || '#a78bfa'}25`, color: agent.color || '#a78bfa' }}>{idx + 1}</div>
                                        <div className="source-info">
                                            <div className="source-title">{source.title}</div>
                                            <div className="source-url">{new URL(source.url).hostname}</div>
                                        </div>
                                    </a>
                                    <button 
                                        className="delete-source-btn" 
                                        onClick={(e) => handleDeleteSource(e, source.url)}
                                        title="Remove Source"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommandConsole;
