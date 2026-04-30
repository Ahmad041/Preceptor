# Preceptor (Bocchi AI Desktop Assistant) 🎸

> An interactive AI desktop assistant themed after Bocchi the Rock. Features RVC voice integration for lifelike communication, a Visual Novel-style Story Mode powered by local LLMs (Ollama), and intelligent hybrid Q&A logic. Designed to deliver an immersive and responsive character roleplay experience directly on your Windows desktop.

## ✨ Features

- **🗣️ Interactive Character AI**: Roleplay and chat naturally with a Bocchi-themed assistant.
- **🎙️ Voice Synthesis (RVC)**: Lifelike voice responses using Retrieval-based Voice Conversion for maximum immersion.
- **📖 Visual Novel Story Mode**: Upload any document and the AI will automatically generate a visual novel-style interactive story based on the content.
- **🧠 Local LLM Powered**: Runs completely locally using **Ollama (Qwen)** for fast, private, and offline AI processing.
- **🔍 Hybrid Q&A Logic**: Smart contextual logic for answering questions efficiently.

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI
- **Frontend**: React, Vite, Tailwind CSS
- **AI & ML**: Ollama (Qwen 3.5), RVC (Retrieval-based Voice Conversion)

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js & npm
- [Ollama](https://ollama.com/) installed and running locally

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ahmad041/Preceptor.git
   cd Preceptor
   ```

2. **Setup Backend:**
   ```bash
   # Create and activate a virtual environment
   python -m venv venv
   venv\Scripts\activate  # On Windows

   # Install dependencies (ensure you have a requirements.txt, or install FastAPI, Uvicorn, etc. manually)
   pip install fastapi uvicorn python-multipart
   ```

3. **Setup Frontend:**
   ```bash
   cd frontend
   npm install
   ```

### Running the App

1. **Start the Backend Server:**
   ```bash
   # From the root directory
   uvicorn main:app --reload
   ```

2. **Start the Frontend Development Server:**
   ```bash
   # From the frontend directory
   npm run dev
   ```

## 📝 Note on Large Files
Due to GitHub's file size limits, large AI models (`.pth`, `.index` for RVC) and audio files are not included in this repository. You will need to provide your own RVC models and place them in the appropriate directory to enable the voice features.

## 📄 License
This project is created for educational and personal use.
