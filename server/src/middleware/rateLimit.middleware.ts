import { Request, Response, NextFunction } from "express"
import { RateLimitResponse } from "../types/index.js"
import {
  getSupabaseRateLimit,
  saveSupabaseRateLimit,
  isSupabaseEnabled,
} from "../services/supabase.service.js"

interface IPRecord {
  count: number
  resetTime: Date
}

const localUsageStore = new Map<string, IPRecord>()
const MAX_FREE_DAILY_UPLOADS = parseInt(
  process.env.MAX_FREE_DAILY_UPLOADS || "5",
  10,
)

export function getClientIP(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim()
  }
  return req.socket.remoteAddress || "127.0.0.1"
}

export function getRateLimitKey(req: Request): string {
  const session = req.headers["x-user-session"]
  if (typeof session === "string" && session.trim().length > 0) {
    return session.trim()
  }
  return getClientIP(req)
}

export async function getRateLimitStatus(
  req: Request,
): Promise<RateLimitResponse> {
  const key = getRateLimitKey(req)
  const now = new Date()

  let record: IPRecord | null | undefined = localUsageStore.get(key)
  if (isSupabaseEnabled()) {
    record = await getSupabaseRateLimit(key)
  }

  if (!record || now > record.resetTime) {
    return {
      remaining: MAX_FREE_DAILY_UPLOADS,
      maxLimit: MAX_FREE_DAILY_UPLOADS,
      resetTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ip: key,
    }
  }

  return {
    remaining: Math.max(0, MAX_FREE_DAILY_UPLOADS - record.count),
    maxLimit: MAX_FREE_DAILY_UPLOADS,
    resetTime: record.resetTime.toISOString(),
    ip: key,
  }
}

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
    const isLocalhost =
      key === "127.0.0.1" || key === "::1" || key === "::ffff:127.0.0.1"
    const effectiveMaxLimit = isLocalhost ? 100 : MAX_FREE_DAILY_UPLOADS

    const now = new Date()
    let record: IPRecord | null | undefined = localUsageStore.get(key)

    if (isSupabaseEnabled()) {
      record = await getSupabaseRateLimit(key)
    }

    if (!record || now > record.resetTime) {
      const nextReset = new Date(now)
      nextReset.setHours(24, 0, 0, 0)
      record = { count: 0, resetTime: nextReset }
    }

    if (record.count >= effectiveMaxLimit) {
      res.status(429).json({
        error: "Portfolio Free Demo Limit Reached",
        message: `You've reached the free demo limit of ${effectiveMaxLimit} uploads today. Please provide your custom Groq API Key in Settings to continue.`,
        remaining: 0,
        maxLimit: effectiveMaxLimit,
        resetTime: record.resetTime.toISOString(),
      })
      return
    }

    record.count += 1
    localUsageStore.set(key, record)

    if (isSupabaseEnabled()) {
      await saveSupabaseRateLimit(key, record)
    }

    next()
  } catch (error) {
    console.error("Rate limit error:", error)
    next() // Fail open if storage error
  }
}
