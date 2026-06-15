import React, { useState } from 'react';
import './SettingsView.css';

const SettingsView = () => {
    const [activeSection, setActiveSection] = useState('model');

    const scrollToSection = (id) => {
        setActiveSection(id);
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div className="settings-layout">
            <div className="settings-sidebar">
                <div className="settings-header">
                    <h2>Pengaturan</h2>
                </div>
                <div className="settings-search-container">
                    <div className="search-icon">🔍</div>
                    <input type="text" placeholder="Cari pengaturan..." className="settings-search-input" />
                </div>
                <div className="settings-nav-list">
                    <button className={`settings-nav-item ${activeSection === 'model' ? 'active' : ''}`} onClick={() => scrollToSection('model')}>
                        <span className="nav-indicator"></span>
                        Model AI
                    </button>
                    <button className={`settings-nav-item ${activeSection === 'persona' ? 'active' : ''}`} onClick={() => scrollToSection('persona')}>
                        <span className="nav-indicator"></span>
                        Persona
                    </button>
                    <button className={`settings-nav-item ${activeSection === 'tts' ? 'active' : ''}`} onClick={() => scrollToSection('tts')}>
                        <span className="nav-indicator"></span>
                        Suara (TTS)
                    </button>
                    <button className={`settings-nav-item ${activeSection === 'avatar' ? 'active' : ''}`} onClick={() => scrollToSection('avatar')}>
                        <span className="nav-indicator"></span>
                        Avatar & Animasi
                    </button>
                    <button className={`settings-nav-item ${activeSection === 'ui' ? 'active' : ''}`} onClick={() => scrollToSection('ui')}>
                        <span className="nav-indicator"></span>
                        UI & Aksesibilitas
                    </button>
                </div>
            </div>

            <div className="settings-main-content">
                <div className="settings-scroll-area">
                    {/* Model AI Section */}
                    <section className="settings-card" id="model">
                        <div className="card-header">
                            <span className="card-icon">🧠</span>
                            <h3>Pengaturan Model AI</h3>
                        </div>
                        <div className="card-body">
                            <div className="setting-group">
                                <label>PENYEDIA MODEL (PROVIDER)</label>
                                <select className="setting-select">
                                    <option>Cloud (OpenAI / Anthropic)</option>
                                    <option>Local (Ollama / Llama.cpp)</option>
                                </select>
                            </div>
                            <div className="setting-group">
                                <label>API KEY</label>
                                <input type="password" defaultValue="••••••••••••••••" readOnly className="setting-input" />
                            </div>
                            <div className="setting-group">
                                <label>SELEKSI MODEL</label>
                                <select className="setting-select">
                                    <option>GPT-4o</option>
                                    <option>Claude 3.5 Sonnet</option>
                                    <option>Llama 3</option>
                                </select>
                            </div>
                            <div className="setting-divider"></div>
                            <div className="setting-group">
                                <div className="slider-header">
                                    <label>TEMPERATURE (0.0 - 2.0)</label>
                                    <span>0.7</span>
                                </div>
                                <input type="range" min="0" max="2" step="0.1" defaultValue="0.7" className="setting-slider" />
                                <div className="slider-labels">
                                    <span>PREDIKTIF</span>
                                    <span>KREATIF</span>
                                </div>
                            </div>
                            <div className="setting-group">
                                <label>MAX TOKENS</label>
                                <input type="number" defaultValue="2048" className="setting-input" />
                            </div>
                        </div>
                    </section>

                    {/* Persona Section */}
                    <section className="settings-card" id="persona">
                        <div className="card-header">
                            <span className="card-icon">🎭</span>
                            <h3>Pengaturan Karakter & Persona</h3>
                        </div>
                        <div className="card-body">
                            <div className="setting-group">
                                <label>PERSONA PRESETS</label>
                                <div className="preset-grid">
                                    <div className="preset-item active">Guru Formal</div>
                                    <div className="preset-item">Teman Santai</div>
                                    <div className="preset-item">Asisten Ahli</div>
                                </div>
                            </div>
                            <div className="setting-group">
                                <label>SYSTEM PROMPT / PERILAKU</label>
                                <textarea className="setting-textarea" defaultValue="Anda adalah seorang guru bahasa Indonesia yang sabar dan profesional. Gunakan bahasa yang baku namun mudah dimengerti. Berikan contoh konkret untuk setiap penjelasan." rows={4}></textarea>
                            </div>
                        </div>
                    </section>

                    {/* TTS Section */}
                    <section className="settings-card" id="tts">
                        <div className="card-header">
                            <span className="card-icon">🎙️</span>
                            <h3>Pengaturan Suara (TTS)</h3>
                        </div>
                        <div className="card-body">
                            <div className="setting-group">
                                <label>SUMBER SUARA</label>
                                <select className="setting-select">
                                    <option>ElevenLabs API</option>
                                    <option>Local TTS (Edge)</option>
                                </select>
                            </div>
                            <div className="setting-group">
                                <label>MODEL SUARA</label>
                                <select className="setting-select">
                                    <option>Siti (Feminin - Clear)</option>
                                    <option>Budi (Maskulin - Deep)</option>
                                </select>
                            </div>
                            <div className="setting-group">
                                <div className="slider-header">
                                    <label>KECEPATAN BICARA</label>
                                    <span>1.0x</span>
                                </div>
                                <input type="range" min="0.5" max="2" step="0.1" defaultValue="1.0" className="setting-slider" />
                            </div>
                            <div className="setting-group">
                                <div className="slider-header">
                                    <label>VOLUME</label>
                                    <span>80%</span>
                                </div>
                                <input type="range" min="0" max="100" defaultValue="80" className="setting-slider" />
                            </div>
                        </div>
                    </section>

                    {/* Avatar Section */}
                    <section className="settings-card" id="avatar">
                        <div className="card-header">
                            <span className="card-icon">🧍</span>
                            <h3>Pengaturan Avatar 3D & Animasi</h3>
                        </div>
                        <div className="card-body">
                            <div className="setting-group">
                                <label>PILIH KARAKTER</label>
                                <div className="avatar-grid">
                                    <div className="avatar-upload">UPLOAD VRM</div>
                                    <div className="avatar-item active">Avatar 1</div>
                                    <div className="avatar-item">Avatar 2</div>
                                    <div className="avatar-item">Avatar 3</div>
                                </div>
                            </div>
                            <div className="setting-group">
                                <div className="slider-header">
                                    <label>FREKUENSI ANIMASI IDLE</label>
                                    <span>Sedang</span>
                                </div>
                                <input type="range" min="1" max="3" defaultValue="2" className="setting-slider" />
                            </div>
                            <div className="setting-group">
                                <label>KUALITAS RENDER</label>
                                <div className="render-quality-toggle">
                                    <button>Low</button>
                                    <button className="active">Medium</button>
                                    <button>High</button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* UI Section */}
                    <section className="settings-card" id="ui">
                        <div className="card-header">
                            <span className="card-icon">👁️</span>
                            <h3>Pengaturan UI & Aksesibilitas</h3>
                        </div>
                        <div className="card-body">
                            <div className="setting-row">
                                <div className="setting-info">
                                    <h4>Transkrip Subtitle</h4>
                                    <p>Tampilkan teks dialog saat AI berbicara</p>
                                </div>
                                <div className="toggle-switch active">
                                    <div className="toggle-knob"></div>
                                </div>
                            </div>
                            <div className="setting-row">
                                <div className="setting-info">
                                    <h4>Tema Aplikasi</h4>
                                    <p>Pilih skema warna antarmuka</p>
                                </div>
                                <div className="theme-toggle">
                                    <button className="theme-btn light">☀️</button>
                                    <button className="theme-btn dark active">🌙</button>
                                </div>
                            </div>
                            <div className="setting-group">
                                <label>UKURAN FONT</label>
                                <select className="setting-select">
                                    <option>Kecil (14px)</option>
                                    <option>Sedang (16px)</option>
                                    <option>Besar (18px)</option>
                                </select>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="settings-footer">
                    <button className="btn-cancel">Batalkan Perubahan</button>
                    <button className="btn-save">Simpan Pengaturan</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
