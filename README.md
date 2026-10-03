# Audins — Audio Insight

[![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Groq](https://img.shields.io/badge/Groq_Whisper_%26_LLM-F55036?style=flat-square)](https://groq.com/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=flat-square&logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

Audins is an open-source audio intelligence studio and web application built to record, transcribe, summarize, and analyze audio files. Powered by Groq using Whisper Large v3 Turbo and GPT-OSS models, Audins transforms lectures, meetings, interviews, and live voice notes into structured summaries and interactive, searchable transcripts.

🔗 **Live Demo:** [audins.galihh.me](https://audins.galihh.me)

---

## Background & Motivation

Taking thorough notes during fast-paced university lectures or dense corporate meetings is challenging. Typing frantically often causes you to miss crucial explanations, while raw audio recordings are cumbersome to review.

Audins solves this by:
1. **Capturing or accepting audio** without manual note-taking stress.
2. **Generating structured AI summaries** with executive briefs, key takeaways, and action items.
3. **Synchronizing audio with transcripts**, allowing you to search keywords and click any sentence to jump the audio player straight to that exact second.

---

## Key Features

### Live Recording & Audio DSP
* **Hardware/Browser Noise Suppression:** Built-in acoustic echo cancellation, noise suppression filter, and auto gain control (AGC) in mono 48kHz for clear voice capture.
* **Microphone Selector:** Choose between internal laptop microphones and external USB/headset microphones (`enumerateDevices`) with automatic device change detection.
* **High-Bitrate Opus Recording:** Encodes directly in browser at 128kbps (`audio/webm;codecs=opus` with MP4 fallback) to prevent watery compression artifacts.
* **Floating Background Recording:** Minimize active recordings into a compact floating bar with live timer, pause/resume, and stop controls while browsing documents.
* **Screen Wake Lock API:** Prevents mobile devices and laptops from sleeping or dimming during extended recordings.
* **Canvas Waveform Visualizer:** 60fps real-time frequency bar visualizer during active capture.

### Speech Transcription & Audio Pipeline
* **Groq Whisper Large v3 Turbo:** Ultra-fast speech-to-text (~216x real-time inference on Groq LPU) with word-accurate timestamps and multilingual support (auto-detect or manual language selection including Indonesian and Javanese).
* **Vocabulary Prompts & Hints:** Feed context hints (names, technical jargon, acronyms) to steer Whisper spelling accuracy.
* **Intelligent FFmpeg Chunking:** Audio files exceeding 20MB are automatically split into 8-minute chunks at 96kbps 16kHz mono with bounded concurrency (`concurrency: 2`), keeping chunk sizes under ~5.7MB (well below Groq's 25MB limit and HTTP proxy gateway timeouts) while preserving continuous timestamps and automatic retries with exponential backoff.
* **Format Transcoding:** Automatically converts `.aac` and unsupported formats into standard MP3 via FFmpeg before processing.
* **Re-transcription:** Re-run transcription on saved audio with updated language options, custom glossary prompts, or personal Groq API keys.

### Interactive Waveform & Synchronized Transcript
* **Authentic Peak Waveform:** 64-bar Web Audio API peak analysis with scrubbing, hover timestamp tooltips, and variable playback speeds (0.75x – 2.0x).
* **Click-to-Seek Synchronization:** Click any transcribed line or timestamp to immediately seek audio playback to that exact second.
* **Keyword Search & Highlight:** Real-time search across transcripts with occurrence counters and highlight navigation.
* **Multi-Format Export:** Export transcripts to Plain Text (`.txt`), Timestamped Text (`.txt`), SubRip Subtitles (`.srt`), WebVTT (`.vtt`), and Markdown (`.md`), or copy all text to clipboard.

### AI Summarization & Actionable Insights
* **Structured Markdown Notes:** Automatically generates executive summaries, core topics, takeaways, and action items using `openai/gpt-oss-120b` with automated fallback to `openai/gpt-oss-20b`.
* **Prompt Injection Defense:** Strict boundary tags and sanitizers protect summary generation against malicious instructions hidden in audio transcripts.
* **Preset & Custom Prompts:** Choose from pre-configured prompt presets (*Indonesian Translation*, *Action Items & Decisions*, *Detailed Study Notes*, *Executive Brief*) or enter custom instructions.
* **Summary Editor & PDF Export:** Edit summaries directly in the browser and export print-ready PDFs with document metadata, clean typography, and headers/footers.

### Workspace, Sharing & Privacy
* **Protected Studio Routing & In-Flight State:** Resilient `/workspace/:id` routing with in-flight upload preservation and dedicated loading states, preventing accidental drops to the library hub during background sync.
* **Public Note Sharing:** Create read-only shareable links (`/share/:shareId`) with audio playback and full transcript inspection.
* **Audio-Only & Document Deletion:** Permanently delete documents or audio-only files with reliable single-source-of-truth syncing across Supabase and local storage without resurrection loops.
* **Raw Audio Download:** Download recordings or uploaded audio directly from the player preview.
* **Bilingual Support (i18n):** Complete user interface available in both **English** and **Indonesian (Bahasa Indonesia)**.
* **Monochromatic Themes:** Clean dark and light themes with system theme auto-detection.

---

## Architecture & Processing Pipeline

```text
[ Microphone / Media File ]
           │
           ▼
[ Client DSP & MediaRecorder ] (Noise suppression, AGC, 128kbps Opus)
           │
           ▼
[ Express API Server ] ─── (Parallel: Cloud Offload + Local Pipeline)
           │
           ├─► Audio <= 20MB ──────────────────────┐
           │                                        ▼
           └─► Audio > 20MB  ──► [ FFmpeg 8-min Slices @ 96k/16kHz ]
                                                    │
                                                    ▼
                                    [ Groq Whisper Large v3 Turbo ]
                                                    │
                                                    ▼
                                          [ Full Transcript ]
                                                    │
                                                    ▼
                                     [ Groq GPT-OSS 120B / 20B ]
                                  (Prompt Defense + Summarization)
                                                    │
                                                    ▼
                                    [ Structured Summary & Actions ]
```

| Step | Technique | Purpose |
| :--- | :--- | :--- |
| **Audio Capture** | WebRTC constraints (`noiseSuppression`, `echoCancellation`, `autoGainControl`) | Eliminates room reverb, fan drone, and background noise at capture time. |
| **Concurrent Offload** | `Promise.all` with Cloud Storage and local Whisper pipeline | Eliminates cloud storage wait time, reducing end-to-end latency by 5–15 seconds. |
| **FFmpeg Slicing** | 8-minute chunks at 96kbps 16kHz mono (`libmp3lame`) with 2 concurrent workers | Produces ~5.7MB chunks preventing Groq gateway HTTP timeouts while matching Whisper's native audio rate. |
| **Speech Recognition** | Groq Whisper Large v3 Turbo (`verbose_json`) | Delivers 2x faster inference and millisecond-accurate segments and timestamps. |
| **Model Fallback** | Primary: `openai/gpt-oss-120b` &bull; Fallback: `openai/gpt-oss-20b` | Prevents summarization failure if TPM or context limit is reached. |
| **Media Security** | HMAC-SHA256 signed media tokens (`?v=<expiry>&t=<token>`) | Protects uploaded media files from unauthorized enumeration. |

---

## Tech Stack

### Frontend
* **Core:** React 19, TypeScript, Vite 8
* **Styling:** Tailwind CSS v4, Monochromatic CSS Variables
* **Audio & Visualization:** Web Audio API, HTML5 Audio, Canvas 2D
* **Icons & Content:** `@phosphor-icons/react`, `react-markdown`
* **Routing & Contexts:** React Router DOM v7, `LanguageContext`, `ThemeContext`, `ToastContext`, `AuthContext`

### Backend
* **Runtime:** Node.js, Express, TypeScript (`tsx` for dev, `tsc` for prod)
* **Audio Processing:** `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`
* **AI Provider:** `groq-sdk` (Whisper Large v3 Turbo, GPT-OSS 120B & 20B)
* **Storage & Persistence:** Local JSON store (`db.json`, `users.json`, `/uploads`), optional Cloudflare R2 (`@aws-sdk/client-s3`) & Supabase (`@supabase/supabase-js`)

---

## Project Structure

```text
├── server/                         # Backend Express application
│   ├── migrations/                 # SQL migration scripts
│   ├── src/
│   │   ├── config.ts               # Env variables, constants & HMAC token signing
│   │   ├── index.ts                # Express setup, CORS & graceful shutdown
│   │   ├── middleware/             # JWT auth & daily rate limiter
│   │   ├── routes/                 # Audio pipeline & authentication routes
│   │   ├── services/               # Groq AI, FFmpeg, R2, Supabase & storage engine
│   │   └── types/                  # Backend TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
│
├── src/                            # Frontend React application
│   ├── components/
│   │   ├── dashboard/              # UploadZone, DocCard, RecentDocsTable, FreeTierBar
│   │   ├── layout/                 # Sidebar, TopHeader, MobileNav, UserDropdown
│   │   ├── modals/                 # AuthModal, ShareModal, RetranscribeModal, SettingsModal
│   │   ├── recording/              # LiveRecorderModal (DSP constraints, device selector)
│   │   ├── ui/                     # Alert, Modal, EmptyState, ToastContext, ErrorBoundary
│   │   └── workspace/              # AudioPlayer (Waveform), TranscriptPanel, SummaryEditor
│   ├── context/                    # AuthContext, LanguageContext (i18n), ThemeContext
│   ├── hooks/                      # useApiKey, useQuota, useDocumentPolling
│   ├── i18n/                       # English & Indonesian translations
│   ├── pages/                      # SharedNotePage (Public view), Settings
│   ├── utils/                      # audioWaveform peak extraction & transcript export
│   ├── App.tsx                     # Main dashboard and workspace router
│   ├── index.css                   # Tailwind CSS v4 design tokens and theme rules
│   └── main.tsx                    # React root entry point
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Getting Started

### Prerequisites
* **Node.js** 18.0.0 or higher
* **npm** or **pnpm**
* A [Groq API Key](https://console.groq.com/) (free tier available)

### 1. Clone Repository
```bash
git clone https://github.com/galihpraditya/Audin.git
cd Audin
```

### 2. Install Dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..
```

### 3. Environment Configuration
Create a `.env` file in `server/.env` (or repository root):
```env
PORT=3001
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:8443

# Groq Cloud API Key (Required for transcription and summary)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Security Secrets
JWT_SECRET=your-random-jwt-secret-key
MEDIA_SIGNING_SECRET=your-random-media-signing-secret

# Free Tier Rate Limiting
MAX_FREE_DAILY_UPLOADS=10

# Optional Cloud Storage (defaults to local disk storage if omitted)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
# R2_ACCESS_KEY_ID=your_r2_access_key
# R2_SECRET_ACCESS_KEY=your_r2_secret_key
# R2_BUCKET_NAME=your_r2_bucket_name

# Data Migration (Set to true only for one-time manual migration from local db.json to Supabase)
# SYNC_LOCAL_DB=false
```

### 4. Run Development Servers
From the repository root:
```bash
npm run dev
```
* **Frontend:** `http://localhost:8443`
* **Backend API:** `http://localhost:3001`

### 5. Production Build
```bash
# Build frontend
npm run build

# Build backend
npm run build --prefix server

# Start backend in production
npm run start --prefix server
```

---

## License

This project is licensed under the [MIT License](LICENSE).
