// Cache local del árbol clientes → establecimientos → lotes (lo que trae
// `fetchArbol`) — mismo motivo que cache-usuario.ts: sin esto, la
// PRIMERA pantalla que ve cualquiera al entrar a la app ("Mis lotes" para
// Monitoreador, el árbol completo para el resto) quedaba en blanco o
// tirando error si no había señal, sin importar que después de esa lista
// todo lo demás (grilla del lote, cargar puntos) sí funcionara offline.
// Guarda una foto por usuario (la RLS filtra distinto según el rol, así
// que no tiene sentido compartir la cache entre cuentas).

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Arbol } from "@/lib/db/lotes";

function key(usuarioId: string) {
  return `zoom-agricultura:cache-arbol:${usuarioId}`;
}

export async function guardarCacheArbol(usuarioId: string, arbol: Arbol): Promise<void> {
  try {
    await AsyncStorage.setItem(key(usuarioId), JSON.stringify(arbol));
  } catch {
    // No hay mucho que hacer si falla guardar la cache — se reintenta sola
    // la próxima vez que haya señal.
  }
}

export async function leerCacheArbol(usuarioId: string): Promise<Arbol | null> {
  try {
    const raw = await AsyncStorage.getItem(key(usuarioId));
    return raw ? (JSON.parse(raw) as Arbol) : null;
  } catch {
    return null;
  }
}
