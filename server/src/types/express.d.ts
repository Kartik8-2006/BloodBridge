import type { User } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      /** The signed-in, database-backed user. Set by `loadUser`. */
      user?: User;
    }
  }
}

export {};
