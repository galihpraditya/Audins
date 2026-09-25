import path from "node:path"
import fs from "node:fs"
import { createHmac, timingSafeEqual } from "node:crypto"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env before any module reads process.env, checking server/.env and root .env
const serverEnvPath = path.resolve(__dirname, "../.env")
const rootEnvPath = path.resolve(__dirname, "../../.env")
if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath })
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath })
} else {
  dotenv.config()
}

export const PORT = parseInt(process.env.PORT || "3001", 10)

export const BASE_URL = (
  process.env.BASE_URL || `http://localhost:${PORT}`
).replace(/\/$/, "")

// Single source of truth for the uploads directory so that every module
// resolves it identically regardless of process.cwd() at start time.
// Both layouts are exactly two levels below the repo root:
//   dev (tsx):  <repo>/server/src/config.js  → ../../ = <repo>
//   prod (tsc): <repo>/server/dist/config.js → ../../ = <repo>
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, "../../uploads")

export const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve(__dirname, "../../db.json")

export const USERS_FILE = process.env.USERS_FILE
  ? path.resolve(process.env.USERS_FILE)
  : path.resolve(__dirname, "../../users.json")

export const MAX_FILE_BYTES = 500 * 1024 * 1024 // 500MB per user storage cap
export const MAX_GLOBAL_STORAGE_BYTES = 5 * 1024 * 1024 * 1024 // 5GB global cap

export const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.MEDIA_SIGNING_SECRET ||
  (() => {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "CRITICAL SECURITY WARNING: JWT_SECRET is not set in production. Using insecure default secret.",
      )
    }
    return "audin-jwt-auth-secret"
  })()

// Secret used to sign local /uploads media URLs so filenames alone are useless.
export const MEDIA_SIGNING_SECRET =
  process.env.MEDIA_SIGNING_SECRET ||
  (() => {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "CRITICAL SECURITY WARNING: MEDIA_SIGNING_SECRET is not set in production. Using insecure default secret.",
      )
    }
    return "audin-insecure-dev-secret"
  })()

export function signMediaToken(fileName: string, expiresAtMs: number): string {
  return createHmac("sha256", MEDIA_SIGNING_SECRET)
    .update(`${fileName}.${expiresAtMs}`)
    .digest("hex")
}

export function verifyMediaToken(
  fileName: string,
  expiresAtMs: number,
  token: string,
): boolean {
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false
  const expected = signMediaToken(fileName, expiresAtMs)
  if (expected.length !== token.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token))
}
