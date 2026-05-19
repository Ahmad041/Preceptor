import React, { useState, useEffect } from 'react';
import './InteractiveOffice.css';

const FLOOR_1_IMG = '/office/floor1.png';
const FLOOR_2_IMG = '/office/floor2.png';
const AVATARS_IMG = '/office/avatars.png';
const USER_IMG = '/office/user.png';

const AGENT_POSITIONS = {
    1: [ // Floor 1
        { id: 'lead', x: 45, y: 35, label: 'Meeting Room' },      // Seika
        { id: 'soft', x: 20, y: 75, label: 'Music Studio' },      // Bocchi
        { id: 'content', x: 75, y: 30, label: 'Kitchen/Dining' }, // Nijika
        { id: 'scout', x: 75, y: 70, label: 'Main Workspace' },   // Hiroi
    ],
    2: [ // Floor 2
        { id: 'docs', x: 20, y: 30, label: 'Room A' },      // Ryo
        { id: 'analyst', x: 50, y: 30, label: 'Room B' },   // Kita
        { id: 'mon', x: 80, y: 30, label: 'Room C' },       // PA-san
    ]
};

const AGENT_SPRITES = {
    lead: 0,    // Seika
    soft: 1,    // Bocchi
    docs: 2,    // Ryo
    mon: 3,     // PA-san
    scout: 4,   // Hiroi
    analyst: 5, // Kita
    content: 6, // Nijika
};

const InteractiveOffice = ({ agents, onSelectAgent, agentActivity }) => {
    const [floor, setFloor] = useState(1);
    const [userPos, setUserPos] = useState({ x: 50, y: 80 });
    const [userDir, setUserDir] = useState('front');

    const activeAgents = AGENT_POSITIONS[floor];

    useEffect(() => {
        const handleKeyDown = (e) => {
            const step = 2;
            setUserPos(prev => {
                let { x, y } = prev;
                if (e.key === 'ArrowUp' || e.key === 'w') {
                    y = Math.max(5, y - step);
                    setUserDir('back');
                }
                if (e.key === 'ArrowDown' || e.key === 's') {
                    y = Math.min(95, y + step);
                    setUserDir('front');
                }
                if (e.key === 'ArrowLeft' || e.key === 'a') {
                    x = Math.max(5, x - step);
                    setUserDir('left');
                }
                if (e.key === 'ArrowRight' || e.key === 'd') {
                    x = Math.min(95, x + step);
                    setUserDir('right');
                }
                return { x, y };
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const getDirOffset = (dir) => {
        switch(dir) {
            case 'front': return 0;
            case 'back': return 33.33;
            case 'left': return 66.66;
            case 'right': return 100;
            default: return 0;
        }
    };

    return (
        <div className="interactive-office">
            <div className="floor-controls">
                <button 
                    className={floor === 1 ? 'active' : ''} 
                    onClick={() => setFloor(1)}
                >
                    1F: Activity & Work
                </button>
                <button 
                    className={floor === 2 ? 'active' : ''} 
                    onClick={() => setFloor(2)}
                >
                    2F: Private & Rest
                </button>
            </div>

            <div className="map-container">
                <img 
                    src={floor === 1 ? FLOOR_1_IMG : FLOOR_2_IMG} 
                    alt={`Floor ${floor}`} 
                    className="map-bg"
                />
                
                {/* USER CHARACTER */}
                <div 
                    className="user-avatar-wrapper"
                    style={{ left: `${userPos.x}%`, top: `${userPos.y}%` }}
                >
                    <div 
                        className="avatar-sprite user" 
                        style={{ 
                            backgroundImage: `url(${USER_IMG})`,
                            backgroundPosition: `${getDirOffset(userDir)}% 0%`,
                            backgroundSize: '400% 100%' 
                        }}
                    ></div>
                    <div className="agent-tag user-tag">
                        <span className="tag-name">YOU</span>
                    </div>
                </div>

                {activeAgents.map(pos => {
                    const agent = agents.find(a => a.id === pos.id);
                    if (!agent) return null;
                    const status = agentActivity[agent.id]?.status || "standby";
                    const spriteIdx = AGENT_SPRITES[agent.id] || 0;

                    return (
                        <div 
                            key={agent.id}
                            className={`agent-avatar-wrapper ${status}`}
                            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                            onClick={() => onSelectAgent(agent)}
                        >
                            <div 
                                className="avatar-sprite" 
                                style={{ 
                                    backgroundImage: `url(${AVATARS_IMG})`,
                                    backgroundPosition: `${(spriteIdx / 6) * 100}% 0%`,
                                    backgroundSize: '700% 100%' 
                                }}
                            >
                            </div>
                            <div className="agent-tag">
                                <span className="tag-name">{agent.name.split(' ')[0]}</span>
                                <span className="tag-status">{status.toUpperCase()}</span>
                            </div>
                            {status === 'active' && <div className="activity-indicator"></div>}
                        </div>
                    );
                })}
            </div>

            <div className="room-legend">
                Currently Viewing: <strong>{floor === 1 ? 'GROUND FLOOR' : 'UPPER FLOOR'}</strong> | Use WASD/Arrows to move
            </div>
        </div>
    );
};

export default InteractiveOffice;
