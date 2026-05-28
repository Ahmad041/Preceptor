import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './OverrideMode.css';

const API = 'http://localhost:8000';

const OverrideMode = () => {
    // Desktop Pilot state
    const [pendingActions, setPendingActions] = useState([]);
    const [actionHistory, setActionHistory] = useState([]);
    const [activePanel, setActivePanel] = useState('jarvis'); // 'jarvis', 'pilot', 'vision', 'memory', 'docx', 'history'
    
    // Vision state
    const [visionRunning, setVisionRunning] = useState(false);
    const [visionData, setVisionData] = useState(null);
    const [visionHistory, setVisionHistory] = useState([]);
    const [visionInterval, setVisionInterval] = useState(30);
    
    // Quick action form
    const [quickAction, setQuickAction] = useState('click');
    const [quickParams, setQuickParams] = useState('');
    
    // JARVIS state
    const [jarvisStatus, setJarvisStatus] = useState(null);
    const [jarvisModels, setJarvisModels] = useState(null);
    const [jarvisChat, setJarvisChat] = useState([]);
    const [jarvisInput, setJarvisInput] = useState('');
    const [jarvisLoading, setJarvisLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const chatEndRef = useRef(null);

    // Memory Browser state
    const [memories, setMemories] = useState([]);
    const [memoryQuery, setMemoryQuery] = useState('');
    const [memorySearchResults, setMemorySearchResults] = useState(null);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [newMemoryText, setNewMemoryText] = useState('');
    const [showAddMemory, setShowAddMemory] = useState(false);

    // DOCX Generator state
    const [docxSessionId, setDocxSessionId] = useState(null);
    const [docxChat, setDocxChat] = useState([]); // [{role, text, options}]
    const [docxInput, setDocxInput] = useState('');
    const [docxDone, setDocxDone] = useState(false);
    const [docxJobId, setDocxJobId] = useState(null);
    const [docxJobStatus, setDocxJobStatus] = useState(null);
    const [docxFiles, setDocxFiles] = useState([]);
    const [docxRefs, setDocxRefs] = useState([]);
    const [docxUploading, setDocxUploading] = useState(false);
    const [docxMode, setDocxMode] = useState(null); // 'auto' or 'custom'
    const [customDocxData, setCustomDocxData] = useState({
        jenis_dok_label: 'Jurnal Ilmiah / Artikel',
        judul: '',
        penulis: '',
        nim: '',
        institusi: '',
        fakultas: '',
        year_from: '2019',
        year_to: '2025',
        max_refs: 15,
        referensi_tambahan: 'Ya',
        struktur_bab: ''
    });

    const docxFileInputRef = useRef(null);
    const docxJobPollRef = useRef(null);
    
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

    // Poll Jarvis status
    const pollJarvis = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/api/jarvis/status`);
            setJarvisStatus(res.data);
        } catch (e) {
            console.error('Jarvis poll error:', e);
        }
    }, []);

    // Fetch installed models
    const fetchModels = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/api/jarvis/models`);
            setJarvisModels(res.data);
        } catch (e) {
            console.error('Models fetch error:', e);
        }
    }, []);

    useEffect(() => {
        pollPending();
        pollVision();
        pollJarvis();
        fetchModels();
        pollRef.current = setInterval(() => {
            pollPending();
            pollVision();
            if (activePanel === 'jarvis') pollJarvis();
        }, 3000);
        return () => clearInterval(pollRef.current);
    }, [pollPending, pollVision, pollJarvis, fetchModels, activePanel]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [jarvisChat]);

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
        if (activePanel === 'memory') fetchMemories();
        if (activePanel === 'docx') fetchDocxFiles();
    }, [activePanel]);

    // ============ MEMORY HANDLERS ============
    const fetchMemories = async () => {
        setMemoryLoading(true);
        try {
            const res = await axios.get(`${API}/api/jarvis/memories`);
            setMemories(res.data || []);
            setMemorySearchResults(null);
        } catch (e) { console.error(e); }
        setMemoryLoading(false);
    };

    const searchMemories = async () => {
        if (!memoryQuery.trim()) { fetchMemories(); return; }
        setMemoryLoading(true);
        try {
            const res = await axios.get(`${API}/api/jarvis/memories?query=${encodeURIComponent(memoryQuery)}`);
            setMemorySearchResults(res.data || []);
        } catch (e) { showNotification('Gagal cari memori', 'error'); }
        setMemoryLoading(false);
    };

    const deleteMemory = async (item) => {
        try {
            const params = item.chroma_id ? `?chroma_id=${encodeURIComponent(item.chroma_id)}` : '';
            await axios.delete(`${API}/api/jarvis/memories/${item.index}${params}`);
            showNotification('Memori dihapus!', 'success');
            fetchMemories();
        } catch (e) { showNotification('Gagal hapus memori', 'error'); }
    };

    const addMemory = async () => {
        if (!newMemoryText.trim()) return;
        try {
            await axios.post(`${API}/api/jarvis/memories`, { text: newMemoryText, nama: 'Memori Obrolan' });
            showNotification('Memori ditambahkan!', 'success');
            setNewMemoryText('');
            setShowAddMemory(false);
            fetchMemories();
        } catch (e) { showNotification('Gagal tambah memori', 'error'); }
    };

    const clearAllMemories = async () => {
        if (!window.confirm('Hapus SEMUA memori? Aksi ini tidak dapat dibatalkan.')) return;
        try {
            await axios.delete(`${API}/api/jarvis/memories-clear`);
            showNotification('Semua memori dihapus!', 'warning');
            fetchMemories();
        } catch (e) { showNotification('Gagal hapus semua memori', 'error'); }
    };

    // ============ DOCX HANDLERS ============
    const startDocxSession = async (mode) => {
        setDocxMode(mode);
        if (mode === 'custom') {
            // Wait for user to fill form
            return;
        }
        
        try {
            const res = await axios.post(`${API}/api/docx/session/start`, {});
            setDocxSessionId(res.data.session_id);
            setDocxDone(false);
            setDocxJobId(null);
            setDocxJobStatus(null);
            setDocxChat([{ role: 'ai', text: res.data.question, options: res.data.options || [] }]);
        } catch (e) { showNotification('Gagal mulai sesi DOCX', 'error'); }
    };

    const submitCustomDocx = async () => {
        if (!customDocxData.judul.trim()) {
            showNotification('Judul wajib diisi!', 'error');
            return;
        }
        try {
            const res = await axios.post(`${API}/api/docx/session/custom`, {
                custom_data: customDocxData
            });
            setDocxSessionId(res.data.session_id);
            setDocxDone(true);
            setDocxJobId(null);
            setDocxJobStatus(null);
            setDocxMode('custom_ready');
            setDocxChat([{ role: 'ai', text: res.data.message, options: [] }]);
        } catch (e) { showNotification('Gagal mengirim data kustom', 'error'); }
    };

    const sendDocxAnswer = async (answer) => {
        if (!docxSessionId || !answer.trim()) return;
        const ans = answer.trim();
        setDocxChat(prev => [...prev, { role: 'user', text: ans }]);
        setDocxInput('');
        try {
            const res = await axios.post(`${API}/api/docx/session/answer`, { session_id: docxSessionId, answer: ans });
            if (res.data.done) {
                setDocxDone(true);
                setDocxChat(prev => [...prev, { role: 'ai', text: res.data.message || 'Semua informasi terkumpul! Siap generate.', options: [] }]);
            } else {
                setDocxChat(prev => [...prev, { role: 'ai', text: res.data.question, options: res.data.options || [] }]);
            }
        } catch (e) { showNotification('Gagal kirim jawaban', 'error'); }
    };

    const generateDocx = async () => {
        if (!docxSessionId) return;
        try {
            const res = await axios.post(`${API}/api/docx/generate`, { session_id: docxSessionId });
            setDocxJobId(res.data.job_id);
            setDocxJobStatus({ progress: 0, step: 'Memulai...', done: false });
            // Poll status setiap 3 detik
            docxJobPollRef.current = setInterval(async () => {
                try {
                    const statusRes = await axios.get(`${API}/api/docx/generate/status/${res.data.job_id}`);
                    setDocxJobStatus(statusRes.data);
                    if (statusRes.data.done) {
                        clearInterval(docxJobPollRef.current);
                        fetchDocxFiles();
                        if (!statusRes.data.error) showNotification('Dokumen berhasil dibuat!', 'success');
                    }
                } catch (err) { console.error(err); }
            }, 3000);
        } catch (e) { showNotification('Gagal trigger generate', 'error'); }
    };

    const uploadDocxRef = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setDocxUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            await axios.post(`${API}/api/docx/references/upload`, formData);
            showNotification(`${file.name} diupload!`, 'success');
            fetchDocxRefs();
        } catch (err) { showNotification('Gagal upload file', 'error'); }
        setDocxUploading(false);
        e.target.value = '';
    };

    const fetchDocxFiles = async () => {
        try {
            const res = await axios.get(`${API}/api/docx/list`);
            setDocxFiles(res.data.docs || []);
        } catch (e) { console.error(e); }
    };

    const fetchDocxRefs = async () => {
        try {
            const res = await axios.get(`${API}/api/docx/references/list`);
            setDocxRefs(res.data.files || []);
        } catch (e) { console.error(e); }
    };

    const deleteDocxRef = async (filename, type) => {
        try {
            await axios.delete(`${API}/api/docx/references/${filename}?file_type=${type}`);
            showNotification(`${filename} dihapus`, 'success');
            fetchDocxRefs();
        } catch (e) { showNotification('Gagal hapus referensi', 'error'); }
    };

    useEffect(() => { return () => clearInterval(docxJobPollRef.current); }, []);

    // JARVIS chat handler
    const sendJarvisMessage = async (overrideMessage = null) => {
        const userMsg = typeof overrideMessage === 'string' ? overrideMessage : jarvisInput;
        if (!userMsg.trim() || jarvisLoading) return;
        
        const finalMsg = userMsg.trim();
        setJarvisInput('');
        setJarvisChat(prev => [...prev, { role: 'user', content: finalMsg, time: new Date().toLocaleTimeString() }]);
        setJarvisLoading(true);
        
        try {
            const res = await axios.post(`${API}/api/jarvis/chat`, { 
                message: finalMsg,
                voice_enabled: voiceEnabled
            });
            setJarvisChat(prev => [...prev, {
                role: 'assistant',
                content: res.data.response || '...',
                model: res.data.model_key || '?',
                elapsed: res.data.elapsed_seconds,
                time: new Date().toLocaleTimeString(),
                tool_call: res.data.tool_call
            }]);

            // Play voice response if available
            if (res.data.audio_base64) {
                const audio = new Audio("data:audio/wav;base64," + res.data.audio_base64);
                audio.play().catch(err => console.error("Gagal memutar audio:", err));
            }

            pollJarvis();
        } catch (e) {
            setJarvisChat(prev => [...prev, {
                role: 'assistant',
                content: `❌ Error: ${e.response?.data?.detail || e.message}`,
                time: new Date().toLocaleTimeString()
            }]);
        } finally {
            setJarvisLoading(false);
        }
    };

    // Voice recording handlers
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice.wav');

                try {
                    showNotification('🎙️ Mentranskripsikan suara...', 'info');
                    const res = await axios.post(`${API}/api/jarvis/transcribe`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    
                    if (res.data.text && res.data.text.trim()) {
                        sendJarvisMessage(res.data.text);
                        showNotification('🎙️ Suara terkirim!', 'success');
                    } else {
                        showNotification('⚠️ Suara tidak terdeteksi.', 'warning');
                    }
                } catch (err) {
                    showNotification('❌ Gagal transkripsi audio', 'error');
                } finally {
                    stream.getTracks().forEach(track => track.stop());
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            showNotification('🎙️ Mendengarkan... Ketuk lagi untuk kirim.', 'info');
        } catch (e) {
            showNotification('❌ Mikrofon tidak dapat diakses', 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleMicClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    // Switch model
    const switchModel = async (modelKey) => {
        try {
            showNotification(`⏳ Switching to ${modelKey}...`, 'info');
            await axios.post(`${API}/api/jarvis/switch`, { model: modelKey });
            showNotification(`✅ Switched to ${modelKey}!`, 'success');
            pollJarvis();
        } catch (e) {
            showNotification(`❌ Gagal switch model: ${e.message}`, 'error');
        }
    };

    // Clear chat
    const clearChat = async () => {
        try {
            await axios.post(`${API}/api/jarvis/clear`);
            setJarvisChat([]);
            showNotification('🗑️ Conversation cleared', 'info');
        } catch (e) {
            showNotification('❌ Gagal clear chat', 'error');
        }
    };

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

    const getModelIcon = (key) => {
        const icons = { brain: '🧠', vision: '👁', coder: '💻' };
        return icons[key] || '🤖';
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
                        <span className="override-icon">🤖</span>
                        BOCCHI-JARVIS
                    </h1>
                    <span className="override-subtitle">Local AI Desktop Assistant</span>
                </div>
                <div className="override-status-bar">
                    <div className={`status-indicator ${jarvisStatus?.status === 'processing' ? 'pulse' : 'active'}`}>
                        <span className="status-dot" style={{ background: jarvisStatus ? '#34d399' : '#666' }} />
                        <span>{jarvisStatus?.model_name || 'Connecting...'}</span>
                    </div>
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
                {['jarvis', 'pilot', 'vision', 'memory', 'docx', 'history'].map(tab => (
                    <button
                        key={tab}
                        className={`override-tab ${activePanel === tab ? 'active' : ''}`}
                        onClick={() => setActivePanel(tab)}
                    >
                        {tab === 'jarvis' && '🤖 JARVIS'}
                        {tab === 'pilot' && '🖱️ Desktop Pilot'}
                        {tab === 'vision' && '👁 Vision Engine'}
                        {tab === 'memory' && '🧠 Memory'}
                        {tab === 'docx' && '📝 DOCX'}
                        {tab === 'history' && '📋 History'}
                    </button>
                ))}
            </div>

            {/* ============ JARVIS PANEL ============ */}
            {activePanel === 'jarvis' && (
                <div className="override-panel jarvis-panel">
                    {/* Model Status Cards */}
                    <div className="jarvis-models-row">
                        {Object.entries(jarvisStatus?.models || {}).map(([key, info]) => (
                            <button
                                key={key}
                                className={`model-card ${jarvisStatus?.active_model === key ? 'active' : ''}`}
                                onClick={() => switchModel(key)}
                                title={`Switch to ${key}: ${info.role}`}
                            >
                                <span className="model-card-icon">{getModelIcon(key)}</span>
                                <span className="model-card-name">{key.toUpperCase()}</span>
                                <span className="model-card-model">{info.name}</span>
                                {jarvisStatus?.active_model === key && (
                                    <span className="model-card-active">ACTIVE</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Chat Area */}
                    <div className="jarvis-chat-container">
                        <div className="jarvis-chat-header">
                            <span>💬 Chat with Bocchi</span>
                            <button className="jarvis-clear-btn" onClick={clearChat}>🗑️ Clear</button>
                        </div>
                        <div className="jarvis-chat-messages">
                            {jarvisChat.length === 0 && (
                                <div className="jarvis-chat-empty">
                                    <span className="empty-icon">🤖</span>
                                    <p>Hai{jarvisStatus?.user_profile?.nama ? `, ${jarvisStatus.user_profile.nama}` : ''}! Aku Bocchi.</p>
                                    <p className="empty-sub">Ketik pesan atau perintah di bawah untuk mulai.</p>
                                </div>
                            )}
                            {jarvisChat.map((msg, i) => (
                                <div key={i} className={`chat-bubble ${msg.role}`}>
                                    <div className="chat-bubble-content">
                                        {msg.content}
                                    </div>
                                    <div className="chat-bubble-meta">
                                        <span>{msg.time}</span>
                                        {msg.model && <span className="chat-model-badge">{msg.model}</span>}
                                        {msg.elapsed && <span>{msg.elapsed}s</span>}
                                    </div>
                                    {msg.tool_call && (
                                        <div className="chat-tool-call">
                                            🔧 Tool: {msg.tool_call.action}({JSON.stringify(msg.tool_call.params || {})})
                                        </div>
                                    )}
                                </div>
                            ))}
                            {jarvisLoading && (
                                <div className="chat-bubble assistant loading">
                                    <div className="typing-dots">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="jarvis-chat-input-row">
                            <button
                                className={`jarvis-voice-toggle-btn ${voiceEnabled ? 'active' : ''}`}
                                onClick={() => setVoiceEnabled(!voiceEnabled)}
                                title={voiceEnabled ? "Voice Output: ON" : "Voice Output: OFF"}
                            >
                                {voiceEnabled ? '🔊' : '🔇'}
                            </button>
                            <button
                                className={`jarvis-mic-btn ${isRecording ? 'recording' : ''}`}
                                onClick={handleMicClick}
                                title={isRecording ? "Stop Recording" : "Start Recording"}
                                disabled={jarvisLoading}
                            >
                                {isRecording ? '🛑' : '🎙️'}
                            </button>
                            <input
                                type="text"
                                className="jarvis-chat-input"
                                value={jarvisInput}
                                onChange={e => setJarvisInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendJarvisMessage()}
                                placeholder={isRecording ? "Sedang mendengarkan..." : "Ketik pesan ke Bocchi..."}
                                disabled={jarvisLoading || isRecording}
                            />
                            <button
                                className="jarvis-send-btn"
                                onClick={() => sendJarvisMessage()}
                                disabled={jarvisLoading || !jarvisInput.trim() || isRecording}
                            >
                                {jarvisLoading ? '⏳' : '🚀'} Send
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                    {visionData?.provider && (
                                        <span className="vision-provider-badge">{visionData.provider}</span>
                                    )}
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

                                {visionData?.text_content && (
                                    <div className="vision-ocr">
                                        <span className="label">OCR Text:</span>
                                        <div className="ocr-content">{visionData.text_content}</div>
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

            {/* ============ MEMORY PANEL ============ */}
            {activePanel === 'memory' && (
                <div className="override-panel memory-panel">
                    <div className="memory-header">
                        <h3 className="section-title">🧠 Long Term Memory</h3>
                        <div className="memory-header-actions">
                            <button className="mem-btn mem-btn-add" onClick={() => setShowAddMemory(!showAddMemory)}>+ Tambah Ingatan</button>
                            <button className="mem-btn mem-btn-danger" onClick={clearAllMemories}>🗑 Kosongkan Semua</button>
                        </div>
                    </div>

                    {/* Search bar */}
                    <div className="memory-search-bar">
                        <input
                            className="mem-search-input"
                            placeholder="Cari memori secara semantik..."
                            value={memoryQuery}
                            onChange={e => setMemoryQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && searchMemories()}
                        />
                        <button className="mem-btn" onClick={searchMemories}>🔍 Cari</button>
                        {memorySearchResults && <button className="mem-btn" onClick={fetchMemories}>✕ Reset</button>}
                    </div>

                    {/* Add Memory Form */}
                    {showAddMemory && (
                        <div className="memory-add-form">
                            <textarea
                                className="mem-textarea"
                                placeholder="Tuliskan ingatan baru..."
                                value={newMemoryText}
                                onChange={e => setNewMemoryText(e.target.value)}
                                rows={3}
                            />
                            <div className="mem-add-actions">
                                <button className="mem-btn mem-btn-save" onClick={addMemory}>💾 Simpan</button>
                                <button className="mem-btn" onClick={() => { setShowAddMemory(false); setNewMemoryText(''); }}>✕ Batal</button>
                            </div>
                        </div>
                    )}

                    {/* Memory List */}
                    {memoryLoading ? (
                        <div className="memory-loading">Memuat ingatan...</div>
                    ) : (
                        <div className="memory-list">
                            {(memorySearchResults || memories).length === 0 ? (
                                <div className="memory-empty">
                                    <span>🧠</span>
                                    <p>{memorySearchResults ? 'Tidak ada hasil pencarian.' : 'Belum ada memori tersimpan.'}</p>
                                </div>
                            ) : (
                                (memorySearchResults || memories).map((item, idx) => (
                                    <div key={item.chroma_id || idx} className="memory-item">
                                        <div className="memory-item-header">
                                            <span className="memory-item-name">{item.nama || 'Memori Obrolan'}</span>
                                            {item.chroma_id && <span className="memory-item-id">{item.chroma_id.slice(-8)}</span>}
                                        </div>
                                        <p className="memory-item-chunk">{(item.chunk || '').slice(0, 200)}{(item.chunk || '').length > 200 ? '...' : ''}</p>
                                        <button className="memory-item-delete" onClick={() => deleteMemory(item)}>🗑 Hapus</button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ============ DOCX PANEL ============ */}
            {activePanel === 'docx' && (
                <div className="override-panel docx-panel">
                    <div className="docx-header">
                        <h3 className="section-title">📝 DOCX Report Generator</h3>
                        <p className="docx-subtitle">AI Academic Writing Assistant — Gemini + Qwen3</p>
                    </div>

                    {/* Chat Q&A Area */}
                    {!docxSessionId && !docxMode ? (
                        <div className="docx-start-area">
                            <div className="docx-start-desc">
                                <p>Bocchi akan membantumu membuat dokumen akademis secara otomatis.</p>
                                <p>Mendukung: Jurnal, Proposal, Makalah, Laporan Penelitian, Laporan Bisnis.</p>
                            </div>
                            <div className="docx-mode-buttons">
                                <button className="docx-start-btn" onClick={() => startDocxSession('auto')}>💬 Q&A Otomatis</button>
                                <button className="docx-start-btn custom-btn" onClick={() => startDocxSession('custom')}>⚙️ Kustomisasi Format</button>
                            </div>
                        </div>
                    ) : !docxSessionId && docxMode === 'custom' ? (
                        <div className="docx-custom-form">
                            <h4>Kustomisasi Dokumen</h4>
                            <div className="form-group">
                                <label>Jenis Dokumen</label>
                                <select value={customDocxData.jenis_dok_label} onChange={e => setCustomDocxData({...customDocxData, jenis_dok_label: e.target.value})}>
                                    <option>Jurnal Ilmiah / Artikel</option>
                                    <option>Proposal Bisnis / Proyek</option>
                                    <option>Makalah</option>
                                    <option>Laporan Penelitian</option>
                                    <option>Laporan Bisnis</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Judul Dokumen *</label>
                                <input type="text" value={customDocxData.judul} onChange={e => setCustomDocxData({...customDocxData, judul: e.target.value})} placeholder="Judul Dokumen" required />
                            </div>
                            <div className="form-group">
                                <label>Nama Penulis</label>
                                <input type="text" value={customDocxData.penulis} onChange={e => setCustomDocxData({...customDocxData, penulis: e.target.value})} placeholder="Nama Penulis" />
                            </div>
                            <div className="form-group">
                                <label>NIM / Identitas</label>
                                <input type="text" value={customDocxData.nim} onChange={e => setCustomDocxData({...customDocxData, nim: e.target.value})} placeholder="NIM" />
                            </div>
                            <div className="form-group">
                                <label>Institusi</label>
                                <input type="text" value={customDocxData.institusi} onChange={e => setCustomDocxData({...customDocxData, institusi: e.target.value})} placeholder="Nama Universitas / Instansi" />
                            </div>
                            <div className="form-group">
                                <label>Fakultas / Departemen</label>
                                <input type="text" value={customDocxData.fakultas} onChange={e => setCustomDocxData({...customDocxData, fakultas: e.target.value})} placeholder="Fakultas" />
                            </div>
                            <div className="form-group">
                                <label>Struktur Bab (Opsional)</label>
                                <textarea 
                                    rows="4" 
                                    value={customDocxData.struktur_bab} 
                                    onChange={e => setCustomDocxData({...customDocxData, struktur_bab: e.target.value})}
                                    placeholder="Bab 1: Pendahuluan&#10;1.1 Latar Belakang&#10;Bab 2: Pembahasan"
                                />
                            </div>
                            <div className="form-group-row">
                                <div>
                                    <label>Tahun Mulai Referensi</label>
                                    <input type="number" value={customDocxData.year_from} onChange={e => setCustomDocxData({...customDocxData, year_from: e.target.value})} />
                                </div>
                                <div>
                                    <label>Tahun Selesai</label>
                                    <input type="number" value={customDocxData.year_to} onChange={e => setCustomDocxData({...customDocxData, year_to: e.target.value})} />
                                </div>
                                <div>
                                    <label>Maksimal Referensi AI</label>
                                    <input type="number" value={customDocxData.max_refs} onChange={e => setCustomDocxData({...customDocxData, max_refs: parseInt(e.target.value)})} min="5" max="30" />
                                </div>
                            </div>
                            <div className="form-actions">
                                <button className="docx-generate-btn" onClick={submitCustomDocx}>✅ Mulai Buat Dokumen</button>
                                <button className="docx-reset-btn" onClick={() => setDocxMode(null)}>Batal</button>
                            </div>
                        </div>
                    ) : (
                        <div className="docx-chat-area">
                            <div className="docx-chat-messages">
                                {docxChat.map((msg, i) => (
                                    <div key={i} className={`docx-bubble docx-bubble-${msg.role}`}>
                                        {msg.role === 'ai' && <span className="docx-bubble-icon">🤖</span>}
                                        <div className="docx-bubble-content">
                                            <p>{msg.text}</p>
                                            {msg.options && msg.options.length > 0 && !docxDone && i === docxChat.length - 1 && (
                                                <div className="docx-options">
                                                    {msg.options.map((opt, oi) => (
                                                        <button key={oi} className="docx-option-btn" onClick={() => sendDocxAnswer(opt)}>{opt}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {msg.role === 'user' && <span className="docx-bubble-icon">👤</span>}
                                    </div>
                                ))}
                            </div>

                            {!docxDone && (
                                <div className="docx-input-row">
                                    <input
                                        className="docx-input"
                                        placeholder="Ketik jawaban..."
                                        value={docxInput}
                                        onChange={e => setDocxInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && sendDocxAnswer(docxInput)}
                                    />
                                    <button className="docx-send-btn" onClick={() => sendDocxAnswer(docxInput)}>Kirim</button>
                                </div>
                            )}

                            {docxDone && !docxJobId && (
                                <button className="docx-generate-btn" onClick={generateDocx}>📄 Generate Dokumen</button>
                            )}

                            <button className="docx-reset-btn" onClick={() => { setDocxSessionId(null); setDocxMode(null); setDocxChat([]); setDocxDone(false); setDocxJobId(null); setDocxJobStatus(null); }}>↩ Mulai Ulang</button>
                        </div>
                    )}

                    {/* Progress Bar */}
                    {docxJobStatus && (
                        <div className="docx-progress-section">
                            <div className="docx-progress-label">
                                <span>{docxJobStatus.step}</span>
                                <span>{docxJobStatus.progress}%</span>
                            </div>
                            <div className="docx-progress-bar">
                                <div className="docx-progress-fill" style={{ width: `${docxJobStatus.progress}%` }} />
                            </div>
                            {docxJobStatus.error && <p className="docx-error">{docxJobStatus.error}</p>}
                        </div>
                    )}

                    {/* Upload Referensi */}
                    <div className="docx-refs-section">
                        <div className="docx-refs-header">
                            <span>📁 Referensi ({docxRefs.length} file)</span>
                            <button className="mem-btn" onClick={() => { fetchDocxRefs(); }} >🔄</button>
                            <button className="mem-btn mem-btn-add" onClick={() => docxFileInputRef.current?.click()} disabled={docxUploading}>
                                {docxUploading ? 'Mengupload...' : '+ Upload File'}
                            </button>
                            <input ref={docxFileInputRef} type="file" style={{ display: 'none' }} accept=".pdf,.docx,.doc,.txt,.md,.png,.jpg" onChange={uploadDocxRef} />
                        </div>
                        {docxRefs.length > 0 && (
                            <div className="docx-refs-list">
                                {docxRefs.map((f, i) => (
                                    <div key={i} className="docx-ref-item">
                                        <span className="docx-ref-type">{f.type.toUpperCase()}</span>
                                        <span className="docx-ref-name">{f.name}</span>
                                        <button className="docx-ref-delete" onClick={() => deleteDocxRef(f.name, f.type)}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Dokumen Hasil */}
                    {docxFiles.length > 0 && (
                        <div className="docx-output-section">
                            <h4 className="docx-output-title">📂 Dokumen Tersimpan</h4>
                            {docxFiles.map((doc, i) => (
                                <div key={i} className="docx-file-row">
                                    <span className="docx-file-name">📄 {doc.filename}</span>
                                    <a
                                        href={`${API}/api/docx/download/${doc.filename}`}
                                        download
                                        className="docx-download-btn"
                                    >⬇ Download</a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default OverrideMode;
