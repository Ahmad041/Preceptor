import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './RnDView.css';

const RnDView = () => {
    const [topic, setTopic] = useState('');
    const [status, setStatus] = useState(null);
    const [reports, setReports] = useState([]);
    const [loadingReports, setLoadingReports] = useState(true);
    const [expandedReport, setExpandedReport] = useState(null);

    // Fetch active status and queue
    const fetchStatus = async () => {
        try {
            const res = await axios.get('http://localhost:8000/api/research/status');
            setStatus(res.data);
        } catch (err) {
            console.error("Failed to fetch research status", err);
        }
    };

    // Fetch historical reports
    const fetchReports = async () => {
        try {
            const res = await axios.get('http://localhost:8000/api/research/reports');
            setReports(res.data.reports || []);
        } catch (err) {
            console.error("Failed to fetch reports", err);
        } finally {
            setLoadingReports(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchReports();
        
        // Poll status every 5 seconds
        const interval = setInterval(() => {
            fetchStatus();
        }, 5000);
        
        return () => clearInterval(interval);
    }, []);

    const handleStartResearch = async (e) => {
        e.preventDefault();
        if (!topic.trim()) return;
        
        try {
            await axios.post('http://localhost:8000/api/research/start', { topic });
            setTopic('');
            fetchStatus(); // immediate update
        } catch (err) {
            console.error("Failed to start research", err);
        }
    };

    const handleDeleteReport = async (id, e) => {
        e.stopPropagation(); // prevent expanding
        if (!window.confirm("Delete this research report?")) return;
        
        try {
            await axios.delete(`http://localhost:8000/api/research/reports/${id}`);
            fetchReports();
        } catch (err) {
            console.error("Failed to delete report", err);
        }
    };

    const toggleExpand = (id) => {
        if (expandedReport === id) {
            setExpandedReport(null);
        } else {
            setExpandedReport(id);
        }
    };

    return (
        <div className="rnd-view-container">
            <header className="rnd-header">
                <h2>R&D Division <span>(AI Co-Scientist)</span></h2>
                <p>Autonomous Research Engine for discovering, gathering, and synthesizing knowledge.</p>
            </header>

            <div className="rnd-content-grid">
                {/* LEFT COLUMN: Controls & Status */}
                <div className="rnd-left-panel">
                    <div className="rnd-card new-research-card">
                        <h3>Initiate Research</h3>
                        <form onSubmit={handleStartResearch} className="rnd-form">
                            <input 
                                type="text" 
                                placeholder="Enter a complex topic to research..." 
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                className="rnd-input"
                            />
                            <button type="submit" className="rnd-btn primary-btn">Start R&D Protocol</button>
                        </form>
                    </div>

                    <div className="rnd-card status-card">
                        <h3>Engine Status</h3>
                        {status ? (
                            <div className="status-details">
                                <div className={`engine-indicator ${status.running ? 'active' : 'idle'}`}>
                                    <span className="dot"></span>
                                    {status.running ? 'ENGINE ONLINE' : 'ENGINE OFFLINE'}
                                </div>
                                
                                <div className="current-task">
                                    <h4>Current Task:</h4>
                                    {status.current_task ? (
                                        <div className="task-box active-task">
                                            <span className="spinner"></span>
                                            {status.current_task.topic}
                                        </div>
                                    ) : (
                                        <div className="task-box empty-task">Idle - No active research</div>
                                    )}
                                </div>

                                <div className="queue-list">
                                    <h4>Queue ({status.queue_length}):</h4>
                                    {status.queue && status.queue.length > 0 ? (
                                        <ul>
                                            {status.queue.map((q, idx) => (
                                                <li key={idx}>{q.topic}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="empty-queue">Queue is empty</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p>Loading status...</p>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: Reports Archive */}
                <div className="rnd-right-panel">
                    <div className="rnd-card reports-card">
                        <h3>Research Archives</h3>
                        <p className="subtitle">Synthesized reports stored in long-term memory (ChromaDB)</p>
                        
                        <div className="reports-list">
                            {loadingReports ? (
                                <p className="loading-text">Loading archives...</p>
                            ) : reports.length > 0 ? (
                                reports.map((report) => (
                                    <div 
                                        key={report.id} 
                                        className={`report-item ${expandedReport === report.id ? 'expanded' : ''}`}
                                        onClick={() => toggleExpand(report.id)}
                                    >
                                        <div className="report-header">
                                            <h4>{report.name.replace('Riset: ', '')}</h4>
                                            <button 
                                                className="delete-btn"
                                                onClick={(e) => handleDeleteReport(report.id, e)}
                                                title="Delete Report"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        {expandedReport === report.id && (
                                            <div className="report-body">
                                                <pre className="report-text">{report.chunk}</pre>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="empty-archives">
                                    <span className="icon">📂</span>
                                    <p>No research archives found.</p>
                                </div>
                            )}
                        </div>
                        <button className="rnd-btn secondary-btn refresh-btn" onClick={fetchReports}>
                            ↻ Refresh Archives
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RnDView;
