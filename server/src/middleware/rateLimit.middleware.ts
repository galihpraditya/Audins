import { Request, Response, NextFunction } from "express"

import { createHash } from "node:crypto"

import { RateLimitRecord, RateLimitResponse } from "../types/index.js"

import {
  incrementSupabaseRateLimit,
  getSupabaseRateLimit,
  saveSupabaseRateLimit,
  isSupabaseRateLimitEnabled,
} from "../services/rateLimit.store.js"

import { calculateStorageUsed } from "../services/storage.service.js"

interface IPRecord extends RateLimitRecord {}

const localUsageStore = new Map<string, IPRecord>()

const MAX_FREE_DAILY_UPLOADS = parseInt(
  process.env.MAX_FREE_DAILY_UPLOADS || "10",

  10,
)

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Session ids are client-supplied UUIDs. We accept only sane characters and
 * bound the length so attacker-controlled headers cannot bloat the in-memory
 * store with garbage keys.
 */

const SESSION_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/

function sanitizeSessionKey(raw: string): string | null {
  return SESSION_KEY_RE.test(raw) ? raw : null
}

function socketAddress(req: Request): string {
  return req.socket.remoteAddress || "127.0.0.1"
}

function hashedIpKey(addr: string): string {
  const hash = createHash("sha256").update(addr).digest("hex").slice(0, 32)

  return `ip-${hash}`
}

export function getRateLimitKey(req: Request): string {
  const authUserId = (req as any).userId

  if (typeof authUserId === "string" && authUserId.trim().length > 0) {
    const sanitized = sanitizeSessionKey(authUserId.trim())

    if (sanitized) return sanitized
  }

  const session = req.headers["x-user-session"]

  if (typeof session === "string" && session.trim().length > 0) {
    const sanitized = sanitizeSessionKey(session.trim())

    if (sanitized) return sanitized

    // Malformed session header: fall back to a stable per-socket identity

    // instead of trusting arbitrary bytes as a map key.
  }

  return hashedIpKey(socketAddress(req))
}

function isLocalSocket(req: Request): boolean {
  const addr = socketAddress(req)

  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1"
}

/** Removes expired entries so the in-memory store cannot grow unbounded. */

export function pruneLocalRateLimits(): void {
  const now = Date.now()

  for (const [key, rec] of localUsageStore) {
    if (now > rec.resetTime.getTime()) localUsageStore.delete(key)
  }
}

async function readRecord(key: string): Promise<IPRecord | null> {
  if (isSupabaseRateLimitEnabled()) {
    const remote = await getSupabaseRateLimit(key)

    if (remote !== null)
      return { count: remote.count, resetTime: remote.resetTime }

    // No record yet anywhere — mirror that locally.

    return null
  }

  const local = localUsageStore.get(key)

  return local ? { count: local.count, resetTime: local.resetTime } : null
}

export async function getRateLimitStatus(
  req: Request,
): Promise<RateLimitResponse> {
  const key = getRateLimitKey(req)

  const now = new Date()

  const record = await readRecord(key)

  const storageUsed = (await calculateStorageUsed(key)) ?? 0

  const storageLimit = 500 * 1024 * 1024 // 500 MB

  if (!record || now > record.resetTime) {
    return {
      remaining: MAX_FREE_DAILY_UPLOADS,

      maxLimit: MAX_FREE_DAILY_UPLOADS,

      resetTime: new Date(now.getTime() + ROLLING_WINDOW_MS).toISOString(),

      ip: key,

      storageUsed,

      storageLimit,
    }
  }

  return {
    remaining: Math.max(0, MAX_FREE_DAILY_UPLOADS - record.count),

    maxLimit: MAX_FREE_DAILY_UPLOADS,

    resetTime: record.resetTime.toISOString(),

    ip: key,

    storageUsed,

    storageLimit,
  }
}

