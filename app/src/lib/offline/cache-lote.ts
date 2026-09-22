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
import { procesarEnTandas } from "./concurrencia";
import { conTimeout } from "./net";
import { fetchCargasDeLote, fetchPuntosDeLote } from "@/lib/db/puntos";
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

/** Precarga la grilla + cargas de TODOS los lotes con grilla que la
 * persona ve en su árbol — pedido explícito del usuario: con solo
 * loguearse y entrar a la app (sin tener que abrir cada lote a mano) ya
 * tiene que quedar todo listo para trabajar cualquiera de ellos sin
 * señal. Se dispara sin bloquear la pantalla — quien llama esto
 * (MisLotes/ArbolLotes) no espera a que termine; si un lote puntual falla
 * no frena a los demás, y si la persona ya entró a algún lote a mano
 * antes, esto simplemente lo vuelve a guardar más fresco. Procesa de a
 * tandas chicas con pausa entre una y otra (ver procesarEnTandas en
 * concurrencia.ts) — lanzar TODOS los lotes de una satura Postgres con
 * timeouts reales (código 57014, confirmado con logs de Supabase), y esa
 * saturación afecta a CUALQUIERA que esté usando la app en ese momento,
 * no solo a esta cuenta.
 *
 * `onDatos`: MisLotes/ArbolLotes necesitan estos mismos puntos+cargas de
 * nuevo para calcular el resumen de avance de cada card ("N completados
 * · M sincronizados") — antes lo pedían POR SEPARADO (ver
 * fetchResumenLote en offline/resumen.ts), duplicando exactamente estos
 * dos mismos pedidos por cada lote. Con comunidades de 50+ lotes eso eran
 * ~200 pedidos en vez de 100 saliendo juntos apenas se entra a la
 * pantalla — la mitad, ya de por sí, del problema de saturación de
 * arriba. Ahora quien llama recibe los datos ya traídos acá y calcula el
 * resumen sin pedir nada de nuevo. */
export function precargarLotes(
  lotes: Lote[],
  onDatos?: (lote: Lote, puntos: Punto[], cargas: Map<string, Carga>) => void
): void {
  const conGrilla = lotes.filter((l) => l.tieneGrilla);
  procesarEnTandas(conGrilla, async (l) => {
    // Puntos primero y cargas después (no en paralelo) — fetchCargasDeLote
    // necesita los IDs de los puntos para no depender de un join más caro
    // para Postgres (ver el comentario en su definición, db/puntos.ts).
    //
    // Con conTimeout (antes sin límite): procesarEnTandas espera a que
    // termine TODA la tanda antes de arrancar la siguiente (Promise.all)
    // — con señal floja de verdad (el caso que esto existe para cubrir,
    // no "sin señal" que ya se filtra con hayConexion en las pantallas
    // que llaman a esto), un solo lote colgado sin límite de tiempo podía
    // trabar la precarga de TODOS los lotes que venían después en la
    // cola, dejando la mayoría sin foto guardada aunque hubiera habido
    // tiempo de sobra para cachear los demás. Reportado en el campo:
    // alguien se quedó parado con señal intermitente esperando que
    // precargue, y varios lotes igual quedaron sin nada guardado.
    const puntos = await conTimeout(fetchPuntosDeLote(l.id), 20000);
    const cargas = await conTimeout(
      fetchCargasDeLote(
        puntos.map((p) => p.id),
        l.campanaActual
      ),
      20000
    );
    // `l.tieneGrilla` en true implica que este lote tiene puntos de
    // verdad (ver el mismo chequeo en usar-datos-campo.ts) — si esta
    // precarga en segundo plano trajo 0 puntos, es un problema pasajero,
    // no el estado real del lote. No lo guardamos: dejar esto en la
    // cache "quemaría" un lote entero en blanco para cuando la persona lo
    // abra sin señal más adelante, aunque tenga toda su grilla real
    // cargada en el servidor.
    if (puntos.length > 0) guardarCacheLote(l.id, l.campanaActual, l, puntos, cargas);
    onDatos?.(l, puntos, cargas);
  });
}
