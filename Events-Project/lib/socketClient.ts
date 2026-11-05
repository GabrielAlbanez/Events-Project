"use client"

import { io } from "socket.io-client"

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL

export const socket = socketUrl
  ? io(socketUrl, {
      autoConnect: false,
      auth: (callback) => {
        void fetch("/api/socket-ticket", { method: "POST", cache: "no-store" })
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
