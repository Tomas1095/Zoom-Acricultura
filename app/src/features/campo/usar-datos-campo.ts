import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { fetchLote } from "@/lib/db/lotes";
import { fetchCargasDeLote, fetchPuntosDeLote } from "@/lib/db/puntos";
import { inferirOrigenDesdePuntos } from "@/lib/geo/geometria";
import { listarCambiosPendientes } from "@/lib/offline/cola";
import { guardarCacheLote, leerCacheLote } from "@/lib/offline/cache-lote";
import { conTimeout, hayConexion } from "@/lib/offline/net";
import { calcularResumenAvance, fusionarPendientesEnCargas, type ResumenAvanceLote } from "@/lib/offline/resumen";
import type { Carga, Lote, Punto } from "@/types/domain";
import { useGps } from "./usar-gps";

// 20m, no 10 — a pedido del usuario, probando en el campo: con el radio
// original quedaba muy justo como "zona segura" para considerar que estás
// parado sobre el punto de muestreo (GPS real, no siempre preciso al metro).
const TOLERANCE_M = 20;

/** Junta todo lo que necesitan tanto la vista general como el modo trabajo:
 * el lote, sus puntos, el estado de carga de cada uno (campaña vigente, o
 * `campana` si se pasa — ver el selector de historial en ResultadosView), y
 * el GPS ya convertido al plano local del lote — portado de las piezas de
 * `App()`/`UbicacionView` del prototipo que calculaban `puntoCercano`.
 *
 * `resumenDeUsuarioId`: si se pasa, el `resumen` devuelto cuenta solo los
 * puntos cargados por esa persona (vista de un Monitoreador — "lo que hice
 * yo"); sin él, cuenta el lote entero (vista de Socio Gerente/Fundador/
 * Encargado — ver lib/offline/resumen.ts).
 *
 * `activo`: para pantallas que quedan montadas de forma persistente aunque
 * no se estén viendo (Resultados/Salidas dentro de LoteTabs, ver
 * lote-tabs.tsx — se dejaron de desmontar en cada cambio de pestaña para
 * que volver a una ya vista sea instantáneo). Sin `activo`, ese ahorro
 * tendría un costo: `useFocusEffect` de más abajo solo refresca cuando
 * TODA la pantalla vuelve a foco (ej. al volver de cargar un punto), no
 * cuando esta pestaña puntual se reactiva por dentro sin que la pantalla
 * haya perdido el foco — así que sin esto, Resultados podía quedarse
 * mostrando datos viejos después de cargar un punto en Grilla y volver.
 * Por default `true` (siempre activo) para no romper ningún llamador que
 * no le importa esta distinción (Grilla/modo trabajo, que si se desmontan
 * de verdad al salir).
 *
 * `loteInicial`: cuando quien llama (VistaGeneral/ResultadosView/
 * SalidasView) ya recibió el lote como prop —lo acaba de traer la pantalla
 * de arriba, ver lote/[id]/index.tsx—, se lo pasa acá para que el primer
 * refresco no vuelva a pedirlo de nuevo al servidor: antes esto agregaba un
 * viaje entero (idéntico al que ya se acababa de hacer un instante antes)
 * antes incluso de arrancar el pedido de puntos+cargas, sumando de más a
 * una demora que con señal débil ya alcanzaba para mostrar el cartel de
 * "sin señal" sin estarlo en verdad. Refrescos posteriores (volver de
 * cargar un punto, reintentar, etc.) sí vuelven a pedir el lote real, para
 * no quedarse con datos viejos si cambió `tieneGrilla`/`campanaActual`. */
