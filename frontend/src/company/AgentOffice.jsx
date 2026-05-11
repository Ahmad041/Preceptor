import React, { useState, useEffect } from 'react';
import AgentRoom from './AgentRoom';
import CommandConsole from './CommandConsole';
import axios from 'axios';
import './AgentOffice.css';

const AGENTS = [
    {
        id: "lead",
        name: "Project Lead",
        role: "Orchestrator & Strategy",
        character: "seika",
        color: "red",
        isMain: true,
    },
    {
        id: "soft",
        name: "Software Team",
        role: "Full-Stack & Systems",
        character: "bocchi",
        color: "cyan",
    },
    {
        id: "docs",
        name: "Document Team",
        role: "Admin & Standards",
        character: "ryo",
        color: "blue",
    },
    {
        id: "mon",
        name: "Monitoring System",
        role: "Stability Guardian",
        character: "pa-san",
        color: "purple",
    },
    {
        id: "scout",
        name: "Web Scout",
        role: "Digital Intelligence",
        character: "hiroi",
        color: "orange",
    },
    {
        id: "analyst",
        name: "Research Analyst",
        role: "Strategic Decisions",
        character: "kita",
        color: "pink",
    },
    {
        id: "content",
        name: "Content Producer",
        role: "Creative Voice",
        character: "nijika",
        color: "yellow",
    }
];

const AgentOffice = () => {
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [systemStats, setSystemStats] = useState(null);
    const [agentActivity, setAgentActivity] = useState({});
    const [financeData, setFinanceData] = useState(null);

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
        <div className="agent-office-container">
            <div className="office-scroll-area">
                <div className="office-grid">
                    {AGENTS.map(agent => (
                        <AgentRoom 
                            key={agent.id}
                            {...agent}
                            isActive={selectedAgent?.id === agent.id}
                            status={agentActivity[agent.id]?.status || "standby"}
                            logs={agentActivity[agent.id]?.logs || []}
                            activityBars={agentActivity[agent.id]?.activity_bars || []}
                            onClick={() => setSelectedAgent(agent)}
                            className={agent.isMain ? 'is-main' : ''}
                        />
                    ))}
                </div>
            </div>

            {/* FINANCE STATS PANEL */}
            <div className="finance-stats-panel">
                <div className="finance-header">
                    <h3>KESSOKU BUDGET MONITOR</h3>
                    <div className="total-spent">
                        TOTAL SPENT: <span>{financeData?.spent?.toFixed(1) || 0} KP</span>
                    </div>
                </div>
                <div className="finance-bars-container">
                    {AGENTS.map(agent => {
                        const agentFin = financeData?.agents?.[agent.id] || { kessoku: 0 };
                        // Max bar width reference (e.g. 5000 KP)
                        const percentage = Math.min(100, (agentFin.kessoku / 2000) * 100);
                        
                        return (
                            <div className="finance-row" key={agent.id}>
                                <div className="agent-label">
                                    <span className={`dot ${agent.color}`}></span>
                                    {agent.id.toUpperCase()}
                                </div>
                                <div className="bar-wrapper">
                                    <div 
                                        className={`bar ${agent.color}`} 
                                        style={{ width: `${percentage}%` }}
                                    ></div>
                                    <span className="value-label">{agentFin.kessoku?.toFixed(0)} KP</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="finance-footer">
                    *1 token ≈ 0.1 Kessoku Points (KP)
                </div>
            </div>

            {selectedAgent && (
                <CommandConsole 
                    agent={selectedAgent} 
                    onClose={() => setSelectedAgent(null)} 
                    sources={agentActivity[selectedAgent.id]?.sources || []}
                    logs={agentActivity[selectedAgent.id]?.logs || []}
                />
            )}

            <div className="agent-status-footer">
                <div className="status-item">
                    <span className="label">AGENTS:</span>
                    <span className="value">
                        {systemStats 
                            ? `${systemStats.active_agents}/${systemStats.total_agents}` 
                            : '0/6'}
                    </span>
                </div>
                <div className="status-item">
                    <span className="label">CPU:</span>
                    <span className="value">
                        {systemStats ? `${systemStats.cpu_percent}%` : '--'}
                    </span>
                </div>
                <div className="status-item">
                    <span className="label">RAM:</span>
                    <span className="value">
                        {systemStats 
                            ? `${systemStats.ram_used_gb}/${systemStats.ram_total_gb}GB` 
                            : '--'}
                    </span>
                </div>
                <div className="status-item">
                    <span className="label">UPTIME:</span>
                    <span className="value">
                        {systemStats ? systemStats.uptime : '--'}
                    </span>
                </div>
                <div className="mission-title">
                    MISSION CONTROL: INKY ONLINE
                    {systemStats && (
                        <span className="live-dot" title={`Last sync: ${systemStats.timestamp}`}></span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgentOffice;