/**
 * Enforces the daily upload quota.
 * - Custom Groq API key bypasses limiting entirely (by design).
 * - Supabase mode uses an ATOMIC rpc check-and-increment.
 * - Local mode relies on synchronous single-threaded Map mutation.
 * - FAIL-CLOSED on infrastructure errors: uploads are the expensive path we
 *   are protecting; availability of quota accounting is preferred over
 *   silently allowing unlimited usage.
 */

export async function checkPortfolioRateLimit(
  req: Request,

  res: Response,

  next: NextFunction,
): Promise<void> {
  try {
    const customApiKey = req.headers["x-groq-api-key"]

    if (
      customApiKey &&
      typeof customApiKey === "string" &&
      customApiKey.trim().length > 0
    ) {
      return next()
    }

    const key = getRateLimitKey(req)

    const effectiveMaxLimit = isLocalSocket(req) ? 100 : MAX_FREE_DAILY_UPLOADS

    const now = new Date()

    const reject = (record: IPRecord) => {
      res.status(429).json({
        error: "Portfolio Free Demo Limit Reached",

        message: `You've reached the free demo limit of ${effectiveMaxLimit} uploads today. Please provide your custom Groq API Key in Settings to continue.`,

        remaining: 0,

        maxLimit: effectiveMaxLimit,

        resetTime: record.resetTime.toISOString(),
      })
    }

    if (isSupabaseRateLimitEnabled()) {
      const incremented = await incrementSupabaseRateLimit(
        key,
        effectiveMaxLimit,
      )

      if (incremented) {
        localUsageStore.set(key, incremented)

        if (incremented.count > effectiveMaxLimit) {
          reject(incremented)

          return
        }

        return next()
      }

      // Atomic path unavailable (probe failed / migration missing). Fall back

      // to the legacy read-modify-write record for THIS request instead of

      // hard-failing every upload until restart. Only fail closed when even

      // the fallback cannot persist.

      const existing = await readRecord(key)

      const record: IPRecord =
        !existing || now > existing.resetTime
          ? { count: 0, resetTime: new Date(now.getTime() + ROLLING_WINDOW_MS) }
          : { count: existing.count, resetTime: existing.resetTime }

      if (record.count >= effectiveMaxLimit) {
        reject(record)

        return
      }

      record.count += 1

      localUsageStore.set(key, record)

      const saved = await saveSupabaseRateLimit(key, record)

      if (!saved) {
        console.error("Legacy rate-limit persistence failed — failing closed.")

        res.status(503).json({
          error: "Quota service temporarily unavailable",

          message:
            "We could not verify your upload quota. Please try again shortly or provide your own Groq API Key in Settings.",
        })

        return
      }

      return next()
    }

    // Local-only mode: single-threaded event loop makes this atomic enough.

    let record = localUsageStore.get(key)

    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: new Date(now.getTime() + ROLLING_WINDOW_MS),
      }
    }

    if (record.count >= effectiveMaxLimit) {
      reject(record)

      return
    }

    record.count += 1

    localUsageStore.set(key, record)

    next()
  } catch (error) {
    console.error("Rate limit error:", error)

    // Fail closed for the paid-resource path (see doc comment above).

    res.status(503).json({
      error: "Quota service temporarily unavailable",

      message:
        "We could not verify your upload quota. Please try again shortly or provide your own Groq API Key in Settings.",
    })
  }
}

/** Best-effort decrement after aborted/failed uploads. */

export async function refundRateLimit(req: Request): Promise<void> {
  try {
    const customApiKey = req.headers["x-groq-api-key"]

    if (
      customApiKey &&
      typeof customApiKey === "string" &&
      customApiKey.trim().length > 0
    ) {
      return
    }

    const key = getRateLimitKey(req)

    if (isSupabaseRateLimitEnabled()) {
      const record = await getSupabaseRateLimit(key)

      if (record && record.count > 0) {
        record.count -= 1

        localUsageStore.set(key, record)

        await saveSupabaseRateLimit(key, record)
      }

      return
    }

    const record = localUsageStore.get(key)

    if (record && record.count > 0) {
      record.count -= 1
    }
  } catch (error) {
    console.error("Failed to refund rate limit:", error)
  }
}
