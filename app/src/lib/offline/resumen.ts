// Progreso de un lote: cuántos puntos están completados (cargados y
// confirmados, sea que ya llegaron al server o todavía están esperando en
// la cola local) vs. cuántos ya SINCRONIZADOS de verdad.
//
// El alcance depende de quién mira — aclarado por el usuario después de la
// primera versión: un Monitoreador quiere ver SUS puntos (para saber si lo
// que hizo de verdad se sincronizó), mientras que Socio Gerente/Fundador
// (y Encargado) quieren el total del lote entero, sin importar quién cargó
// cada punto — así, si al lote le faltan sincronizar puntos al final del
// día, saben que hay que hablar con el equipo. Por eso `usuarioId` es
// opcional: sin él, cuenta todo el lote; con él, solo lo cargado por esa
// persona (`cargadoPorId`).

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
  /** Total de puntos de la grilla del lote — SIEMPRE del lote entero, sea
   * cual sea `usuarioId`: un Monitoreador no tiene "su propio total", el
   * total es el de la grilla. Quien muestre el resumen filtrado por
   * usuario no debería usar esto como denominador (ver ConflictosBanner o
   * el propio `completados` a secas). */
  totalPuntos: number;
  completados: number;
  sincronizados: number;
}

/** Cuenta sobre el mapa YA fusionado (ver `fusionarPendientesEnCargas`
 * arriba) — `completados`: cualquier punto confirmado, esté ya en el
 * server o todavía esperando en la cola local. `sincronizados`: solo los
 * que de verdad llegaron al server. Si se pasa `usuarioId`, solo cuenta
 * los puntos que cargó ESA persona (`cargadoPorId`); sin él, cuenta todo
 * el lote sin importar quién cargó cada punto. */
export function calcularResumenAvance(totalPuntos: number, cargas: Map<string, Carga>, usuarioId?: string): ResumenAvanceLote {
  let completados = 0;
  let sincronizados = 0;
  cargas.forEach((c) => {
    if (!c.confirmado) return;
    if (usuarioId && c.cargadoPorId !== usuarioId) return;
    completados++;
    if (c.sincronizado) sincronizados++;
  });
  return { totalPuntos, completados, sincronizados };
}

/** Trae y calcula el resumen de un lote de una sola vez — para listas que
 * muestran varios lotes juntos (ver MisLotes) y no pueden reusar
 * `useDatosCampo`, que solo maneja un lote abierto a la vez. */
export async function fetchResumenLote(loteId: string, campana: string, usuarioId?: string): Promise<ResumenAvanceLote> {
  const [puntos, cargas] = await Promise.all([fetchPuntosDeLote(loteId), fetchCargasDeLote(loteId, campana)]);
  const fusionadas = fusionarPendientesEnCargas(cargas, puntos, campana);
  return calcularResumenAvance(puntos.length, fusionadas, usuarioId);
}
