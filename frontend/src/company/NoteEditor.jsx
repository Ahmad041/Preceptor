import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';

const NoteEditor = ({ note, onSave }) => {
    const [content, setContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [aiQuery, setAiQuery] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showReportMenu, setShowReportMenu] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportTemplates, setReportTemplates] = useState([]);

    useEffect(() => {
        setContent(note.content || '');
        setAiResult(null);
        fetchTemplates();
    }, [note]);

    const fetchTemplates = async () => {
        try {
            const res = await axios.get('http://localhost:8000/api/reports/templates');
            setReportTemplates(res.data.templates);
        } catch (err) {
            console.error('Failed to fetch templates', err);
        }
    };

    const handleGenerateReport = async (templateId) => {
        setIsGeneratingReport(true);
        setShowReportMenu(false);
        try {
            const res = await axios.post('http://localhost:8000/api/reports/generate', {
                template_id: templateId,
                folder: note.folder
            });
            if (res.data.status === 'success') {
                setContent(prev => prev + '\n\n' + res.data.content);
            }
        } catch (err) {
            console.error('Report generation failed', err);
            alert('G-gomen... Gagal membuat laporan neural.');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(note.id, content);
        setIsSaving(false);
    };

    const handleAiAsk = async () => {
        if (!aiQuery.trim()) return;
        setIsAiLoading(true);
        try {
            const res = await axios.post('http://localhost:8000/api/notes/ask', {
                question: aiQuery,
                note_id: note.id
            });
            setAiResult(res.data.answer);
        } catch (err) {
            console.error('AI ask failed', err);
            setAiResult('Sorry, I failed to process your question.');
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleExportPDF = async () => {
        try {
            const response = await axios.get(`http://localhost:8000/api/notes/export-pdf/${note.id}`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${note.title || 'Note'}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Export failed', err);
            alert('Export to PDF failed. Gagal mengonversi dokumen.');
        }
    };

    return (
        <div className="note-editor-container">
            {isGeneratingReport && (
                <div className="report-loading-overlay">
                    <div className="loading-content">
                        <div className="glitch-spinner"></div>
                        <p>ANALYZING NEURAL DATA...</p>
                        <span className="sub-text">Synthesizing mission logs and financial records...</span>
                    </div>
                </div>
            )}

            <div className="editor-top-bar">
                <div className="note-path-info">
                    <span className="file-icon">📄</span>
                    <span className="file-path">{note.path.split('\\').pop()}</span>
                </div>
                <div className="editor-actions">
                    <div className="report-menu-container">
                        <button className="generate-btn" onClick={() => setShowReportMenu(!showReportMenu)}>
                            ⚡ Generate Report
                        </button>
                        {showReportMenu && (
                            <div className="report-dropdown">
                                {reportTemplates.map(t => (
                                    <div key={t.id} className="report-item" onClick={() => handleGenerateReport(t.id)}>
                                        <div className="report-name">{t.name}</div>
                                        <div className="report-desc">{t.description}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button className="export-btn" onClick={handleExportPDF}>
                        📥 Export PDF
                    </button>
                    <button 
                        className={`save-btn ${isSaving ? 'saving' : ''}`} 
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="editor-workspace">
                <div className="editor-pane">
                    <textarea 
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Write your thoughts in Markdown..."
                        spellCheck="false"
                    />
                </div>
                <div className="preview-pane">
                    <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {content}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>

            {/* AI Assistant Panel */}
            <div className="ai-assistant-panel">
                <div className="ai-header">
                    <span>✨ Bocchi Intelligence</span>
                </div>
                <div className="ai-input-group">
                    <input 
                        type="text" 
                        placeholder="Ask anything about your notes..." 
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAiAsk()}
                    />
                    <button onClick={handleAiAsk} disabled={isAiLoading}>
                        {isAiLoading ? '...' : 'Ask'}
                    </button>
                </div>
                {aiResult && (
                    <div className="ai-response">
                        <ReactMarkdown>{aiResult}</ReactMarkdown>
                        <button className="close-ai" onClick={() => setAiResult(null)}>✕</button>
                    </div>
                )}
            </div>

            <style>{`
                .note-editor-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    width: 100%;
                    position: relative;
                }

                .editor-top-bar {
                    padding: 8px 16px;
                    background: rgba(0, 0, 0, 0.2);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .note-path-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #888;
                    font-size: 0.8rem;
                }

                .editor-actions {
                    display: flex;
                    gap: 10px;
                }
                
                .export-btn {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #ccc;
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .export-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .save-btn {
                    background: #f472b6;
                    color: white;
                    border: none;
                    padding: 6px 16px;
                    border-radius: 4px;
                    font-weight: 600;
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: opacity 0.2s;
                }

                .save-btn:hover {
                    opacity: 0.9;
                }

                .editor-workspace {
                    flex: 1;
                    display: flex;
                    overflow: hidden;
                }

                .editor-pane, .preview-pane {
                    flex: 1;
                    height: 100%;
                    overflow-y: auto;
                }

                .editor-pane {
                    border-right: 1px solid rgba(255, 255, 255, 0.05);
                }

                textarea {
                    width: 100%;
                    height: 100%;
                    background: transparent;
                    border: none;
                    color: #d1d5db;
                    padding: 30px;
                    font-family: 'Fira Code', 'Cascadia Code', monospace;
                    font-size: 0.95rem;
                    line-height: 1.6;
                    resize: none;
                    outline: none;
                }

                .preview-pane {
                    padding: 30px;
                    background: rgba(0, 0, 0, 0.05);
                }

                .markdown-body {
                    color: #d1d5db;
                    font-size: 1rem;
                    line-height: 1.7;
                }

                .markdown-body h1, .markdown-body h2 {
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    padding-bottom: 0.3em;
                    color: #f472b6;
                }

                .ai-assistant-panel {
                    position: absolute;
                    bottom: 24px;
                    right: 24px;
                    width: 320px;
                    background: rgba(15, 5, 30, 0.95);
                    border: 1px solid rgba(244, 114, 182, 0.3);
                    border-radius: 12px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(10px);
                    z-index: 50;
                    display: flex;
                    flex-direction: column;
                }

                .ai-header {
                    padding: 10px 16px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: #f472b6;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .ai-input-group {
                    padding: 12px;
                    display: flex;
                    gap: 8px;
                }

                .ai-input-group input {
                    flex: 1;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 8px 12px;
                    border-radius: 6px;
                    color: white;
                    font-size: 0.85rem;
                }

                .ai-input-group button {
                    background: #f472b6;
                    border: none;
                    color: white;
                    padding: 0 12px;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .ai-response {
                    padding: 16px;
                    max-height: 300px;
                    overflow-y: auto;
                    font-size: 0.9rem;
                    color: #ccc;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    position: relative;
                }

                .close-ai {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: none;
                    border: none;
                    color: #666;
                    cursor: pointer;
                }

                /* Phase 4: Report UI */
                .report-menu-container {
                    position: relative;
                }

                .generate-btn {
                    background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);
                    transition: all 0.2s;
                }

                .generate-btn:hover {
                    box-shadow: 0 0 15px rgba(6, 182, 212, 0.6);
                    transform: translateY(-1px);
                }

                .report-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    width: 280px;
                    background: rgba(10, 10, 20, 0.95);
                    border: 1px solid rgba(6, 182, 212, 0.3);
                    border-radius: 8px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
                    z-index: 100;
                    overflow: hidden;
                    backdrop-filter: blur(10px);
                }

                .report-item {
                    padding: 12px 16px;
                    cursor: pointer;
                    transition: background 0.2s;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .report-item:last-child {
                    border-bottom: none;
                }

                .report-item:hover {
                    background: rgba(6, 182, 212, 0.1);
                }

                .report-name {
                    color: #06b6d4;
                    font-size: 0.85rem;
                    font-weight: 700;
                    margin-bottom: 2px;
                }

                .report-desc {
                    color: #888;
                    font-size: 0.7rem;
                    line-height: 1.3;
                }

                .report-loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.85);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(4px);
                }

                .loading-content {
                    text-align: center;
                }

                .glitch-spinner {
                    width: 50px;
                    height: 50px;
                    border: 3px solid transparent;
                    border-top-color: #06b6d4;
                    border-bottom-color: #f472b6;
                    border-radius: 50%;
                    margin: 0 auto 20px;
                    animation: spin 1s linear infinite;
                    box-shadow: 0 0 15px rgba(6, 182, 212, 0.5);
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .loading-content p {
                    color: #06b6d4;
                    font-family: 'Fira Code', monospace;
                    font-weight: 800;
                    letter-spacing: 2px;
                    margin-bottom: 8px;
                }

                .sub-text {
                    color: #666;
                    font-size: 0.75rem;
                }
            `}</style>
        </div>
    );
};

export default NoteEditor;
