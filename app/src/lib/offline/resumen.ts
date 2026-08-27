// Progreso de un lote: cuántos puntos están completados (cargados y
// confirmados, sea que ya llegaron al server o todavía están esperando en
// la cola local) vs. cuántos ya SINCRONIZADOS de verdad — pedido explícito
// del usuario: "cada persona está segura de que para cada lote figuran los
// puntos que hizo y a la vez cuantos de esos puntos se sincronizaron con
// éxito". El resumen es del lote entero (todo lo que cargó cualquiera con
// acceso, no filtrado por quién lo cargó) — mismo criterio que ya usa el
// resto de la app (Resultados, ObservacionesPanel) para agregar a nivel
// de lote.

import { fetchCargasDeLote, fetchPuntosDeLote } from "@/lib/db/puntos";
import { listarCambiosPendientes } from "./cola";
import type { Carga, Punto } from "@/types/domain";

/** Superpone los cambios pendientes de tipo "carga" de este lote/campaña
 * sobre el mapa de cargas ya traído del server, como `Carga` sintética
 * con `sincronizado: false` — así un punto guardado sin señal se ve
 * completo (verde, contado) al toque, sin esperar a que la sincronización
 * real llegue a confirmarlo. Las fotos pendientes no hace falta
 * fusionarlas acá: no cambian si un punto cuenta como completado. */
export function fusionarPendientesEnCargas(
  cargas: Map<string, Carga>,
  puntos: Punto[],
  campana: string
): Map<string, Carga> {
  const idsDelLote = new Set(puntos.map((p) => p.id));
  const pendientes = listarCambiosPendientes();
  const resultado = new Map(cargas);
  for (const item of pendientes) {
    const p = item.payload;
    if (p.tipo !== "carga" || p.campana !== campana || !idsDelLote.has(p.puntoId)) continue;
    const previa = resultado.get(p.puntoId);
    resultado.set(p.puntoId, {
      id: previa?.id ?? "",
      puntoId: p.puntoId,
      campana,
      bicho: p.campos.bicho,
      babosa: p.campos.babosa,
      huevoBabosas: p.campos.huevoBabosas,
      gusanoArroz: p.campos.gusanoArroz,
      isocaCortadora: p.campos.isocaCortadora,
      gusanoBlanco: p.campos.gusanoBlanco,
      humedad: previa?.humedad ?? null,
      observaciones: p.campos.observaciones,
      fotos: previa?.fotos ?? [],
      cargado: true,
      confirmado: true,
      cargadoPorId: p.cargadoPorId,
      conflictoConId: null,
      sincronizado: false,
      updatedAt: item.creadoEn,
    });
  }
  return resultado;
}

export interface ResumenAvanceLote {
  totalPuntos: number;
  completados: number;
  sincronizados: number;
}

/** Cuenta sobre el mapa YA fusionado (ver `fusionarPendientesEnCargas`
 * arriba) — `completados`: cualquier punto confirmado, esté ya en el
 * server o todavía esperando en la cola local. `sincronizados`: solo los
 * que de verdad llegaron al server. */
export function calcularResumenAvance(totalPuntos: number, cargas: Map<string, Carga>): ResumenAvanceLote {
  let completados = 0;
  let sincronizados = 0;
  cargas.forEach((c) => {
    if (c.confirmado) {
      completados++;
      if (c.sincronizado) sincronizados++;
    }
  });
  return { totalPuntos, completados, sincronizados };
}

/** Trae y calcula el resumen de un lote de una sola vez — para listas que
 * muestran varios lotes juntos (ver MisLotes) y no pueden reusar
 * `useDatosCampo`, que solo maneja un lote abierto a la vez. */
export async function fetchResumenLote(loteId: string, campana: string): Promise<ResumenAvanceLote> {
  const [puntos, cargas] = await Promise.all([fetchPuntosDeLote(loteId), fetchCargasDeLote(loteId, campana)]);
  const fusionadas = fusionarPendientesEnCargas(cargas, puntos, campana);
  return calcularResumenAvance(puntos.length, fusionadas);
}
