import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchLote } from "@/lib/db/lotes";
import { fetchCargasDeLote, fetchPuntosDeLote } from "@/lib/db/puntos";
import { inferirOrigenDesdePuntos } from "@/lib/geo/geometria";
import type { Carga, Lote, Punto } from "@/types/domain";
import { useGps } from "./usar-gps";

const TOLERANCE_M = 10; // mismo radio que el prototipo — ver PointSheet/enRango

/** Junta todo lo que necesitan tanto la vista general como el modo trabajo:
 * el lote, sus puntos, el estado de carga de cada uno (campaña vigente), y
 * el GPS ya convertido al plano local del lote — portado de las piezas de
 * `App()`/`UbicacionView` del prototipo que calculaban `puntoCercano`. */
export function useDatosCampo(loteId: string) {
  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [cargas, setCargas] = useState<Map<string, Carga>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const l = await fetchLote(loteId);
      setLote(l);
      if (l) {
        const [ps, cs] = await Promise.all([fetchPuntosDeLote(loteId), fetchCargasDeLote(loteId, l.campanaActual)]);
        setPuntos(ps);
        setCargas(cs);
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }, [loteId]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const origen = useMemo(() => (puntos.length > 0 ? inferirOrigenDesdePuntos(puntos) : null), [puntos]);
  const gps = useGps(origen);

  const puntoCercano = useMemo(() => {
    if (!gps.posicion || puntos.length === 0) return null;
    let mejor = puntos[0];
    let mejorDist = Infinity;
    for (const p of puntos) {
      const d = Math.hypot(gps.posicion.x - p.x, gps.posicion.y - p.y);
      if (d < mejorDist) {
        mejorDist = d;
        mejor = p;
      }
    }
    return { punto: mejor, distancia: mejorDist };
  }, [gps.posicion, puntos]);

  const enRango = !!puntoCercano && puntoCercano.distancia <= TOLERANCE_M;

  return { cargando, error, lote, puntos, cargas, refrescar, gps, puntoCercano, enRango, origen };
}
