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

// Antes 4000: con las consultas de Comunidades (chequeos extra de a qué
// comunidad/rol pertenece cada uno) 4s se quedaba corto en conexiones no
// perfectas y tiraba "Tardó demasiado en responder" con señal real — el
// pedido no estaba colgado, solo un poco lento. 10s sigue siendo corto
// comparado con "sin conexión real" (que NetInfo/hayConexion ya filtra
// antes), así que no perdemos la detección rápida de sin-señal.
const TIMEOUT_MS = 10000;

export async function hayConexion(): Promise<boolean> {
  try {
    const estado = await NetInfo.fetch();
    // `isConnected` (el radio de wifi/datos está prendido y asociado a
    // una red) no alcanza para saber si hay INTERNET DE VERDAD — con
    // señal débil (el caso típico en el campo) o un wifi sin salida real
    // (portal cautivo, router sin internet), el teléfono se sigue
    // mostrando "conectado" aunque ningún pedido real vaya a funcionar.
    // Con solo `isConnected`, la app igual intentaba el pedido real y se
    // quedaba colgada hasta que venciera el timeout completo (10s, ver
    // `conTimeout` más abajo) antes de recién ahí caer al respaldo
    // local — un caso real reportado por un usuario: entrar a un lote o
    // abrir un punto se sentía "muy lento" en el campo con señal débil,
    // exactamente este síntoma, multiplicado por cada pantalla que hace
    // su propio chequeo (ver dónde se usa `hayConexion` — el árbol de
    // lotes, la pantalla del lote, la del punto, el login).
    // `isInternetReachable` es la propia verificación de NetInfo, con un
    // pedido liviano de verdad (no el pedido real nuestro, mucho más
    // pesado) — cuando da explícitamente `false` (confirmado sin
    // internet) no tiene sentido ni probar. Si todavía no se determinó
    // (`null`, recién arrancando la app) se deja pasar igual — el
    // timeout de `conTimeout` sigue siendo la red de contención para ese
    // caso.
    return !!estado.isConnected && estado.isInternetReachable !== false;
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
