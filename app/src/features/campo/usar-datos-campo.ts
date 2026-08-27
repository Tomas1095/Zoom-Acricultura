import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";

import { fetchLote } from "@/lib/db/lotes";
import { fetchCargasDeLote, fetchPuntosDeLote } from "@/lib/db/puntos";
import { inferirOrigenDesdePuntos } from "@/lib/geo/geometria";
import { guardarCacheLote, leerCacheLote } from "@/lib/offline/cache-lote";
import { conTimeout, hayConexion } from "@/lib/offline/net";
import { calcularResumenAvance, fusionarPendientesEnCargas, type ResumenAvanceLote } from "@/lib/offline/resumen";
import type { Carga, Lote, Punto } from "@/types/domain";
import { useGps } from "./usar-gps";

const TOLERANCE_M = 10; // mismo radio que el prototipo — ver PointSheet/enRango

/** Junta todo lo que necesitan tanto la vista general como el modo trabajo:
 * el lote, sus puntos, el estado de carga de cada uno (campaña vigente, o
 * `campana` si se pasa — ver el selector de historial en ResultadosView), y
 * el GPS ya convertido al plano local del lote — portado de las piezas de
 * `App()`/`UbicacionView` del prototipo que calculaban `puntoCercano`.
 *
 * `resumenDeUsuarioId`: si se pasa, el `resumen` devuelto cuenta solo los
 * puntos cargados por esa persona (vista de un Monitoreador — "lo que hice
 * yo"); sin él, cuenta el lote entero (vista de Socio Gerente/Fundador/
 * Encargado — ver lib/offline/resumen.ts). */
export function useDatosCampo(loteId: string, campana?: string, resumenDeUsuarioId?: string) {
  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [cargas, setCargas] = useState<Map<string, Carga>>(new Map());
  const [error, setError] = useState<string | null>(null);
  // true cuando lo que se está mostrando es la última foto guardada en el
  // celular (ver lib/offline/cache-lote.ts), no lo que hay de verdad en el
  // server ahora mismo — porque el fetch en vivo falló, típicamente por
  // estar sin señal en el campo.
  const [usandoCache, setUsandoCache] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      // Chequeo rápido antes de intentar nada — si no hay señal, ni tiene
      // sentido esperar a que el fetch se dé por vencido solo (eso puede
      // tardar bastante) para recién ahí caer al respaldo local. Ver
      // lib/offline/net.ts.
      if (!(await hayConexion())) throw new Error("Sin conexión");
      const l = await conTimeout(fetchLote(loteId));
      setLote(l);
      if (l) {
        const campanaEfectiva = campana ?? l.campanaActual;
        const [ps, cs] = await conTimeout(
          Promise.all([fetchPuntosDeLote(loteId), fetchCargasDeLote(loteId, campanaEfectiva)])
        );
        guardarCacheLote(loteId, campanaEfectiva, l, ps, cs);
        // Fusiona lo que esta persona ya guardó sin señal (todavía en la
        // cola local) para que se vea completo al toque, sin esperar a que
        // la sincronización real llegue a confirmarlo — ver
        // lib/offline/resumen.ts.
        setPuntos(ps);
        setCargas(fusionarPendientesEnCargas(cs, ps, campanaEfectiva));
        setUsandoCache(false);
        setError(null);
      }
    } catch (e: any) {
      // Sin señal (o el server no respondió): en vez de dejar la pantalla
      // en blanco o con un error, mostramos la última foto que se guardó
      // de este lote — puede estar desactualizada, pero alguien que llega
      // al campo sin cobertura necesita poder ver la grilla igual para
      // poder trabajar (lo que cargue queda en la cola local, ver
      // lib/offline/cola.ts, y se sube solo cuando vuelva la señal).
      const cache = leerCacheLote(loteId, campana);
      if (cache) {
        setLote(cache.lote);
        setPuntos(cache.puntos);
        setCargas(fusionarPendientesEnCargas(cache.cargas, cache.puntos, campana ?? cache.lote.campanaActual));
        setUsandoCache(true);
        setError(null);
      } else {
        setError(e.message ?? String(e));
      }
    } finally {
      setCargando(false);
    }
  }, [loteId, campana]);

  // useFocusEffect (no useEffect a secas) para que, al volver de cargar un
  // punto, el mapa se refresque solo con el color nuevo — sin esto quedaba
  // con el estado viejo hasta salir del lote y volver a entrar.
  useFocusEffect(
    useCallback(() => {
      refrescar();
    }, [refrescar])
  );

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

  const resumen = useMemo<ResumenAvanceLote>(
    () => calcularResumenAvance(puntos.length, cargas, resumenDeUsuarioId),
    [puntos, cargas, resumenDeUsuarioId]
  );

  return { cargando, error, usandoCache, lote, puntos, cargas, resumen, refrescar, gps, puntoCercano, enRango, origen };
}
