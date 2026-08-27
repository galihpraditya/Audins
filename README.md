# Audins - Audio Insight

Audins is an open-source web application and audio intelligence studio designed to transcribe, summarize, and analyze audio and video recordings. Powered by Groq using Whisper Large v3 and GPT-OSS models, it turns lectures, meetings, interviews, and live recordings into structured, actionable summaries and interactive, searchable transcripts.

Live Demo: [audins.vercel.app](https://audins.vercel.app)

---

> **The Story Behind Audins**
> 
> This project was built to solve a real, everyday struggle: **taking notes during fast-paced university lectures and dense meetings.**
> 
> Instead of frantically trying to type everything down, Audins allows you to record or upload the audio and let the AI do the heavy lifting — generating clean, structured summaries and extracting key action items.
> 
> When you need to review a specific moment in the conversation, you don't have to guess or scrub blindly through a long timeline. Simply search for a keyword in the interactive transcript, click the segment, and the player immediately jumps to the exact second it was spoken.

---

## Key Features

* **In-Browser Live Audio Recording:** Record meetings, interviews, or lectures directly from your microphone with a real-time waveform canvas visualizer, timer, pause/resume, and instant submission for transcription.
* **High-Speed Audio & Video Transcription:** Transcribes media files (up to 500MB) with high accuracy using Groq Whisper (`whisper-large-v3`).
* **Authentic Waveform & Interactive Audio Player:** Real-time Web Audio API peak analysis with a 64-bar waveform, smooth scrubbing, hover timestamp preview, speed controls (0.75x – 2x), 5-second skips, and audio download.
* **Interactive Transcript with Timestamp Sync:** Click any transcribed segment to immediately jump audio playback to that exact second. Includes instant keyword search with match counter and one-click copy.
* **Dynamic AI Summarization:** Automatically transforms transcripts into contextual summaries with structured sections, takeaways, and action items using `openai/gpt-oss-120b` (with automated fallback to `openai/gpt-oss-20b`).
* **Custom AI Guidelines & Presets:** Guide the summary output using prompt presets (*Indonesian Translation*, *Action Items & Decisions*, *Detailed Study Notes*, *Executive Brief*) or provide custom instructions.
* **Summary Markdown Editor:** Edit and refine generated summaries directly in the workspace with live Markdown preview and formatted section copying.
* **Print-Ready PDF Export:** Export structured summaries to styled, multi-page PDFs with automated naming (`[DocName]_Summary_Audins.pdf`), consistent headers/footers, and clean typography.
* **Bilingual Support (i18n):** Full internationalization with instant switching between **English** and **Indonesian (Bahasa Indonesia)**.
* **Monochromatic Theme System:** Sleek, high-contrast dark and light themes with system preference detection.
* **Flexible API Key & Free Tier:** Generous free tier (10 uploads/day) with dynamic reset countdown, or bring your own Groq API Key for unlimited processing.

---

## Advanced AI & Processing Pipeline — Under the Hood

To handle large media files, rate limits, and edge cases gracefully, Audins implements an intelligent backend processing pipeline:

| Feature | Mechanism | Purpose |
| :--- | :--- | :--- |
| **30-Minute Audio Chunking** | Automatically splits files `>24MB` into 30-minute segments (1800s) using FFmpeg with bounded concurrency (`CHUNK_CONCURRENCY = 3`). | Bypasses Whisper's 25MB file size limit while maintaining exact timestamp continuity. |
| **Format Transcoding** | Converts formats like `.aac` to `.mp3` automatically using FFmpeg before processing. | Guarantees audio compatibility with the Groq API. |
| **Resilient Model Fallback** | Automatically falls back from `openai/gpt-oss-120b` to `openai/gpt-oss-20b` upon hitting TPM or rate limits. | Prevents request failures and ensures reliable summary generation. |
| **Context Window Optimization** | Condenses transcripts exceeding 20,000 characters (~6,500 tokens) using head/tail sampling. | Stays within model context limits while retaining crucial context. |
| **Authentic Waveform Extraction** | Decodes audio buffers in the browser via Web Audio API using downsampled stride sampling across 64 visual peaks. | Delivers authentic, lightweight audio waveform visualization without server overhead. |
| **Secure Tokenized Media Serving** | Signs local audio media URLs with HMAC-SHA256 time-expiring tokens (`?v=<expiry>&t=<token>`). | Prevents unauthorized file access while allowing audio playback and downloads. |

---

## Infrastructure, Storage, and Security

* **Database & Row Level Security:** Supabase PostgreSQL stores metadata, transcripts, and summaries with Row Level Security (RLS) policies.
* **Cloud Storage & Data Retention:** Uploaded audio/video files are stored in Cloudflare R2 (or Supabase Storage) with a 500MB quota per user. Media files are automatically cleaned up after 7 days to optimize storage, while text transcripts and summaries remain permanently accessible.
* **Rate Limiting Engine:** Dual-layer rate limiter (Supabase SQL store with in-memory fallback) enforces a 10-upload daily limit for free tier users, featuring a live countdown to reset.
* **Client-Side API Key Storage:** Bring-your-own-key (BYOK) Groq API keys are stored solely in the user's browser `localStorage` and sent over HTTPS headers to bypass server-side rate limits.

---

## Tech Stack

### Frontend
* **Core:** React 19, TypeScript, Vite
* **Styling:** Tailwind CSS v4, Custom CSS Variables
* **Audio & Visuals:** Web Audio API (Waveform Analysis & Live Recording), HTML5 Audio
* **Icons & Markdown:** `@phosphor-icons/react`, `react-markdown`
* **Routing & State:** React Router DOM v7, React Contexts (`LanguageContext`, `ThemeContext`, `ToastContext`)

### Backend
* **Runtime:** Node.js, Express, TypeScript (`tsx` for development)
* **File Uploads:** Multer (Memory / Temp storage)
* **Audio Processing:** `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`
* **AI Provider:** `groq-sdk` (Whisper Large v3, OpenAI GPT-OSS 120B & 20B)
* **Databases & Storage:** Supabase (`@supabase/supabase-js`), Cloudflare R2 (`@aws-sdk/client-s3`)

---

## Project Structure

```text
├── server/                         # Backend Node.js/Express application
│   ├── migrations/                 # SQL migration scripts (Rate limiting tables)
│   ├── src/
│   │   ├── config.ts               # Environment variables & constants
│   │   ├── middleware/             # Rate limiter & upload middlewares
│   │   ├── routes/                 # Express API routes (audio processing, documents)
│   │   ├── services/               # Groq AI, FFmpeg chunking, R2 & Supabase services
│   │   └── types/                  # Backend TypeScript interfaces
│   └── package.json
│
├── src/                            # Frontend React application
│   ├── components/
│   │   ├── dashboard/              # UploadZone, DocCard, RecentDocsTable, FreeTierBar
│   │   ├── layout/                 # Sidebar, TopHeader, MobileNav, Logo
│   │   ├── modals/                 # SettingsModal, RateLimitModal
│   │   ├── recording/              # LiveRecorderModal (Microphone & Web Audio visualizer)
│   │   ├── ui/                     # Alert, Modal, EmptyState, Toast, ErrorBoundary
│   │   └── workspace/              # AudioPlayer (Waveform), TranscriptPanel, SummaryEditor
│   ├── context/                    # LanguageContext (i18n), ThemeContext (Dark/Light)
│   ├── hooks/                      # useApiKey, useQuota, useDocumentPolling
│   ├── i18n/                       # Translation dictionaries (English & Indonesian)
│   ├── utils/                      # audioWaveform peak extraction utilities
│   ├── App.tsx                     # Main application layout and document controller
│   └── index.css                   # Tailwind CSS v4 design tokens and theme rules
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18 or higher recommended.
- A [Groq API Key](https://console.groq.com/) (optional for demo/free tier, required for unlimited usage).

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/audins.git
   cd audins
   ```

2. **Install all dependencies**
   ```bash
   # Install root & frontend dependencies
   npm install

   # Install backend dependencies
   cd server
   npm install
   cd ..
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the `server` directory:
   ```env
   PORT=3001
   BASE_URL=http://localhost:3001
   FRONTEND_URL=http://localhost:8443

   # Groq AI
   GROQ_API_KEY=your_groq_api_key_here

   # Rate Limiting
   MAX_FREE_DAILY_UPLOADS=10

   # Supabase (Optional for cloud persistence)
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Cloudflare R2 (Optional for cloud storage)
   R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret_key
   R2_BUCKET_NAME=your_bucket_name
   ```

4. **Start Development Servers**
   From the **root directory**, run:
   ```bash
   npm run dev
   ```
   This will start both:
   * **Frontend (Vite):** `http://localhost:8443`
   * **Backend (Express):** `http://localhost:3001`

---

## License

This project is open-source and available under the [MIT License](LICENSE).
