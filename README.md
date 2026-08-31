<div align="center">
  <img src="https://i.ibb.co/60f9sTw2/uzhavan-logo.png" alt="Uzhavan AI Logo" width="160" height="160" style="border-radius: 50%; border: 4px solid #22c55e;" />
  <h1>🌾 UZHAVAN AI (உழவன் AI)</h1>
  <p><b>Next-Gen Multilingual Agricultural AI Assistant & Intelligent Voice Call Bot</b></p>

  [![React](https.img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com/)
  [![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%26%20Auth-orange.svg)](https://firebase.google.com/)
  [![NVIDIA NIM](https://img.shields.io/badge/NVIDIA_NIM-Llama--3.3--70B-green.svg)](https://build.nvidia.com/)
</div>

---

## 📌 Overview

**UZHAVAN AI** is a state-of-the-art agricultural intelligence platform built to empower farmers with real-time, multi-source actionable advice. Featuring an **Intelligent Voice Call Bot**, personalized **Crop Disease Prediction**, **Live Weather Advisories**, **Agmarknet Mandi Prices**, and **Agricultural News**, Uzhavan AI bridges the gap between complex agricultural science and rural farming communities across multiple languages (Tamil, English, Hindi, Telugu, Kannada, Malayalam).

---

## 🌟 Key Features

### 📞 1. Intelligent Multilingual Call Bot (`/screens/PhoneCall.tsx`)
- **16 Agricultural Intent Routing System**: Understands queries about Weather, Market Prices, Agricultural News, Crop Diseases, Prevention, Natural/Organic Remedies, Chemical Management, Crop Selection, Soil, Irrigation, Fertilizers, Pests, and Government Schemes.
- **Parallel Multi-Source Data Ingestion**: Concurrently queries Live Weather, Agmarknet Market Prices, News API, and Local Agricultural RAG Knowledge Base.
- **Multi-Model Intelligence Chain**: Runs primary inference on **NVIDIA NIM (Llama-3.3-70B)** with direct **Groq** and **Gemini 2.0 Flash** fallbacks, alongside a zero-downtime **Local Offline RAG Generator**.
- **Voice STT & Streaming TTS**: Supports Speech-to-Text and Text-to-Speech in Tamil, Hindi, Telugu, Kannada, Malayalam, and English.

### 🔬 2. Personalized Crop Disease Prediction (`/screens/DiseasePrediction.tsx`)
- **Profile Context Hydration**: Automatically personalizes disease diagnosis based on the authenticated farmer's registered crop (e.g., Carrot, Brinjal, Paddy, Tomato).
- **Comprehensive Remedies**: Delivers step-by-step symptoms, natural/organic management (Neem Oil, Trichoderma viride), chemical treatment with active ingredients & precise dosages, and prevention tips.

### 🌤️ 3. Weather & Farming Advisories (`/screens/Weather.tsx`)
- Real-time temperature, humidity, wind speed, rainfall alerts, and field operation advisories tailored for Tamil Nadu districts and Indian farming hubs.

### 📊 4. Agmarknet Market Price Intelligence (`/screens/MarketInsight.tsx` & `/screens/DailyPricePredictions.tsx`)
- Live mandi prices, daily commodity price trends, min/max rates, and market forecasts for informed crop selling.

### 📰 5. Agricultural News (`/screens/AgricultureNews.tsx`)
- Real-time agriculture news aggregator with language selection and state-level government announcements.

---

## 🛠️ Architecture & Tech Stack

```mermaid
graph TD
    User((Farmer)) <--> VoiceUI[Voice & Web Interface]
    VoiceUI <--> STT_TTS[Speech-To-Text / Text-To-Speech]
    VoiceUI <--> Router[16-Intent Agriculture Router]
    
    subgraph Multi-Source Data Engine
        Router --> WeatherAPI[Live Weather API]
        Router --> MarketAPI[Agmarknet Mandi Prices]
        Router --> NewsAPI[Agri News Engine]
        Router --> RAG[Agri Knowledge Base RAG]
    end
    
    subgraph Multi-Model AI Fallback Pipeline
        WeatherAPI & MarketAPI & NewsAPI & RAG --> NVIDIA[1. NVIDIA NIM Llama-3.3-70B]
        NVIDIA -- Fallback --> Groq[2. Groq Llama-3.3-70B]
        Groq -- Fallback --> Gemini[3. Gemini 2.0 Flash]
        Gemini -- Fallback --> LocalRAG[4. Offline Local RAG Generator]
    end
    
    LocalRAG --> VoiceUI
```

- **Frontend**: React 18, TypeScript, Vite, Lucide Icons, TailwindCSS.
- **Backend Proxy**: FastAPI (Python 3.10+), Uvicorn, CORS-safe proxy handlers.
- **Data & Auth**: Firebase Authentication, Firestore Profile Storage, LocalStorage Persistence.
- **AI Models**: NVIDIA NIM (`meta/llama-3.3-70b-instruct`), Groq API, Google Gemini 2.0 Flash.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 1. Clone Repository
```bash
git clone https://github.com/Gopi45-gk/uzhavan-ai-1.git
cd uzhavan-ai-1
```

### 2. Frontend Setup
```bash
npm install
npm run dev
```

### 3. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

<div align="center">
  <sub>Built with ❤️ for Indian Farmers by Team Uzhavan AI</sub>
</div>
