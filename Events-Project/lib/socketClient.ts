"use client"

import { io } from "socket.io-client"

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL

// The realtime host can sleep when idle; start waking it as soon as the app loads,
// before the session resolves and the socket connects. Fire-and-forget, once per page load.
if (socketUrl && typeof window !== "undefined" && typeof fetch === "function") {
  try {
    void fetch(new URL("/healthz", socketUrl), { mode: "no-cors", cache: "no-store", keepalive: true }).catch(() => undefined)
  } catch {
    // Invalid URL or blocked request: the socket connection still reports its own status.
  }
}

export const socket = socketUrl
  ? io(socketUrl, {
      autoConnect: false,
      timeout: 45_000,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      auth: (callback) => {
        void fetch("/api/socket-ticket", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000) })
          .then(async (response) => {
            if (response.status === 204) return callback({})
            if (!response.ok) return callback({ ticket: "" })
            const { ticket } = await response.json() as { ticket: string }
            callback({ ticket })
          })
          .catch(() => callback({ ticket: "" }))
      },
    })
  : io({ autoConnect: false })
