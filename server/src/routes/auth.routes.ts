import { Router, Response } from "express"

import { signUpUser, signInUser } from "../services/auth.service.js"

import { claimGuestDocuments } from "../services/storage.service.js"

import {
  authenticate,
  requireAuthenticatedUser,
  AuthenticatedRequest,
} from "../middleware/auth.middleware.js"

const router = Router()

// POST /api/v1/auth/signup

router.post("/signup", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, name, guestSessionId } = req.body

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Valid email is required" })

      return
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" })

      return
    }

    const authRes = await signUpUser(email, password, name)

    let claimedCount = 0

    if (guestSessionId && typeof guestSessionId === "string") {
      claimedCount = await claimGuestDocuments(guestSessionId, authRes.user.id)
    }

    res.status(201).json({
      ...authRes,

      claimedCount,
    })
  } catch (error: any) {
    console.error("Signup error:", error)

    res.status(400).json({ error: error.message || "Failed to create account" })
  }
})

// POST /api/v1/auth/login

router.post("/login", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, guestSessionId } = req.body

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" })

      return
    }

    const authRes = await signInUser(email, password)

    let claimedCount = 0

    if (guestSessionId && typeof guestSessionId === "string") {
      claimedCount = await claimGuestDocuments(guestSessionId, authRes.user.id)
    }

    res.json({
      ...authRes,

      claimedCount,
    })
  } catch (error: any) {
    console.error("Login error:", error)

    res.status(401).json({ error: error.message || "Invalid credentials" })
  }
})

// GET /api/v1/auth/me

router.get(
  "/me",

  authenticate,

  requireAuthenticatedUser,

  (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user })
  },
)

// POST /api/v1/auth/claim-session

router.post(
  "/claim-session",

  authenticate,

  requireAuthenticatedUser,

  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { guestSessionId } = req.body

      if (!guestSessionId || typeof guestSessionId !== "string") {
        res.status(400).json({ error: "guestSessionId is required" })

        return
      }

      const claimedCount = await claimGuestDocuments(
        guestSessionId,
        req.userId!,
      )

      res.json({
        success: true,

        claimedCount,
      })
    } catch (error: any) {
      console.error("Claim session error:", error)

      res.status(500).json({ error: "Failed to claim guest documents" })
    }
  },
)

export default router
