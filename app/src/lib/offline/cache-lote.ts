// Cache local de "lo último que se pudo traer del server" para un lote —
// distinta de la cola de cambios pendientes (cola.ts, para ESCRIBIR sin
// señal). Esto es para poder VER algo sin señal: un Monitoreador que abre
// la app ya en el campo, sin cobertura desde el arranque, no tenía forma
// de ver la grilla ni abrir un punto — todo el contenido de lectura salía
// siempre en vivo del server, así que la pantalla quedaba en blanco o
// tirando error (ver "No se pudo cargar el punto"). Ahora, cada vez que un
// fetch en vivo sale bien se guarda una "foto" acá; si el próximo fetch
// falla (sin señal), se usa esa foto como respaldo en vez de romper la
// pantalla — puede estar desactualizada, pero ver algo es mejor que nada.

import { getDb } from "./db";
import type { Carga, Lote, Punto } from "@/types/domain";

export interface CacheLote {
  lote: Lote;
  puntos: Punto[];
  cargas: Map<string, Carga>;
}

/** Guarda la versión CRUDA recién traída del server (sin fusionar cambios
 * pendientes locales — esa fusión se vuelve a hacer siempre al leer, ver
 * lib/offline/resumen.ts, así no queda un cambio pendiente duplicado en
 * dos lados). */
export function guardarCacheLote(loteId: string, campana: string, lote: Lote, puntos: Punto[], cargas: Map<string, Carga>): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO cache_lotes (lote_id, campana, lote_json, puntos_json, cargas_json, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?)`,
    loteId,
    campana,
    JSON.stringify(lote),
    JSON.stringify(puntos),
    JSON.stringify(Array.from(cargas.entries())),
    new Date().toISOString()
  );
}

/** Si se pasa `campana`, trae esa foto puntual; si no, trae la más
 * reciente que haya para ese lote (para cuando ni siquiera se sabe cuál es
 * la campaña vigente porque el fetch del lote también falló). */
export function leerCacheLote(loteId: string, campana?: string): CacheLote | null {
  const fila = campana
    ? getDb().getFirstSync<{ lote_json: string; puntos_json: string; cargas_json: string }>(
        `SELECT lote_json, puntos_json, cargas_json FROM cache_lotes WHERE lote_id = ? AND campana = ?`,
        loteId,
        campana
      )
    : getDb().getFirstSync<{ lote_json: string; puntos_json: string; cargas_json: string }>(
        `SELECT lote_json, puntos_json, cargas_json FROM cache_lotes WHERE lote_id = ? ORDER BY actualizado_en DESC LIMIT 1`,
        loteId
      );
  if (!fila) return null;
  return {
    lote: JSON.parse(fila.lote_json),
    puntos: JSON.parse(fila.puntos_json),
    cargas: new Map(JSON.parse(fila.cargas_json)),
  };
}
