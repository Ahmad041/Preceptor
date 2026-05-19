import React, { useState, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import GatherEngine from './GatherEngine';
import GatherEngine3D from './GatherEngine3D';
import CommandConsole from './CommandConsole';
import axios from 'axios';
import './AgentOffice.css';

const AGENTS = [
    {
        id: "lead",
        name: "Project Lead",
        role: "Orchestrator & Strategy",
        character: "seika",
        color: "#e74c3c",
        isMain: true,
    },
    {
        id: "soft",
        name: "Software Team",
        role: "Full-Stack & Systems",
        character: "bocchi",
        color: "#3498db",
    },
    {
        id: "docs",
        name: "Document Team",
        role: "Admin & Standards",
        character: "ryo",
        color: "#2ecc71",
    },
    {
        id: "mon",
        name: "Monitoring System",
        role: "Stability Guardian",
        character: "pa-san",
        color: "#f39c12",
    },
    {
        id: "scout",
        name: "Web Scout",
        role: "Digital Intelligence",
        character: "hiroi",
        color: "#9b59b6",
    },
    {
        id: "analyst",
        name: "Research Analyst",
        role: "Strategic Decisions",
        character: "kita",
        color: "#1abc9c",
    },
    {
        id: "content",
        name: "Content Producer",
        role: "Creative Voice",
        character: "nijika",
        color: "#e91e63",
    }
];

const AgentOffice = ({ isFullscreen, onToggleFullscreen }) => {
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [systemStats, setSystemStats] = useState(null);
    const [is3DMode, setIs3DMode] = useState(true);
    const [agentActivity, setAgentActivity] = useState({});
    const [financeData, setFinanceData] = useState(null);

    const [consoleHistory, setConsoleHistory] = useState({});

    // Poll system stats setiap 3 detik
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/system/stats');
                setSystemStats(res.data);
            } catch (err) {
                // Silent fail — server mungkin belum siap
            }
        };
        
        fetchStats(); // Initial fetch
        const interval = setInterval(fetchStats, 3000);
        return () => clearInterval(interval);
    }, []);

    // Poll agent activity setiap 3 detik
    useEffect(() => {
        const fetchActivity = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/agent/activity');
                setAgentActivity(res.data);
            } catch (err) {
                // Silent fail
            }
        };

        fetchActivity(); // Initial fetch
        const interval = setInterval(fetchActivity, 3000);
        return () => clearInterval(interval);
    }, []);

    // Poll finance data setiap 5 detik
    useEffect(() => {
        const fetchFinance = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/system/finance');
                setFinanceData(res.data);
            } catch (err) {
                // Silent fail
            }
        };

        fetchFinance();
        const interval = setInterval(fetchFinance, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSelectAgent = (agent) => {
        setSelectedAgent(agent);
    };

    return (
        <div className={`agent-office-container ${isFullscreen ? 'fullscreen' : ''}`}>
            {/* Left Sidebar for Stats and Activity */}
            <div className="delegation-sidebar">
                <div className="sidebar-header">
                    <h2>SYSTEM STATUS</h2>
                    {systemStats && <div className="live-indicator"></div>}
                </div>
                
                <div className="sidebar-section">
                    <div className="stat-row">
                        <span className="stat-label">AGENTS</span>
                        <span className="stat-value">{systemStats ? `${systemStats.active_agents}/${systemStats.total_agents}` : '0/6'}</span>
                    </div>
                    <div className="stat-row">
                        <span className="stat-label">CPU</span>
                        <span className="stat-value">{systemStats ? `${systemStats.cpu_percent}%` : '--'}</span>
                    </div>
                    <div className="stat-row">
                        <span className="stat-label">RAM</span>
                        <span className="stat-value">{systemStats ? `${systemStats.ram_used_gb}/${systemStats.ram_total_gb}GB` : '--'}</span>
                    </div>
                    <div className="stat-row">
                        <span className="stat-label">UPTIME</span>
                        <span className="stat-value">{systemStats ? systemStats.uptime : '--'}</span>
                    </div>
                </div>

                <div className="sidebar-header" style={{ marginTop: '20px' }}>
                    <h2>AGENT ACTIVITY</h2>
                </div>
                <div className="sidebar-activity-list">
                    {AGENTS.map(agent => (
                        <div key={agent.id} className="activity-item" onClick={() => handleSelectAgent(agent)}>
                            <div className="activity-agent-name" style={{ color: agent.color }}>
                                {agent.name}
                            </div>
                            <div className="activity-agent-status">
                                {agentActivity[agent.id] ? 
                                    (typeof agentActivity[agent.id] === 'string' ? agentActivity[agent.id] : agentActivity[agent.id].task || 'Idle') 
                                    : 'Idle'}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Area */}
            <div className="office-main-area">
                <div className="top-actions">
                    <button onClick={onToggleFullscreen} className="delegation-btn">
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                    {!isFullscreen && (
                        <button onClick={() => setIs3DMode(!is3DMode)} className="delegation-btn primary">
                            {is3DMode ? 'Switch to 2D' : 'Switch to 3D Dorm'}
                        </button>
                    )}
                </div>

                <div className="office-scroll-area">
                    <ErrorBoundary fallbackRender={({error}) => <div style={{padding: 20, color: 'red'}}><h2>Crash</h2><pre>{error.message}</pre></div>}>
                        {is3DMode ? (
                            <GatherEngine3D 
                                agents={AGENTS}
                                onSelectAgent={handleSelectAgent}
                                agentActivity={agentActivity}
                                financeData={financeData}
                                isFullscreen={isFullscreen}
                            />
                        ) : (
                            <GatherEngine 
                                agents={AGENTS}
                                onSelectAgent={handleSelectAgent}
                                agentActivity={agentActivity}
                                financeData={financeData}
                                isFullscreen={isFullscreen}
                            />
                        )}
                    </ErrorBoundary>
                </div>
            </div>

            {selectedAgent && (
                <CommandConsole 
                    agent={selectedAgent} 
                    onClose={() => setSelectedAgent(null)} 
                    sources={agentActivity[selectedAgent.id]?.sources || []}
                    logs={agentActivity[selectedAgent.id]?.logs || []}
                    history={consoleHistory[selectedAgent.id] || []}
                    setHistory={(newHistory) => {
                        setConsoleHistory(prev => {
                            const currentHistory = prev[selectedAgent.id] || [];
                            const resolvedHistory = typeof newHistory === 'function' ? newHistory(currentHistory) : newHistory;
                            return {
                                ...prev,
                                [selectedAgent.id]: resolvedHistory
                            };
                        });
                    }}
                />
            )}
        </div>
    );
};

export default AgentOffice;
