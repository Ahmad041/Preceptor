import { useState, useEffect } from 'react';
import BocchiAvatar from './BocchiAvatar';
export default function QuizStory({ group, onBack }) {
  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [audioBase64, setAudioBase64] = useState(null);
  const [bocchiMessage, setBocchiMessage] = useState(null);

  const playBocchiMessage = async (text, emosi) => {
    setBocchiMessage(text);
    try {
      const response = await fetch('http://localhost:8000/api/story/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dialog: text, emosi: emosi })
      });
      const data = await response.json();
      if (data.audio_base64) {
        setAudioBase64(data.audio_base64);
      }
    } catch (e) { console.error('TTS error:', e); }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !quizFinished && quizData && !showExplanation) {
        playBocchiMessage("S-senpai... kamu baru saja pindah tab kan? J-jangan mencontek ya...", "Sad");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [quizFinished, quizData, showExplanation]);

  useEffect(() => {
    if (quizFinished || !quizData || showExplanation) return;
    
    const timer = setTimeout(() => {
      const complaints = [
        "Uhm... Senpai? Apa pertanyaannya terlalu sulit?",
        "J-jangan diam saja... a-aku jadi gugup...",
        "K-kalau tidak tahu, tebak saja tidak apa-apa kok...",
        "A-ayo cepat jawab... waktunya terus berjalan lho..."
      ];
      const randomComplaint = complaints[Math.floor(Math.random() * complaints.length)];
      playBocchiMessage(randomComplaint, "Sad");
    }, 15000);

    return () => clearTimeout(timer);
  }, [currentQuestionIndex, showExplanation, quizData, quizFinished]);
  useEffect(() => {
    // Check if quiz exists in group data
    const savedGroups = JSON.parse(localStorage.getItem('story_groups') || '[]');
    const currentGroup = savedGroups.find(g => g.id === group.id);
    if (currentGroup && currentGroup.quiz) {
      setQuizData(currentGroup.quiz);
    }
  }, [group.id]);

  const generateQuiz = async () => {
    setLoading(true);
    try {
      // Compile materi_konten
      let materi = '';
      group.chapters?.forEach(ch => {
        materi += `--- Chapter: ${ch.judul} ---\n`;
        ch.scenes?.forEach(s => {
          materi += `${s.dialog}\n`;
          if (s.catatan && s.catatan.length > 0) {
            materi += `Catatan: ${s.catatan.join(', ')}\n`;
          }
        });
      });
      group.ovas?.forEach(ova => {
        materi += `--- OVA: ${ova.judul} ---\n`;
        ova.scenes?.forEach(s => {
          materi += `${s.dialog}\n`;
        });
      });

      const response = await fetch('http://localhost:8000/api/story/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materi_konten: materi,
          user_nama: localStorage.getItem('story_user_nama') || 'Senpai'
        })
      });

      if (!response.ok) throw new Error('Gagal generate quiz');
      const data = await response.json();
      
      if (data.status === 'berhasil') {
        const newQuiz = data.data;
        setQuizData(newQuiz);
        
        // Save to localStorage
        const savedGroups = JSON.parse(localStorage.getItem('story_groups') || '[]');
        const updatedGroups = savedGroups.map(g => {
          if (g.id === group.id) {
            return { ...g, quiz: newQuiz };
          }
          return g;
        });
        localStorage.setItem('story_groups', JSON.stringify(updatedGroups));
      } else {
        throw new Error(data.pesan);
      }
    } catch (err) {
      alert('Error generating quiz: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (index) => {
    if (showExplanation) return;
    setAudioBase64(null);
    setBocchiMessage(null);
    setSelectedAnswer(index);
    setShowExplanation(true);
    
    if (index === quizData.questions[currentQuestionIndex].jawaban_benar) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    setAudioBase64(null);
    setBocchiMessage(null);
    if (currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setQuizFinished(true);
      
      // Update score in localStorage
      const savedGroups = JSON.parse(localStorage.getItem('story_groups') || '[]');
      const updatedGroups = savedGroups.map(g => {
        if (g.id === group.id && g.quiz) {
          return { ...g, quiz: { ...g.quiz, score: score + (selectedAnswer === quizData.questions[currentQuestionIndex].jawaban_benar ? 1 : 0) } };
        }
        return g;
      });
      localStorage.setItem('story_groups', JSON.stringify(updatedGroups));
    }
  };

  const resetQuiz = () => {
    setAudioBase64(null);
    setBocchiMessage(null);
    setCurrentQuestionIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setQuizFinished(false);
  };

  if (!quizData && !loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf2f8', flexDirection: 'column', gap: '20px' }}>
        <h1 style={{ color: '#e11d48' }}>🎮 Quiz: {group.title}</h1>
        <p style={{ color: '#71717a' }}>Uji ingatanmu tentang materi ini bersama Bocchi!</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: '20px', border: '1px solid #e11d48', background: 'transparent', color: '#e11d48', cursor: 'pointer', fontWeight: 'bold' }}>Kembali</button>
          <button onClick={generateQuiz} style={{ padding: '10px 20px', borderRadius: '20px', border: 'none', background: '#e11d48', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Mulai Generate Quiz</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf2f8', flexDirection: 'column' }}>
        <div style={{ fontSize: '40px', marginBottom: '20px', animation: 'spin 2s linear infinite' }}>⏳</div>
        <h2 style={{ color: '#e11d48' }}>Bocchi sedang menyusun soal ujian...</h2>
        <p style={{ color: '#71717a' }}>Mohon tunggu sebentar ya!</p>
      </div>
    );
  }

  if (quizFinished) {
    const totalQuestions = quizData.questions.length;
    let reaction = '';
    if (score <= 3) reaction = "K-kita belajar ulang ya... Jangan menyerah!";
    else if (score <= 6) reaction = "L-lumayan... tapi masih bisa lebih baik kok!";
    else if (score <= 9) reaction = "S-Senpai hebat!! Hampir sempurna!";
    else reaction = "EEEHH?! Sempurna?! K-kamu pasti curang!! ...bercanda hehe";

    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf2f8', flexDirection: 'column', gap: '20px' }}>
        <h1 style={{ color: '#e11d48', fontSize: '48px', margin: 0 }}>Ujian Selesai!</h1>
        <div style={{ fontSize: '72px', fontWeight: 'bold', color: score >= 7 ? '#10b981' : '#f59e0b' }}>
          {score} / {totalQuestions}
        </div>
        <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', maxWidth: '500px', textAlign: 'center' }}>
          <p style={{ fontStyle: 'italic', color: '#52525b', margin: 0 }}>"{reaction}"</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '20px' }}>
          <button onClick={onBack} style={{ padding: '12px 24px', borderRadius: '24px', border: 'none', background: '#f4f4f5', color: '#52525b', cursor: 'pointer', fontWeight: 'bold' }}>Kembali ke Library</button>
          <button onClick={resetQuiz} style={{ padding: '12px 24px', borderRadius: '24px', border: 'none', background: '#e11d48', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Ulangi Quiz</button>
        </div>
      </div>
    );
  }

  const currentQ = quizData.questions[currentQuestionIndex];

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#fdf2f8', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: '1px solid #e4e4e7', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', color: '#52525b' }}>
          ← Keluar Ujian
        </button>
        <div style={{ fontWeight: 'bold', color: '#e11d48' }}>
          Soal {currentQuestionIndex + 1} dari {quizData.questions.length}
        </div>
        <div style={{ fontWeight: 'bold', color: '#10b981' }}>
          Skor Sementara: {score}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Side: Bocchi Interaction */}
        <div style={{ width: '400px', padding: '32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid rgba(228,228,231,0.5)' }}>
          <div style={{ width: '100%', height: '350px', position: 'relative', marginBottom: '24px' }}>
            <BocchiAvatar 
              audioBase64={audioBase64} 
              emosi={bocchiMessage ? "Sad" : (currentQ.emosi_bocchi?.toLowerCase() || 'neutral')} 
              onFinishedPlaying={() => setAudioBase64(null)} 
            />
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', position: 'relative', width: '100%' }}>
            {/* Speech bubble tail */}
            <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', borderWidth: '0 10px 10px 10px', borderStyle: 'solid', borderColor: 'transparent transparent white transparent' }} />
            <p style={{ margin: 0, color: '#3f3f46', fontSize: '15px', lineHeight: '1.5', fontStyle: 'italic' }}>
              "{bocchiMessage || currentQ.dialog_bocchi}"
            </p>
          </div>
        </div>

        {/* Right Side: Question and Options */}
        <div style={{ flex: 1, padding: '48px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '24px', color: '#18181b', marginBottom: '32px', lineHeight: '1.4' }}>
            {currentQ.soal}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {currentQ.opsi.map((opt, idx) => {
              let btnStyle = {
                padding: '20px', textAlign: 'left', fontSize: '16px', borderRadius: '16px', cursor: 'pointer',
                border: '2px solid #e4e4e7', background: 'white', color: '#3f3f46', transition: 'all 0.2s',
                fontWeight: '500'
              };

              if (showExplanation) {
                if (idx === currentQ.jawaban_benar) {
                  btnStyle.background = '#d1fae5';
                  btnStyle.borderColor = '#10b981';
                  btnStyle.color = '#065f46';
                } else if (idx === selectedAnswer) {
                  btnStyle.background = '#fee2e2';
                  btnStyle.borderColor = '#ef4444';
                  btnStyle.color = '#991b1b';
                }
                btnStyle.cursor = 'default';
              } else {
                // Hover effect injected via className or inline is tricky, we'll keep it simple
              }

              return (
                <button 
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  style={btnStyle}
                  onMouseEnter={e => { if(!showExplanation) { e.target.style.borderColor = '#f43f5e'; e.target.style.background = '#fff1f2'; } }}
                  onMouseLeave={e => { if(!showExplanation) { e.target.style.borderColor = '#e4e4e7'; e.target.style.background = 'white'; } }}
                >
                  {String.fromCharCode(65 + idx)}. {opt}
                </button>
              );
            })}
          </div>

          {showExplanation && (
            <div style={{ marginTop: 'auto', paddingTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleNext} style={{
                background: '#e11d48', color: 'white', border: 'none', padding: '16px 32px', borderRadius: '30px',
                fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 8px 20px rgba(225,29,72,0.3)'
              }}>
                {currentQuestionIndex < quizData.questions.length - 1 ? 'Soal Selanjutnya ➔' : 'Selesai Ujian 🎉'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
