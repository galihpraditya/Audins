import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { RateLimitRecord } from "../types/index.js"

/**
 * Rate limit record store.
 *
 * Preferred mode: a dedicated `rate_limits` table + `increment_rate_limit`
 * SQL function (see server/migrations/001_rate_limits.sql) which performs an
 * ATOMIC check-and-increment, immune to concurrent-request races.
 *
 * Legacy mode: rows inside the existing `documents` table with ids prefixed
 * `rate_limit_` (non-atomic read-modify-write). Kept so deployments without
 * the migration keep working; the middleware treats failures as fail-closed.
 */

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

let supabase: SupabaseClient | null = null

if (process.env.SUPABASE_URL && supabaseKey) {
  try {
    supabase = createClient(process.env.SUPABASE_URL!, supabaseKey!)
  } catch {
    supabase = null
  }
}

export function isSupabaseRateLimitEnabled(): boolean {
  return !!supabase
}

let mode: "rpc" | "legacy" | "unknown" = "unknown"
let lastLegacyProbeAt = 0
// A single transient failure (network blip at boot) must not lock the server
// out of the atomic path forever — re-probe periodically while in legacy mode.
const LEGACY_REPROBE_INTERVAL_MS = 60_000

async function detectMode(): Promise<"rpc" | "legacy"> {
  const now = Date.now()
  const shouldReprobe =
    mode === "legacy" && now - lastLegacyProbeAt > LEGACY_REPROBE_INTERVAL_MS

  if (mode === "rpc") return mode
  if (mode !== "unknown" && !shouldReprobe) return mode

  if (!supabase) return "legacy"
  try {
    // Probe: if the rpc/table is missing this errors and we fall back.
    const { error } = await supabase.rpc("increment_rate_limit", {
      p_key: "__probe__",
      p_max_limit: 1,
    })
    if (error) {
      if (mode !== "legacy") {
        console.log(
          "Supabase rate_limits rpc unavailable — using legacy documents-table rate limiting (will re-probe periodically).",
        )
      }
      mode = "legacy"
      lastLegacyProbeAt = now
    } else {
      mode = "rpc"
    }
  } catch {
    mode = "legacy"
    lastLegacyProbeAt = now
  }
  return mode
}

const legacyId = (key: string) => `rate_limit_${key}`

/**
 * Atomic check-and-increment. Returns the record AFTER increment, or null on
 * failure/absence of the rpc (caller should fall back or fail closed).
 */
export async function incrementSupabaseRateLimit(
  key: string,
  maxLimit: number,
): Promise<RateLimitRecord | null> {
  if (!supabase) return null
  if ((await detectMode()) !== "rpc") return null
  try {
    const { data, error } = await supabase.rpc("increment_rate_limit", {
      p_key: legacyId(key),
      p_max_limit: maxLimit,
    })
    if (error) throw error
    const payload = data as { count?: number; resetTime?: string }
    return {
      count: Number(payload?.count ?? 0),
      resetTime: new Date(payload?.resetTime ?? Date.now() + 24 * 3600 * 1000),
    }
  } catch (error) {
    console.error(`Atomic rate-limit increment failed for ${key}:`, error)
    return null
  }
}

/** Reads the current record from whichever store is active. */
export async function getSupabaseRateLimit(
  key: string,
): Promise<RateLimitRecord | null> {
  if (!supabase) return null
  const id = legacyId(key)
  try {
    if ((await detectMode()) === "rpc") {
      const { data, error } = await supabase
        .from("rate_limits")
        .select("count, reset_time")
        .eq("id", id)
        .maybeSingle()
      if (error) throw error
      return data ? { count: data.count, resetTime: new Date(data.reset_time) } : null
    }

    const { data, error } = await supabase
      .from("documents")
      .select("content")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    if (data && data.content) {
      return {
        count: Number(data.content.count ?? 0),
        resetTime: new Date(data.content.resetTime),
      }
    }
    return null
  } catch (error) {
    console.error(`Failed to read rate limit for ${key}:`, error)
    return null
  }
}

/** Writes an explicit count/reset (used for refunds and legacy increments). */
export async function saveSupabaseRateLimit(
  key: string,
  record: RateLimitRecord,
): Promise<boolean> {
  if (!supabase) return false
  const id = legacyId(key)
  try {
    if ((await detectMode()) === "rpc") {
      const { error } = await supabase.from("rate_limits").upsert({
        id,
        count: record.count,
        reset_time: record.resetTime.toISOString(),
      })
      if (error) throw error
      return true
    }

    const { error } = await supabase.from("documents").upsert({
      id,
      content: { count: record.count, resetTime: record.resetTime.toISOString() },
    })
    if (error) throw error
    return true
  } catch (error) {
    console.error(`Failed to save rate limit for ${key}:`, error)
    return false
  }
}
