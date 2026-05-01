import { useState, useEffect } from 'react';

export default function StoryLibrary({ onBack, onUploadClick, onPlayChapter, onQuizClick }) {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedOverGroup, setDraggedOverGroup] = useState(null);

  useEffect(() => {
    // Load story groups from localStorage
    const savedGroups = localStorage.getItem('story_groups');
    if (savedGroups) {
      try {
        setGroups(JSON.parse(savedGroups));
      } catch (e) {
        console.error('Failed to parse story_groups', e);
        setGroups([]);
      }
    } else {
      setGroups([]);
    }
  }, []);

  const handleDeleteGroup = (groupId) => {
    if (window.confirm('Apakah kamu yakin ingin menghapus grup cerita ini?')) {
      const newGroups = groups.filter(g => g.id !== groupId);
      setGroups(newGroups);
      localStorage.setItem('story_groups', JSON.stringify(newGroups));
      if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedGroup(null);
      }
    }
  };

  const handleRenameGroup = (groupId, currentTitle) => {
    const newTitle = window.prompt('Masukkan nama grup baru:', currentTitle);
    if (newTitle && newTitle.trim()) {
      const newGroups = groups.map(g => g.id === groupId ? { ...g, title: newTitle.trim() } : g);
      setGroups(newGroups);
      localStorage.setItem('story_groups', JSON.stringify(newGroups));
      if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedGroup(newGroups.find(g => g.id === groupId));
      }
    }
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e, item, type, index) => {
    setDraggedItem({ item, type, fromGroupId: selectedGroup.id, index });
    e.dataTransfer.effectAllowed = "move";
    // Optional: make it slightly transparent while dragging
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
    setDraggedOverGroup(null);
  };

  const handleDragOverGroup = (e, groupId) => {
    e.preventDefault();
    if (draggedItem && draggedItem.fromGroupId !== groupId) {
      setDraggedOverGroup(groupId);
    }
  };

  const handleDragLeaveGroup = () => {
    setDraggedOverGroup(null);
  };

  const handleDropGroup = (e, targetGroupId) => {
    e.preventDefault();
    setDraggedOverGroup(null);
    
    if (!draggedItem || draggedItem.fromGroupId === targetGroupId) return;
    
    const { item, type, fromGroupId } = draggedItem;
    const listName = type === 'chapter' ? 'chapters' : 'ovas';
    
    const newGroups = groups.map(g => {
      if (g.id === fromGroupId) {
        return {
          ...g,
          [listName]: (g[listName] || []).filter(i => i.filename !== item.filename)
        };
      }
      if (g.id === targetGroupId) {
        return {
          ...g,
          [listName]: [...(g[listName] || []), item]
        };
      }
      return g;
    });
    
    setGroups(newGroups);
    localStorage.setItem('story_groups', JSON.stringify(newGroups));
    
    // Update selectedGroup to reflect removal
    if (selectedGroup && selectedGroup.id === fromGroupId) {
      setSelectedGroup(newGroups.find(g => g.id === fromGroupId));
    }
  };

  const handleDragOverItem = (e, index) => {
    e.preventDefault();
  };

  const handleDropItem = (e, targetType, targetIndex) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.fromGroupId !== selectedGroup.id || draggedItem.type !== targetType) return;
    if (draggedItem.index === targetIndex) return;

    const { item, type } = draggedItem;
    const listName = type === 'chapter' ? 'chapters' : 'ovas';
    
    const newList = [...(selectedGroup[listName] || [])];
    newList.splice(draggedItem.index, 1);
    newList.splice(targetIndex, 0, item);
    
    const newGroups = groups.map(g => {
      if (g.id === selectedGroup.id) {
        return { ...g, [listName]: newList };
      }
      return g;
    });
    
    setGroups(newGroups);
    localStorage.setItem('story_groups', JSON.stringify(newGroups));
    setSelectedGroup(newGroups.find(g => g.id === selectedGroup.id));
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      position: 'relative', background: '#fdf2f8',
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <img style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
          alt="Background" src="/bg-room.png" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(253,242,248,0.9), rgba(253,242,248,0.5), transparent)' }} />
      </div>

      {/* Top Bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px', zIndex: 20,
      }}>
        <button onClick={onBack} style={{
          background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(228,228,231,0.8)',
          color: '#52525b', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
          cursor: 'pointer', backdropFilter: 'blur(4px)', transition: 'all 0.2s'
        }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.8)'}
           onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.5)'}>
          ← Kembali
        </button>
        
        <button onClick={onUploadClick} style={{
          background: '#e11d48', border: 'none',
          color: 'white', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 4px 12px rgba(225,29,72,0.3)', transition: 'all 0.2s'
        }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
           onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
          + Upload Story Baru
        </button>
      </div>

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', height: '100vh', paddingTop: '70px'
      }}>
        {/* Left Panel: Group List */}
        <div style={{
          width: '320px', padding: '24px', borderRight: '1px solid rgba(244,114,182,0.2)',
          background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto'
        }}>
          <h2 style={{ color: '#e11d48', fontSize: '20px', fontWeight: 800, margin: '0 0 8px' }}>
            📚 Story Library
          </h2>
          
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '40px', color: '#a1a1aa' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
              <p style={{ fontSize: '13px', fontWeight: 600 }}>Belum ada cerita.</p>
              <p style={{ fontSize: '12px' }}>Upload dokumen pertamamu!</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.id} 
                onClick={() => setSelectedGroup(group)}
                onDragOver={(e) => handleDragOverGroup(e, group.id)}
                onDragLeave={handleDragLeaveGroup}
                onDrop={(e) => handleDropGroup(e, group.id)}
                style={{
                  background: selectedGroup?.id === group.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                  border: `2px solid ${selectedGroup?.id === group.id ? '#f43f5e' : (draggedOverGroup === group.id ? '#10b981' : 'transparent')}`,
                  borderRadius: '16px', padding: '16px', cursor: 'pointer',
                  transition: 'all 0.2s', boxShadow: selectedGroup?.id === group.id ? '0 8px 20px rgba(225,29,72,0.15)' : 'none'
                }}
              >
                <div style={{ fontWeight: 800, color: '#18181b', fontSize: '15px', marginBottom: '4px' }}>
                  {group.title}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a', display: 'flex', gap: '8px' }}>
                  <span>📖 {group.chapters?.length || 0} Chapter</span>
                  {group.ovas?.length > 0 && <span>🌟 {group.ovas.length} OVA</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Panel: Group Details */}
        <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
          {selectedGroup ? (
            <div style={{ background: 'white', borderRadius: '32px', padding: '40px', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <h1 style={{ color: '#18181b', fontSize: '28px', fontWeight: 800, margin: '0 0 8px' }}>
                    {selectedGroup.title}
                  </h1>
                  <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
                    Kumpulan chapter dan cerita sampingan dari seri ini. (Drag and Drop untuk menyusun)
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => onQuizClick && onQuizClick(selectedGroup)} style={{
                    background: '#10b981', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
                  }}>🎮 Main Quiz</button>
                  <button onClick={() => handleRenameGroup(selectedGroup.id, selectedGroup.title)} style={{
                    background: '#f4f4f5', border: 'none', color: '#52525b', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
                  }}>✏️ Rename</button>
                  <button onClick={() => handleDeleteGroup(selectedGroup.id)} style={{
                    background: '#fee2e2', border: 'none', color: '#ef4444', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
                  }}>🗑️ Delete</button>
                </div>
              </div>

              {/* Chapters List */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ color: '#e11d48', fontSize: '18px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📖 Main Chapters
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {selectedGroup.chapters?.map((chap, idx) => {
                    const progress = JSON.parse(localStorage.getItem(`story_progress_${chap.filename}`) || '{"currentScene": 0}');
                    return (
                      <div key={chap.filename} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, chap, 'chapter', idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOverItem(e, idx)}
                        onDrop={(e) => handleDropItem(e, 'chapter', idx)}
                        style={{
                          border: '2px solid #f4f4f5', borderRadius: '16px', padding: '20px',
                          display: 'flex', flexDirection: 'column', gap: '12px',
                          background: '#fafafa', transition: 'border-color 0.2s',
                          cursor: 'grab'
                        }}
                        onMouseEnter={e => {
                           if (e.currentTarget.style.opacity !== '0.5') e.currentTarget.style.borderColor = '#fbcfe8';
                        }}
                        onMouseLeave={e => {
                           if (e.currentTarget.style.opacity !== '0.5') e.currentTarget.style.borderColor = '#f4f4f5';
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f43f5e', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Chapter {idx + 1}</span>
                            <span style={{ cursor: 'grab', color: '#d4d4d8' }}>☰</span>
                          </div>
                          <div style={{ fontWeight: 700, color: '#18181b', fontSize: '15px' }}>
                            {chap.judul}
                          </div>
                        </div>
                        
                        <div style={{ marginTop: 'auto' }}>
                          {progress.currentScene > 0 && (
                            <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '8px' }}>
                              Terakhir dibaca: {new Date(progress.timestamp || Date.now()).toLocaleDateString('id-ID')}
                            </div>
                          )}
                          <button 
                            onClick={() => onPlayChapter(chap)}
                            style={{
                              width: '100%', padding: '10px', borderRadius: '10px', border: 'none',
                              background: progress.currentScene > 0 ? '#fce7f3' : '#e11d48',
                              color: progress.currentScene > 0 ? '#be185d' : 'white',
                              fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                            }}>
                            {progress.currentScene > 0 ? '▶ Lanjutkan' : '▶ Mulai Baca'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!selectedGroup.chapters || selectedGroup.chapters.length === 0) && (
                    <div style={{ color: '#a1a1aa', fontSize: '13px', fontStyle: 'italic' }}>Belum ada chapter.</div>
                  )}
                </div>
              </div>

              {/* OVAs List */}
              {selectedGroup.ovas && selectedGroup.ovas.length > 0 && (
                <div>
                  <h3 style={{ color: '#8b5cf6', fontSize: '18px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🌟 OVA / Spin-offs
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {selectedGroup.ovas.map((ova, idx) => {
                      const progress = JSON.parse(localStorage.getItem(`story_progress_${ova.filename}`) || '{"currentScene": 0}');
                      return (
                        <div key={ova.filename} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, ova, 'ova', idx)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => handleDragOverItem(e, idx)}
                          onDrop={(e) => handleDropItem(e, 'ova', idx)}
                          style={{
                            border: '2px solid #f3f0ff', borderRadius: '16px', padding: '20px',
                            display: 'flex', flexDirection: 'column', gap: '12px',
                            background: '#faf5ff', transition: 'border-color 0.2s',
                            cursor: 'grab'
                          }}
                          onMouseEnter={e => {
                            if (e.currentTarget.style.opacity !== '0.5') e.currentTarget.style.borderColor = '#ddd6fe';
                          }}
                          onMouseLeave={e => {
                            if (e.currentTarget.style.opacity !== '0.5') e.currentTarget.style.borderColor = '#f3f0ff';
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                              <span>OVA {idx + 1}</span>
                              <span style={{ cursor: 'grab', color: '#d4d4d8' }}>☰</span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#18181b', fontSize: '15px' }}>
                              {ova.judul}
                            </div>
                          </div>
                          
                          <div style={{ marginTop: 'auto' }}>
                            <button 
                              onClick={() => onPlayChapter(ova)}
                              style={{
                                width: '100%', padding: '10px', borderRadius: '10px', border: 'none',
                                background: '#8b5cf6', color: 'white',
                                fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                              }}>
                              ▶ Nonton OVA
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>Pilih grup cerita untuk melihat chapter.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
