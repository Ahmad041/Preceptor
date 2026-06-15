import React, { useState, useEffect } from 'react';
import './BootScreen.css';

const BootScreen = ({ onComplete }) => {
    const loadingTexts = [
        "Initializing AI Core...",
        "Syncing Neural Pathways...",
        "Loading Aesthetic Matrices...",
        "Calibrating Emotional Subroutines...",
        "Establishing Connection..."
    ];

    const [textIndex, setTextIndex] = useState(0);
    const [progress, setProgress] = useState(33);
    const [fade, setFade] = useState(true);

    useEffect(() => {
        const textInterval = setInterval(() => {
            setFade(false);
            setTimeout(() => {
                setTextIndex(prev => (prev + 1) % loadingTexts.length);
                setFade(true);
            }, 500);

            setProgress(prev => {
                const newWidth = Math.min(100, Math.max(20, prev + (Math.random() * 20 - 5)));
                return newWidth;
            });
        }, 3000);

        return () => clearInterval(textInterval);
    }, []);

    useEffect(() => {
        const bootTimer = setTimeout(() => {
            if (onComplete) onComplete();
        }, 5000);
        return () => clearTimeout(bootTimer);
    }, [onComplete]);

    // Exact Stitch design colors
    const C = {
        primary: '#974362',
        primaryContainer: '#ffa8c4',
        primaryFixed: '#ffa8c4',
        primaryDim: '#883756',
        surface: '#fef8fa',
        surfaceContainerLow: '#f8f2f4',
        surfaceContainerLowest: '#ffffff',
        surfaceContainerHighest: '#e7e1e4',
        onSurface: '#343135',
        onSurfaceVariant: '#625e61',
        onPrimary: '#fff7f7',
        outlineVariant: '#b6b0b4',
    };

    return (
        <div
            className="boot-screen"
            style={{
                background: C.surface,
                color: C.onSurface,
                fontFamily: '"Be Vietnam Pro", sans-serif',
                overflow: 'hidden',
                height: '100vh',
                width: '100vw',
                position: 'relative',
            }}
        >
            {/* Content Overlay */}
            <div
                className="boot-screen__overlay"
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${C.surface}4D`, /* /30 opacity */
                    backdropFilter: 'blur(64px)',
                    WebkitBackdropFilter: 'blur(64px)',
                }}
            >
                {/* Central AI Core */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 256, height: 256, marginBottom: 48 }}>
                    {/* Pulsing Rings */}
                    <div
                        className="boot-pulse-ring"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '50%',
                            border: `1px solid ${C.primaryContainer}`,
                            opacity: 0.5,
                        }}
                    />
                    <div
                        className="boot-pulse-ring"
                        style={{
                            position: 'absolute',
                            inset: 16,
                            borderRadius: '50%',
                            border: `1px solid ${C.primary}`,
                            animationDelay: '0.5s',
                        }}
                    />

                    {/* Core Sphere */}
                    <div
                        style={{
                            width: 128,
                            height: 128,
                            borderRadius: '50%',
                            background: `linear-gradient(to bottom right, ${C.primary}, ${C.primaryContainer})`,
                            boxShadow: '0 0 48px rgba(151, 67, 98, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            zIndex: 20,
                        }}
                    >
                        <span
                            className="material-symbols-outlined boot-icon-pulse"
                            style={{
                                color: C.onPrimary,
                                fontSize: 60,
                                fontVariationSettings: "'FILL' 1",
                            }}
                        >
                            all_inclusive
                        </span>
                    </div>

                    {/* Orbital Elements */}
                    <div className="boot-orbit" style={{ position: 'absolute', inset: 0 }}>
                        <div
                            style={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: C.primaryFixed,
                                position: 'absolute',
                                top: 0,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                boxShadow: '0 0 12px rgba(255, 168, 196, 0.8)',
                            }}
                        />
                    </div>
                </div>

                {/* Status Text */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <h1
                        className="boot-text-flicker"
                        style={{
                            color: C.primary,
                            fontSize: '2.25rem',
                            fontWeight: 700,
                            letterSpacing: '-0.025em',
                            fontFamily: '"Plus Jakarta Sans", sans-serif',
                            margin: 0,
                        }}
                    >
                        Bocchi AI
                    </h1>

                    <div
                        style={{
                            background: `${C.surfaceContainerLow}99`, /* /60 opacity */
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            padding: '12px 24px',
                            borderRadius: 9999,
                            border: `1px solid ${C.outlineVariant}33`, /* /20 opacity */
                            boxShadow: `0 10px 15px -3px ${C.primaryDim}0D`, /* /5 opacity */
                        }}
                    >
                        <p
                            style={{
                                color: C.onSurfaceVariant,
                                fontSize: 14,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                fontWeight: 500,
                                fontFamily: '"Plus Jakarta Sans", sans-serif',
                                margin: 0,
                                transition: 'opacity 0.5s ease-in-out',
                                opacity: fade ? 1 : 0,
                            }}
                        >
                            {loadingTexts[textIndex]}
                        </p>
                    </div>

                    {/* Progress Bar */}
                    <div
                        style={{
                            width: 256,
                            height: 4,
                            marginTop: 24,
                            background: C.surfaceContainerHighest,
                            borderRadius: 9999,
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            className="boot-progress-pulse"
                            style={{
                                height: '100%',
                                background: `linear-gradient(to right, ${C.primaryContainer}, ${C.primary})`,
                                borderRadius: 9999,
                                width: `${progress}%`,
                                transition: 'width 1s ease-in-out',
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* System Status Bottom Right */}
            <div
                className="boot-text-flicker"
                style={{
                    position: 'absolute',
                    bottom: 32,
                    right: 32,
                    zIndex: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: `${C.surfaceContainerLowest}66`, /* /40 opacity */
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: `1px solid ${C.outlineVariant}1A`, /* /10 opacity */
                    boxShadow: '0 8px 32px 0 rgba(151, 67, 98, 0.04)',
                }}
            >
                <div className="boot-ping" style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 10, color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        SYSTEM_STATUS
                    </span>
                    <span style={{ fontSize: 12, color: C.primary, fontWeight: 500, fontFamily: '"Be Vietnam Pro", sans-serif' }}>
                        Booting Sequence
                    </span>
                </div>
            </div>

            {/* Decorative Corner Elements */}
            <div style={{ position: 'absolute', top: 32, left: 32, zIndex: 20, opacity: 0.3 }}>
                <svg fill="none" height="40" viewBox="0 0 40 40" width="40">
                    <path d="M0 0H10V2H2V10H0V0Z" fill={C.primary} />
                </svg>
            </div>
            <div style={{ position: 'absolute', top: 32, right: 32, zIndex: 20, opacity: 0.3 }}>
                <svg fill="none" height="40" viewBox="0 0 40 40" width="40">
                    <path d="M40 0H30V2H38V10H40V0Z" fill={C.primary} />
                </svg>
            </div>
            <div style={{ position: 'absolute', bottom: 32, left: 32, zIndex: 20, opacity: 0.3 }}>
                <svg fill="none" height="40" viewBox="0 0 40 40" width="40">
                    <path d="M0 40H10V38H2V30H0V40Z" fill={C.primary} />
                </svg>
            </div>
        </div>
    );
};

export default BootScreen;

