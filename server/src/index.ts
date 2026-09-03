import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "node:path"
import audioRoutes, { getActiveBackgroundJobCount } from "./routes/audio.routes.js"
import authRoutes from "./routes/auth.routes.js"
import {
  PORT,
  UPLOADS_DIR,
  DB_FILE,
  verifyMediaToken,
} from "./config.js"
import {
  failStaleProcessingDocuments,
  cleanupExpiredAudio,
  flushDbWrites,
} from "./services/storage.service.js"
import { pruneLocalRateLimits } from "./middleware/rateLimit.middleware.js"

dotenv.config()

const app = express()

// --- CORS ---
// Strict allow-list: localhost for development plus exact FRONTEND_URL entries.
// Wildcards over shared hosting domains (*.vercel.app etc.) were removed —
// anyone can deploy to those, which previously let attacker pages call the API.
const allowedOrigins = new Set<string>(
  [
    "http://localhost:8443",
    "http://localhost:5173",
    "http://127.0.0.1:8443",
    "http://127.0.0.1:5173",
    ...(process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(",").map((u) => u.trim().replace(/\/$/, ""))
      : []),
  ].filter(Boolean),
)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (Postman, curl, server-to-server)
      if (!origin) return callback(null, true)

      const cleanOrigin = origin.replace(/\/$/, "")
      if (allowedOrigins.has(cleanOrigin)) return callback(null, true)

      console.warn(`CORS blocked request from origin: ${origin}`)
      callback(new Error("Not allowed by CORS"))
    },
    credentials: true,
  }),
)

app.use(express.json())

// --- Local media serving ---
// Replaces the previous unauthenticated express.static("/uploads"). Files are
// only served when the request carries a valid signed token (?v=<expiry>&t=<hmac>),
// so a guessed filename alone grants nothing.
app.get("/uploads/:file", (req, res) => {
  const file = req.params.file
  if (!/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) {
    res.status(400).json({ error: "Invalid file name" })
    return
  }

  const expiresAt = Number(req.query.v)
  const token = typeof req.query.t === "string" ? req.query.t : ""
  if (!token || !verifyMediaToken(file, expiresAt, token)) {
    res.status(403).json({ error: "Missing or invalid media token" })
    return
  }

  res.sendFile(path.join(UPLOADS_DIR, file), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "File not found" })
    }
  })
})

// Root welcome route
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Audins AI Audio Intelligence Backend API",
    apiRoot: `http://localhost:${PORT}/api/v1`,
    health: `http://localhost:${PORT}/health`,
  })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "Audins AI Audio Intelligence Backend",
    version: "1.1.0",
    timestamp: new Date().toISOString(),
  })
})

// Register REST API routes
app.use("/api/v1/auth", authRoutes)
app.use("/api/v1", audioRoutes)

// Fallback 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      health: "GET /health",
      apiIndex: "GET /api/v1",
      documents: "GET /api/v1/documents",
      upload: "POST /api/v1/audio/upload",
    },
  })
})

// Standardized JSON Error Handler Middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("API Error:", err)

    let status = err.status || 500
    let message = err.message || "Internal Server Error"

    // Handle Multer specific errors
    if (err.name === "MulterError") {
      status = 400
      if (err.code === "LIMIT_FILE_SIZE") {
        message = "File is too large. Maximum size allowed is 500MB."
      } else {
        message = `Upload error: ${err.message}`
      }
    } else if (
      err.message &&
      err.message.includes("Unsupported file format")
    ) {
      status = 400
    }

    res.status(status).json({
      error: message,
      status,
    })
  },
)

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`=================================================`)
  console.log(` 🎙️  Audin AI Backend Server Running on Port ${PORT}`)
  console.log(` 🚀 API Endpoint: http://localhost:${PORT}/api/v1`)
  console.log(` 🟢 Health Check:  http://localhost:${PORT}/health`)
  console.log(` 📁 Uploads dir:   ${UPLOADS_DIR}`)
  console.log(` 💾 Local DB file: ${DB_FILE}`)
  console.log(`=================================================`)
})

// Generous but bounded timeouts: long uploads/cloud copies still work, but a
// dead socket can no longer hold resources forever.
server.timeout = 15 * 60 * 1000 // 15 minutes hard cap per request
server.keepAliveTimeout = 120000 // 2 minutes keep-alive
server.headersTimeout = 125000 // 125 seconds header timeout

// --- Maintenance scheduler ---
// Expiry cleanup used to run ONLY when someone hit GET /settings/rate-limit,
// meaning expired files lingered forever on idle deployments. Run it on a
// fixed interval instead, together with rate-limit store pruning.
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000 // hourly

async function runMaintenance(): Promise<void> {
  try {
    pruneLocalRateLimits()
    await cleanupExpiredAudio()
  } catch (error) {
    console.error("Scheduled maintenance failed:", error)
  }
}

const maintenanceTimer = setInterval(runMaintenance, MAINTENANCE_INTERVAL_MS)
maintenanceTimer.unref?.()

// --- Boot recovery ---
// Background AI jobs are in-process and die with the process; recover docs
// stuck in "Processing" from a previous run so users aren't left hanging.
void failStaleProcessingDocuments().catch((error) =>
  console.error("Stale processing recovery failed:", error),
)

// --- Graceful shutdown ---
let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${signal} received. Shutting down gracefully...`)

  // Stop accepting new connections.
  server.close(() => console.log("HTTP server closed."))

  // Wait (max 25s) for in-flight background AI pipelines to finish.
  const deadline = Date.now() + 25_000
  while (getActiveBackgroundJobCount() > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
  }
  if (getActiveBackgroundJobCount() > 0) {
    console.warn(
      `${getActiveBackgroundJobCount()} background job(s) still active after timeout; exiting anyway.`,
    )
  }

  await flushDbWrites()
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