export function useDatosCampo(
  loteId: string,
  campana?: string,
  resumenDeUsuarioId?: string,
  activo: boolean = true,
  loteInicial?: Lote
) {
  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(loteInicial ?? null);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [cargas, setCargas] = useState<Map<string, Carga>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const loteInicialSinUsarRef = useRef(!!loteInicial);
  // true cuando lo que se está mostrando es la última foto guardada en el
  // celular (ver lib/offline/cache-lote.ts), no lo que hay de verdad en el
  // server ahora mismo — porque el fetch en vivo falló, típicamente por
  // estar sin señal en el campo.
  const [usandoCache, setUsandoCache] = useState(false);

  const refrescar = useCallback(async () => {
    // Se toma ACÁ, antes de arrancar el fetch remoto (que con señal
    // intermitente puede tardar varios segundos) — evita una carrera con
    // sincronizarPendientes (ver sync-context.tsx): si un punto termina de
    // subirse y se saca de la cola justo mientras este fetch está en
    // vuelo, fusionarPendientesEnCargas ya no lo encontraba ni en la cola
    // (vaciada) ni en el fetch (tomado antes de que existiera en el
    // server) y el punto se veía blanco hasta el próximo refresco. Con
    // esta foto fija, ese punto sigue contando como completado pase lo que
    // pase con la cola durante el fetch.
    const pendientesAlEmpezar = listarCambiosPendientes();
    try {
      // Chequeo rápido antes de intentar nada — si no hay señal, ni tiene
      // sentido esperar a que el fetch se dé por vencido solo (eso puede
      // tardar bastante) para recién ahí caer al respaldo local. Ver
      // lib/offline/net.ts.
      if (!(await hayConexion())) throw new Error("Sin conexión");
      // Ver el comentario de `loteInicial` más arriba: solo la primera vez,
      // y solo si de verdad es este mismo lote (por las dudas, si loteId
      // cambiara sin desmontar el hook).
      const usarLoteInicial = loteInicialSinUsarRef.current && loteInicial?.id === loteId;
      loteInicialSinUsarRef.current = false;
      // 15s, no los 10s por default de conTimeout — confirmado con el
      // usuario que con wifi andando bien igual pasaba de los 10s alguna
      // vez (probado en el campo: 12s), suficiente para caer al respaldo
      // de cache sin estar realmente sin señal.
      const l = usarLoteInicial ? loteInicial! : await conTimeout(fetchLote(loteId), 15000);
      setLote(l);
      if (l) {
        const campanaEfectiva = campana ?? l.campanaActual;
        // 25s acá, no los 10s por default de conTimeout — confirmado con
        // el usuario que esto se veía en el campo con señal débil: el
        // permiso y los datos estaban perfectos (probado a mano en
        // Supabase simulando la sesión real de un Monitoreador afectado,
        // devolvía los puntos bien), lo que fallaba era que el pedido
        // combinado de puntos+cargas no llegaba a tiempo con señal mala
        // antes de que la app se rindiera — y como no había forma de
        // reintentar (ver el aviso en vista-general.tsx), quedaba pegado
        // en blanco para siempre. Es más pedido que traer el lote solo
        // (dos consultas juntas), así que necesita más margen.
        const [ps, cs] = await conTimeout(
          Promise.all([fetchPuntosDeLote(loteId), fetchCargasDeLote(loteId, campanaEfectiva)]),
          25000
        );
        // `l.tieneGrilla` en true implica que este lote SÍ tiene puntos
        // generados (se ponen en true juntos, nunca uno sin el otro — ver
        // el pipeline de KMZ) — si igual `ps` vino vacío, es casi seguro
        // un problema pasajero de conexión al traerlos, no un lote real
        // sin puntos. No lo guardamos en la cache offline para no dejar
        // "quemado" ese estado vacío como respaldo futuro (ver el cartel
        // de "Reintentar" en vista-general.tsx, que usa este mismo
        // chequeo para ofrecer reintentar en vez de quedar pegado).
        if (!l.tieneGrilla || ps.length > 0) {
          guardarCacheLote(loteId, campanaEfectiva, l, ps, cs);
        }
        // Fusiona lo que esta persona ya guardó sin señal (todavía en la
        // cola local) para que se vea completo al toque, sin esperar a que
        // la sincronización real llegue a confirmarlo — ver
        // lib/offline/resumen.ts.
        setPuntos(ps);
        setCargas(fusionarPendientesEnCargas(cs, ps, campanaEfectiva, pendientesAlEmpezar));
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
        setCargas(fusionarPendientesEnCargas(cache.cargas, cache.puntos, campana ?? cache.lote.campanaActual, pendientesAlEmpezar));
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

  // Ver el comentario de `activo` más arriba: refresca también cuando esta
  // pestaña puntual pasa de inactiva a activa, sin esperar a que la
  // pantalla entera pierda y recupere el foco. El ref evita refrescar de
  // más en el montaje inicial (ahí `activo` ya arranca en `true`, y el
  // useFocusEffect de arriba ya se encarga de esa primera carga).
  const activoAntesRef = useRef(activo);
  useEffect(() => {
    if (activo && !activoAntesRef.current) refrescar();
    activoAntesRef.current = activo;
  }, [activo, refrescar]);

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
