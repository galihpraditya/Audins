import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react"

import {
  User,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  SyncStatus,
} from "../types"

import {
  getAuthToken,
  setAuthToken,
  getRefreshToken,
  setRefreshToken,
  refreshTokenApi,
  getStoredUser,
  setStoredUser,
  clearAuth,
  loginApi,
  registerApi,
  fetchCurrentUserApi,
  getSessionId,
  rotateSessionId,
  claimOrphanedDocumentsApi,
} from "../services/api"

interface AuthContextType {
  user: User | null

  token: string | null

  isAuthenticated: boolean

  isGuest: boolean

  syncStatus: SyncStatus

  lastSyncedAt: Date | null

  authModalOpen: boolean

  authModalTab: "login" | "register"

  openAuthModal: (tab?: "login" | "register") => void

  closeAuthModal: () => void

  login: (
    creds: LoginCredentials,
    shouldClaimGuest?: boolean,
    documentIds?: string[],
  ) => Promise<AuthResponse>

  register: (
    creds: RegisterCredentials,
    shouldClaimGuest?: boolean,
    documentIds?: string[],
  ) => Promise<AuthResponse>

  logout: () => void

  triggerSync: () => Promise<void>

  registerSyncListener: (fn: () => Promise<void>) => () => void

  claimOrphanedDocuments: () => Promise<number>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getAuthToken)

  const [user, setUserState] = useState<User | null>(getStoredUser)

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    token ? "synced" : "guest",
  )

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const [authModalOpen, setAuthModalOpen] = useState(false)

  const [authModalTab, setAuthModalTab] = useState<"login" | "register">(
    "login",
  )

  const syncListenersRef = useState<Set<() => Promise<void>>>(
    () => new Set(),
  )[0]

  const registerSyncListener = useCallback(
    (fn: () => Promise<void>) => {
      syncListenersRef.add(fn)

      return () => {
        syncListenersRef.delete(fn)
      }
    },

    [syncListenersRef],
  )

  const triggerSync = useCallback(async () => {
    if (!token) {
      setSyncStatus("guest")

      return
    }

    setSyncStatus("syncing")

    try {
      // Execute all registered sync listeners (e.g. refresh documents and quota)

      const tasks = Array.from(syncListenersRef).map((fn) =>
        fn().catch(() => {}),
      )

      await Promise.all(tasks)

      setSyncStatus("synced")

      setLastSyncedAt(new Date())
    } catch {
      setSyncStatus("offline")
    }
  }, [token, syncListenersRef])

  // Verify stored token on initial mount

  useEffect(() => {
    if (!token) {
      setSyncStatus("guest")

      return
    }

    let active = true

    fetchCurrentUserApi()

      .then((verifiedUser) => {
        if (!active) return

        if (verifiedUser) {
          setUserState(verifiedUser)

          setStoredUser(verifiedUser)

          setSyncStatus("synced")

          setLastSyncedAt(new Date())
        } else {
          // Token expired or invalid

          clearAuth()

          setTokenState(null)

          setUserState(null)

          setSyncStatus("guest")
        }
      })

      .catch(() => {
        if (!active) return

        setSyncStatus("offline")
      })

    return () => {
      active = false
    }
  }, [token])

  // Periodic token refresh to keep session alive
  useEffect(() => {
    if (!token) return

    const interval = setInterval(() => {
      const rt = getRefreshToken()
      if (rt) {
        refreshTokenApi(rt)
          .then((refreshed) => {
            setTokenState(refreshed.token)
            setUserState(refreshed.user)
          })
          .catch((err) => {
            console.warn("Auto-refresh failed:", err)
          })
      }
    }, 30 * 60 * 1000) // 30 minutes

    return () => clearInterval(interval)
  }, [token])

  // Cross-device sync triggers: window focus & visibility change

  useEffect(() => {
    if (!token) return

    const handleFocus = () => {
      void triggerSync()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void triggerSync()
      }
    }

    window.addEventListener("focus", handleFocus)

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", handleFocus)

      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [token, triggerSync])

  const openAuthModal = useCallback((tab: "login" | "register" = "login") => {
    setAuthModalTab(tab)

    setAuthModalOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false)
  }, [])

  const login = useCallback(
    async (
      creds: LoginCredentials,
      shouldClaimGuest = true,
      documentIds?: string[],
    ): Promise<AuthResponse> => {
      const guestSessionId = shouldClaimGuest ? getSessionId() : undefined

      const res = await loginApi(
        creds,
        guestSessionId,
        shouldClaimGuest ? documentIds : undefined,
      )

      const remember = creds.rememberMe !== false

      setAuthToken(res.token, remember)

      if (res.refreshToken) {
        setRefreshToken(res.refreshToken, remember)
      }

      setStoredUser(res.user, remember)

      setTokenState(res.token)

      setUserState(res.user)

      setSyncStatus("synced")

      setLastSyncedAt(new Date())

      setAuthModalOpen(false)

      // Notify sync listeners to pull updated account documents

      const tasks = Array.from(syncListenersRef).map((fn) =>
        fn().catch(() => {}),
      )

      await Promise.all(tasks)

      return res
    },

    [syncListenersRef],
  )

  const register = useCallback(
    async (
      creds: RegisterCredentials,

      shouldClaimGuest = true,
      documentIds?: string[],
    ): Promise<AuthResponse> => {
      const guestSessionId = shouldClaimGuest ? getSessionId() : undefined

      const res = await registerApi(
        creds,
        guestSessionId,
        shouldClaimGuest ? documentIds : undefined,
      )

      const remember = creds.rememberMe !== false

      setAuthToken(res.token, remember)

      if (res.refreshToken) {
        setRefreshToken(res.refreshToken, remember)
      }

      setStoredUser(res.user, remember)

      setTokenState(res.token)

      setUserState(res.user)

      setSyncStatus("synced")

      setLastSyncedAt(new Date())

      setAuthModalOpen(false)

      // Notify sync listeners to pull updated account documents

      const tasks = Array.from(syncListenersRef).map((fn) =>
        fn().catch(() => {}),
      )

      await Promise.all(tasks)

      return res
    },

    [syncListenersRef],
  )

  const logout = useCallback(async () => {
    clearAuth()
    rotateSessionId()

    setTokenState(null)

    setUserState(null)

    setSyncStatus("guest")

    setLastSyncedAt(null)

    // Notify listeners so documents reload for clean guest state
    const tasks = Array.from(syncListenersRef).map((fn) => fn().catch(() => {}))
    await Promise.all(tasks)
  }, [syncListenersRef])

  const claimOrphanedDocuments = useCallback(async (): Promise<number> => {
    if (!token) return 0
    try {
      const res = await claimOrphanedDocumentsApi()
      if (res.claimedCount > 0) {
        await triggerSync()
      }
      return res.claimedCount
    } catch (err) {
      console.error("Failed to claim orphaned documents:", err)
      return 0
    }
  }, [token, triggerSync])

  const isAuthenticated = Boolean(token && user)
  const isGuest = !isAuthenticated

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      isGuest,
      syncStatus,
      lastSyncedAt,
      authModalOpen,
      authModalTab,
      openAuthModal,
      closeAuthModal,
      login,
      register,
      logout,
      triggerSync,
      registerSyncListener,
      claimOrphanedDocuments,
    }),
    [
      user,
      token,
      isAuthenticated,
      isGuest,
      syncStatus,
      lastSyncedAt,
      authModalOpen,
      authModalTab,
      openAuthModal,
      closeAuthModal,
      login,
      register,
      logout,
      triggerSync,
      registerSyncListener,
      claimOrphanedDocuments,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
