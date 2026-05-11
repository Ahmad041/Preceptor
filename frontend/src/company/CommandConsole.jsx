import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import './AgentOffice.css';

const CommandConsole = ({ agent, onClose, sources = [], logs = [] }) => {
    const [command, setCommand] = useState('');
    const [history, setHistory] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Sync logs into history if history is empty (prevents "empty" look when agent is busy)
    useEffect(() => {
        if (history.length === 0 && logs.length > 0) {
            const initialLogs = logs.map(l => ({ role: 'system', content: l }));
            setHistory(initialLogs);
        }
    }, [logs]);
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
        if (e.target.className === 'command-console-overlay') {
            onClose();
        }
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
                conversation: buildMessages(currentCommand)
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

    return (
        <div className="command-console-overlay" onClick={handleOverlayClick}>
            <div className={`command-console-modal ${agent.color} ${sources.length > 0 ? 'has-sources' : ''}`}>
                <div className="console-main-area">
                    <div className="console-header">
                        <div className="title">
                            <span className="blink">●</span> COMMAND CENTER: {agent.name.toUpperCase()}
                        </div>
                        <button className="close-btn" onClick={onClose} title="Close (Esc)">×</button>
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
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
                        <span>AGENT: {agent.id.toUpperCase()}</span>
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
                                        <div className="source-index">{idx + 1}</div>
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
