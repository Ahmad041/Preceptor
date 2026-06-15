import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000/api/simulation';

const AgentDM = ({ agent, simId, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Initial greeting
    useEffect(() => {
        setMessages([
            { sender: 'agent', text: `Halo, aku ${agent.name}. Ada yang ingin kamu bicarakan secara rahasia?` }
        ]);
    }, [agent]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
        setIsLoading(true);

        try {
            const res = await axios.post(`${API}/${simId}/chat/${agent.id}`, { message: userMsg });
            if (res.data.response) {
                setMessages(prev => [...prev, { sender: 'agent', text: res.data.response }]);
            } else {
                setMessages(prev => [...prev, { sender: 'agent', text: 'Maaf, aku tidak mengerti.' }]);
            }
        } catch (err) {
            console.error('DM Error:', err);
            setMessages(prev => [...prev, { sender: 'agent', text: 'Koneksiku sedang buruk, coba lagi nanti.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="dm-overlay" onClick={onClose}>
            <div className="dm-modal" onClick={e => e.stopPropagation()}>
                <div className="dm-header">
                    <div 
                        className="dm-agent-avatar" 
                        style={{ background: agent.avatar_color || '#6366f1' }}
                    >
                        {agent.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="dm-agent-info">
                        <div className="dm-agent-name">{agent.name}</div>
                        <div className="dm-agent-persona">{agent.persona?.slice(0, 50)}...</div>
                    </div>
                    <button className="dm-close-btn" onClick={onClose}>✕</button>
                </div>
                
                <div className="dm-messages">
                    {messages.map((msg, i) => (
                        <div key={i} className={`dm-msg ${msg.sender}`}>
                            {msg.text}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="dm-msg agent">
                            <span className="typing-indicator">Memikirkan balasan...</span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                
                <div className="dm-input-area">
                    <textarea 
                        className="dm-input"
                        placeholder="Tanyakan sesuatu secara rahasia..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                    />
                    <button 
                        className="dm-send-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                    >
                        Kirim
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AgentDM;
