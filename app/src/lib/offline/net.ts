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
    // Antes acá también se exigía `estado.isInternetReachable !== false`
    // (además de `isConnected`) — la idea (ver el historial de este
    // archivo) era filtrar el caso de wifi "conectado" pero sin salida
    // real (portal cautivo, router sin internet, señal muy débil en el
    // campo), para no quedarse colgado el timeout completo antes de caer
    // al respaldo local. En la práctica terminó siendo AL REVÉS de
    // problemático: `isInternetReachable` es la propia sonda de NetInfo
    // (no nuestro pedido real) y es conocida por dar `false` de pedo en
    // iOS — sobre todo recién al volver la app de segundo plano, o en
    // wifis hogareños de lo más normales — mientras el resto del
    // teléfono (WhatsApp, el navegador) sigue navegando sin drama. El
    // resultado real, reportado por un usuario: carteles de "sin señal"
    // seguidos con wifi andando perfecto, y pantallas que ni siquiera
    // intentaban el pedido real (se iban directo a la cache) por esta
    // falsa alarma.
    // `isConnected` (el radio de wifi/datos prendido y asociado a una
    // red) es una señal más básica, pero muchísimo más confiable — el
    // costo de quedarse sin este filtro extra es volver al
    // comportamiento de antes de que existiera (un lote/punto sin
    // internet real tarda el timeout completo en caer al respaldo local,
    // en vez de detectarlo al instante) — más lento en ese caso puntual,
    // pero sin falsos positivos en el caso muchísimo más común de wifi
    // que sí funciona.
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
