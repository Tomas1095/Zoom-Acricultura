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

// Foto reciente en memoria (se pierde al cerrar la app — no es la cache
// persistente en SQLite de cache-lote.ts, que es para SIN señal) de
// lote+puntos+cargas ya traídos. Reportado por el usuario: Monitoreadores
// notaban lento entrar a "Modo trabajo" en Android — la causa real es que
// esa pantalla es una navegación NUEVA (no una pestaña que ya estaba
// montada) y volvía a pedir TODO desde cero, aunque Vista General (la
// pantalla de la que se viene, un toque antes) acaba de traer exactamente
// lo mismo — React Navigation no desmonta esa pantalla de atrás, los datos
// siguen en memoria, solo que nada los reusaba. Con esto, cualquier
// pantalla que llame a este hook para el mismo lote+campaña dentro de la
// ventana de vigencia se ahorra los tres pedidos enteros.
//
// Clave aparte "vigente" (sin campaña en la clave) porque Modo trabajo no
// sabe de antemano cuál es `campanaActual` del lote sin pedirlo — así
// busca directo por lote sin necesitar ese dato primero. Vista
// General/Resultados/Salidas, que sí conocen la campaña que están
// mirando, usan la clave con campaña incluida (más precisa, evita mezclar
// una foto de la campaña vigente con una consulta de historial).
interface FotoRecienteLote {
  lote: Lote;
  puntos: Punto[];
  cargas: Map<string, Carga>;
  ts: number;
}
const VIGENCIA_FOTO_RECIENTE_MS = 15000;
const fotosRecientes = new Map<string, FotoRecienteLote>();

function guardarFotoReciente(loteId: string, campanaEfectiva: string, esVigente: boolean, foto: FotoRecienteLote) {
  fotosRecientes.set(`${loteId}:${campanaEfectiva}`, foto);
  if (esVigente) fotosRecientes.set(`vigente:${loteId}`, foto);
}

