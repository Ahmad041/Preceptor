import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './NotebookLMView.css';

const NotebookLMView = () => {
    const [sources, setSources] = useState([]);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    
    // Upload / Import State
    const [showAddSource, setShowAddSource] = useState(false);
    const [sourceType, setSourceType] = useState('youtube'); // 'youtube' or 'file'
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    // Audio Overview State
    const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
    const [podcastAudio, setPodcastAudio] = useState(null);
    const [podcastScript, setPodcastScript] = useState('');

    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleAddYoutube = async () => {
        if (!youtubeUrl) return;
        setIsUploading(true);
        try {
            const res = await axios.post('http://localhost:8000/api/youtube/rag-ingest', { url: youtubeUrl });
            setSources([...sources, { id: Date.now(), type: 'youtube', name: youtubeUrl, status: 'Ingested' }]);
            setYoutubeUrl('');
            setShowAddSource(false);
        } catch (err) {
            console.error(err);
            alert('Failed to ingest YouTube video.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            // Adjust endpoint if your existing upload API is different
            await axios.post('http://localhost:8000/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setSources([...sources, { id: Date.now(), type: 'file', name: file.name, status: 'Ingested' }]);
            setShowAddSource(false);
        } catch (err) {
            console.error(err);
            alert('Failed to upload file.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;
        
        const newMessages = [...messages, { role: 'user', content: inputText }];
        setMessages(newMessages);
        setInputText('');
        setIsLoadingChat(true);

        try {
            // Using your existing chat endpoint which queries RAG
            const res = await axios.post('http://localhost:8000/api/chat', { 
                pesan: inputText,
                mode_agent: 'Bocchi'
            });
            setMessages([...newMessages, { role: 'ai', content: res.data.pesan }]);
        } catch (err) {
            console.error(err);
            setMessages([...newMessages, { role: 'ai', content: 'Maaf, terjadi kesalahan server.' }]);
        } finally {
            setIsLoadingChat(false);
        }
    };

    const handleGeneratePodcast = async () => {
        if (sources.length === 0) {
            alert("Harap masukkan minimal 1 sumber data (PDF/YouTube) sebelum membuat podcast.");
            return;
        }
        
        setIsGeneratingPodcast(true);
        try {
            // For now, if we have a youtube URL, let's pass the first youtube source
            // We will upgrade this endpoint to handle multiple / generic RAG context in Task 3
            const ytSource = sources.find(s => s.type === 'youtube');
            const urlToPass = ytSource ? ytSource.name : "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // dummy fallback if only file
            
            const res = await axios.post('http://localhost:8000/api/notebook/podcast', { url: urlToPass });
            
            if (res.data.audio_base64) {
                setPodcastAudio(`data:audio/wav;base64,${res.data.audio_base64}`);
                setPodcastScript(res.data.script);
            }
        } catch (err) {
            console.error(err);
            alert('Gagal men-generate podcast.');
        } finally {
            setIsGeneratingPodcast(false);
        }
    };

    return (
        <div className="notebook-container">
            {/* LEFT PANEL: SOURCES */}
            <div className="notebook-sidebar">
                <div className="sidebar-header">
                    <h3>Sumber Data</h3>
                    <button className="add-source-btn" onClick={() => setShowAddSource(!showAddSource)}>+</button>
                </div>
                
                {showAddSource && (
                    <div className="add-source-panel">
                        <div className="source-tabs">
                            <button className={sourceType === 'youtube' ? 'active' : ''} onClick={() => setSourceType('youtube')}>YouTube</button>
                            <button className={sourceType === 'file' ? 'active' : ''} onClick={() => setSourceType('file')}>File (PDF)</button>
                        </div>
                        
                        {sourceType === 'youtube' ? (
                            <div className="source-input">
                                <input 
                                    type="text" 
                                    placeholder="Tempel link YouTube..." 
                                    value={youtubeUrl}
                                    onChange={(e) => setYoutubeUrl(e.target.value)}
                                />
                                <button onClick={handleAddYoutube} disabled={isUploading}>
                                    {isUploading ? 'Menyerap...' : 'Tambahkan'}
                                </button>
                            </div>
                        ) : (
                            <div className="source-input">
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="sources-list">
                    {sources.map(src => (
                        <div key={src.id} className="source-item">
                            <div className="source-icon">{src.type === 'youtube' ? '📺' : '📄'}</div>
                            <div className="source-info">
                                <span className="source-name" title={src.name}>{src.name}</span>
                                <span className="source-status">{src.status}</span>
                            </div>
                        </div>
                    ))}
                    {sources.length === 0 && (
                        <div className="empty-sources">Belum ada sumber materi. Tambahkan PDF atau YouTube untuk mulai.</div>
                    )}
                </div>
            </div>

            {/* MAIN PANEL: CHAT & PODCAST */}
            <div className="notebook-main">
                {/* Audio Overview Panel */}
                <div className="audio-overview-panel">
                    <div className="overview-header">
                        <h3>Audio Overview (Podcast)</h3>
                        {!podcastAudio && !isGeneratingPodcast && (
                            <button className="generate-btn" onClick={handleGeneratePodcast}>
                                🎙️ Generate Podcast
                            </button>
                        )}
                    </div>
                    
                    {isGeneratingPodcast && (
                        <div className="loading-podcast">
                            <div className="spinner"></div>
                            <span>Memproses dokumen & mensintesis suara... (Dapat memakan waktu 1-3 menit)</span>
                        </div>
                    )}

                    {podcastAudio && (
                        <div className="podcast-player">
                            <audio controls src={podcastAudio} className="custom-audio-player"></audio>
                            <details className="podcast-script">
                                <summary>Lihat Transkrip Podcast</summary>
                                <div className="script-content">{podcastScript}</div>
                            </details>
                        </div>
                    )}
                </div>

                {/* Chat Panel */}
                <div className="chat-panel">
                    <div className="chat-messages">
                        {messages.length === 0 ? (
                            <div className="chat-placeholder">
                                <h1>Chat dengan Catatanmu</h1>
                                <p>Tanyakan ringkasan, detail, atau konsep utama dari sumber datamu.</p>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={`chat-bubble ${msg.role}`}>
                                    <div className="bubble-content">{msg.content}</div>
                                </div>
                            ))
                        )}
                        {isLoadingChat && (
                            <div className="chat-bubble ai typing">
                                <span className="dot"></span>
                                <span className="dot"></span>
                                <span className="dot"></span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    
                    <div className="chat-input-area">
                        <input 
                            type="text" 
                            placeholder="Ketik pertanyaan tentang materi di atas..." 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <button onClick={handleSendMessage} disabled={isLoadingChat}>Kirim</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotebookLMView;
