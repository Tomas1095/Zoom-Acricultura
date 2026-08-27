// Sin esto, entrar a una pantalla sin señal se sentía "colgada" varios
// segundos: un fetch() en un teléfono sin señal no falla al toque, el
// sistema operativo tarda un rato largo en darse por vencido antes de
// devolver el error — recién ahí se caía al respaldo local (ver
// cache-lote.ts/cache-arbol.ts/cache-usuario.ts). Con NetInfo.fetch()
// sabemos casi al instante si conviene ni intentar, y por las dudas (wifi
// conectado pero sin internet real, portales cautivos, etc.) esto además
// le pone un límite corto a cualquier intento real, así nunca se cuelga
// más que eso.

import NetInfo from "@react-native-community/netinfo";

const TIMEOUT_MS = 4000;

export async function hayConexion(): Promise<boolean> {
  try {
    const estado = await NetInfo.fetch();
    return !!estado.isConnected;
  } catch {
    // Si falla el chequeo en sí (raro), que decida el fetch real en vez
    // de asumir que no hay señal.
    return true;
  }
}

// PromiseLike (no Promise a secas) porque los builders de supabase-js
// (ej. `supabase.from(...).select(...)`) son "thenables" pero no Promise
// de verdad — con Promise<T> acá, TS no podía inferir el tipo y tiraba
// error en cada call site que le pasaba uno directo.
export function conTimeout<T>(promesa: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promesa),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Tardó demasiado en responder")), ms)),
  ]);
}