function leerFotoReciente(clave: string): FotoRecienteLote | null {
  const foto = fotosRecientes.get(clave);
  if (!foto || Date.now() - foto.ts > VIGENCIA_FOTO_RECIENTE_MS) return null;
  return foto;
}

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
  // El motivo real de por qué se cayó al cache (antes se descartaba con
  // `setError(null)` en ese caso, mostrando siempre el mismo cartel
  // genérico de "sin señal" sin importar la causa real — así no había
  // forma de distinguir, por ejemplo, sin señal de verdad de un error de
  // permisos o del servidor). Se guarda aparte de `error` (que sigue
  // siendo "no hay NADA para mostrar, ni cache") para no romper a quien ya
  // lo usa con ese sentido.
  const [errorCache, setErrorCache] = useState<string | null>(null);
  // Gatea TANTO reusar `loteInicial` como buscar una foto reciente en
  // memoria (ver más arriba) — las dos cosas solo tienen sentido en el
  // primerísimo refresco de ESTA pantalla, nunca en refrescos posteriores
  // (volver de cargar un punto, reintentar, etc.), que sí tienen que traer
  // el dato real para no quedarse con algo viejo.
  const primerRefrescoRef = useRef(true);
  // true cuando lo que se está mostrando es la última foto guardada en el
  // celular (ver lib/offline/cache-lote.ts), no lo que hay de verdad en el
  // server ahora mismo — porque el fetch en vivo falló, típicamente por
  // estar sin señal en el campo.
  const [usandoCache, setUsandoCacheInterno] = useState(false);
  const avisoCacheTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Encender el cartel de "sin señal, mostrando lo guardado" con un
  // pequeño retraso (no al toque) — a pedido del usuario, que con señal
  // buena notaba el cartel prender "por una milésima de segundo" cada vez
  // que entraba a un lote. La causa: con caché primero (ver más abajo,
  // "CACHÉ PRIMERO"), el cartel se prende apenas se muestra la foto
  // guardada, y con señal buena el pedido en vivo llega tan rápido después
  // que apaga el cartel casi al instante — se ve como un parpadeo, no como
  // información útil. Con este retraso, si el pedido en vivo llega antes
  // de que se cumpla (el caso normal con señal buena), el cartel ni
  // llega a mostrarse. Apagarlo, en cambio, sigue siendo instantáneo —
  // ahí sí importa que desaparezca apenas hay datos frescos.
  function setUsandoCache(valor: boolean) {
    if (avisoCacheTimeoutRef.current) {
      clearTimeout(avisoCacheTimeoutRef.current);
      avisoCacheTimeoutRef.current = null;
    }
    if (valor) {
      avisoCacheTimeoutRef.current = setTimeout(() => {
        avisoCacheTimeoutRef.current = null;
        setUsandoCacheInterno(true);
      }, 400);
    } else {
      setUsandoCacheInterno(false);
    }
  }

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
    const esPrimerRefresco = primerRefrescoRef.current;
    primerRefrescoRef.current = false;

    // CACHÉ PRIMERO, sin esperar nada de red — antes esta pantalla siempre
    // intentaba el pedido en vivo primero y recién mostraba lo guardado
    // localmente si eso FALLABA (esperando el timeout entero para
    // enterarse). Con señal floja de verdad (no sin señal, floja: el
    // pedido a veces sale y a veces no), eso significaba pagar el costo de
    // esperar-y-fallar en CADA pantalla que se abría, aunque la app ya
    // tuviera exactamente lo mismo guardado hace rato. Reportado en el
    // campo: "andaba bien, de golpe se traba" — coincidía siempre con
    // señal débil, nunca con estar realmente sin señal (ahí al menos
    // fallaba rápido). Ahora se muestra lo que ya hay guardado al toque
    // (si hay algo) y el pedido en vivo sigue de fondo para actualizar
    // solo si trae algo más nuevo — nadie espera nunca a que ese pedido
    // termine (bien o mal) para ver el lote.
    let teniaAlgoLocal = false;
    if (esPrimerRefresco) {
      // Foto reciente en MEMORIA primero (más fresca, sin tocar SQLite):
      // cubre pasar de Vista General a Modo trabajo (o entre pestañas) sin
      // ni siquiera un parpadeo, ya que es literalmente lo mismo que se
      // acaba de traer un instante antes.
      const foto = leerFotoReciente(campana ? `${loteId}:${campana}` : `vigente:${loteId}`);
      if (foto) {
        setLote(foto.lote);
        setPuntos(foto.puntos);
        setCargas(fusionarPendientesEnCargas(foto.cargas, foto.puntos, campana ?? foto.lote.campanaActual, pendientesAlEmpezar));
        setUsandoCache(false);
        setError(null);
        setErrorCache(null);
        setCargando(false);
        teniaAlgoLocal = true;
      } else {
        const cache = leerCacheLote(loteId, campana);
        if (cache) {
          setLote(cache.lote);
          setPuntos(cache.puntos);
          setCargas(fusionarPendientesEnCargas(cache.cargas, cache.puntos, campana ?? cache.lote.campanaActual, pendientesAlEmpezar));
          setUsandoCache(true);
          setError(null);
          setErrorCache(null);
          setCargando(false);
          teniaAlgoLocal = true;
        }
      }
    }

    try {
      // Chequeo rápido antes de intentar nada — si no hay señal, ni tiene
      // sentido esperar a que el fetch se dé por vencido solo (eso puede
      // tardar bastante) para recién ahí caer al respaldo local. Ver
      // lib/offline/net.ts.
      if (!(await hayConexion())) throw new Error("Sin conexión");
      // Ver el comentario de `loteInicial` más arriba: solo la primera vez,
      // y solo si de verdad es este mismo lote (por las dudas, si loteId
      // cambiara sin desmontar el hook).
      const usarLoteInicial = esPrimerRefresco && loteInicial?.id === loteId;
      // 15s, no los 10s por default de conTimeout — confirmado con el
      // usuario que con wifi andando bien igual pasaba de los 10s alguna
      // vez (probado en el campo: 12s). Ya no hace falta que sea corto "por
      // las dudas" — con lo de arriba, quien mira la pantalla nunca espera
      // a que esto se resuelva para ver algo si ya había algo guardado.
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
        //
        // Puntos primero y cargas DESPUÉS (no Promise.all) — a propósito:
        // fetchCargasDeLote ahora necesita los IDs de los puntos (ver el
        // comentario ahí), así que ya no se pueden pedir en paralelo. Cuesta
        // un poco más de tiempo total (dos viajes seguidos en vez de dos en
        // simultáneo), pero la consulta de cargas en sí queda mucho más
        // liviana para Postgres — confirmado en el campo que varias
        // personas entrando al MISMO lote a la vez (normal en el trabajo
        // real) seguía saturando la base con la versión vieja, con join,
        // incluso en un plan de Supabase más grande.
        const ps = await conTimeout(fetchPuntosDeLote(loteId), 25000);
        const cs = await conTimeout(
          fetchCargasDeLote(
            ps.map((p) => p.id),
            campanaEfectiva
          ),
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
          guardarFotoReciente(loteId, campanaEfectiva, campanaEfectiva === l.campanaActual, {
            lote: l,
            puntos: ps,
            cargas: cs,
            ts: Date.now(),
          });
        }
        // Fusiona lo que esta persona ya guardó sin señal (todavía en la
        // cola local) para que se vea completo al toque, sin esperar a que
        // la sincronización real llegue a confirmarlo — ver
        // lib/offline/resumen.ts.
        setPuntos(ps);
        setCargas(fusionarPendientesEnCargas(cs, ps, campanaEfectiva, pendientesAlEmpezar));
        setUsandoCache(false);
        setError(null);
        setErrorCache(null);
      }
    } catch (e: any) {
      // El pedido en vivo falló (sin señal, o el server no respondió a
      // tiempo). Si ya se estaba mostrando algo local (de arriba, o de un
      // refresco anterior que sí salió bien), lo dejamos como está — no
      // tiene sentido tapar un lote que la persona YA está viendo con un
      // cartel de error solo porque el intento de refrescarlo de fondo no
      // llegó a nada; sigue siendo el mismo dato de antes, con el motivo
      // real guardado aparte para diagnóstico (errorCache).
      if (teniaAlgoLocal) {
        setUsandoCache(true);
        setErrorCache(e.message ?? String(e));
      } else {
        // Nunca hubo nada guardado de este lote — recién acá, sin nada
        // que mostrar, corresponde el cartel de error.
        const cache = leerCacheLote(loteId, campana);
        if (cache) {
          setLote(cache.lote);
          setPuntos(cache.puntos);
          setCargas(fusionarPendientesEnCargas(cache.cargas, cache.puntos, campana ?? cache.lote.campanaActual, pendientesAlEmpezar));
          setUsandoCache(true);
          setError(null);
          setErrorCache(e.message ?? String(e));
        } else {
          setError(e.message ?? String(e));
          setErrorCache(e.message ?? String(e));
        }
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

  // Limpia el timer del cartel de caché (ver setUsandoCache más arriba) si
  // la pantalla se desmonta antes de que se cumpla — sin esto, podía
  // intentar actualizar el estado de un componente que ya no existe.
  useEffect(() => {
    return () => {
      if (avisoCacheTimeoutRef.current) clearTimeout(avisoCacheTimeoutRef.current);
    };
  }, []);

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

  return { cargando, error, errorCache, usandoCache, lote, puntos, cargas, resumen, refrescar, gps, puntoCercano, enRango, origen };
}
