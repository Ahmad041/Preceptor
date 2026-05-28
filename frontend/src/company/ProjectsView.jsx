import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ProjectsView.css';

const ProjectsView = () => {
    const [financeData, setFinanceData] = useState(null);
    const [projectStats, setProjectStats] = useState([]);
    const [loading, setLoading] = useState(true);

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

    if (loading) return <div className="projects-loading">LOADING PROJECT METRICS...</div>;

    return (
        <div className="projects-view-container">
            <div className="finance-overview">
                <div className="finance-card primary">
                    <h3>KESSOKU POINTS (KP)</h3>
                    <div className="kp-value">{financeData?.spent?.toFixed(1) || 0}</div>
                    <p className="subtitle">Total AI Token Expenditure</p>
                </div>
                <div className="finance-card">
                    <h3>ACTIVE PROJECTS</h3>
                    <div className="kp-value">{projectStats.length}</div>
                    <p className="subtitle">Tracked in Knowledge Base</p>
                </div>
            </div>

            <div className="projects-list-section">
                <h2>PROJECT ANALYTICS</h2>
                <div className="projects-table-container">
                    <table className="projects-table">
                        <thead>
                            <tr>
                                <th>PROJECT NAME</th>
                                <th>DOCUMENTS</th>
                                <th>SENTENCES</th>
                                <th>EST. TOKENS</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projectStats.length > 0 ? projectStats.map((project, idx) => (
                                <tr key={idx}>
                                    <td className="proj-name">{project.name}</td>
                                    <td>{project.notes_count}</td>
                                    <td>{project.sentence_count}</td>
                                    <td className="proj-tokens">{project.tokens.toLocaleString()}</td>
                                    <td><span className="status-badge active">ACTIVE</span></td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="5" className="empty-row">No projects found in the archive.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProjectsView;
