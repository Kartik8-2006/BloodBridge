import { io, type Socket } from 'socket.io-client';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? undefined;

/** One live connection per signed-in session. The server only says "something changed"; data is re-fetched over the API. */
export function connectSocket(getToken: () => Promise<string | null>): Socket {
  return io(BASE, {
    path: '/socket.io',
    auth: (cb) => {
      getToken().then((token) => cb({ token })).catch(() => cb({ token: null }));
    },
    reconnectionDelayMax: 15_000,
  });
}
