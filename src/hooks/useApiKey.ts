import { useCallback, useEffect, useState } from "react"
import { ApiKeyStatus } from "../types"

const API_KEY_STORAGE = "audin_api_key"

function readStoredKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || ""
  } catch {
    return ""
  }
}

/**
 * Custom Groq API key with localStorage persistence and debounced validation
 * against the Groq models endpoint.
 */
export function useApiKey() {
  const [userApiKey, setUserApiKey] = useState<string>(readStoredKey)
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>("idle")

  // Validate the key whenever it changes.
  useEffect(() => {
    const key = userApiKey?.trim()
    if (!key) {
      setApiKeyStatus("idle")
      return
    }

    setApiKeyStatus("validating")
    const controller = new AbortController()

    fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })
      .then((res) => {
        setApiKeyStatus(res.ok ? "valid" : "invalid")
      })
      .catch((err) => {
        if (err.name !== "AbortError") setApiKeyStatus("invalid")
      })

    return () => controller.abort()
  }, [userApiKey])

  // Persist (guarded — some privacy modes throw on writes).
  useEffect(() => {
    try {
      localStorage.setItem(API_KEY_STORAGE, userApiKey)
    } catch {
      /* non-fatal */
    }
  }, [userApiKey])

  const saveApiKey = useCallback((key: string) => {
    setUserApiKey(key)
  }, [])

  return {
    userApiKey,
    saveApiKey,
    apiKeyStatus,
    hasCustomKey: !!userApiKey.trim(),
  }
}
