import { Request, Response, NextFunction } from 'express'
import { RateLimitResponse } from '../types/index.js'

interface IPRecord {
  count: number
  resetTime: Date
}

const ipUsageStore = new Map<string, IPRecord>()
const MAX_FREE_DAILY_UPLOADS = parseInt(process.env.MAX_FREE_DAILY_UPLOADS || '5', 10)

export function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress || '127.0.0.1'
}

export function getRateLimitStatus(req: Request): RateLimitResponse {
  const ip = getClientIP(req)
  const now = new Date()
  const record = ipUsageStore.get(ip)

  if (!record || now > record.resetTime) {
    return {
      remaining: MAX_FREE_DAILY_UPLOADS,
      maxLimit: MAX_FREE_DAILY_UPLOADS,
      resetTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ip,
    }
  }

  return {
    remaining: Math.max(0, MAX_FREE_DAILY_UPLOADS - record.count),
    maxLimit: MAX_FREE_DAILY_UPLOADS,
    resetTime: record.resetTime.toISOString(),
    ip,
  }
}

export function checkPortfolioRateLimit(req: Request, res: Response, next: NextFunction): void {
  const customApiKey = req.headers['x-groq-api-key']

  // If user provides custom Groq API Key, bypass shared rate limit
  if (customApiKey && typeof customApiKey === 'string' && customApiKey.trim().length > 0) {
    return next()
  }

  const ip = getClientIP(req)
  // Relax rate limit for local development on localhost
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  const effectiveMaxLimit = isLocalhost ? 100 : MAX_FREE_DAILY_UPLOADS

  const now = new Date()
  let record = ipUsageStore.get(ip)

  // Reset counter if past 24h
  if (!record || now > record.resetTime) {
    const nextReset = new Date(now)
    nextReset.setHours(24, 0, 0, 0)
    record = { count: 0, resetTime: nextReset }
    ipUsageStore.set(ip, record)
  }

  if (record.count >= effectiveMaxLimit) {
    res.status(429).json({
      error: 'Portfolio Free Demo Limit Reached',
      message: `You've reached the free demo limit of ${effectiveMaxLimit} uploads today. Please provide your custom Groq API Key in Settings to continue.`,
      remaining: 0,
      maxLimit: effectiveMaxLimit,
      resetTime: record.resetTime.toISOString(),
    })
    return
  }

  // Increment usage count for shared demo key
  record.count += 1
  ipUsageStore.set(ip, record)
  next()
}
