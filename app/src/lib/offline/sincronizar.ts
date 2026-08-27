// Motor de sincronización — recorre la cola de cambios pendientes (ver
// cola.ts) e intenta subir cada uno de verdad, usando las MISMAS funciones
// que ya usa el guardado en vivo (guardarYConfirmarCarga, subirFoto +
// agregarFotoACarga) — así el resultado en el server es idéntico a si la
// red nunca se hubiese cortado, y no hay dos caminos de código distintos
// que puedan divergir.

import { guardarYConfirmarCarga, agregarFotoACarga } from "@/lib/db/cargas";
import { subirFoto } from "@/lib/storage/fotos";
import { listarCambiosPendientes, eliminarCambioPendiente, marcarIntentoFallido } from "./cola";

export interface ResultadoSincronizacion {
  sincronizados: number;
  fallidos: number;
}

/** Recorre la cola una vez y prueba subir cada cambio pendiente. Se borra
 * de la cola apenas se confirma en el server; si vuelve a fallar (sigue
 * sin señal, o el server rechaza algo puntual) queda en la cola con el
 * intento sumado para el próximo llamado — no se descarta solo, la
 * persona no puede perder una carga por reintentos agotados. */
export async function sincronizarPendientes(): Promise<ResultadoSincronizacion> {
  const pendientes = listarCambiosPendientes();
  let sincronizados = 0;
  let fallidos = 0;

  for (const item of pendientes) {
    try {
      const p = item.payload;
      if (p.tipo === "carga") {
        await guardarYConfirmarCarga(p.puntoId, p.campana, p.campos, p.cargadoPorId);
      } else {
        const path = await subirFoto(p.loteId, p.puntoId, p.uriLocal);
        await agregarFotoACarga(p.puntoId, p.campana, path, p.cargadoPorId);
      }
      eliminarCambioPendiente(item.id);
      sincronizados++;
    } catch (e: any) {
      marcarIntentoFallido(item.id, e.message ?? String(e));
      fallidos++;
    }
  }

  return { sincronizados, fallidos };
}
