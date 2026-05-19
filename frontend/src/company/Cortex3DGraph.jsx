import React, { useRef, useEffect, useState, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';

const TYPE_COLORS = {
    'Agent': '#ff007f',    // Neon Pink
    'Task': '#a855f7',     // Purple Neon
    'Web': '#38bdf8',      // Light Blue Neon
    'Java': '#fb923c',     // Orange Neon
    'Documents': '#4ade80', // Green Neon
    'Work': '#f87171',     // Soft Red
    'Critical': '#ef4444', // Red Neon
    'Project': '#fbbf24',  // Amber Neon
    'DeepSearch': '#22d3ee', // Cyan Neon for search hits
    'PDF': '#ff0033',      // Pure Neon Red for PDF
    'Folder': '#f8fafc',   // Slate for Folder Nodes (Hubs)
    'default': '#818cf8'   // Indigo Neon
};

const Cortex3DGraph = ({ data, onNodeClick }) => {
    const fgRef = useRef();
    const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef();

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setGraphDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        window.addEventListener('resize', updateDimensions);
        updateDimensions();
        // small delay to ensure flex layout settled
        setTimeout(updateDimensions, 100);

        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <ForceGraph3D
                ref={fgRef}
                width={graphDimensions.width}
                height={graphDimensions.height}
                graphData={data}
                nodeLabel="name"
                nodeColor={node => TYPE_COLORS[node.type] || TYPE_COLORS.default}
                nodeResolution={16}
                nodeOpacity={0.9}
                linkDirectionalParticles={2}
                linkDirectionalParticleSpeed={d => d.value * 0.001 || 0.005}
                linkWidth={0.5}
                linkColor={() => 'rgba(0, 255, 255, 0.2)'}
                backgroundColor="#0a0a0f"
                onNodeClick={(node) => {
                    // Zoom to node
                    const distance = 100;
                    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
                    fgRef.current.cameraPosition(
                        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                        node,
                        3000
                    );
                    if (onNodeClick) onNodeClick(node.id);
                }}
            />
            {/* Cyberpunk Overlay Elements */}
            <div className="cortex-overlay-corners">
                <div className="corner top-left"></div>
                <div className="corner top-right"></div>
                <div className="corner bottom-left"></div>
                <div className="corner bottom-right"></div>
            </div>
            <div className="cortex-scanline"></div>
        </div>
    );
};

export default Cortex3DGraph;
