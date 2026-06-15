import React, { useEffect, useState } from 'react';
import BackgroundShader from './BackgroundShader';
import './KnowledgeGraph3D.css';

const KnowledgeGraph3D = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [terminalMessages, setTerminalMessages] = useState([
        "> INITIATING_NODE_RECON... SUCCESS",
        "> ANALYZING_TRAFFIC_PATTERN [04:22:11]",
        "> PACKET_LOSS: 0.0002%",
        "> WARNING: EXTERNAL_QUERY_DETECTED",
        "> FILTERING_NOISE..."
    ]);

    useEffect(() => {
        // Trigger animations after mount
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, 100);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const fullMessages = [
            "> REDIRECTING_ROUTING_TABLE...",
            "> BUFFER_SIZE_OVERRIDE: 4096KB",
            "> TRACING_PACKET_ORIGIN...",
            "> NODE_ENCRYPTION_LAYER_3_VERIFIED",
            "> SCANNING_REDUNDANT_NODES...",
            "> DATA_CORRUPTION_INDEX: 0.00%"
        ];
        let index = 0;

        const interval = setInterval(() => {
            setTerminalMessages(prev => {
                const newMsg = fullMessages[index % fullMessages.length];
                index++;
                const updated = [...prev, newMsg];
                if (updated.length > 8) {
                    updated.shift();
                }
                return updated;
            });
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="knowledge-graph-container">
            <BackgroundShader />
            <div className="scanline-overlay"></div>

            <main className="relative w-full h-full flex items-center justify-between px-16 overflow-hidden z-10">
                {/* Simulated 3D wireframe sphere (Centered Absolutely) */}
                <div className="sphere-container animate-rotate flex items-center justify-center pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="sphere-wireframe flex items-center justify-center">
                        <div className="ring" style={{ transform: 'rotateY(0deg)' }}></div>
                        <div className="ring" style={{ transform: 'rotateY(45deg)' }}></div>
                        <div className="ring" style={{ transform: 'rotateY(90deg)' }}></div>
                        <div className="ring" style={{ transform: 'rotateY(135deg)' }}></div>
                        <div className="ring" style={{ transform: 'rotateX(90deg)' }}></div>
                        {/* Core Glow */}
                        <div className="absolute w-32 h-32 bg-[#c3c6d7]/20 blur-[60px] rounded-full"></div>
                    </div>
                    {/* Floating Data Nodes */}
                    <div className="absolute" style={{ transform: 'translateZ(250px) translateX(100px) translateY(-50px)' }}>
                        <div className="w-2 h-2 bg-[#c3c6d7] shadow-[0_0_10px_#c3c6d7] rounded-full pulse-indicator"></div>
                    </div>
                    <div className="absolute" style={{ transform: 'translateZ(-200px) translateX(-150px) translateY(80px)' }}>
                        <div className="w-1.5 h-1.5 bg-[#c3c0ff] shadow-[0_0_10px_#c3c0ff] rounded-full pulse-indicator"></div>
                    </div>
                </div>

                {/* GRAPH_CONTROLS Panel (Left) */}
                <section className={`w-80 space-y-8 relative z-20 ${isVisible ? 'panel-visible' : 'panel-enter'}`} id="graph-controls">
                    <div className="bracket-container p-6 bg-[#0c0f0f]/40 backdrop-blur-md border border-white/5">
                        <div className="bracket-tl"></div><div className="bracket-tr"></div>
                        <h3 className="font-['Outfit'] text-[14px] font-semibold text-[#c3c6d7] mb-6 tracking-[0.2em]">GRAPH_CONTROLS</h3>
                        
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/60 mb-2">
                                    <span>RESOLUTION</span>
                                    <span>84%</span>
                                </div>
                                <div className="h-1 bg-[#333535] relative overflow-hidden group">
                                    <div className="absolute h-full bg-[#c3c6d7] w-[84%]"></div>
                                    <div className="absolute h-full bg-white/20 w-1 group-hover:translate-x-full transition-transform"></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/60 mb-2">
                                    <span>NODE_DENSITY</span>
                                    <span>0.42</span>
                                </div>
                                <input className="w-full h-1 bg-[#333535] accent-[#c3c6d7] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#c3c6d7]/50" type="range" defaultValue={42}/>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-4">
                                <button className="glow-hover border border-[#46464c] px-4 py-2 font-['Outfit'] text-[12px] font-semibold tracking-[0.2em] text-center transition-all bg-transparent text-[#e2e2e2]">RE_MAP</button>
                                <button className="glow-hover border border-[#46464c] px-4 py-2 font-['Outfit'] text-[12px] font-semibold tracking-[0.2em] text-center transition-all bg-transparent text-[#e2e2e2]">ISOLATE</button>
                            </div>
                        </div>
                    </div>
                    
                    {/* System Metrics */}
                    <div className="px-6 py-4 border-l-2 border-[#c3c6d7]/20 space-y-4">
                        <div className="flex justify-between items-end">
                            <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/40">MEMORY_LOAD</span>
                            <span className="font-['Outfit'] text-[24px] font-light tracking-[0.05em] text-[#c3c6d7]">1.2GB</span>
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/40">LATENCY</span>
                            <span className="font-['Outfit'] text-[24px] font-light tracking-[0.05em] text-[#c3c0ff]">04ms</span>
                        </div>
                    </div>
                </section>

                {/* NODE_INTEL Panel (Right) */}
                <section className={`w-96 space-y-8 relative z-20 ${isVisible ? 'panel-visible' : 'panel-enter-right'}`} id="node-intel">
                    <div className="bracket-container p-6 bg-[#0c0f0f]/40 backdrop-blur-md border border-white/5">
                        <div className="bracket-tl"></div><div className="bracket-tr"></div>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="font-['Outfit'] text-[32px] font-bold tracking-[0.08em] leading-none mb-1 text-[#e2e2e2]">NODE_INTEL</h2>
                                <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c3c0ff]">SECTOR_7_CENTRAL</span>
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1 bg-[#c3c6d7]/10 border border-[#c3c6d7]/20 rounded">
                                <div className="w-2 h-2 rounded-full bg-[#c3c6d7] pulse-indicator"></div>
                                <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c3c6d7]">LIVE_SYNC</span>
                            </div>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
                                <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/60">ENCRYPTION_STRENGTH</span>
                                <div className="flex gap-1 items-center">
                                    <div className="h-2 w-4 bg-[#c3c6d7]"></div>
                                    <div className="h-2 w-4 bg-[#c3c6d7]"></div>
                                    <div className="h-2 w-4 bg-[#c3c6d7]"></div>
                                    <div className="h-2 w-4 bg-[#c3c6d7]/20"></div>
                                    <div className="h-2 w-4 bg-[#c3c6d7]/20"></div>
                                    <span className="ml-auto font-['Outfit'] text-sm font-light tracking-[0.05em] text-[#c3c6d7]">AES_256</span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/60 block mb-1">RELEVANCE_SCORE</span>
                                    <span className="font-['Outfit'] text-[28px] font-bold tracking-[0.1em] text-[#e2e2e2]">98.4</span>
                                </div>
                                <div>
                                    <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/60 block mb-1">DATA_TYPE</span>
                                    <span className="font-['Outfit'] text-lg font-bold tracking-[0.08em] text-[#c3c0ff]">NEURAL_NET</span>
                                </div>
                            </div>
                            
                            <div className="pt-4">
                                <div className="flex items-center gap-4 group cursor-pointer">
                                    <div className="w-12 h-12 flex items-center justify-center border border-[#c3c6d7]/30 group-hover:border-[#c3c6d7] transition-all">
                                        <span className="material-symbols-outlined text-[#c3c6d7]" data-icon="terminal">terminal</span>
                                    </div>
                                    <div>
                                        <h4 className="font-['Outfit'] text-[12px] font-semibold tracking-[0.2em] text-[#e2e2e2] group-hover:translate-x-1 transition-all">DECRYPT_LOGS</h4>
                                        <p className="text-[10px] text-[#c7c6cc]/60">Requires clearance level 4+</p>
                                    </div>
                                </div>
                            </div>
                            
                            <button className="w-full py-4 bg-[#c3c6d7] text-[#2c303d] font-['Outfit'] font-semibold tracking-[0.2em] text-[12px] hover:bg-white hover:text-black transition-colors flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-sm" data-icon="bolt">bolt</span>
                                INITIATE_HANDSHAKE
                            </button>
                        </div>
                    </div>
                    
                    {/* Terminal Stream Simulation */}
                    <div className="font-mono text-[10px] text-[#c3c6d7]/40 p-4 bg-black/40 h-32 overflow-hidden border border-white/5">
                        <div className="flex flex-col gap-1">
                            {terminalMessages.map((msg, idx) => (
                                <p key={idx}>{msg}</p>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer Stats */}
            <footer className="absolute bottom-0 w-full px-16 py-8 flex justify-between items-end pointer-events-none z-10">
                <div className="flex gap-8">
                    <div className="flex flex-col">
                        <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/40">GEO_LOC</span>
                        <span className="font-['Outfit'] text-[12px] font-semibold tracking-[0.2em] text-[#e2e2e2]">PRAGUE_CELL_7</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/40">UPTIME</span>
                        <span className="font-['Outfit'] text-[12px] font-semibold tracking-[0.2em] text-[#e2e2e2]">144:12:09</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-['Outfit'] text-[10px] font-semibold tracking-[0.2em] text-[#c7c6cc]/40">SYSTEM_STATUS</p>
                        <p className="font-['Outfit'] text-[12px] font-semibold tracking-[0.2em] text-[#c3c6d7]">OPERATIONAL</p>
                    </div>
                    <div className="w-16 h-[2px] bg-[#c3c6d7]"></div>
                </div>
            </footer>
        </div>
    );
};

export default KnowledgeGraph3D;
