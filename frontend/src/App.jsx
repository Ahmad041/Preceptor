import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BocchiAvatar from './BocchiAvatar'
import MainMenu from './MainMenu'
import StoryUpload from './StoryUpload'
import StoryPlayer from './StoryPlayer'
import StoryLibrary from './StoryLibrary'
import QuizStory from './QuizStory'
import CompanyMode from './company/CompanyMode'
import './App.css'

function App() {
  const [screen, setScreen] = useState('menu')
  const [userProfile, setUserProfile] = useState({ nama: '', hubungan: '' })
  
  const [pesan, setPesan] = useState('') 
  const [jawaban, setJawaban] = useState('') 
  const [loading, setLoading] = useState(false) 
  const [emosi, setEmosi] = useState('idle')
  const [audioBase64, setAudioBase64] = useState(null)
  const [showInput, setShowInput] = useState(false)
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isPanicking, setIsPanicking] = useState(false)
  const [systemStats, setSystemStats] = useState({ cpu: 0, ram: 0 })

  
  const [lihatLayar, setLihatLayar] = useState(false)
  const [dokumen, setDokumen] = useState([])
  const [uploading, setUploading] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  
  // Desktop Pilot state
  const [pendingActions, setPendingActions] = useState([]);
  
  // Vision state
  const [visionRunning, setVisionRunning] = useState(false);
  const [visionData, setVisionData] = useState(null);
  const [visionInterval, setVisionInterval] = useState(30);
  
  // State untuk Fitur Canvas
  const [showCanvas, setShowCanvas] = useState(false)
  const [canvasContent, setCanvasContent] = useState('')
  
  // State untuk Fitur Buat File
  const [showFileModal, setShowFileModal] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFileContent, setNewFileContent] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [catatanList, setCatatanList] = useState([])
  const [permissionRequest, setPermissionRequest] = useState(null)

  // Voice state
  const [isRecording, setIsRecording] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  // Memory Browser state
  const [showMemory, setShowMemory] = useState(false)
  const [memories, setMemories] = useState([])
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memorySearchResults, setMemorySearchResults] = useState(null)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [newMemoryText, setNewMemoryText] = useState('')
  const [showAddMemory, setShowAddMemory] = useState(false)

  // DOCX Generator state
  const [showDocx, setShowDocx] = useState(false)
  const [docxSessionId, setDocxSessionId] = useState(null)
  const [docxChat, setDocxChat] = useState([])
  const [docxInput, setDocxInput] = useState('')
  const [docxDone, setDocxDone] = useState(false)
  const [docxJobId, setDocxJobId] = useState(null)
  const [docxJobStatus, setDocxJobStatus] = useState(null)
  const [docxFiles, setDocxFiles] = useState([])
  const [docxRefs, setDocxRefs] = useState([])
  const [docxUploading, setDocxUploading] = useState(false)

  const docxFileInputRef = useRef(null)
  const docxJobPollRef = useRef(null)

  const fileInputRef = useRef(null)
  const typingRef = useRef(null)

  useEffect(() => {
    ambilDaftarDokumen();
    ambilDaftarCatatan();
    
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/system_status');
        const data = res.data;
        setSystemStats(data);
        if (data.cpu > 80 || data.ram > 85) {
          setIsPanicking(true);
        } else {
          setIsPanicking(false);
        }
      } catch (e) {
        console.error('Failed to get system status', e);
      }

      // Poll pending actions
      try {
        const pendingRes = await axios.get('http://localhost:8000/api/desktop/pending');
        setPendingActions(pendingRes.data.pending || []);
      } catch (e) {}

      // Poll vision state
      try {
        const visionRes = await axios.get('http://localhost:8000/api/vision/status');
        setVisionRunning(visionRes.data.running);
        setVisionData(visionRes.data.current);
      } catch (e) {}

    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (typingRef.current) clearTimeout(typingRef.current);
    if (!jawaban) return;

    setIsTyping(true);
    setDisplayedText('');
    let i = 0;
    const tick = () => {
      i++;
      setDisplayedText(jawaban.slice(0, i));
      if (i < jawaban.length) {
        typingRef.current = setTimeout(tick, 22);
      } else {
        setIsTyping(false);
      }
    };
    typingRef.current = setTimeout(tick, 22);
    return () => clearTimeout(typingRef.current);
  }, [jawaban]);

  const approveAction = async (actionId) => {
    try {
      await axios.post('http://localhost:8000/api/desktop/approve', { action_id: actionId });
    } catch (e) { console.error('Gagal approve', e); }
  };

  const rejectAction = async (actionId) => {
    try {
      await axios.post('http://localhost:8000/api/desktop/reject', { action_id: actionId });
    } catch (e) { console.error('Gagal reject', e); }
  };

  const toggleVision = async () => {
    try {
      if (visionRunning) {
        await axios.post('http://localhost:8000/api/vision/stop');
        setVisionRunning(false);
      } else {
        await axios.post(`http://localhost:8000/api/vision/start?interval=${visionInterval}`);
        setVisionRunning(true);
      }
    } catch (e) { console.error('Gagal toggle vision', e); }
  };

  const ambilDaftarDokumen = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/dokumen');
      setDokumen(res.data.dokumen || []);
    } catch (e) {}
  };

  const uploadDokumen = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post('http://localhost:8000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await ambilDaftarDokumen();
    } catch (err) {
      console.error('[Docs] Gagal upload:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const hapusDokumen = async (namaFile) => {
    try {
      await axios.delete(`http://localhost:8000/api/dokumen/${encodeURIComponent(namaFile)}`);
      await ambilDaftarDokumen();
    } catch (err) {}
  };

  // ============ VOICE HANDLERS ============
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
          const res = await axios.post('http://localhost:8000/api/jarvis/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          if (res.data.text && res.data.text.trim()) {
            setPesan(res.data.text);
            setTimeout(() => kirimKeAi(res.data.text), 100);
          }
        } catch (err) {
          console.error('Gagal transkripsi audio', err);
        } finally {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error('Mikrofon tidak dapat diakses', e);
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

  // ============ MEMORY HANDLERS ============
  const fetchMemories = async () => {
    setMemoryLoading(true);
    try {
      const res = await axios.get('http://localhost:8000/api/jarvis/memories');
      setMemories(res.data || []);
      setMemorySearchResults(null);
    } catch (e) { console.error(e); }
    setMemoryLoading(false);
  };

  const searchMemories = async () => {
    if (!memoryQuery.trim()) { fetchMemories(); return; }
    setMemoryLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/jarvis/memories?query=${encodeURIComponent(memoryQuery)}`);
      setMemorySearchResults(res.data || []);
    } catch (e) { console.error('Gagal cari memori', e); }
    setMemoryLoading(false);
  };

  const deleteMemory = async (item) => {
    try {
      const params = item.chroma_id ? `?chroma_id=${encodeURIComponent(item.chroma_id)}` : '';
      await axios.delete(`http://localhost:8000/api/jarvis/memories/${item.index}${params}`);
      fetchMemories();
    } catch (e) { console.error('Gagal hapus memori', e); }
  };

  const addMemory = async () => {
    if (!newMemoryText.trim()) return;
    try {
      await axios.post('http://localhost:8000/api/jarvis/memories', { text: newMemoryText, nama: 'Memori Obrolan Sandbox' });
      setNewMemoryText('');
      setShowAddMemory(false);
      fetchMemories();
    } catch (e) { console.error('Gagal tambah memori', e); }
  };

  const clearAllMemories = async () => {
    if (!window.confirm('Hapus SEMUA memori jangka panjang? Aksi ini tidak dapat dibatalkan.')) return;
    try {
      await axios.delete('http://localhost:8000/api/jarvis/memories-clear');
      fetchMemories();
    } catch (e) { console.error('Gagal hapus semua memori', e); }
  };

  useEffect(() => {
    if (showMemory) fetchMemories();
  }, [showMemory]);

  // ============ DOCX HANDLERS ============
  const fetchDocxFiles = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/docx/list');
      setDocxFiles(res.data.docs || []);
    } catch (e) { console.error(e); }
  };

  const fetchDocxRefs = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/docx/references/list');
      setDocxRefs(res.data.files || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (showDocx) {
      fetchDocxFiles();
      fetchDocxRefs();
    }
  }, [showDocx]);

  const startDocxSession = async () => {
    try {
      const res = await axios.post('http://localhost:8000/api/docx/session/start', {});
      setDocxSessionId(res.data.session_id);
      setDocxDone(false);
      setDocxJobId(null);
      setDocxJobStatus(null);
      setDocxChat([{ role: 'ai', text: res.data.question, options: res.data.options || [] }]);
    } catch (e) { console.error('Gagal mulai sesi DOCX', e); }
  };

  const sendDocxAnswer = async (answer) => {
    if (!docxSessionId || !answer.trim()) return;
    const ans = answer.trim();
    setDocxChat(prev => [...prev, { role: 'user', text: ans }]);
    setDocxInput('');
    try {
      const res = await axios.post('http://localhost:8000/api/docx/session/answer', { session_id: docxSessionId, answer: ans });
      if (res.data.done) {
        setDocxDone(true);
        setDocxChat(prev => [...prev, { role: 'ai', text: res.data.message || 'Semua informasi terkumpul! Siap generate.', options: [] }]);
      } else {
        setDocxChat(prev => [...prev, { role: 'ai', text: res.data.question, options: res.data.options || [] }]);
      }
    } catch (e) { console.error('Gagal kirim jawaban', e); }
  };

  const generateDocx = async () => {
    if (!docxSessionId) return;
    try {
      const res = await axios.post('http://localhost:8000/api/docx/generate', { session_id: docxSessionId });
      setDocxJobId(res.data.job_id);
      setDocxJobStatus({ progress: 0, step: 'Memulai...', done: false });
      
      docxJobPollRef.current = setInterval(async () => {
        try {
          const statusRes = await axios.get(`http://localhost:8000/api/docx/generate/status/${res.data.job_id}`);
          setDocxJobStatus(statusRes.data);
          if (statusRes.data.done) {
            clearInterval(docxJobPollRef.current);
            fetchDocxFiles();
          }
        } catch (err) { console.error(err); }
      }, 3000);
    } catch (e) { console.error('Gagal trigger generate', e); }
  };

  const uploadDocxRef = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDocxUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post('http://localhost:8000/api/docx/references/upload', formData);
      fetchDocxRefs();
    } catch (err) { console.error('Gagal upload file referensi', err); }
    setDocxUploading(false);
    if (docxFileInputRef.current) docxFileInputRef.current.value = '';
  };

  const deleteDocxRef = async (filename, type) => {
    try {
      await axios.delete(`http://localhost:8000/api/docx/references/${filename}?file_type=${type}`);
      fetchDocxRefs();
    } catch (e) { console.error('Gagal hapus referensi', e); }
  };

  useEffect(() => { return () => clearInterval(docxJobPollRef.current); }, []);

  const kirimKeAi = async (pesanOverride) => {
    const pesanKirim = typeof pesanOverride === 'string' ? pesanOverride : pesan;
    if (!pesanKirim.trim() || loading) return;
    setPesan('');
    setShowInput(false);
    setLoading(true);
    setJawaban('');
    setDisplayedText('...');

    try {
      const response = await axios.post('http://localhost:8000/api/chat', {
        pesan: pesanKirim,
        user_nama: userProfile.nama,
        user_hubungan: userProfile.hubungan,
        lihat_layar: lihatLayar,
        voice_enabled: voiceEnabled
      });
      
      if (response.data.status === "needs_permission") {
        setPermissionRequest(response.data);
        return; // Tunggu konfirmasi user
      }

      if (response.data.status === "executing_tool") {
        setJawaban(response.data.pesan_tunggu);
        setEmosi('senang');
        
        try {
          const execResponse = await axios.post('http://localhost:8000/api/execute-tool', {
            tool: response.data.tool,
            parameter: response.data.parameter,
            pesan_asli: response.data.pesan_asli,
            izin_diberikan: true
          });
          
          if (execResponse.data.canvas_content) {
            setCanvasContent(execResponse.data.canvas_content);
            setShowCanvas(true);
          }
          
          const teksBocchi = execResponse.data.jawaban;
          setJawaban(teksBocchi);

          const backendEmosi = (execResponse.data.emosi || 'Neutral').toLowerCase();
          let mappedEmosi = 'idle';
          if (['joy', 'fun'].includes(backendEmosi)) mappedEmosi = 'senang';
          else if (backendEmosi === 'angry') mappedEmosi = 'marah';
          else if (backendEmosi === 'sorrow') mappedEmosi = 'takut';
          else if (backendEmosi === 'surprised') mappedEmosi = 'gugup';
          setEmosi(mappedEmosi);
          setTimeout(() => setEmosi('idle'), 8000);

          if (execResponse.data.audio_base64) {
            setAudioBase64(execResponse.data.audio_base64);
          }
        } catch (error) {
          console.error(error);
          setJawaban("M-maaf Senpai... ada yang error waktu aku ngerjain tugasnya...");
        } finally {
          setLoading(false);
        }
        return;
      }

      if (response.data.canvas_content) {
        setCanvasContent(response.data.canvas_content);
        setShowCanvas(true);
      }

      const teksBocchi = response.data.jawaban;
      setJawaban(teksBocchi);

      const backendEmosi = (response.data.emosi || 'Neutral').toLowerCase();
      let mappedEmosi = 'idle';
      if (['joy', 'fun'].includes(backendEmosi)) mappedEmosi = 'senang';
      else if (backendEmosi === 'angry') mappedEmosi = 'marah';
      else if (backendEmosi === 'sorrow') mappedEmosi = 'takut';
      else if (backendEmosi === 'surprised') mappedEmosi = 'gugup';
      setEmosi(mappedEmosi);
      setTimeout(() => setEmosi('idle'), 8000);

      if (response.data.audio_base64) {
        setAudioBase64(response.data.audio_base64);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionResponse = async (approved) => {
    if (!permissionRequest) return;
    const req = permissionRequest;
    setPermissionRequest(null);
    setLoading(true);

    try {
      if (approved) {
        setJawaban("Aku kerjakan dulu ya Senpai, tunggu sebentar...");
        setEmosi('senang');
      } else {
        setJawaban("U-um... baiklah, aku batalkan ya...");
        setEmosi('gugup');
      }

      const response = await axios.post('http://localhost:8000/api/execute-tool', {
        tool: req.tool,
        parameter: req.parameter,
        pesan_asli: req.pesan_asli,
        izin_diberikan: approved
      });

      if (response.data.canvas_content) {
        setCanvasContent(response.data.canvas_content);
        setShowCanvas(true);
      }

      const teksBocchi = response.data.jawaban;
      setJawaban(teksBocchi);

      const backendEmosi = (response.data.emosi || 'Neutral').toLowerCase();
      let mappedEmosi = 'idle';
      if (['joy', 'fun'].includes(backendEmosi)) mappedEmosi = 'senang';
      else if (backendEmosi === 'angry') mappedEmosi = 'marah';
      else if (backendEmosi === 'sorrow') mappedEmosi = 'takut';
      else if (backendEmosi === 'surprised') mappedEmosi = 'gugup';
      setEmosi(mappedEmosi);
      setTimeout(() => setEmosi('idle'), 8000);

      if (response.data.audio_base64) {
        setAudioBase64(response.data.audio_base64);
      }
    } catch (error) {
      console.error(error);
      setJawaban("Maaf, terjadi kesalahan saat mengeksekusi perintah.");
    } finally {
      setLoading(false);
    }
  };

  const handleBuatFile = async () => {
    if (!newFileName.trim() || !newFileContent.trim() || fileLoading) return;
    setFileLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/buat-file', {
        nama: newFileName,
        konten: newFileContent
      });
      if (res.data.status === 'berhasil') {
        alert(`File '${newFileName}' berhasil dibuat di folder 'catatan'!`);
        setShowFileModal(false);
        setNewFileName('');
        setNewFileContent('');
        await ambilDaftarCatatan();
      } else {
        alert('Gagal membuat file: ' + res.data.error);
      }
    } catch (err) {
      alert('Error saat menghubungi server.');
    } finally {
      setFileLoading(false);
    }
  };

  const ambilDaftarCatatan = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/list-catatan');
      setCatatanList(res.data.catatan || []);
    } catch (e) {}
  };

  const hapusCatatan = async (namaFile) => {
    try {
      await axios.delete(`http://localhost:8000/api/catatan/${encodeURIComponent(namaFile)}`);
      await ambilDaftarCatatan();
    } catch (err) {}
  };

  const copyToNote = () => {
    if (!jawaban) return;
    setNewFileContent(jawaban);
    setNewFileName(`catatan_${new Date().getTime()}.md`);
    setShowFileModal(true);
  };

  const handleScreenClick = () => {
    if (isTyping) {
      // Skip typewriter - show full text
      clearTimeout(typingRef.current);
      setDisplayedText(jawaban);
      setIsTyping(false);
    } else if (!showInput && !loading) {
      setShowInput(true);
    }
  };

  const [selectedMode, setSelectedMode] = useState('override')
  const [storyData, setStoryData] = useState(null)

  if (screen === 'menu') {
    return <MainMenu onStart={(profile, mode) => {
      setUserProfile(profile);
      setSelectedMode(mode);
      if (mode === 'story') {
        setScreen('story_library');
      } else if (mode === 'company') {
        setScreen('company');
      } else {
        setScreen('chat');
      }
    }} />;
  }

  if (screen === 'story_library') {
    return <StoryLibrary
      onBack={() => setScreen('menu')}
      onUploadClick={() => setScreen('story_upload')}
      onPlayChapter={(chap) => {
        setStoryData(chap);
        setScreen('story_play');
      }}
      onQuizClick={(group) => {
        setStoryData(group);
        setScreen('quiz_story');
      }}
    />;
  }

  if (screen === 'story_upload') {
    return <StoryUpload
      onGenerated={(data, profile) => {
        setStoryData(data);
        setUserProfile(profile);
        
        // Save to group based on backend classification
        // Strip audio_base64 dari scenes sebelum simpan ke localStorage (hemat storage!)
        // audio_file tetap disimpan sebagai referensi ke file di disk
        const lightData = {
          ...data,
          scenes: data.scenes.map(s => {
            const { audio_base64, ...rest } = s;
            return rest;  // simpan semua kecuali audio_base64
          }),
        };
        
        const savedGroups = JSON.parse(localStorage.getItem('story_groups') || '[]');
        if (lightData.is_new_group) {
          const newGroup = {
            id: Date.now().toString(),
            title: lightData.judul || 'New Story Group',
            chapters: lightData.tipe === 'chapter' ? [lightData] : [],
            ovas: lightData.tipe === 'ova' ? [lightData] : []
          };
          savedGroups.push(newGroup);
        } else {
          const groupIndex = savedGroups.findIndex(g => g.id === lightData.group_id);
          if (groupIndex !== -1) {
            if (lightData.tipe === 'ova') {
              savedGroups[groupIndex].ovas.push(lightData);
            } else {
              savedGroups[groupIndex].chapters.push(lightData);
            }
          } else {
            // Fallback if group_id not found
            const newGroup = {
              id: Date.now().toString(),
              title: lightData.judul || 'New Story Group',
              chapters: [lightData],
              ovas: []
            };
            savedGroups.push(newGroup);
          }
        }
        localStorage.setItem('story_groups', JSON.stringify(savedGroups));
        
        setScreen('story_play');
      }}
      onBack={() => setScreen('story_library')}
    />;
  }

  if (screen === 'story_play' && storyData) {
    return <StoryPlayer
      scenes={storyData.scenes}
      userProfile={userProfile}
      storyMeta={{ filename: storyData.filename, judul: storyData.judul }}
      onBack={() => {
        setStoryData(null);
        setScreen('story_library');
      }}
    />;
  }

  if (screen === 'quiz_story' && storyData) {
    return <QuizStory
      group={storyData}
      onBack={() => {
        setStoryData(null);
        setScreen('story_library');
      }}
    />;
  }

  if (screen === 'company') {
    return <CompanyMode onBack={() => setScreen('menu')} />;
  }

  return (
    <>
      {/* System Monitor Overlay */}
      <div style={{
        position: 'fixed', top: '10px', left: '10px', zIndex: 100,
        background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: '8px',
        color: isPanicking ? '#f87171' : '#a9b1d6', fontSize: '12px', fontFamily: 'monospace',
        border: `1px solid ${isPanicking ? '#f87171' : 'rgba(255,255,255,0.1)'}`
      }}>
        Vision: {visionRunning ? 'ON' : 'OFF'}
      </div>
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: '#1a0a2e',
        fontFamily: "'Segoe UI', sans-serif",
        cursor: 'default',
        userSelect: 'none',
      }}
      onClick={handleScreenClick}
    >
      {/* ── Background ── */}
      <img
        src="/bg-room.png"
        alt="bg"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          opacity: 0.7,
        }}
      />
      {/* Vignette overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Left Sidebar (Canvas Toggle) ── */}
      <div style={{
        position: 'absolute', top: '50%', left: 0,
        transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: '12px',
        background: 'rgba(20,5,40,0.85)',
        padding: '16px 10px',
        border: '1px solid rgba(244,114,182,0.3)',
        borderLeft: 'none',
        borderRadius: '0 16px 16px 0',
        zIndex: 30,
        backdropFilter: 'blur(10px)',
        boxShadow: '4px 0 15px rgba(0,0,0,0.4)',
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowCanvas(!showCanvas); }}
          title={showCanvas ? "Tutup Canvas" : "Buka Canvas"}
          style={{
            background: showCanvas ? 'rgba(244,114,182,0.3)' : 'transparent',
            border: '1px solid',
            borderColor: showCanvas ? 'rgba(244,114,182,0.5)' : 'transparent',
            color: '#f9a8d4',
            fontSize: '22px',
            cursor: 'pointer',
            padding: '10px',
            borderRadius: '12px',
            transition: 'all 0.3s',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          {showCanvas ? '📖' : '📘'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleVision(); }}
          title={visionRunning ? "Stop Vision" : "Start Vision"}
          style={{
            background: visionRunning ? 'rgba(52,211,153,0.3)' : 'transparent',
            border: '1px solid',
            borderColor: visionRunning ? 'rgba(52,211,153,0.5)' : 'transparent',
            color: '#34d399',
            fontSize: '22px',
            cursor: 'pointer',
            padding: '10px',
            borderRadius: '12px',
            transition: 'all 0.3s',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          {visionRunning ? '👁️' : '🕶️'}
        </button>
      </div>

      {/* ── Top Bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
        zIndex: 20,
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); setScreen('menu'); }}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            padding: '5px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
        >
          ← Kembali
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDocs(false); setShowDocx(false); setShowMemory(m => !m); }}
            style={{
              background: showMemory ? 'rgba(244,114,182,0.3)' : 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '5px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            🧠 Memory
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDocs(false); setShowMemory(false); setShowDocx(d => !d); }}
            style={{
              background: showDocx ? 'rgba(244,114,182,0.3)' : 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '5px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            📝 DOCX
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMemory(false); setShowDocx(false); setShowDocs(d => !d); }}
            style={{
              background: showDocs ? 'rgba(244,114,182,0.3)' : 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '5px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            📄 Docs {dokumen.length > 0 && `(${dokumen.length})`}
          </button>
          <label style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            padding: '5px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={lihatLayar}
              onChange={(e) => setLihatLayar(e.target.checked)}
              style={{ accentColor: '#f472b6' }}
            />
            👁 Layar
          </label>
        </div>
      </div>

      {/* ── Docs Panel ── */}
      {showDocs && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '52px', right: '12px',
            width: '280px',
            background: 'rgba(15,5,30,0.92)',
            border: '1px solid rgba(244,114,182,0.3)',
            borderRadius: '16px',
            padding: '16px',
            zIndex: 30,
            color: 'white',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>📄 LocalDocs</span>
            <label style={{
              background: '#e11d48',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 700,
            }}>
              {uploading ? '⏳...' : '+ Upload'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.docx,.doc,.md,.csv,.json,.py,.js,.jsx,.ts,.tsx,.html,.css"
                onChange={uploadDokumen}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          {dokumen.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '16px 0' }}>
              Belum ada dokumen
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {dokumen.map((dok, i) => (
                <li key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'rgba(255,255,255,0.07)',
                  borderRadius: '8px', padding: '7px 10px',
                  fontSize: '12px',
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    {dok.nama}
                  </span>
                  <button
                    onClick={() => hapusDokumen(dok.nama)}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '13px' }}
                  >✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Memory Panel ── */}
      {showMemory && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '52px', right: '12px',
            width: '320px',
            background: 'rgba(20, 5, 40, 0.95)',
            border: '1px solid rgba(244,114,182,0.5)',
            borderRadius: '12px',
            padding: '16px',
            zIndex: 35,
            color: 'white',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>🧠 Memory Browser</span>
            <button onClick={clearAllMemories} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>
              Clear All
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input 
              type="text" 
              value={memoryQuery} 
              onChange={e => setMemoryQuery(e.target.value)} 
              placeholder="Cari ingatan..."
              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '12px' }}
            />
            <button onClick={searchMemories} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '0 10px', cursor: 'pointer' }}>
              🔍
            </button>
          </div>

          <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
            {memoryLoading ? (
              <p style={{ fontSize: '12px', color: 'gray', textAlign: 'center' }}>Memuat...</p>
            ) : (memorySearchResults || memories).length === 0 ? (
              <p style={{ fontSize: '12px', color: 'gray', textAlign: 'center' }}>Tidak ada ingatan.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(memorySearchResults || memories).map((m, i) => (
                  <li key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '6px', fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ flex: 1 }}>{m.text}</span>
                    <button onClick={() => deleteMemory(m)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showAddMemory ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea 
                value={newMemoryText} 
                onChange={e => setNewMemoryText(e.target.value)}
                placeholder="Ingatan baru..."
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', resize: 'none', height: '50px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={addMemory} style={{ flex: 1, background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px', fontSize: '11px', cursor: 'pointer' }}>Simpan</button>
                <button onClick={() => setShowAddMemory(false)} style={{ flex: 1, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px', fontSize: '11px', cursor: 'pointer' }}>Batal</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddMemory(true)} style={{ width: '100%', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}>
              + Tambah Manual
            </button>
          )}
        </div>
      )}

      {/* ── DOCX Panel ── */}
      {showDocx && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '52px', right: '12px',
            width: '350px',
            background: 'rgba(20, 5, 40, 0.95)',
            border: '1px solid rgba(244,114,182,0.5)',
            borderRadius: '12px',
            padding: '16px',
            zIndex: 35,
            color: 'white',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>📝 DOCX Generator</span>
            <label style={{ background: '#3b82f6', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}>
              {docxUploading ? '⏳...' : '+ Referensi'}
              <input type="file" ref={docxFileInputRef} accept=".txt,.pdf,.md,.docx" onChange={uploadDocxRef} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
            {docxRefs.map((ref, i) => (
              <span key={i} style={{ background: 'rgba(59,130,246,0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                {ref.filename} <button onClick={() => deleteDocxRef(ref.filename, ref.type)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
              </span>
            ))}
          </div>

          {!docxSessionId ? (
            <button onClick={startDocxSession} style={{ width: '100%', padding: '10px', background: '#f472b6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Mulai Pembuatan DOCX
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {docxChat.map((msg, i) => (
                  <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? '#f472b6' : 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: '12px', fontSize: '12px', maxWidth: '85%' }}>
                    {msg.text}
                  </div>
                ))}
              </div>
              
              {!docxDone ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={docxInput} onChange={e => setDocxInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendDocxAnswer(docxInput)} placeholder="Jawaban..." style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '12px' }} />
                  <button onClick={() => sendDocxAnswer(docxInput)} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}>Kirim</button>
                </div>
              ) : (
                <button onClick={generateDocx} disabled={!!docxJobId} style={{ padding: '10px', background: docxJobId ? '#6b7280' : '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {docxJobId ? 'Proses...' : 'Generate File DOCX'}
                </button>
              )}

              {docxJobStatus && (
                <div style={{ fontSize: '11px', textAlign: 'center', marginTop: '4px', color: '#60a5fa' }}>
                  Status: {docxJobStatus.step}
                </div>
              )}
            </div>
          )}

          {docxFiles.length > 0 && (
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f9a8d4', display: 'block', marginBottom: '8px' }}>📂 File Tersedia:</span>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {docxFiles.map((file, i) => (
                  <li key={i} style={{ fontSize: '11px' }}>
                    <a href={`http://localhost:8000/api/docx/download/${file.filename}`} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>
                      📄 {file.filename}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Pending Actions Widget ── */}
      {pendingActions.length > 0 && (
        <div style={{
          position: 'absolute', top: showDocs ? '300px' : '52px', right: '12px',
          width: '320px',
          background: 'rgba(20, 20, 20, 0.95)',
          border: '1px solid #3b82f6',
          borderRadius: '12px',
          padding: '16px',
          zIndex: 40,
          color: 'white',
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#60a5fa', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🚀 Pilot Actions Pending ({pendingActions.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingActions.map(action => (
              <div key={action.id} style={{
                background: 'rgba(255,255,255,0.05)',
                padding: '10px', borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                  <strong>{action.tool}</strong>: {action.instruction}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); approveAction(action.id); }}
                    style={{
                      flex: 1, background: '#10b981', color: 'white', border: 'none',
                      padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold'
                    }}
                  >✓ Approve</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); rejectAction(action.id); }}
                    style={{
                      flex: 1, background: '#ef4444', color: 'white', border: 'none',
                      padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold'
                    }}
                  >✕ Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Character Sprite ── */}
      <div style={{
        position: 'absolute',
        bottom: '160px',
        left: '50%',
        transform: showCanvas ? 'translateX(-80%)' : 'translateX(-50%)',
        transition: 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
        height: '70vh',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        <BocchiAvatar 
          audioBase64={audioBase64} 
          emosi={isPanicking ? 'panik' : emosi} 
          onFinishedPlaying={() => setAudioBase64(null)} 
        />
      </div>

      {/* ── Canvas Panel ── */}
      <div style={{
        position: 'absolute',
        top: '60px',
        right: showCanvas ? '20px' : '-50vw',
        width: '45vw',
        height: 'calc(100vh - 240px)',
        background: 'rgba(15,5,30,0.85)',
        border: '1px solid rgba(244,114,182,0.4)',
        borderRadius: '16px',
        backdropFilter: 'blur(10px)',
        zIndex: 15,
        transition: 'right 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Canvas Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>📄 Canvas Ringkasan</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                const blob = new Blob([canvasContent], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'ringkasan_bocchi.md';
                a.click();
              }}
              style={{
                background: 'rgba(244,114,182,0.2)',
                border: '1px solid rgba(244,114,182,0.4)',
                color: '#f9a8d4',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
            >
              📥 Download .md
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowCanvas(false); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '16px',
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
            >
              ✕
            </button>
          </div>
        </div>
        {/* Canvas Content */}
        <div className="canvas-markdown" style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto',
          color: 'rgba(255,255,255,0.9)',
          fontSize: '15px',
          lineHeight: '1.6',
          wordBreak: 'break-word'
        }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {canvasContent}
          </ReactMarkdown>
        </div>
      </div>

      {/* ── Dialogue Box ── */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        zIndex: 20,
      }}>
        {/* Name Tag */}
        {(displayedText || loading) && (
          <div style={{
            marginLeft: '40px',
            marginBottom: '-2px',
            display: 'inline-block',
            background: 'rgba(20, 5, 40, 0.92)',
            border: '1px solid rgba(244,114,182,0.5)',
            borderBottom: 'none',
            padding: '6px 22px 8px',
            borderRadius: '10px 10px 0 0',
            color: '#f9a8d4',
            fontWeight: 800,
            fontSize: '15px',
            letterSpacing: '1px',
          }}>
            Bocchi
          </div>
        )}

        {/* Dialogue Area */}
        <div
          style={{
            background: 'rgba(10, 3, 25, 0.88)',
            borderTop: '1px solid rgba(244,114,182,0.4)',
            padding: '20px 40px 12px',
            minHeight: '120px',
            position: 'relative',
          }}
        >
          {/* Dialogue Text */}
          <p style={{
            color: 'white',
            fontSize: '16px',
            lineHeight: 1.8,
            margin: 0,
            minHeight: '56px',
            letterSpacing: '0.3px',
          }}>
            {loading
              ? <span style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>Bocchi sedang berpikir...</span>
              : displayedText || (
                <span style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                  {userProfile.nama ? `Klik layar untuk mulai berbicara dengan Bocchi, ${userProfile.nama}...` : 'Klik layar untuk mulai berbicara...'}
                </span>
              )
            }
            {isTyping && <span style={{ animation: 'blink 0.8s infinite', color: '#f9a8d4' }}>▌</span>}
          </p>

          {/* Continue Arrow */}
          {!isTyping && !loading && displayedText && !showInput && (
            <div style={{
              position: 'absolute',
              right: '24px',
              bottom: '16px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center'
            }}>
              <button 
                onClick={(e) => { e.stopPropagation(); copyToNote(); }}
                title="Simpan sebagai file"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(244,114,182,0.3)',
                  color: '#f9a8d4',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  pointerEvents: 'auto'
                }}
              >
                📝 Save
              </button>
              <div style={{
                color: '#f9a8d4',
                fontSize: '18px',
                animation: 'bounce 1s infinite',
              }}>▼</div>
            </div>
          )}

          {/* Input Area - appears when user clicks after Bocchi finishes */}
          {showInput && !loading && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '12px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
                <input
                  autoFocus
                  type="text"
                  value={pesan}
                  onChange={e => setPesan(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && kirimKeAi()}
                  placeholder={`Katakan sesuatu kepada Bocchi...`}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(244,114,182,0.4)',
                    borderRadius: '12px',
                    padding: '10px 16px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                <button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  title={voiceEnabled ? "Voice Output ON" : "Voice Output OFF"}
                  style={{
                    background: voiceEnabled ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${voiceEnabled ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.2)'}`,
                    color: 'white',
                    borderRadius: '12px',
                    padding: '0 16px',
                    fontSize: '18px',
                    cursor: 'pointer',
                  }}
                >
                  {voiceEnabled ? '🔊' : '🔇'}
                </button>
                <button
                  onClick={handleMicClick}
                  style={{
                    background: isRecording ? '#ef4444' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${isRecording ? '#ef4444' : 'rgba(255,255,255,0.2)'}`,
                    color: 'white',
                    borderRadius: '12px',
                    padding: '0 16px',
                    fontSize: '18px',
                    cursor: 'pointer',
                    animation: isRecording ? 'pulse 1.5s infinite' : 'none'
                  }}
                >
                  {isRecording ? '⏹' : '🎙️'}
                </button>
                <button
                  onClick={kirimKeAi}
                  disabled={!pesan.trim() && !isRecording}
                  style={{
                    background: pesan.trim() ? '#e11d48' : 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '0 22px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: pesan.trim() ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Kirim ▶
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom Menu Bar ── */}
        <div style={{
          background: 'rgba(5, 1, 15, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          justifyContent: 'center',
          gap: '2px',
          padding: '6px 0',
        }}>
          {['AUTO', 'FILE', 'SAVE', 'LOAD', 'LOG', 'SKIP', 'CONFIG', 'QUIT'].map(label => (
            <button
              key={label}
              onClick={(e) => {
                e.stopPropagation();
                if (label === 'QUIT') setScreen('menu');
                if (label === 'FILE') setShowFileModal(true);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: label === 'QUIT' ? '#f87171' : 'rgba(255,255,255,0.55)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '1.5px',
                padding: '4px 18px',
                cursor: 'pointer',
                borderRight: label !== 'QUIT' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#f9a8d4'}
              onMouseLeave={e => e.currentTarget.style.color = label === 'QUIT' ? '#f87171' : 'rgba(255,255,255,0.55)'}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Modal Buat File ── */}
      {showFileModal && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, backdropFilter: 'blur(8px)',
        }} onClick={() => setShowFileModal(false)}>
          <div style={{
            background: '#1f1137',
            width: '95%', maxWidth: '800px',
            borderRadius: '24px',
            padding: '24px',
            border: '1px solid rgba(244,114,182,0.3)',
            boxShadow: '0 15px 50px rgba(0,0,0,0.6)',
            display: 'flex',
            gap: '24px',
            maxHeight: '80vh',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Kiri: List File */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '20px' }}>
              <h3 style={{ color: '#f9a8d4', marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>📂 File Tersimpan</h3>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
                {catatanList.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>Belum ada file di folder 'catatan'</p>
                ) : (
                  catatanList.map((file, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '12px', padding: '10px 12px',
                      marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      border: '1px solid rgba(255,255,255,0.03)'
                    }}>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ color: 'white', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.nama}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{(file.ukuran / 1024).toFixed(1)} KB</div>
                      </div>
                      <button 
                        onClick={() => hapusCatatan(file.nama)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '16px' }}
                      >✕</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Kanan: Form Buat File */}
            <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ color: '#f9a8d4', marginTop: 0, marginBottom: '20px' }}>📝 Buat File Baru</h3>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Nama File (contoh: diary.md)</label>
                <input 
                  type="text"
                  placeholder="catatan_bocchi.txt"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '12px', color: 'white', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Konten File</label>
                <textarea 
                  placeholder="Tuliskan sesuatu di sini..."
                  value={newFileContent}
                  onChange={e => setNewFileContent(e.target.value)}
                  style={{
                    width: '100%', flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '12px', color: 'white', outline: 'none', resize: 'none',
                    fontFamily: 'monospace', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '10px' }}>
                <button 
                  onClick={() => setShowFileModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Tutup
                </button>
                <button 
                  onClick={handleBuatFile}
                  disabled={!newFileName || !newFileContent || fileLoading}
                  style={{
                    background: (newFileName && newFileContent) ? '#f472b6' : 'rgba(255,255,255,0.1)',
                    color: 'white', border: 'none', borderRadius: '12px', padding: '12px 28px',
                    fontWeight: 'bold', cursor: 'pointer', transition: 'transform 0.1s'
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {fileLoading ? 'Menyimpan...' : 'Simpan File'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Permission Modal */}
      {permissionRequest && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: '#1a1b26', padding: '24px', borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)', maxWidth: '400px', width: '90%'
          }}>
            <h3 style={{ color: '#f472b6', marginTop: 0, marginBottom: '16px' }}>Izin Akses Sistem</h3>
            <p style={{ color: 'white', marginBottom: '12px', fontSize: '14px', lineHeight: '1.5' }}>
              Bocchi ingin menjalankan aksi pada sistem Anda:
            </p>
            <div style={{
              background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px',
              fontFamily: 'monospace', fontSize: '12px', color: '#a9b1d6', marginBottom: '20px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>
              <strong>Tool:</strong> {permissionRequest.tool}<br/>
              <strong>Argumen:</strong><br/>
              {permissionRequest.parameter}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => handlePermissionResponse(false)}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                  borderRadius: '8px', padding: '8px 16px', cursor: 'pointer'
                }}
              >
                Tolak
              </button>
              <button 
                onClick={() => handlePermissionResponse(true)}
                style={{
                  background: '#f472b6', border: 'none', color: 'white', fontWeight: 'bold',
                  borderRadius: '8px', padding: '8px 16px', cursor: 'pointer'
                }}
              >
                Izinkan
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
        @keyframes bounce { 0%,100% { transform:translateY(0) } 50% { transform:translateY(4px) } }
      `}</style>
    </div>
    </>
  );
}

export default App