import fs from "node:fs"
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { v4 as uuidv4 } from "uuid"
import { USERS_FILE, JWT_SECRET } from "../config.js"
import { isSupabaseEnabled, getSupabaseClient } from "./supabase.service.js"
import { User, AuthResponse } from "../types/index.js"

interface StoredLocalUser {
  id: string
  email: string
  name?: string
  passwordHash: string
  salt: string
  createdAt: string
}

let localUsersStore: Map<string, StoredLocalUser> = new Map()

function loadLocalUsers(): void {
  if (isSupabaseEnabled()) return
  if (fs.existsSync(USERS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))
      localUsersStore = new Map(
        data.map((u: StoredLocalUser) => [u.email.toLowerCase(), u]),
      )
      return
    } catch (error) {
      console.error("Failed to read users.json, starting with empty store:", error)
    }
  }
  localUsersStore = new Map()
}

let userWriteChain: Promise<void> = Promise.resolve()

function scheduleUsersWrite(): void {
  if (isSupabaseEnabled()) return
  userWriteChain = userWriteChain
    .then(async () => {
      const data = JSON.stringify(Array.from(localUsersStore.values()), null, 2)
      const tmp = `${USERS_FILE}.tmp`
      await fs.promises.writeFile(tmp, data, "utf8")
      await fs.promises.rename(tmp, USERS_FILE)
    })
    .catch((error) => {
      console.error("Failed to persist users.json:", error)
    })
}

loadLocalUsers()

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex")
}

interface LocalTokenPayload {
  sub: string
  email: string
  name?: string
  exp: number
}

function createLocalToken(payload: LocalTokenPayload): string {
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = createHmac("sha256", JWT_SECRET)
    .update(payloadStr)
    .digest("base64url")
  return `${payloadStr}.${sig}`
}

function verifyLocalToken(token: string): LocalTokenPayload | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 2) return null
    const [payloadStr, sig] = parts
    const expectedSig = createHmac("sha256", JWT_SECRET)
      .update(payloadStr)
      .digest("base64url")

    if (sig.length !== expectedSig.length) return null
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null

    const payload = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString("utf8"),
    ) as LocalTokenPayload

    if (!payload.exp || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export async function signUpUser(
  email: string,
  pass: string,
  name?: string,
): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("Invalid email address")
  }
  if (!pass || pass.length < 6) {
    throw new Error("Password must be at least 6 characters")
  }

  // 1. Supabase Mode
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error("Supabase is not initialized")

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: pass,
      options: {
        data: { name: name || cleanEmail.split("@")[0] },
      },
    })

    if (error) throw new Error(error.message)
    if (!data.user) throw new Error("Registration failed")

    const user: User = {
      id: data.user.id,
      email: data.user.email || cleanEmail,
      name: data.user.user_metadata?.name || name,
      createdAt: data.user.created_at,
    }

    return {
      user,
      token: data.session?.access_token || "",
      provider: "supabase",
    }
  }

  // 2. Local Fallback Mode
  if (localUsersStore.has(cleanEmail)) {
    throw new Error("An account with this email already exists")
  }

  const salt = randomBytes(16).toString("hex")
  const passwordHash = hashPassword(pass, salt)
  const userId = `usr-${uuidv4().substring(0, 12)}`
  const now = new Date().toISOString()

  const localUser: StoredLocalUser = {
    id: userId,
    email: cleanEmail,
    name: name || cleanEmail.split("@")[0],
    passwordHash,
    salt,
    createdAt: now,
  }

  localUsersStore.set(cleanEmail, localUser)
  scheduleUsersWrite()

  const token = createLocalToken({
    sub: userId,
    email: cleanEmail,
    name: localUser.name,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  })

  return {
    user: {
      id: userId,
      email: cleanEmail,
      name: localUser.name,
      createdAt: now,
    },
    token,
    provider: "local",
  }
}

export async function signInUser(
  email: string,
  pass: string,
): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) throw new Error("Email is required")
  if (!pass) throw new Error("Password is required")

  // 1. Supabase Mode
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error("Supabase is not initialized")

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: pass,
    })

    if (error) throw new Error(error.message)
    if (!data.user || !data.session) throw new Error("Invalid credentials")

    return {
      user: {
        id: data.user.id,
        email: data.user.email || cleanEmail,
        name: data.user.user_metadata?.name,
        createdAt: data.user.created_at,
      },
      token: data.session.access_token,
      provider: "supabase",
    }
  }

  // 2. Local Fallback Mode
  const stored = localUsersStore.get(cleanEmail)
  if (!stored) {
    throw new Error("Invalid email or password")
  }

  const computedHash = hashPassword(pass, stored.salt)
  if (
    computedHash.length !== stored.passwordHash.length ||
    !timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(stored.passwordHash, "hex"),
    )
  ) {
    throw new Error("Invalid email or password")
  }

  const token = createLocalToken({
    sub: stored.id,
    email: stored.email,
    name: stored.name,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  })

  return {
    user: {
      id: stored.id,
      email: stored.email,
      name: stored.name,
      createdAt: stored.createdAt,
    },
    token,
    provider: "local",
  }
}

export async function getUserFromToken(token: string): Promise<User | null> {
  if (!token) return null

  // 1. Supabase Mode
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient()
    if (!supabase) return null

    try {
      const { data, error } = await supabase.auth.getUser(token)
      if (error || !data.user) return null

      return {
        id: data.user.id,
        email: data.user.email || "",
        name: data.user.user_metadata?.name,
        createdAt: data.user.created_at,
      }
    } catch {
      return null
    }
  }

  // 2. Local Fallback Mode
  const payload = verifyLocalToken(token)
  if (!payload) return null

  const stored = localUsersStore.get(payload.email.toLowerCase())
  if (!stored) {
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      createdAt: new Date().toISOString(),
    }
  }

  return {
    id: stored.id,
    email: stored.email,
    name: stored.name,
    createdAt: stored.createdAt,
  }
}
