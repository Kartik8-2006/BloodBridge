import type { Env } from './config/env.js';
import type { Db } from './lib/prisma.js';
import type { AuthProvider } from './middleware/auth.js';
import type { AiClient } from './services/ai.js';
import type { PaymentGateway } from './services/payments.js';
import type { Geocoder } from './services/nominatim.js';
import type { OverpassClient } from './services/overpass.js';
import type { DocumentStorage } from './services/storage.js';

/** Everything the API needs from the outside world. Swapped for fakes in tests. */
export interface Deps {
  db: Db;
  env: Env;
  auth: AuthProvider;
  storage: DocumentStorage;
  overpass: OverpassClient;
  geocoder: Geocoder;
  ai: AiClient;
  payments: PaymentGateway;
}
