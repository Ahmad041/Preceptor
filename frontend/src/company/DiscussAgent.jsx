import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import AgentDM from './AgentDM';
import './DiscussAgent.css';

const API = 'http://localhost:8000/api/simulation';

// ── Mood emoji mapping ──
const MOOD_EMOJI = {
    neutral: '😐', happy: '😊', angry: '😠', sad: '😢',
    excited: '🤩', worried: '😟', confused: '🤔', confident: '😎'
};

const DiscussAgent = () => {
    // ── Phase: 'setup' | 'loading' | 'simulation' | 'report' ──
    const [phase, setPhase] = useState('setup');

    // Setup state
    const [files, setFiles] = useState([]);
    const [scenario, setScenario] = useState('');
    const [hardwareInfo, setHardwareInfo] = useState(null);
    const [inputMaxTurns, setInputMaxTurns] = useState(20);
    const [inputMaxAgents, setInputMaxAgents] = useState(4);

    // Simulation state
    const [simId, setSimId] = useState(null);
    const [agents, setAgents] = useState([]);
    const [logs, setLogs] = useState([]);
    const [simStatus, setSimStatus] = useState('');
    const [currentTurn, setCurrentTurn] = useState(0);
    const [maxTurns, setMaxTurns] = useState(20);
    const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'timeline'
    const [injectText, setInjectText] = useState('');

    // DM state
    const [dmAgent, setDmAgent] = useState(null);

    // Report state
    const [reportContent, setReportContent] = useState('');

    const logsEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const pollRef = useRef(null);

    // ── Fetch hardware info on mount ──
    useEffect(() => {
        axios.get(`${API}/hardware-info`)
            .then(res => {
                const info = res.data.hardware || res.data;
                setHardwareInfo(info);
                setInputMaxTurns(info.max_turns || 20);
            })
            .catch(() => {
                setHardwareInfo({ vram_gb: 0, ram_gb: 8, max_agents: 3, recommended_model: 'gemma2:2b' });
                setInputMaxTurns(20);
            });
    }, []);

    // ── Poll simulation status + logs while running ──
    useEffect(() => {
        if (phase === 'simulation' && simId) {
            const poll = async () => {
                try {
                    const [statusRes, logsRes] = await Promise.all([
                        axios.get(`${API}/${simId}/status`),
                        axios.get(`${API}/${simId}/logs?per_page=200`)
                    ]);
                    if (statusRes.data.simulation) {
                        setSimStatus(statusRes.data.simulation.status);
                        setCurrentTurn(statusRes.data.simulation.current_turn);
                        setAgents(statusRes.data.agents || []);
                    }
                    if (logsRes.data.logs) {
                        setLogs(logsRes.data.logs);
                    }
                } catch (err) {
                    console.error('Poll error:', err);
                }
            };
            poll(); // immediate first poll
            pollRef.current = setInterval(poll, 3000);
            return () => clearInterval(pollRef.current);
        }
    }, [phase, simId]);

    // ── Auto-scroll logs ──
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // ── File handling ──
    const handleFileSelect = (e) => {
        const selected = Array.from(e.target.files);
        setFiles(prev => [...prev, ...selected]);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    // ── Start simulation ──
    const startSimulation = async () => {
        if (files.length === 0 && !scenario.trim()) return;
        setPhase('loading');

        try {
            const formData = new FormData();
            files.forEach(f => formData.append('files', f));
            formData.append('scenario', scenario || 'Analisis situasi berdasarkan dokumen yang diberikan.');
            formData.append('max_turns', inputMaxTurns.toString());
            formData.append('max_agents', inputMaxAgents.toString());

            const res = await axios.post(`${API}/start`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.sim_id) {
                setSimId(res.data.sim_id);
                setAgents(res.data.agents || []);
                setMaxTurns(res.data.max_turns || 20);
                setSimStatus('running');
                setPhase('simulation');
            } else {
                alert('Gagal memulai simulasi: ' + (res.data.message || 'Unknown error'));
                setPhase('setup');
            }
        } catch (err) {
            console.error('Start error:', err);
            alert('Error memulai simulasi: ' + (err.response?.data?.message || err.message));
            setPhase('setup');
        }
    };

    // ── Inject event ──
    const injectEvent = async () => {
        if (!injectText.trim() || !simId) return;
        try {
            await axios.post(`${API}/${simId}/inject`, { event: injectText });
            setInjectText('');
        } catch (err) {
            console.error('Inject error:', err);
        }
    };

    // ── Stop simulation ──
    const stopSimulation = async () => {
        if (!simId) return;
        try {
            await axios.post(`${API}/${simId}/stop`);
            setSimStatus('stopped');
            clearInterval(pollRef.current);
        } catch (err) {
            console.error('Stop error:', err);
        }
    };

    // ── Generate report ──
    const generateReport = async () => {
        if (!simId) return;
        setPhase('loading');
        try {
            const res = await axios.get(`${API}/${simId}/report`);
            setReportContent(res.data.report || 'Tidak ada data laporan.');
            setPhase('report');
            clearInterval(pollRef.current);
        } catch (err) {
            console.error('Report error:', err);
            setReportContent('Gagal menghasilkan laporan.');
            setPhase('report');
        }
    };

    // ── New simulation ──
    const resetAll = () => {
        clearInterval(pollRef.current);
        setPhase('setup');
        setFiles([]);
        setScenario('');
        setSimId(null);
        setAgents([]);
        setLogs([]);
        setSimStatus('');
        setCurrentTurn(0);
        setReportContent('');
        setDmAgent(null);
    };

    // ══════════════════════════════════════════════════
    // RENDER: SETUP PHASE
    // ══════════════════════════════════════════════════
    if (phase === 'setup') {
        return (
            <div className="discuss-agent-container">
                <div className="setup-phase">
                    <div className="setup-header">
                        <h2>🤖 Discuss Agent</h2>
                        <p>Upload materi referensi dan deskripsikan skenario. Agen AI akan mensimulasikan interaksi dan memprediksi hasilnya.</p>
                    </div>

                    {hardwareInfo && (
                        <div className="hardware-info-card">
                            <div className="hw-stat">
                                <span className="hw-label">VRAM</span>
                                <span className={`hw-value ${hardwareInfo.vram_gb >= 8 ? 'good' : hardwareInfo.vram_gb >= 4 ? 'medium' : 'low'}`}>
                                    {hardwareInfo.vram_gb?.toFixed(1)} GB
                                </span>
                            </div>
                            <div className="hw-stat">
                                <span className="hw-label">RAM</span>
                                <span className="hw-value">{hardwareInfo.ram_gb?.toFixed(1)} GB</span>
                            </div>
                            <div className="hw-stat">
                                <span className="hw-label">Max Agen</span>
                                <span className="hw-value good">{hardwareInfo.max_agents}</span>
                            </div>
                            <div className="hw-stat">
                                <span className="hw-label">Model</span>
                                <span className="hw-value">{hardwareInfo.recommended_model}</span>
                            </div>
                        </div>
                    )}

                    <div className="setup-form">
                        <div
                            className={`upload-zone ${files.length > 0 ? 'has-files' : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,.txt,.docx,.md,.json"
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                            <div className="upload-icon">📁</div>
                            <div className="upload-text">
                                <strong>Klik untuk upload</strong> atau seret file ke sini<br />
                                PDF, TXT, DOCX, MD, JSON
                            </div>
                            {files.length > 0 && (
                                <div className="uploaded-files">
                                    {files.map((f, i) => (
                                        <div key={i} className="file-chip">
                                            📄 {f.name}
                                            <span className="remove-file" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>✕</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <textarea
                            className="scenario-input"
                            placeholder="Deskripsikan skenario yang ingin kamu eksplorasi...&#10;Contoh: 'Apa yang terjadi jika perusahaan X mengakuisisi perusahaan Y?'"
                            value={scenario}
                            onChange={(e) => setScenario(e.target.value)}
                        />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                            <label style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Jumlah Putaran (Max Turns):</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="100"
                                value={inputMaxTurns} 
                                onChange={(e) => setInputMaxTurns(parseInt(e.target.value) || 20)}
                                style={{
                                    width: '100%', padding: '0.5rem', background: 'rgba(15,23,42,0.6)', 
                                    border: '1px solid #334155', borderRadius: '4px', color: '#fff'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                            <label style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Jumlah Agent:</label>
                            <input 
                                type="number" 
                                min="2" 
                                max="10"
                                value={inputMaxAgents} 
                                onChange={(e) => setInputMaxAgents(parseInt(e.target.value) || 4)}
                                style={{
                                    width: '100%', padding: '0.5rem', background: 'rgba(15,23,42,0.6)', 
                                    border: '1px solid #334155', borderRadius: '4px', color: '#fff'
                                }}
                            />
                        </div>

                        <button
                            className="start-simulation-btn"
                            onClick={startSimulation}
                            disabled={files.length === 0 && !scenario.trim()}
                        >
                            ⚡ Mulai Simulasi
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════
    // RENDER: LOADING PHASE
    // ══════════════════════════════════════════════════
    if (phase === 'loading') {
        return (
            <div className="discuss-agent-container">
                <div className="setup-phase">
                    <div className="setup-loading">
                        <div className="loading-spinner" />
                        <div className="loading-text">Memproses dokumen dan membuat agen AI...</div>
                    </div>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════
    // RENDER: REPORT PHASE
    // ══════════════════════════════════════════════════
    if (phase === 'report') {
        return (
            <div className="discuss-agent-container">
                <div className="report-phase">
                    <div className="report-header">
                        <h2>📊 Laporan Prediksi</h2>
                        <p>Hasil analisis dari simulasi multi-agen</p>
                    </div>
                    <div className="report-content" dangerouslySetInnerHTML={{
                        __html: reportContent
                            .replace(/### (.*)/g, '<h3>$1</h3>')
                            .replace(/## (.*)/g, '<h2>$1</h2>')
                            .replace(/# (.*)/g, '<h1>$1</h1>')
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
                    }} />
                    <div className="report-actions">
                        <button className="report-btn secondary" onClick={() => setPhase('simulation')}>
                            ← Kembali ke Simulasi
                        </button>
                        <button className="report-btn primary" onClick={resetAll}>
                            🔄 Simulasi Baru
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════
    // RENDER: SIMULATION PHASE
    // ══════════════════════════════════════════════════
    return (
        <div className="discuss-agent-container">
            <div className="simulation-phase">
                {/* Toolbar */}
                <div className="sim-toolbar">
                    <div className="sim-info">
                        <span className="sim-title">Simulasi Aktif</span>
                        <span className="sim-turn-badge">Turn {currentTurn}/{maxTurns}</span>
                        <span className={`sim-status-badge ${simStatus}`}>{simStatus}</span>
                    </div>
                    <div className="sim-controls">
                        <div className="view-mode-toggle">
                            <button
                                className={`view-mode-btn ${viewMode === 'chat' ? 'active' : ''}`}
                                onClick={() => setViewMode('chat')}
                            >
                                💬 Chat
                            </button>
                            <button
                                className={`view-mode-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                                onClick={() => setViewMode('timeline')}
                            >
                                📜 Timeline
                            </button>
                        </div>
                        <button className="sim-control-btn report" onClick={generateReport}>
                            📊 Report
                        </button>
                        {simStatus === 'running' && (
                            <button className="sim-control-btn danger" onClick={stopSimulation}>
                                ⏹ Stop
                            </button>
                        )}
                    </div>
                </div>

                {/* 3-Panel Body */}
                <div className="sim-body">
                    {/* LEFT: Agent List */}
                    <div className="agents-panel">
                        <div className="agents-panel-title">Agen ({agents.length})</div>
                        {agents.map(agent => (
                            <div
                                key={agent.id}
                                className={`agent-card ${dmAgent?.id === agent.id ? 'active' : ''}`}
                                onClick={() => setDmAgent(agent)}
                            >
                                <div
                                    className="agent-avatar"
                                    style={{ background: agent.avatar_color || '#6366f1' }}
                                >
                                    {agent.name?.[0]?.toUpperCase() || '?'}
                                    <span className="mood-indicator">
                                        {MOOD_EMOJI[agent.mood] || '😐'}
                                    </span>
                                </div>
                                <div className="agent-info">
                                    <div className="agent-name">{agent.name}</div>
                                    <div className="agent-role">{agent.persona?.slice(0, 40) || 'Agent'}...</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* CENTER: Chat/Timeline */}
                    <div className="center-panel">
                        <div className="logs-container">
                            {logs.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#475569', padding: '2rem' }}>
                                    Menunggu interaksi agen pertama...
                                </div>
                            )}

                            {viewMode === 'chat' ? (
                                // ── CHAT GROUP VIEW ──
                                logs.map((log, i) => {
                                    if (log.action_type === 'intervention') {
                                        return (
                                            <div key={i} className="chat-message system">
                                                <div className="chat-content">
                                                    ⚡ INTERVENSI: {log.content}
                                                </div>
                                            </div>
                                        );
                                    }
                                    const agent = agents.find(a => a.id === log.agent_id);
                                    return (
                                        <div key={i} className="chat-message">
                                            <div
                                                className="chat-avatar"
                                                style={{ background: agent?.avatar_color || '#6366f1' }}
                                            >
                                                {log.agent_name?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div className="chat-body">
                                                <div className="chat-name" style={{ color: agent?.avatar_color || '#818cf8' }}>
                                                    {log.agent_name}
                                                    {log.target_agent_id && (
                                                        <span style={{ color: '#475569', fontWeight: 400 }}>
                                                            {' → '}{agents.find(a => a.id === log.target_agent_id)?.name || '?'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="chat-content">{log.content}</div>
                                                <div className="chat-meta">Turn {log.turn}</div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                // ── TIMELINE VIEW ──
                                logs.map((log, i) => (
                                    <div key={i} className={`timeline-entry ${log.action_type === 'intervention' ? 'intervention' : ''}`}>
                                        <div className="timeline-turn">T{log.turn}</div>
                                        <div className="timeline-body">
                                            <div className="timeline-agent-name" style={{ color: agents.find(a => a.id === log.agent_id)?.avatar_color || '#818cf8' }}>
                                                {log.action_type === 'intervention' ? '⚡ INTERVENSI' : log.agent_name}
                                            </div>
                                            <div className="timeline-content">{log.content}</div>
                                            <div className="timeline-timestamp">{log.timestamp}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </div>

                    {/* RIGHT: Control Panel */}
                    <div className="control-panel">
                        <div className="control-section">
                            <div className="control-section-title">Statistik</div>
                            <div className="sim-stats-grid">
                                <div className="sim-stat-card">
                                    <div className="stat-value">{agents.length}</div>
                                    <div className="stat-label">Agen</div>
                                </div>
                                <div className="sim-stat-card">
                                    <div className="stat-value">{currentTurn}</div>
                                    <div className="stat-label">Turn</div>
                                </div>
                                <div className="sim-stat-card">
                                    <div className="stat-value">{logs.length}</div>
                                    <div className="stat-label">Interaksi</div>
                                </div>
                                <div className="sim-stat-card">
                                    <div className="stat-value">{maxTurns}</div>
                                    <div className="stat-label">Max Turn</div>
                                </div>
                            </div>
                        </div>

                        <div className="control-section">
                            <div className="control-section-title">⚡ Intervensi (God Mode)</div>
                            <div className="inject-form">
                                <textarea
                                    className="inject-input"
                                    placeholder="Masukkan kejadian mendadak...&#10;Contoh: 'Terjadi krisis ekonomi global'"
                                    value={injectText}
                                    onChange={(e) => setInjectText(e.target.value)}
                                />
                                <button
                                    className="inject-btn"
                                    onClick={injectEvent}
                                    disabled={!injectText.trim() || simStatus !== 'running'}
                                >
                                    ⚡ Injeksi Kejadian
                                </button>
                            </div>
                        </div>

                        <div className="control-section">
                            <div className="control-section-title">Aksi</div>
                            <button
                                className="sim-control-btn"
                                style={{ width: '100%', justifyContent: 'center', marginBottom: '0.5rem' }}
                                onClick={generateReport}
                            >
                                📊 Generate Laporan
                            </button>
                            <button
                                className="sim-control-btn"
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={resetAll}
                            >
                                🔄 Simulasi Baru
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* DM Modal */}
            {dmAgent && (
                <AgentDM
                    agent={dmAgent}
                    simId={simId}
                    onClose={() => setDmAgent(null)}
                />
            )}
        </div>
    );
};

export default DiscussAgent;
