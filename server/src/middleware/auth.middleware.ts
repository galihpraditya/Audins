import { Request, Response, NextFunction } from "express"

import { getUserFromToken } from "../services/auth.service.js"

import { User } from "../types/index.js"

export interface AuthenticatedRequest extends Request {
  userId?: string

  user?: User

  isGuest?: boolean
}

function getHeaderKey(header: string | string[] | undefined): string | null {
  if (!header) return null

  if (Array.isArray(header)) return header[0] || null

  return header
}

/**
 * Extracts Bearer token or guest session ID and attaches userId / user to request.
 */

export async function authenticate(
  req: AuthenticatedRequest,

  res: Response,

  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim()

      const user = await getUserFromToken(token)

      if (user) {
        req.user = user

        req.userId = user.id

        req.isGuest = false

        return next()
      }
    }

    // Fallback to guest session header

    const guestSession = getHeaderKey(req.headers["x-user-session"])

    if (guestSession) {
      req.userId = guestSession

      req.isGuest = true

      return next()
    }

    // Neither present

    req.userId = undefined

    req.isGuest = undefined

    next()
  } catch (error) {
    console.error("Authentication middleware error:", error)

    next()
  }
}

/**
 * Ensures the request is from an authenticated registered user (non-guest).
 */

export function requireAuthenticatedUser(
  req: AuthenticatedRequest,

  res: Response,

  next: NextFunction,
): void {
  if (!req.user || !req.userId || req.isGuest) {
    res.status(401).json({ error: "Authentication required" })

    return
  }

  next()
}

/**
 * Ensures the request has an identified user or guest session ID.
 */

export function requireAnyUser(
  req: AuthenticatedRequest,

  res: Response,

  next: NextFunction,
): void {
  if (!req.userId) {
    res
      .status(401)
      .json({ error: "Missing authentication or x-user-session header" })

    return
  }

  next()
}
