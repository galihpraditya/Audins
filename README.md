# Audins - Audio Insight

Audins is a web application designed to transcribe and summarize audio and video recordings. Powered by the Groq API using Whisper and Llama 3 models, it converts lectures, meetings, and interviews into structured summaries and searchable transcripts.

Live Demo: [audins.vercel.app](https://audins.vercel.app)

---

> **The Story Behind Audins**
> 
> This project was initially built to solve a real problem: **the struggle of taking notes during fast-paced university lectures and long meetings.**
> 
> Instead of scrambling to write everything down, Audins allows you to simply record the audio and let the AI do the heavy lifting. It automatically generates a clean, structured summary of the topic. 
>
> Even better, if you want to listen back to a specific part of the conversation, you no longer have to guess or scrub blindly through the audio timeline. You can simply search for a keyword in the raw transcript, click on the text, and immediately play the exact moment it was spoken.

---

## Key Features

* **Audio & Video Transcription:** Generates text transcripts from uploaded media files.
* **Interactive Audio Player:** Click on any transcribed word to jump to its corresponding timestamp in the audio file.
* **AI Summarization:** Automatically structures transcripts into sections, summaries, and action items using Llama 3.3.
* **Custom AI Guidelines:** Refine summaries by giving instructions such as translating the output or focusing on specific topics.
* **PDF Export:** Downloads summaries as formatted PDF files with custom styles.
* **Flexible API Options:** Works with the default limits or lets you use your own Groq API key.

### Advanced AI Pipeline - Under the Hood

To handle API limitations and edge cases, the backend implements the following processing pipeline:

| Feature | Mechanism | Purpose |
| :--- | :--- | :--- |
| **Audio Chunking** | Automatically splits files >24MB into 10-minute segments using FFmpeg. | Bypasses the Whisper API 25MB file size limit. |
| **Format Conversion** | Converts audio formats like `.aac` to `.mp3` using FFmpeg. | Ensures compatibility with the Groq API. |
| **Model Fallback** | Automatically falls back to `llama-3.1-8b-instant` if Llama 3.3 70B hits rate limits. | Prevents request failures due to API limits. |
| **Context Management** | Condenses transcripts exceeding 20,000 characters. | Prevents exceeding the LLM token window. |

---

## Infrastructure, Security, and Limits

* **Database Security:** Enforces data privacy at the database level using Supabase RLS policies. Users can only access their own data.
* **Cloud Storage & Data Retention:** Uploaded audio and video files are stored in Cloudflare R2 with a quota of 500MB per user. To manage storage costs, these media files are automatically deleted after seven days, while text transcripts and summaries remain permanently in Supabase.
* **Rate Limiting:** Protects the free tier with session-based rate limits (up to 10 uploads per day) to manage API expenses.
* **Deployment:** Ready to deploy with the frontend on Vercel, the backend on Render, and data persisted on Supabase and Cloudflare R2.

---

## Tech Stack and Developer Experience

### Stack Overview
* **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite
* **Backend:** Node.js, Express, TypeScript, Multer
* **Database & Metadata:** Supabase (PostgreSQL)
* **Cloud Storage:** Cloudflare R2 (S3-Compatible Object Storage)
* **AI Processing:** Groq API using Whisper and Llama 3.3 models

### Developer Experience (DX)
* **Local FFmpeg:** No manual system installation is required; FFmpeg and FFprobe are bundled locally via npm packages.
* **Concurrent Development:** Run `npm run dev` at the root to start the frontend and backend servers simultaneously.

---

## Project Structure

```text
├── server/                     # Backend Node.js/Express application
│   ├── src/
│   │   ├── middleware/         # Custom middlewares (Rate Limiting, Uploads)
│   │   ├── routes/             # REST API routing
│   │   ├── services/           # AI pipelines (Groq, FFmpeg, Chunking)
│   │   └── types/              # TypeScript declarations
│   └── package.json
│
├── src/                        # Frontend React application
│   ├── components/             # Reusable UI components (Dashboard, Workspace, Layout)
│   ├── services/               # Frontend API service integrations
│   ├── App.tsx                 # Main application controller and state container
│   └── index.css               # Core design tokens and custom CSS variables
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js version 18 or higher is recommended.
- A Groq API Key, which is optional but recommended for unrestricted usage.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/audins.git
   cd audins
   ```

2. **Install All Dependencies**
   *Install frontend dependencies:*
   ```bash
   npm install
   ```
   *Install backend dependencies:*
   ```bash
   cd server
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the `server` directory and configure your backend environment:
   ```env
   PORT=3001
   GROQ_API_KEY=your_groq_api_key_here
   MAX_FREE_DAILY_UPLOADS=10
   ```

4. **Start the Application**
   From the **root directory**, run the development server:
   ```bash
   npm run dev
   ```
   This command starts the Vite frontend at `http://localhost:8443` and the Express backend at `http://localhost:3001` concurrently.

## License

This project is open-source and available under the [MIT License](LICENSE).
