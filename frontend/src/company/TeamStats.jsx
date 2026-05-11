import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './TeamStats.css';

const TeamStats = () => {
    const [financeData, setFinanceData] = useState(null);
    const [projectStats, setProjectStats] = useState([]);
    const [loading, setLoading] = useState(true);

    const AGENTS = [
        { id: "lead", name: "Team Orchestrator", color: "purple" },
        { id: "soft", name: "Software Team", color: "cyan" },
        { id: "docs", name: "Document Team", color: "blue" },
        { id: "mon", name: "Monitoring System", color: "red" },
        { id: "scout", name: "Web Scout", color: "orange" },
        { id: "analyst", name: "Research Analyst", color: "pink" },
        { id: "content", name: "Content Producer", color: "yellow" }
    ];

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [financeRes, projectsRes] = await Promise.all([
                    axios.get('http://localhost:8000/api/system/finance'),
                    axios.get('http://localhost:8000/api/system/projects-stats')
                ]);
                setFinanceData(financeRes.data);
                setProjectStats(projectsRes.data);
            } catch (err) {
                console.error("Failed to fetch statistics", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return <div className="stats-loading">CALIBRATING NEURAL METRICS...</div>;

    return (
        <div className="team-stats-container">
            <div className="stats-header">
                <h2>TEAM PERFORMANCE ARCHIVE</h2>
                <div className="total-metrics">
                    <div className="metric-box">
                        <span className="label">TOTAL KP CONSUMED</span>
                        <span className="value">{financeData?.spent?.toFixed(1) || 0}</span>
                    </div>
                    <div className="metric-box">
                        <span className="label">FLEET STATUS</span>
                        <span className="value green">OPTIMAL</span>
                    </div>
                </div>
            </div>

            <div className="stats-grid">
                {AGENTS.map(agent => {
                    const data = financeData?.agents?.[agent.id] || { tokens: 0, kessoku: 0 };
                    // Normalize bar (max 5000 tokens for scale)
                    const tokenPercentage = Math.min(100, (data.tokens / 5000) * 100);
                    const kpPercentage = Math.min(100, (data.kessoku / 500) * 100);

                    return (
                        <div className={`agent-stat-card ${agent.color}`} key={agent.id}>
                            <div className="card-header">
                                <span className="agent-name">{agent.name.toUpperCase()}</span>
                                <span className="agent-id">{agent.id}</span>
                            </div>
                            
                            <div className="stat-bars">
                                <div className="bar-group">
                                    <div className="bar-label">
                                        <span>TOKENS GENERATED</span>
                                        <span>{data.tokens}</span>
                                    </div>
                                    <div className="bar-bg">
                                        <div className="bar-fill token" style={{ width: `${tokenPercentage}%` }}></div>
                                    </div>
                                </div>

                                <div className="bar-group">
                                    <div className="bar-label">
                                        <span>KESSOKU POINTS (KP)</span>
                                        <span>{data.kessoku.toFixed(1)}</span>
                                    </div>
                                    <div className="bar-bg">
                                        <div className="bar-fill kp" style={{ width: `${kpPercentage}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <div className="card-footer">
                                <span className="efficiency">EFFICIENCY: 98.4%</span>
                                <span className="status">SYNCED</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="projects-stats-section">
                <div className="section-header">
                    <h3>ACTIVE ORDERS / PROJECTS ANALYTICS</h3>
                    <p>Metrics based on generated sentences and estimated token value per project.</p>
                </div>
                
                <div className="projects-grid">
                    {projectStats.length > 0 ? projectStats.map((project, idx) => {
                        // Scale relative to max tokens in list
                        const maxTokens = Math.max(...projectStats.map(p => p.tokens)) || 1;
                        const barWidth = (project.tokens / maxTokens) * 100;

                        return (
                            <div className="project-stat-row" key={project.name}>
                                <div className="project-info">
                                    <span className="project-name">{project.name}</span>
                                    <span className="project-details">
                                        {project.notes_count} Notes | {project.sentence_count} Sentences
                                    </span>
                                </div>
                                <div className="project-bar-container">
                                    <div className="project-bar" style={{ width: `${barWidth}%` }}>
                                        <span className="token-value">{project.tokens.toLocaleString()} KP</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="no-data">NO PROJECT DATA DETECTED IN ARCHIVE</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeamStats;
