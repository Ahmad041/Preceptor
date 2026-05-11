import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const CATEGORY_COLORS = {
    'Obsidian': '#d946ef', // Fuchsia Neon
    'Coding': '#0ea5e9',   // Sky Blue Neon
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

const HIGHLIGHT_COLOR = '#00ffff'; // Electric Cyan
const ACTIVE_COLOR = '#ff007f';    // Neon Rose/Pink
const DIM_COLOR = 'rgba(10, 10, 20, 0.5)'; 

const KnowledgeGraph = ({ data, onNodeClick, highlightedNodeIds = [] }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const nodesRef = useRef(null);
    const linksRef = useRef(null);
    const neighborMapRef = useRef(null);
    const sortedNodesRef = useRef(null);
    const transformRef = useRef({ x: 0, y: 0, k: 1 });
    const isLockedRef = useRef(false);
    const targetKRef = useRef(1.4);
    const [uiZoom, setUiZoom] = useState(100);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [draggingNode, setDraggingNode] = useState(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // State for premium features
    const [activeFilters, setActiveFilters] = useState(new Set());
    const [centroids, setCentroids] = useState({});
    const [hoveredContent, setHoveredContent] = useState(null);
    const [isTooltipLoading, setIsTooltipLoading] = useState(false);
    const [appearanceProgress, setAppearanceProgress] = useState(0);
    const [particleDensity, setParticleDensity] = useState(30); // 0-100
    const [extensionFilters, setExtensionFilters] = useState(new Set());
    const [fps, setFps] = useState(0);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [stressTestNodes, setStressTestNodes] = useState([]);
    const [activeTagFilters, setActiveTagFilters] = useState(new Set());
    const [inspectorNote, setInspectorNote] = useState(null);
    const [isInspectorLoading, setIsInspectorLoading] = useState(false);
    const [inspectorPos, setInspectorPos] = useState({ x: 0, y: 0 });
    const fpsRef = useRef({ frames: 0, lastTime: performance.now() });

    // Watched folders management
    const [watchedFolders, setWatchedFolders] = useState([]);
    const [newFolderPath, setNewFolderPath] = useState('');
    const [folderLoading, setFolderLoading] = useState(false);

    // Fetch watched folders from backend
    useEffect(() => {
        const fetchFolders = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/folders');
                setWatchedFolders(res.data.folders || []);
            } catch (err) {
                console.error('Failed to fetch folders', err);
            }
        };
        fetchFolders();
    }, []);

    const handleAddFolder = async () => {
        if (!newFolderPath.trim()) return;
        setFolderLoading(true);
        try {
            await axios.post('http://localhost:8000/api/folders', { path: newFolderPath.trim() });
            const res = await axios.get('http://localhost:8000/api/folders');
            setWatchedFolders(res.data.folders || []);
            setNewFolderPath('');
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to add folder');
        } finally {
            setFolderLoading(false);
        }
    };

    const handleRemoveFolder = async (path) => {
        if (!confirm(`Remove folder from watch list?\n${path}`)) return;
        setFolderLoading(true);
        try {
            await axios.delete('http://localhost:8000/api/folders', { data: { path } });
            const res = await axios.get('http://localhost:8000/api/folders');
            setWatchedFolders(res.data.folders || []);
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to remove folder');
        } finally {
            setFolderLoading(false);
        }
    };

    // --- HD CAPTURE SYSTEM ---
    const handleCapture = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Take data URL from canvas
        const dataUrl = canvas.toDataURL('image/png');
        const blob = await (await fetch(dataUrl)).blob();
        const formData = new FormData();
        formData.append('file', blob, 'capture.png');

        try {
            await axios.post('http://localhost:8000/api/upload-capture', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            console.log("[SYSTEM] HD Capture uploaded successfully.");
        } catch (err) {
            console.error("[SYSTEM] Failed to upload capture", err);
        }
    }, []);

    useEffect(() => {
        const pollCapture = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/system/capture-status');
                if (res.data.requested) {
                    console.log("[SYSTEM] HD Capture requested by agent.");
                    handleCapture();
                    // Clear the flag on backend
                    await axios.post('http://localhost:8000/api/system/capture-clear');
                }
            } catch (err) {
                // Polling fail silent
            }
        };

        const interval = setInterval(pollCapture, 3000);
        return () => clearInterval(interval);
    }, [handleCapture]);
    // -------------------------


    const availableFolders = useMemo(() => {
        if (!data || !data.nodes) return [];
        const folders = data.nodes.map(n => n.root_folder || 'Unknown');
        return [...new Set(folders)].sort();
    }, [data]);

    const availableExtensions = useMemo(() => {
        if (!data || !data.nodes) return [];
        const exts = data.nodes.map(n => {
            if (!n || !n.path) return 'none';
            const parts = n.path.split('.');
            return parts.length > 1 ? parts.pop().toLowerCase() : 'none';
        });
        return [...new Set(exts)].sort();
    }, [data]);

    const availableTags = useMemo(() => {
        if (!data || !data.nodes) return [];
        const tags = data.nodes.flatMap(n => n.tags || []);
        return [...new Set(tags)].sort();
    }, [data]);

    const filteredNodes = useMemo(() => {
        if (!data) return [];
        let hasSun = false;
        const nodesData = data.nodes || [];
        
        // Combine with stress test nodes
        const combinedData = [...nodesData, ...stressTestNodes];
        
        const result = combinedData.filter(n => {
            if (!n) return false;
            
            // Matahari selalu terlihat (Pusat Tata Surya)
            if (n.title?.toLowerCase().includes('memori_bocchi') || n.title?.toLowerCase() === 'matahari' || n.is_system) {
                hasSun = true;
                return true;
            }

            const folder = n.root_folder || 'Unknown';
            const ext = n.path?.split('.')?.pop()?.toLowerCase() || 'none';
            const tags = n.tags || [];
            
            // Filter by folder, extension, and tags
            const matchesFolder = activeFilters.size === 0 || activeFilters.has(folder);
            const matchesExt = extensionFilters.size === 0 || extensionFilters.has(ext);
            const matchesTags = activeTagFilters.size === 0 || tags.some(t => activeTagFilters.has(t));

            

            const isVisible = matchesFolder && matchesExt && matchesTags;
            
            if (!isVisible) return false;

            // Deterministic density filter
            const hash = n.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return (hash % 100) < particleDensity;
        });

        if (!hasSun) {
            result.push({
                id: 'memori_bocchi.json',
                title: 'Matahari (Memori Bocchi)',
                path: 'memori_bocchi.json',
                root_folder: 'System',
                is_system: true
            });
        }
        return result;
    }, [data, activeFilters, extensionFilters, particleDensity, stressTestNodes]);

    const filteredLinks = useMemo(() => {
        if (!data || !data.links || filteredNodes.length === 0) return [];
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        return data.links.filter(l => {
            const sId = (l.source && typeof l.source === 'object') ? l.source.id : l.source;
            const tId = (l.target && typeof l.target === 'object') ? l.target.id : l.target;
            return nodeIds.has(sId) && nodeIds.has(tId);
        });
    }, [data, filteredNodes]);

    const subFolders = useMemo(() => {
        return [...new Set(filteredNodes.map(n => n.folder || 'Root'))].sort();
    }, [filteredNodes]);

    // Initial filter setup (Restore from localStorage)
    useEffect(() => {
        const savedFilters = localStorage.getItem('kg-active-filters');
        const savedExts = localStorage.getItem('kg-extension-filters');
        const savedDensity = localStorage.getItem('kg-particle-density');

        if (savedFilters) {
            try {
                const parsed = JSON.parse(savedFilters);
                if (parsed.length > 0) {
                    setActiveFilters(new Set(parsed));
                } else if (availableFolders.length > 0) {
                    setActiveFilters(new Set(availableFolders));
                }
            } catch (e) {
                if (availableFolders.length > 0) setActiveFilters(new Set(availableFolders));
            }
        } else if (availableFolders.length > 0) {
            setActiveFilters(new Set(availableFolders));
        }

        if (savedExts) {
            try {
                const parsed = JSON.parse(savedExts);
                if (parsed.length > 0) {
                    setExtensionFilters(new Set(parsed));
                } else if (availableExtensions.length > 0) {
                    setExtensionFilters(new Set(availableExtensions));
                }
            } catch (e) {
                if (availableExtensions.length > 0) setExtensionFilters(new Set(availableExtensions));
            }
        } else if (availableExtensions.length > 0) {
            setExtensionFilters(new Set(availableExtensions));
        }

        if (savedDensity) {
            setParticleDensity(parseInt(savedDensity));
        }
    }, [availableFolders, availableExtensions]);

    // Save filters to localStorage whenever they change
    useEffect(() => {
        if (activeFilters.size > 0) localStorage.setItem('kg-active-filters', JSON.stringify([...activeFilters]));
        if (extensionFilters.size > 0) localStorage.setItem('kg-extension-filters', JSON.stringify([...extensionFilters]));
        localStorage.setItem('kg-particle-density', particleDensity);
    }, [activeFilters, extensionFilters, particleDensity]);

    // Dimensions Observer (Robust ResizeObserver)
    useEffect(() => {
        if (!containerRef.current) return;
        
        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                    if (transformRef.current.x === 0 && transformRef.current.y === 0) {
                        transformRef.current = { x: width / 2, y: height / 2, k: 0.6 };
                        setUiZoom(60);
                    }
                }
            }
        });
        
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const toggleFilter = (folder) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            if (next.has(folder)) { next.delete(folder); }
            else { next.add(folder); }
            return next;
        });
    };

    const addAlpha = (color, opacity) => {
        if (!color) return `rgba(255, 255, 255, ${opacity})`;
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        if (color.startsWith('rgba')) {
            return color.replace(/[\d.]+\s*\)$/g, `${opacity})`);
        }
        return color;
    };

    useEffect(() => {
        if (!data || filteredNodes.length === 0) {
            nodesRef.current = [];
            linksRef.current = [];
            sortedNodesRef.current = [];
            return;
        }

        const CODE_EXTENSIONS = new Set(['py', 'js', 'jsx', 'ts', 'tsx', 'c', 'cpp', 'h', 'hpp', 'php', 'html', 'css', 'sh', 'json']);

        const nodes = filteredNodes.map(node => {
            const isSun = node.title?.toLowerCase().includes('memori_bocchi') || node.title?.toLowerCase() === 'matahari';
            const ext = node.path?.split('.')?.pop()?.toLowerCase() || 'none';
            const isCode = CODE_EXTENSIONS.has(ext);
            
            return {
                ...node,
                isSun,
                ext,
                isCode,
                x: isSun ? 0 : (node.x || (Math.random() - 0.5) * 800),
                y: isSun ? 0 : (node.y || (Math.random() - 0.5) * 800),
                fx: isSun ? 0 : null,
                fy: isSun ? 0 : null,
                radius: isSun ? 50 : 5
            };
        });

        const folderMap = new Map();
        const hierarchyLinks = [];
        const sunNode = nodes.find(n => n.isSun);

        nodes.forEach(node => {
            if (node.isSun) return;
            
            // Normalize slashes
            const relPath = node.relative_path ? node.relative_path.replace(/\\/g, '/') : node.folder || 'Root';
            const parts = relPath.split('/');
            
            // The last part is the file itself, the preceding parts are folders
            const folderParts = parts.length > 1 ? parts.slice(0, -1) : [node.folder || 'Root'];
            
            let currentPath = '';
            let parentId = null;

            folderParts.forEach((part, index) => {
                const isRoot = index === 0;
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                const folderId = `folder:${currentPath}`;
                
                if (!folderMap.has(folderId)) {
                    folderMap.set(folderId, {
                        id: folderId,
                        title: part,
                        fullPath: currentPath,
                        isFolder: true,
                        isRootFolder: isRoot,
                        root_folder: folderParts[0],
                        radius: isRoot ? 28 : 18,
                        x: (Math.random() - 0.5) * 400,
                        y: (Math.random() - 0.5) * 400,
                        orbitalLevel: index + 1
                    });
                    
                    // Link to parent or Sun
                    if (isRoot) {
                        if (sunNode) {
                            hierarchyLinks.push({ source: sunNode.id, target: folderId, isFolderLink: true });
                        }
                    } else if (parentId) {
                        hierarchyLinks.push({ source: parentId, target: folderId, isFolderLink: true });
                    }
                }
                parentId = folderId;
            });
            
            // Link file to its immediate parent folder
            if (parentId) {
                hierarchyLinks.push({ source: parentId, target: node.id, isFolderLink: true });
                node.parentPlanetId = parentId;
                node.orbitalLevel = folderParts.length + 1;
            } else {
                node.orbitalLevel = 1;
            }
        });

        const folderNodes = Array.from(folderMap.values());
        const rootPlanets = folderNodes.filter(f => f.isRootFolder);
        const rootPlanetNames = rootPlanets.map(f => f.title);
        const allNodes = [...nodes, ...folderNodes];
        
        // Link resolution and parent caching (O(1) tick optimization)
        allNodes.forEach(node => {
            if (node.isSun) {
                node.orbitalLevel = 0;
            } else if (node.isRootFolder) {
                const planetIndex = rootPlanetNames.indexOf(node.title);
                node.orbitalRadius = 400 + (planetIndex * 250);
                node.orbitalSpeed = 0.0003 / (1 + planetIndex * 0.3);
                node.angle = (planetIndex / rootPlanets.length) * Math.PI * 2;
            } else if (node.isFolder) {
                node.orbitalRadius = 150 + (Math.random() * 50);
                node.orbitalSpeed = 0.001 + (Math.random() * 0.001);
                node.angle = Math.random() * Math.PI * 2;
                const parentLink = hierarchyLinks.find(l => l.target === node.id);
                if (parentLink) node.parentPlanetId = parentLink.source;
            } else {
                node.orbitalRadius = 60 + (Math.random() * 60);
                node.orbitalSpeed = 0.0015 + (Math.random() * 0.002);
                node.angle = Math.random() * Math.PI * 2;
            }

            if (node.parentPlanetId) {
                node.parentPlanetObj = allNodes.find(n => n.id === node.parentPlanetId);
            }
        });

        const links = [
            ...filteredLinks.map(link => ({
                ...link,
                source: allNodes.find(n => n.id === (link.source && typeof link.source === 'object' ? link.source.id : link.source)),
                target: allNodes.find(n => n.id === (link.target && typeof link.target === 'object' ? link.target.id : link.target))
            })).filter(l => l.source && l.target),
            ...hierarchyLinks.map(link => ({
                ...link,
                source: allNodes.find(n => n.id === link.source),
                target: allNodes.find(n => n.id === link.target)
            })).filter(l => l.source && l.target)
        ];

        nodesRef.current = allNodes;
        linksRef.current = links;
        sortedNodesRef.current = [...allNodes].sort((a, b) => {
            if (a.isSun) return 1;
            if (b.isSun) return -1;
            return (a.isFolder ? 1 : -1);
        });

        const neighborMap = new Map();
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (!neighborMap.has(s)) neighborMap.set(s, new Set());
            if (!neighborMap.has(t)) neighborMap.set(t, new Set());
            neighborMap.get(s).add(t);
            neighborMap.get(t).add(s);
        });
        neighborMapRef.current = neighborMap;

        const centroidTimer = setInterval(() => {
            const currentNodes = nodesRef.current;
            if (!currentNodes) return;
            const newCentroids = {};
            activeFilters.forEach(folder => {
                const fNodes = currentNodes.filter(n => n.root_folder === folder);
                if (fNodes.length > 0) {
                    newCentroids[folder] = {
                        x: fNodes.reduce((sum, n) => sum + n.x, 0) / fNodes.length,
                        y: fNodes.reduce((sum, n) => sum + n.y, 0) / fNodes.length
                    };
                }
            });
            setCentroids(newCentroids);
        }, 500);

        setAppearanceProgress(0);
        const start = Date.now();
        const timer = setInterval(() => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / 1000, 1);
            setAppearanceProgress(progress);
            if (progress >= 1) clearInterval(timer);
        }, 16);

        return () => {
            clearInterval(timer);
            clearInterval(centroidTimer);
        };
    }, [data, filteredNodes, filteredLinks]);

    useEffect(() => {
        if (!canvasRef.current || !dimensions.width) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        let animationFrame;

        const draw = () => {
            const nodes = nodesRef.current;
            const links = linksRef.current;
            const sortedNodes = sortedNodesRef.current;
            if (!nodes || !links || !sortedNodes) {
                animationFrame = requestAnimationFrame(draw);
                return;
            }

            const now = Date.now();

            // FPS tracking
            fpsRef.current.frames++;
            const elapsed = performance.now() - fpsRef.current.lastTime;
            if (elapsed >= 1000) {
                setFps(Math.round(fpsRef.current.frames * 1000 / elapsed));
                fpsRef.current.frames = 0;
                fpsRef.current.lastTime = performance.now();
            }

            ctx.save();
            ctx.fillStyle = '#020008';
            ctx.fillRect(0, 0, dimensions.width, dimensions.height);

            // Grid removed for performance

            // Update Camera Lock if active
            if (isLockedRef.current && selectedId) {
                const sNode = sortedNodes.find(n => n.id === selectedId);
                if (sNode && !draggingNode?.isBackground) {
                    const k = targetKRef.current;
                    const targetX = dimensions.width / 2 - sNode.x * k;
                    const targetY = dimensions.height / 2 - sNode.y * k;
                    const ease = 0.08;
                    transformRef.current.x += (targetX - transformRef.current.x) * ease;
                    transformRef.current.y += (targetY - transformRef.current.y) * ease;
                    transformRef.current.k += (k - transformRef.current.k) * ease;
                    
                    if (Math.abs(uiZoom - transformRef.current.k * 100) > 1) {
                        setUiZoom(transformRef.current.k * 100);
                    }
                }
            }

            const transform = transformRef.current;

            // Draw Orbital Rings
            ctx.save();
            ctx.translate(transform.x, transform.y);
            ctx.scale(transform.k, transform.k);
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.setLineDash([5, 15]);
            const rootCount = sortedNodes.filter(n => n.isRootFolder).length;
            for(let i=0; i<rootCount; i++) {
                const r = 400 + (i * 250);
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();

            ctx.save();
            ctx.translate(transform.x, transform.y);
            ctx.scale(transform.k, transform.k);

            Object.entries(centroids).forEach(([folder, pos]) => {
                const alpha = Math.min(0.1, 0.05 * transform.k);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = CATEGORY_COLORS[folder] || CATEGORY_COLORS.default;
                ctx.font = `900 ${Math.max(40, 100 / transform.k)}px 'Outfit', sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText(folder.toUpperCase(), pos.x, pos.y);
            });

            // Batch links by type for fewer state changes
            ctx.globalAlpha = 0.12;
            ctx.lineWidth = 0.6;
            ctx.strokeStyle = 'rgba(129, 140, 248, 0.25)';
            ctx.beginPath();
            links.forEach(link => {
                const isHighlighted = selectedId && (selectedId === link.source.id || selectedId === link.target.id);
                if (isHighlighted) return; // draw highlighted separately
                ctx.moveTo(link.source.x, link.source.y);
                ctx.lineTo(link.target.x, link.target.y);
            });
            ctx.stroke();

            // Draw highlighted links
            if (selectedId) {
                ctx.globalAlpha = 0.8;
                ctx.lineWidth = 2;
                ctx.strokeStyle = HIGHLIGHT_COLOR;
                ctx.beginPath();
                links.forEach(link => {
                    if (selectedId === link.source.id || selectedId === link.target.id) {
                        ctx.moveTo(link.source.x, link.source.y);
                        ctx.lineTo(link.target.x, link.target.y);
                    }
                });
                ctx.stroke();
            }

            sortedNodes.forEach((node, i) => {
                const nodeDelay = nodes.length > 100 ? (i / nodes.length) : 0;
                if (appearanceProgress < nodeDelay * 0.5) return;

                // Optimized Orbital Physics
                if (draggingNode === node) {
                    node.x = node.fx;
                    node.y = node.fy;
                } else if (node.orbitalLevel > 0) {
                    const speed = node.orbitalSpeed || 0.001;
                    const time = now * speed;
                    const currentAngle = (node.angle || 0) + time;
                    
                    if (node.isRootFolder) {
                        const r = node.orbitalRadius;
                        node.x = Math.cos(currentAngle) * r;
                        node.y = Math.sin(currentAngle) * r;
                    } else if (node.parentPlanetObj) {
                        const r = node.orbitalRadius;
                        const px = node.parentPlanetObj.x;
                        const py = node.parentPlanetObj.y;
                        node.x = px + Math.cos(currentAngle) * r;
                        node.y = py + Math.sin(currentAngle) * r;
                    }
                }

                const screenX = node.x * transform.k + transform.x;
                const screenY = node.y * transform.k + transform.y;
                const screenR = node.radius * transform.k * 3;
                if (screenX + screenR < 0 || screenX - screenR > dimensions.width ||
                    screenY + screenR < 0 || screenY - screenR > dimensions.height) {
                    return; // Frustum Culling
                }

                const isSelected = selectedId === node.id;
                const isSearchHit = highlightedNodeIds.includes(node.id);
                const isNeighbor = selectedId && neighborMapRef.current?.get(selectedId)?.has(node.id);
                const isDimmed = (selectedId || highlightedNodeIds.length > 0) && !isSelected && !isNeighbor && !isSearchHit;

                let baseColor;
                if (node.isSun) baseColor = '#fff7ed';
                else if (isSearchHit) baseColor = CATEGORY_COLORS.DeepSearch;
                else if (isSelected) baseColor = ACTIVE_COLOR;
                else if (isNeighbor) baseColor = HIGHLIGHT_COLOR;
                else if (isDimmed) baseColor = 'rgba(30, 30, 50, 0.2)';
                else if (node.isFolder) {
                    baseColor = node.isCodePlanet ? CATEGORY_COLORS.Coding : CATEGORY_COLORS.Folder;
                }
                else if (node.isCode) baseColor = CATEGORY_COLORS.Coding;
                else if (node.ext === 'pdf') baseColor = CATEGORY_COLORS.PDF;
                else baseColor = CATEGORY_COLORS[node.root_folder] || CATEGORY_COLORS.default;

                const r = node.radius * (isSelected || isSearchHit ? 1.4 : 1);
                
                if (node.isSun || node.is_system) {
                    ctx.save();
                    const pulse = Math.sin(now * 0.002) * 12 + 25;
                    
                    // Outer atmospheric glow
                    ctx.shadowBlur = 80 + pulse;
                    ctx.shadowColor = 'rgba(234, 179, 8, 0.6)'; // Amber glow

                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r * 4.5 + pulse, 0, 2 * Math.PI);
                    ctx.fillStyle = 'rgba(234, 179, 8, 0.1)'; 
                    ctx.fill();

                    // Inner corona
                    ctx.shadowBlur = 40 + pulse / 2;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r * 2.5, 0, 2 * Math.PI);
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.3)'; 
                    ctx.fill();

                    // Surface
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                    ctx.fillStyle = '#fef08a';
                    ctx.fill();
                    
                    // Center core
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r * 0.7, 0, 2 * Math.PI);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    
                    ctx.restore();
                }
 else if (node.isFolder) {
                    const screenR = r * transform.k;
                    if (screenR >= 1.0) {
                        // Planet glow
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, r * 1.8, 0, 2 * Math.PI);
                        ctx.fillStyle = addAlpha(baseColor, 0.12);
                        ctx.fill();
                    }

                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                    ctx.fillStyle = baseColor;
                    ctx.fill();
                } else {
                    const screenR = r * transform.k;
                    // Skip tiny particles unless hovered/selected
                    if (screenR < 0.5 && !isSelected && !isSearchHit && node !== hoveredNode) {
                        // Skip rendering entirely
                    } else if (screenR < 1.5) {
                        ctx.fillStyle = isDimmed ? 'rgba(20, 20, 35, 0.4)' : baseColor;
                        ctx.fillRect(node.x - r, node.y - r, r * 2, r * 2);
                    } else {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                        ctx.fillStyle = isDimmed ? 'rgba(20, 20, 35, 0.4)' : baseColor;
                        ctx.fill();
                    }
                }

                if (isSelected || node === hoveredNode || isSearchHit || (node.isSun && transform.k > 0.05) || (node.isFolder && transform.k > 0.15)) {
                    ctx.globalAlpha = isDimmed ? 0.3 : 1.0;
                    ctx.fillStyle = isSelected ? ACTIVE_COLOR : (node.isSun ? '#fb923c' : 'white');
                    const fontSize = node.isSun ? 16 : (node.isFolder ? 13 : 11);
                    ctx.font = `${node.isSun || node.isFolder ? '900' : '600'} ${fontSize}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText(node.title, node.x, node.y + r + (node.isSun ? 40 : 18));
                }
            });

            ctx.restore();

            // --- MINIMAP ---
            const mmSize = Math.min(180, dimensions.width * 0.18);
            const mmPad = 16;
            const mmX = dimensions.width - mmSize - mmPad;
            const mmY = dimensions.height - mmSize - mmPad;

            ctx.save();
            
            // Draw background + Clip for interior
            ctx.beginPath();
            ctx.roundRect(mmX, mmY, mmSize, mmSize, 12);
            ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
            ctx.fill(); 
            
            ctx.save();
            ctx.clip(); // Clip viewport spill

            const maxDim = 3500;
            const mmS = mmSize / maxDim;
            const mmC = mmSize / 2;

            ctx.save();
            ctx.translate(mmX + mmC, mmY + mmC);
            ctx.scale(mmS, mmS);

            // Draw Sun + Hubs on minimap
            nodes.forEach(n => {
                if (!n.isSun && !n.isFolder && !n.is_system) return;
                ctx.beginPath();
                ctx.arc(n.x, n.y, (n.isSun || n.is_system) ? 60 : 30, 0, Math.PI * 2);
                ctx.fillStyle = (n.isSun || n.is_system) ? '#fb923c' : (CATEGORY_COLORS[n.root_folder] || '#fff');
                ctx.fill();
            });

            // Viewport Rect
            const vpW = dimensions.width / transform.k;
            const vpH = dimensions.height / transform.k;
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 3 / mmS;
            ctx.strokeRect(-transform.x / transform.k, -transform.y / transform.k, vpW, vpH);
            ctx.restore(); // scale/translate
            ctx.restore(); // clip

            // Border (drawn outside clip)
            ctx.beginPath();
            ctx.roundRect(mmX, mmY, mmSize, mmSize, 12);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            animationFrame = requestAnimationFrame(draw);
        };

        animationFrame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animationFrame);
    }, [dimensions, selectedId, hoveredNode, highlightedNodeIds, appearanceProgress, centroids, subFolders]);

    useEffect(() => {
        if (!hoveredNode || hoveredNode.isFolder) {
            setHoveredContent(null);
            return;
        }

        const timer = setTimeout(async () => {
            setIsTooltipLoading(true);
            try {
                const res = await fetch(`http://localhost:8000/api/notes/${hoveredNode.id}`);
                const note = await res.json();
                setHoveredContent(note.content?.substring(0, 150) + "...");
            } catch (err) {
                setHoveredContent("Preview unavailable");
            } finally {
                setIsTooltipLoading(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [hoveredNode]);

    const handleMouseDown = (e) => {
        const transform = transformRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - transform.x) / transform.k;
        const mouseY = (e.clientY - rect.top - transform.y) / transform.k;

        const node = nodesRef.current?.find(n => {
            const dx = n.x - mouseX;
            const dy = n.y - mouseY;
            return Math.sqrt(dx*dx + dy*dy) < n.radius * 2.5;
        });

        if (node) {
            setDraggingNode(node);
            node.fx = node.x;
            node.fy = node.y;
            
            // Hybrid logic: Select for inspector, but don't call onNodeClick yet
            setSelectedId(node.id);
            setInspectorPos({ x: e.clientX, y: e.clientY });
            fetchInspectorNote(node.id);
            
            isLockedRef.current = true;
            targetKRef.current = Math.max(transform.k, 1.4);
        } else {
            setDraggingNode({ isBackground: true, startX: e.clientX, startY: e.clientY, startTX: transform.x, startTY: transform.y });
            setSelectedId(null);
            setInspectorNote(null);
            isLockedRef.current = false;
        }
    };

    const fetchInspectorNote = async (id) => {
        if (id.startsWith('folder:')) return;
        setIsInspectorLoading(true);
        try {
            const res = await axios.get(`http://localhost:8000/api/notes/${id}`);
            setInspectorNote(res.data);
        } catch (err) {
            console.error('Failed to fetch inspector note', err);
        } finally {
            setIsInspectorLoading(false);
        }
    };

    const handleMouseMove = (e) => {
        const transform = transformRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - transform.x) / transform.k;
        const mouseY = (e.clientY - rect.top - transform.y) / transform.k;

        if (draggingNode) {
            if (draggingNode.isBackground) {
                transformRef.current.x = draggingNode.startTX + (e.clientX - draggingNode.startX);
                transformRef.current.y = draggingNode.startTY + (e.clientY - draggingNode.startY);
            } else {
                draggingNode.fx = mouseX;
                draggingNode.fy = mouseY;
            }
        } else {
            const node = nodesRef.current?.find(n => {
                const dx = n.x - mouseX;
                const dy = n.y - mouseY;
                return Math.sqrt(dx*dx + dy*dy) < n.radius * 2.5;
            });
            setHoveredNode(node);
        }
    };

    const handleMouseUp = () => {
        if (draggingNode && !draggingNode.isBackground) {
            draggingNode.fx = null;
            draggingNode.fy = null;
        }
        setDraggingNode(null);
    };

    const handleWheel = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const factor = Math.pow(1.1, -e.deltaY / 200);
        
        const prev = transformRef.current;
        const newK = Math.min(Math.max(prev.k * factor, 0.05), 5);
        const x = mouseX - (mouseX - prev.x) * (newK / prev.k);
        const y = mouseY - (mouseY - prev.y) * (newK / prev.k);
        
        transformRef.current = { x, y, k: newK };
        if (isLockedRef.current) {
            targetKRef.current = newK;
        }
        setUiZoom(newK * 100);
    };

    // Attach non-passive listeners
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e) => {
            e.preventDefault();
            handleWheel(e);
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, [handleWheel]);

    if (!data || !data.nodes) return <div className="loading-graph"><span>Initializing neural interface...</span></div>;

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#020008', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ 
                    background: 'rgba(5, 5, 12, 0.75)', border: '1px solid rgba(0, 255, 255, 0.2)', 
                    padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)',
                    color: fps > 30 ? '#4ade80' : (fps > 15 ? '#fbbf24' : '#ef4444'),
                    fontFamily: 'JetBrains Mono, monospace', fontSize: '14px', fontWeight: 'bold',
                    boxShadow: '0 0 15px rgba(0, 0, 0, 0.5)'
                }}>
                    {fps} FPS
                </div>
            </div>

            <div className={`graph-settings-container ${isSettingsOpen ? 'open' : ''}`}>
                <button 
                    className="settings-toggle-btn"
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                >
                    <span>{isSettingsOpen ? 'CLOSE SYSTEM' : 'NEURAL CORE v2.1'}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>

                <div className="graph-settings">
                    <div className="setting-header">SYSTEM ARCHITECTURE</div>
                
                <div className="filter-section">
                    <div className="section-label">ACTIVE FOLDERS</div>
                    <div className="filter-grid">
                        {availableFolders.map(folder => (
                            <div 
                                key={folder} 
                                className={`filter-tag ${activeFilters.has(folder) ? 'active' : ''}`}
                                onClick={() => toggleFilter(folder)}
                                style={{ '--accent': CATEGORY_COLORS[folder] || CATEGORY_COLORS.default }}
                            >
                                {folder}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="filter-section">
                    <div className="section-label">TAG FILTERING</div>
                    <div className="filter-grid">
                        {availableTags.map(tag => (
                            <div 
                                key={tag} 
                                className={`filter-tag ${activeTagFilters.has(tag) ? 'active' : ''}`}
                                onClick={() => {
                                    const next = new Set(activeTagFilters);
                                    if (next.has(tag)) next.delete(tag);
                                    else next.add(tag);
                                    setActiveTagFilters(next);
                                }}
                                style={{ '--accent': '#f0f' }}
                            >
                                #{tag}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="density-section">
                    <div className="section-label">NEURAL FLOW: {particleDensity}%</div>
                    <input 
                        type="range" min="0" max="100" 
                        value={particleDensity} 
                        onChange={(e) => setParticleDensity(parseInt(e.target.value))}
                        className="density-slider"
                    />
                    <button 
                        className="stress-test-btn"
                        onClick={() => {
                            const extra = [];
                            for (let i = 0; i < 1000; i++) {
                                extra.push({
                                    id: `stress-${i}-${Date.now()}`,
                                    title: `StressNode-${i}`,
                                    radius: 2,
                                    isFolder: false,
                                    is_stress: true,
                                    root_folder: 'System'
                                });
                            }
                            setStressTestNodes(prev => [...prev, ...extra]);
                        }}
                    >
                        RUN STRESS TEST (+1K NODES)
                    </button>
                    <button 
                        className="stress-test-btn"
                        style={{ marginTop: '8px' }}
                        onClick={() => {
                            const sun = nodesRef.current?.find(n => n.isSun || n.is_system);
                            if (sun) {
                                setSelectedId(sun.id);
                                isLockedRef.current = true;
                                targetKRef.current = 1.4;
                                // Force center immediately
                                transformRef.current.x = dimensions.width / 2 - sun.x * transformRef.current.k;
                                transformRef.current.y = dimensions.height / 2 - sun.y * transformRef.current.k;
                            } else {
                                isLockedRef.current = false;
                                transformRef.current = { x: dimensions.width / 2, y: dimensions.height / 2, k: 0.6 };
                                setUiZoom(60);
                            }
                        }}
                    >
                        CENTER TO SUN
                    </button>
                </div>

                <div className="zoom-section" style={{ marginTop: '16px' }}>
                    <div className="section-label">ZOOM LEVEL: {(uiZoom).toFixed(0)}%</div>
                    <input 
                        type="range" min="5" max="500" 
                        value={uiZoom} 
                        onChange={(e) => {
                            const newK = parseInt(e.target.value) / 100;
                            const prev = transformRef.current;
                            const center_x = dimensions.width / 2;
                            const center_y = dimensions.height / 2;
                            const x = center_x - (center_x - prev.x) * (newK / prev.k);
                            const y = center_y - (center_y - prev.y) * (newK / prev.k);
                            transformRef.current = { x, y, k: newK };
                            if (isLockedRef.current) targetKRef.current = newK;
                            setUiZoom(newK * 100);
                        }}
                        className="density-slider"
                    />
                </div>

                <div className="legend-section">
                    <div className="section-label">VISUAL LEGEND</div>
                    <div className="legend">
                        <div className="legend-item"><span style={{background: CATEGORY_COLORS.Coding}}></span> Code Planet (Source)</div>
                        <div className="legend-item"><span style={{background: CATEGORY_COLORS.PDF}}></span> PDF (Dokumen)</div>
                        <div className="legend-item"><span style={{background: CATEGORY_COLORS.Folder}}></span> Folder Hub</div>
                        <div className="legend-item"><span style={{background: CATEGORY_COLORS.DeepSearch}}></span> Search Result</div>
                    </div>
                </div>

                <div className="filter-section">
                    <div className="section-label">WATCHED FOLDERS</div>
                    <div className="folder-list">
                        {watchedFolders.map((folder, idx) => (
                            <div key={idx} className={`folder-item ${!folder.exists ? 'missing' : ''}`}>
                                <div className="folder-info">
                                    <span className="folder-name">{folder.name}</span>
                                    <span className="folder-path">{folder.path}</span>
                                </div>
                                <button 
                                    className="folder-remove-btn"
                                    onClick={() => handleRemoveFolder(folder.path)}
                                    title="Remove folder"
                                    disabled={folderLoading}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="folder-add-row">
                        <input
                            type="text"
                            placeholder="C:\\path\\to\\folder"
                            value={newFolderPath}
                            onChange={(e) => setNewFolderPath(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
                            className="folder-input"
                        />
                        <button 
                            className="folder-add-btn" 
                            onClick={handleAddFolder}
                            disabled={folderLoading || !newFolderPath.trim()}
                        >
                            {folderLoading ? '...' : '+'}
                        </button>
                    </div>
                </div>

                <div className="filter-section">
                    <div className="section-label">ACTIVE FILTERS</div>
                    <div className="filter-grid">
                        {availableFolders.map(folder => (
                            <div 
                                key={folder} 
                                className={`filter-tag ${activeFilters.has(folder) ? 'active' : ''}`}
                                onClick={() => toggleFilter(folder)}
                                style={{ '--accent': CATEGORY_COLORS[folder] || CATEGORY_COLORS.default }}
                            >
                                {folder}
                            </div>
                        ))}
                    </div>
                </div>
                </div>
            </div>

            {hoveredNode && (
                <div 
                    className="node-tooltip"
                    style={{
                        left: (hoveredNode.x * transformRef.current.k + transformRef.current.x) + 20,
                        top: (hoveredNode.y * transformRef.current.k + transformRef.current.y) - 20
                    }}
                >
                    <div className="tooltip-header">
                        <span className="folder-badge" style={{ background: (hoveredNode.isFolder ? CATEGORY_COLORS.Folder : (CATEGORY_COLORS[hoveredNode.root_folder] || CATEGORY_COLORS.default)) }}>
                            {hoveredNode.isFolder ? 'HUB' : hoveredNode.root_folder}
                        </span>
                        {!hoveredNode.isFolder && <div className="node-id">ID: {hoveredNode.id.substring(0, 8)}...</div>}
                    </div>
                    <div className="node-title">{hoveredNode.isFolder ? `Folder: ${hoveredNode.title}` : (hoveredNode.name || 'Untitled Node')}</div>
                    {!hoveredNode.isFolder && (
                        <div className="node-preview">
                            {isTooltipLoading ? 'Loading...' : (hoveredContent || 'No preview available')}
                        </div>
                    )}
                </div>
            )}

            <canvas 
                ref={canvasRef}
                width={dimensions.width}
                height={dimensions.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: draggingNode ? 'grabbing' : (hoveredNode ? 'pointer' : 'grab') }}
            />

            {/* Hybrid Inspector Panel */}
            {inspectorNote && (
                <div 
                    className="absolute z-50 w-72 bg-black/80 backdrop-blur-2xl border border-fuchsia-500/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                    style={{ 
                        left: Math.min(inspectorPos.x + 20, window.innerWidth - 300), 
                        top: Math.min(inspectorPos.y + 20, window.innerHeight - 400) 
                    }}
                >
                    <div className="p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="px-2 py-0.5 bg-fuchsia-500/20 text-fuchsia-400 text-[10px] rounded border border-fuchsia-500/30 font-bold uppercase">
                                Note Preview
                            </span>
                            <button 
                                onClick={() => setInspectorNote(null)}
                                className="text-white/30 hover:text-white transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">
                            {isInspectorLoading ? 'Accessing Data...' : inspectorNote.title}
                        </h3>

                        <div className="text-sm text-white/60 leading-relaxed mb-4 line-clamp-4 font-serif italic">
                            {isInspectorLoading ? 'Decrypting neural pathways...' : (inspectorNote.content?.substring(0, 200) + '...')}
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-6">
                            {(inspectorNote.tags || []).map(t => (
                                <span key={t} className="text-[10px] text-cyan-400 font-mono">#{t}</span>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                onNodeClick(inspectorNote);
                                setInspectorNote(null);
                            }}
                            className="w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-fuchsia-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Full Document
                        </button>
                    </div>
                    
                    {/* Bottom stats bar */}
                    <div className="bg-white/5 px-5 py-2 flex items-center justify-between border-t border-white/5">
                        <span className="text-[9px] text-white/30 uppercase font-bold tracking-tighter">
                            Linked: {inspectorNote.backlinks?.length || 0}
                        </span>
                        <span className="text-[9px] text-white/30 uppercase font-bold tracking-tighter">
                            Size: {inspectorNote.content?.length || 0} bytes
                        </span>
                    </div>
                </div>
            )}
            
            <div className="graph-footer">
                <div className="footer-info">NODES: {data.nodes.length} • LINKS: {data.links.length}</div>
                <div className="fps-counter" style={{ 
                    color: fps >= 50 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.7rem',
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                    textShadow: `0 0 8px ${fps >= 50 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171'}`
                }}>{fps} FPS</div>
                <div className="footer-controls">DRAG TO PAN • SCROLL TO ZOOM • CLICK TO INSPECT • DRAG NODE TO REORGANIZE</div>
            </div>

            <style>{`
                .loading-graph {
                    width: 100%; height: 100%;
                    display: flex; align-items: center; justify-content: center;
                    background: #010105; color: #ff007f;
                    font-family: 'Outfit', sans-serif;
                    text-transform: uppercase; letter-spacing: 0.4em;
                    font-weight: 900;
                }
                .graph-settings-container {
                    position: absolute; top: 24px; right: 24px; z-index: 100;
                    display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
                }
                .settings-toggle-btn {
                    background: rgba(5, 5, 12, 0.85);
                    border: 1px solid rgba(0, 255, 255, 0.2);
                    backdrop-filter: blur(24px) saturate(200%);
                    color: #00ffff;
                    padding: 12px 20px;
                    border-radius: 14px;
                    display: flex; align-items: center; gap: 10px;
                    font-family: 'Outfit', sans-serif;
                    font-weight: 900; font-size: 0.75rem; letter-spacing: 0.15em;
                    cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 15px rgba(0, 255, 255, 0.1);
                    text-transform: uppercase;
                }
                .settings-toggle-btn:hover {
                    background: rgba(0, 255, 255, 0.15);
                    box-shadow: 0 0 25px rgba(0, 255, 255, 0.3);
                    transform: translateY(-2px);
                    border-color: rgba(0, 255, 255, 0.5);
                }
                .graph-settings {
                    background: rgba(5, 5, 12, 0.75);
                    padding: 24px; border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(24px) saturate(200%);
                    color: white; width: 340px;
                    box-shadow: 0 40px 80px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0,0,0,0.5) inset;
                    font-family: 'Outfit', sans-serif;
                    display: flex; flex-direction: column; gap: 24px;
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    opacity: 0; pointer-events: none;
                    transform: translateY(-10px) scale(0.98);
                    transform-origin: top right;
                    max-height: calc(100vh - 120px);
                    overflow-y: auto;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255,255,255,0.1) transparent;
                }
                .graph-settings-container.open .graph-settings {
                    opacity: 1; pointer-events: auto;
                    transform: translateY(0) scale(1);
                }
                .setting-header {
                    font-size: 0.75rem; font-weight: 900;
                    color: #00ffff; letter-spacing: 0.25em;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 12px;
                    text-shadow: 0 0 15px rgba(0, 255, 255, 0.4);
                }
                .section-label {
                    font-size: 0.65rem; font-weight: 800; color: rgba(255,255,255,0.4);
                    margin-bottom: 12px; letter-spacing: 0.15em;
                }
                .filter-grid {
                    display: flex; flex-wrap: wrap; gap: 8px;
                }
                .filter-tag {
                    font-size: 0.65rem; padding: 6px 14px; border-radius: 10px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
                    cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    color: rgba(255,255,255,0.5); font-weight: 600;
                }
                .filter-tag:hover {
                    background: rgba(255,255,255,0.08);
                    color: white;
                }
                .filter-tag.active {
                    background: var(--accent, #ff007f); color: white;
                    box-shadow: 0 0 25px var(--accent, #ff007f);
                    border-color: rgba(255,255,255,0.3);
                    transform: translateY(-1px);
                }
                .density-slider {
                    width: 100%;
                    -webkit-appearance: none;
                    height: 4px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 10px;
                    outline: none;
                }
                .density-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                }
                .stress-test-btn {
                    margin-top: 12px;
                    width: 100%;
                    padding: 8px;
                    background: rgba(0, 255, 255, 0.1);
                    border: 1px solid rgba(0, 255, 255, 0.3);
                    color: #00ffff;
                    font-size: 10px;
                    font-weight: 900;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .stress-test-btn:hover {
                    background: rgba(0, 255, 255, 0.2);
                    box-shadow: 0 0 15px rgba(0, 255, 255, 0.3);
                    transform: scale(1.02);
                }
                .legend {
                    display: flex; flex-direction: column; gap: 10px;
                }
                .legend-item {
                    display: flex; align-items: center; gap: 12px;
                    font-size: 0.7rem; color: rgba(255,255,255,0.6);
                    font-weight: 500;
                }
                .legend-item span {
                    width: 12px; height: 12px; border-radius: 4px;
                    box-shadow: 0 0 10px currentColor;
                }
                .node-tooltip {
                    position: absolute; z-index: 200; pointer-events: none;
                    background: rgba(2, 2, 8, 0.85); backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-left: 5px solid #ff007f;
                    border-radius: 12px; padding: 16px; width: 300px;
                    box-shadow: 0 30px 60px rgba(0,0,0,0.8);
                    animation: tooltipSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes tooltipSlide {
                    from { opacity: 0; transform: translateX(10px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .tooltip-header {
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 12px;
                }
                .folder-badge {
                    font-size: 0.55rem; font-weight: 900; padding: 4px 10px;
                    border-radius: 6px; color: white; text-transform: uppercase;
                    letter-spacing: 0.1em;
                }
                .node-id {
                    font-size: 0.55rem; color: rgba(255,255,255,0.2); 
                    font-family: 'JetBrains Mono';
                }
                .node-title {
                    font-size: 1.1rem; font-weight: 800; color: white;
                    margin-bottom: 10px; line-height: 1.3;
                    font-family: 'Outfit', sans-serif;
                }
                .node-preview {
                    font-size: 0.8rem; color: rgba(255,255,255,0.5);
                    line-height: 1.6; font-family: 'Inter', sans-serif;
                    max-height: 100px; overflow: hidden;
                    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
                }
                .loading-dots span {
                    animation: pulse 1.4s infinite both; color: #ff007f;
                }
                @keyframes pulse {
                    0% { opacity: 0.2; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.5); }
                    100% { opacity: 0.2; transform: scale(1); }
                }
                .graph-footer {
                    position: absolute; bottom: 0; left: 0; width: 100%;
                    padding: 24px 32px; display: flex; justify-content: space-between;
                    align-items: center; pointer-events: none;
                    background: linear-gradient(to top, rgba(1,1,5,1), transparent);
                }
                .footer-info {
                    font-size: 0.65rem; color: #ff007f; font-weight: 800;
                    letter-spacing: 0.2em; font-family: 'JetBrains Mono';
                    text-shadow: 0 0 10px rgba(255,0,127,0.3);
                }
                .footer-controls {
                    font-size: 0.65rem; color: rgba(255, 255, 255, 0.2);
                    font-weight: 600; letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                .folder-list {
                    display: flex; flex-direction: column; gap: 6px;
                    max-height: 200px; overflow-y: auto;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255,255,255,0.1) transparent;
                }
                .folder-item {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 8px 12px; border-radius: 10px;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    transition: all 0.2s ease;
                }
                .folder-item:hover {
                    background: rgba(255,255,255,0.06);
                    border-color: rgba(255,255,255,0.12);
                }
                .folder-item.missing {
                    opacity: 0.4;
                    border-color: rgba(248, 113, 113, 0.3);
                }
                .folder-info {
                    display: flex; flex-direction: column; gap: 2px;
                    overflow: hidden; flex: 1;
                }
                .folder-name {
                    font-size: 0.7rem; font-weight: 700; color: white;
                }
                .folder-path {
                    font-size: 0.55rem; color: rgba(255,255,255,0.3);
                    font-family: 'JetBrains Mono', monospace;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .folder-remove-btn {
                    background: none; border: none; color: rgba(255,255,255,0.2);
                    cursor: pointer; font-size: 0.75rem; padding: 4px 8px;
                    border-radius: 6px; transition: all 0.2s ease;
                    flex-shrink: 0;
                }
                .folder-remove-btn:hover {
                    color: #f87171; background: rgba(248, 113, 113, 0.15);
                }
                .folder-add-row {
                    display: flex; gap: 6px; margin-top: 8px;
                }
                .folder-input {
                    flex: 1; padding: 8px 12px; border-radius: 8px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: white; font-size: 0.65rem;
                    font-family: 'JetBrains Mono', monospace;
                    outline: none; transition: border-color 0.2s ease;
                }
                .folder-input:focus {
                    border-color: rgba(0, 255, 255, 0.4);
                }
                .folder-input::placeholder {
                    color: rgba(255,255,255,0.2);
                }
                .folder-add-btn {
                    padding: 8px 14px; border-radius: 8px;
                    background: rgba(0, 255, 255, 0.15);
                    border: 1px solid rgba(0, 255, 255, 0.3);
                    color: #00ffff; font-size: 0.8rem; font-weight: 900;
                    cursor: pointer; transition: all 0.2s ease;
                }
                .folder-add-btn:hover:not(:disabled) {
                    background: rgba(0, 255, 255, 0.25);
                    box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
                }
                .folder-add-btn:disabled {
                    opacity: 0.3; cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};

export default KnowledgeGraph;
