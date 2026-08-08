import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import fs from "node:fs"
import path from "node:path"
import audioRoutes from "./routes/audio.routes.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Middleware
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (Postman, curl, server-to-server)
      if (!origin) return callback(null, true)

      const cleanOrigin = origin.replace(/\/$/, "")

      const isLocal =
        cleanOrigin.startsWith("http://localhost") ||
        cleanOrigin.startsWith("http://127.0.0.1") ||
        cleanOrigin.match(/^http:\/\/192\.168\.\d+\.\d+/) ||
        cleanOrigin.match(/^http:\/\/10\.\d+\.\d+\.\d+/) ||
        cleanOrigin.match(/^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+/)

      let isAllowedProd = false
      if (process.env.FRONTEND_URL) {
        const allowedList = process.env.FRONTEND_URL.split(",").map((url) =>
          url.trim().replace(/\/$/, ""),
        )
        isAllowedProd =
          allowedList.includes(cleanOrigin) || allowedList.includes("*")
      }

      // Auto-allow all Vercel and Cloudflare Pages deployment URLs
      if (
        cleanOrigin.endsWith(".vercel.app") ||
        cleanOrigin.endsWith(".workers.dev")
      ) {
        isAllowedProd = true
      }

      if (isLocal || isAllowedProd) {
        callback(null, true)
      } else {
        console.warn(`CORS blocked request from origin: ${origin}`)
        callback(new Error("Not allowed by CORS"), false)
      }
    },
    credentials: true,
  }),
)

app.use(express.json())
app.use("/uploads", express.static(uploadsDir))

// Root welcome route
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Audin AI Audio Intelligence Backend API",
    apiRoot: `http://localhost:${PORT}/api/v1`,
    health: `http://localhost:${PORT}/health`,
  })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "Audin AI Audio Intelligence Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  })
})

// Register REST API routes
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
    } else if (err.message && err.message.includes("Unsupported file format")) {
      status = 400
    }

    res.status(status).json({
      error: message,
      status,
    })
  },
)

// Start Express Server
app.listen(PORT, () => {
  console.log(`=================================================`)
  console.log(` 🎙️  Audin AI Backend Server Running on Port ${PORT}`)
  console.log(` 🚀 API Endpoint: http://localhost:${PORT}/api/v1`)
  console.log(` 🟢 Health Check:  http://localhost:${PORT}/health`)
  console.log(`=================================================`)
})
