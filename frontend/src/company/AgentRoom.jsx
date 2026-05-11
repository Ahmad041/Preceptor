import React from 'react';
import './AgentOffice.css';

const STATUS_LABELS = {
    standby: "STANDBY",
    processing: "PROCESSING",
    done: "DONE",
    error: "ERROR"
};

const STATUS_CLASSES = {
    standby: "",
    processing: "status-processing",
    done: "status-done",
    error: "status-error"
};

const LOG_TYPE_CLASSES = {
    info: "log-info",
    tool: "log-tool",
    error: "log-error",
    system: "log-system",
    success: "log-success"
};

const AgentRoom = ({ 
    id, 
    name, 
    role, 
    color, 
    character, 
    status = "standby",
    logs = [],
    activityBars = [],
    isActive = false,
    className = "",
    onClick
}) => {
    const statusLabel = STATUS_LABELS[status] || "STANDBY";
    const statusClass = STATUS_CLASSES[status] || "";

    return (
        <div 
            className={`agent-room-card ${color} ${isActive ? 'active-room' : ''} ${statusClass} ${className}`} 
            id={id} 
            onClick={onClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="room-header">
                <div className="room-title">
                    <span className={`status-dot ${status === 'processing' ? 'pulse' : ''} ${status === 'error' ? 'error-dot' : ''}`}></span>
                    <h3>{name}</h3>
                </div>
                <div className="room-id">ID_{id.toUpperCase()}</div>
            </div>

            <div className="room-content">
                <div className="character-view">
                    <div className={`character-sprite ${character}`}>
                        {/* Character icon or SVG will go here */}
                        <div className="pixel-avatar"></div>
                    </div>
                    <div className="agent-badge">{role}</div>
                </div>

                <div className="terminal-view">
                    <div className="terminal-header">
                        CONSOLE_LOG
                        {status === 'processing' && <span className="live-indicator">● LIVE</span>}
                    </div>
                    <div className="terminal-body">
                        {logs.length === 0 ? (
                            <div className="log-line log-idle">
                                <span className="timestamp">[--:--]</span>
                                <span className="text">Awaiting commands...</span>
                            </div>
                        ) : (
                            logs.map((log, idx) => (
                                <div key={idx} className={`log-line ${LOG_TYPE_CLASSES[log.type] || ''}`}>
                                    <span className="timestamp">[{log.timestamp}]</span>
                                    <span className="text">{log.message}</span>
                                </div>
                            ))
                        )}
                        <div className="typing-cursor">_</div>
                    </div>
                </div>
            </div>

            <div className="room-footer">
                <div className={`status-label ${statusClass}`}>
                    STATUS: <span className="status-value">{statusLabel}</span>
                </div>
                <div className="activity-graph">
                    {(activityBars.length > 0 ? activityBars : Array(12).fill(0.05)).map((val, i) => (
                        <div 
                            key={i} 
                            className="bar" 
                            style={{ 
                                height: `${Math.max(val * 100, 5)}%`, 
                                opacity: Math.max(val, 0.15) 
                            }}
                        ></div>
                    ))}
                </div>
            </div>

            {/* Neon Border Effects */}
            <div className="neon-line top"></div>
            <div className="neon-line bottom"></div>
        </div>
    );
};

export default AgentRoom;
