import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './OverrideMode.css';

const API = 'http://localhost:8000';

const OverrideMode = () => {
    // Desktop Pilot state
    const [pendingActions, setPendingActions] = useState([]);
    const [actionHistory, setActionHistory] = useState([]);
    const [activePanel, setActivePanel] = useState('pilot'); // 'pilot', 'vision', 'history'
    
    // Vision state
    const [visionRunning, setVisionRunning] = useState(false);
    const [visionData, setVisionData] = useState(null);
    const [visionHistory, setVisionHistory] = useState([]);
    const [visionInterval, setVisionInterval] = useState(30);
    
    // Quick action form
    const [quickAction, setQuickAction] = useState('click');
    const [quickParams, setQuickParams] = useState('');
    
    // Notification
    const [notification, setNotification] = useState(null);
    const pollRef = useRef(null);

    const showNotification = (msg, type = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 3000);
    };

    // Poll pending actions
    const pollPending = useCallback(async () => {
        try {
            const [pendingRes, historyRes] = await Promise.all([
                axios.get(`${API}/api/desktop/pending`),
                axios.get(`${API}/api/desktop/history`)
            ]);
            setPendingActions(pendingRes.data.pending || []);
            setActionHistory(historyRes.data.history || []);
        } catch (e) {
            console.error('Poll error:', e);
        }
    }, []);

    // Poll vision state
    const pollVision = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/api/vision/status`);
            setVisionRunning(res.data.running);
            setVisionData(res.data.current);
        } catch (e) {
            console.error('Vision poll error:', e);
        }
    }, []);

    useEffect(() => {
        pollPending();
        pollVision();
        pollRef.current = setInterval(() => {
            pollPending();
            pollVision();
        }, 2000);
        return () => clearInterval(pollRef.current);
    }, [pollPending, pollVision]);

    // Action handlers
    const approveAction = async (actionId) => {
        try {
            await axios.post(`${API}/api/desktop/approve`, { action_id: actionId });
            showNotification('✅ Aksi disetujui dan dieksekusi!', 'success');
            pollPending();
        } catch (e) {
            showNotification('❌ Gagal approve aksi', 'error');
        }
    };

    const rejectAction = async (actionId) => {
        try {
            await axios.post(`${API}/api/desktop/reject`, { action_id: actionId });
            showNotification('🚫 Aksi ditolak.', 'warning');
            pollPending();
        } catch (e) {
            showNotification('❌ Gagal reject aksi', 'error');
        }
    };

    const submitQuickAction = async () => {
        if (!quickParams.trim()) return;
        try {
            let params = {};
            const parts = quickParams.split(',').map(s => s.trim());
            
            switch (quickAction) {
                case 'click':
                    params = { x: parseInt(parts[0]), y: parseInt(parts[1]), button: parts[2] || 'left', clicks: parseInt(parts[3]) || 1 };
                    break;
                case 'type':
                    params = { text: quickParams };
                    break;
                case 'press':
                    params = { key: quickParams.trim() };
                    break;
                case 'hotkey':
                    params = { keys: parts };
                    break;
                case 'scroll':
                    params = { amount: parseInt(parts[0]), x: parts[1] ? parseInt(parts[1]) : null, y: parts[2] ? parseInt(parts[2]) : null };
                    break;
                case 'screenshot_full':
                    params = {};
                    break;
                default:
                    params = {};
            }

            await axios.post(`${API}/api/desktop/request`, {
                action_type: quickAction,
                params,
                agent_id: 'user_manual'
            });
            showNotification('📨 Aksi dikirim ke antrian!', 'info');
            setQuickParams('');
            pollPending();
        } catch (e) {
            showNotification('❌ Gagal mengirim aksi', 'error');
        }
    };

    // Vision handlers
    const toggleVision = async () => {
        try {
            if (visionRunning) {
                await axios.post(`${API}/api/vision/stop`);
                showNotification('👁 Vision loop dihentikan.', 'warning');
            } else {
                await axios.post(`${API}/api/vision/start?interval=${visionInterval}`);
                showNotification('👁 Vision loop dimulai!', 'success');
            }
            pollVision();
        } catch (e) {
            showNotification('❌ Gagal toggle vision', 'error');
        }
    };

    const forceCaptureNow = async () => {
        try {
            const res = await axios.post(`${API}/api/vision/capture`);
            setVisionData(res.data);
            showNotification('📸 Screenshot captured!', 'success');
        } catch (e) {
            showNotification('❌ Gagal capture', 'error');
        }
    };

    const fetchVisionHistory = async () => {
        try {
            const res = await axios.get(`${API}/api/vision/history`);
            setVisionHistory(res.data.history || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (activePanel === 'history') fetchVisionHistory();
    }, [activePanel]);

    const getActionIcon = (type) => {
        const icons = {
            click: '🖱️', type: '⌨️', press: '🔘', hotkey: '⚡',
            scroll: '📜', screenshot_full: '📸', screenshot_region: '🖼️',
            move: '➡️', locate_image: '🔍'
        };
        return icons[type] || '🔧';
    };

    const getStatusColor = (status) => {
        const colors = {
            pending: '#fbbf24', executed: '#34d399', rejected: '#f87171', error: '#ef4444'
        };
        return colors[status] || '#888';
    };

    return (
        <div className="override-mode">
            {/* Notification Toast */}
            {notification && (
                <div className={`override-toast ${notification.type}`}>
                    {notification.msg}
                </div>
            )}

            {/* Header */}
            <div className="override-header">
                <div className="override-title-group">
                    <h1 className="override-title">
                        <span className="override-icon">⚡</span>
                        OVERRIDE MODE
                    </h1>
                    <span className="override-subtitle">Desktop Pilot + Vision Engine</span>
                </div>
                <div className="override-status-bar">
                    <div className={`status-indicator ${pendingActions.length > 0 ? 'pulse' : ''}`}>
                        <span className="status-dot" style={{ background: pendingActions.length > 0 ? '#fbbf24' : '#34d399' }} />
                        <span>{pendingActions.length} Pending</span>
                    </div>
                    <div className={`status-indicator ${visionRunning ? 'active' : ''}`}>
                        <span className="status-dot" style={{ background: visionRunning ? '#34d399' : '#666' }} />
                        <span>Vision: {visionRunning ? 'ON' : 'OFF'}</span>
                    </div>
                </div>
            </div>

            {/* Panel Tabs */}
            <div className="override-tabs">
                {['pilot', 'vision', 'history'].map(tab => (
                    <button
                        key={tab}
                        className={`override-tab ${activePanel === tab ? 'active' : ''}`}
                        onClick={() => setActivePanel(tab)}
                    >
                        {tab === 'pilot' && '🖱️ Desktop Pilot'}
                        {tab === 'vision' && '👁 Vision Engine'}
                        {tab === 'history' && '📋 History'}
                    </button>
                ))}
            </div>

            {/* ============ DESKTOP PILOT PANEL ============ */}
            {activePanel === 'pilot' && (
                <div className="override-panel">
                    {/* Quick Action Form */}
                    <div className="pilot-section">
                        <h3 className="section-title">⚡ Quick Action</h3>
                        <div className="quick-action-form">
                            <select
                                value={quickAction}
                                onChange={e => setQuickAction(e.target.value)}
                                className="action-select"
                            >
                                <option value="click">🖱️ Click</option>
                                <option value="type">⌨️ Type</option>
                                <option value="press">🔘 Press Key</option>
                                <option value="hotkey">⚡ Hotkey</option>
                                <option value="scroll">📜 Scroll</option>
                                <option value="screenshot_full">📸 Screenshot</option>
                            </select>
                            <input
                                type="text"
                                value={quickParams}
                                onChange={e => setQuickParams(e.target.value)}
                                placeholder={
                                    quickAction === 'click' ? 'x,y,button,clicks' :
                                    quickAction === 'type' ? 'teks yang ingin diketik' :
                                    quickAction === 'press' ? 'nama tombol (enter, tab, ...)' :
                                    quickAction === 'hotkey' ? 'ctrl,c atau alt,tab' :
                                    quickAction === 'scroll' ? 'jumlah (positif=atas)' :
                                    'kosong'
                                }
                                className="action-input"
                                onKeyDown={e => e.key === 'Enter' && submitQuickAction()}
                                disabled={quickAction === 'screenshot_full'}
                            />
                            <button className="action-submit" onClick={submitQuickAction}>
                                Send →
                            </button>
                        </div>
                    </div>

                    {/* Pending Actions */}
                    <div className="pilot-section">
                        <h3 className="section-title">
                            ⏳ Pending Confirmation
                            {pendingActions.length > 0 && (
                                <span className="pending-badge">{pendingActions.length}</span>
                            )}
                        </h3>
                        <div className="actions-list">
                            {pendingActions.length === 0 ? (
                                <div className="empty-actions">
                                    <span className="empty-icon">✨</span>
                                    <p>Tidak ada aksi yang menunggu konfirmasi.</p>
                                </div>
                            ) : (
                                pendingActions.map(action => (
                                    <div key={action.action_id} className="action-card pending">
                                        <div className="action-info">
                                            <span className="action-icon">{getActionIcon(action.action_type)}</span>
                                            <div className="action-details">
                                                <span className="action-type">{action.action_type.toUpperCase()}</span>
                                                <span className="action-params">{JSON.stringify(action.params)}</span>
                                                <span className="action-meta">
                                                    Agent: {action.agent_id} • {new Date(action.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="action-buttons">
                                            <button 
                                                className="btn-approve" 
                                                onClick={() => approveAction(action.action_id)}
                                            >
                                                ✅ Approve
                                            </button>
                                            <button 
                                                className="btn-reject" 
                                                onClick={() => rejectAction(action.action_id)}
                                            >
                                                ❌ Reject
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ============ VISION ENGINE PANEL ============ */}
            {activePanel === 'vision' && (
                <div className="override-panel">
                    <div className="vision-controls">
                        <div className="vision-toggle-group">
                            <button 
                                className={`vision-toggle ${visionRunning ? 'running' : ''}`}
                                onClick={toggleVision}
                            >
                                {visionRunning ? '⏹ Stop Vision' : '▶️ Start Vision'}
                            </button>
                            <button className="vision-capture-btn" onClick={forceCaptureNow}>
                                📸 Capture Now
                            </button>
                            <div className="interval-control">
                                <label>Interval:</label>
                                <input
                                    type="number"
                                    min="5"
                                    max="60"
                                    value={visionInterval}
                                    onChange={e => setVisionInterval(parseInt(e.target.value) || 10)}
                                    className="interval-input"
                                />
                                <span>detik</span>
                            </div>
                        </div>
                    </div>

                    {/* Vision Display */}
                    <div className="vision-display">
                        <div className="vision-main">
                            <h3 className="section-title">👁 Bocchi's Eyes — Live Analysis</h3>
                            <div className="vision-card">
                                <div className="vision-status-row">
                                    <span className={`vision-indicator ${visionRunning ? 'active' : ''}`} />
                                    <span>{visionData?.status || 'idle'}</span>
                                    {visionData?.timestamp && (
                                        <span className="vision-timestamp">
                                            {new Date(visionData.timestamp).toLocaleTimeString()}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="vision-description">
                                    {visionData?.description || 'Vision engine belum aktif. Klik "Start Vision" untuk memulai.'}
                                </div>

                                {visionData?.active_window && (
                                    <div className="vision-window">
                                        <span className="label">Active Window:</span>
                                        <span className="value">{visionData.active_window}</span>
                                    </div>
                                )}

                                {visionData?.elements && visionData.elements.length > 0 && (
                                    <div className="vision-elements">
                                        <span className="label">Detected Elements:</span>
                                        <div className="element-tags">
                                            {visionData.elements.map((el, i) => (
                                                <span key={i} className="element-tag">{el}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ HISTORY PANEL ============ */}
            {activePanel === 'history' && (
                <div className="override-panel">
                    <h3 className="section-title">📋 Action History</h3>
                    <div className="actions-list history-list">
                        {actionHistory.length === 0 ? (
                            <div className="empty-actions">
                                <span className="empty-icon">📭</span>
                                <p>Belum ada riwayat aksi.</p>
                            </div>
                        ) : (
                            actionHistory.map(action => (
                                <div 
                                    key={action.action_id} 
                                    className={`action-card ${action.status}`}
                                >
                                    <div className="action-info">
                                        <span className="action-icon">{getActionIcon(action.action_type)}</span>
                                        <div className="action-details">
                                            <span className="action-type">{action.action_type.toUpperCase()}</span>
                                            <span className="action-params">{JSON.stringify(action.params)}</span>
                                            <span className="action-meta">
                                                Agent: {action.agent_id} • {new Date(action.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="action-status-badge" style={{ color: getStatusColor(action.status) }}>
                                        {action.status === 'executed' && '✅'}
                                        {action.status === 'rejected' && '🚫'}
                                        {action.status === 'error' && '⚠️'}
                                        {action.status === 'pending' && '⏳'}
                                        {' '}{action.status.toUpperCase()}
                                    </div>
                                    {action.result && (
                                        <div className="action-result">
                                            {action.result}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default OverrideMode;
