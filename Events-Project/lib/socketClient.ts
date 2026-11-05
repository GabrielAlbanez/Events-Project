"use client"

import { io } from "socket.io-client"

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL

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
