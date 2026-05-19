import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './CompanyMode.css';

const PulseLiveFeed = () => {
    const [logs, setLogs] = useState([]);
    const feedRef = useRef(null);

    // Initial mock logs or fetch from real API if you have a stream
    useEffect(() => {
        const initialLogs = [
            { id: 1, agent: 'KRONOS', type: 'system', message: 'NeuralOS Matrix Initialized. Syncing Cortex...', timestamp: new Date().toLocaleTimeString() },
            { id: 2, agent: 'ATLAS', type: 'data', message: 'Loading historical knowledge graph structures.', timestamp: new Date().toLocaleTimeString() }
        ];
        setLogs(initialLogs);

        // Polling agent activity to simulate live feed
        const interval = setInterval(async () => {
            try {
                // Adjust this endpoint if you have a different one for logs
                const res = await axios.get('http://localhost:8000/api/agent/activity');
                if (res.data && res.data.activity) {
                    const newLogs = res.data.activity.map((act, index) => ({
                        id: Date.now() + index,
                        agent: act.agent_name || 'SYSTEM',
                        type: act.status === 'working' ? 'action' : 'info',
                        message: act.current_task || 'Idle processing',
                        timestamp: new Date().toLocaleTimeString()
                    }));
                    
                    if (newLogs.length > 0) {
                        setLogs(prev => {
                            const updated = [...prev, ...newLogs];
                            // Keep only last 50 logs to prevent lag
                            return updated.slice(Math.max(updated.length - 50, 0));
                        });
                    }
                }
            } catch (error) {
                // Silently handle polling errors or push a connection error log
                /*
                setLogs(prev => [...prev, {
                    id: Date.now(), agent: 'SYSTEM', type: 'error', message: 'Connection to Core disrupted.', timestamp: new Date().toLocaleTimeString()
                }].slice(-50));
                */
            }
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
    }, [logs]);

    const getAgentColor = (agentName) => {
        const colors = {
            'Alpha': '#ff007f',
            'KRONOS': '#22d3ee',
            'ATLAS': '#fbbf24',
            'SYSTEM': '#4ade80'
        };
        return colors[agentName] || '#818cf8';
    };

    return (
        <div className="pulse-live-feed">
            <div className="feed-header">
                <span className="live-indicator"></span>
                <h3>PULSE · LIVE</h3>
            </div>
            <div className="feed-content" ref={feedRef}>
                {logs.map(log => (
                    <div key={log.id} className={`feed-item type-${log.type}`}>
                        <div className="feed-meta">
                            <span className="feed-agent" style={{ color: getAgentColor(log.agent) }}>[{log.agent}]</span>
                            <span className="feed-time">{log.timestamp}</span>
                        </div>
                        <div className="feed-message">
                            <span className="prompt-arrow">&gt;</span> {log.message}
                        </div>
                    </div>
                ))}
            </div>
            <div className="feed-input-area">
                <span className="prompt-prefix">root@cortex:~#</span>
                <input type="text" className="feed-input" placeholder="Enter query..." disabled />
            </div>
        </div>
    );
};

export default PulseLiveFeed;
