import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";

import { latLonAXY } from "@/lib/geo/geometria";
import type { LatLon, XY } from "@/lib/geo/geometria";

export type EstadoGps = "buscando" | "activo" | "no-disponible";

// Por debajo de esta velocidad (m/s) no se confía en el rumbo que da el GPS
// (`pos.coords.heading`, "curso sobre el terreno") — parado o caminando muy
// despacio, esa cuenta se arma con desplazamientos mínimos entre lecturas y
// el resultado es puro ruido (puede señalar cualquier dirección). ~0.4 m/s
// es un paso bien lento — cualquier caminata normal ya lo supera cómodo.
const VELOCIDAD_MIN_RUMBO_GPS = 0.4;
// Mientras el rumbo del GPS siga llegando fresco (caminando), manda él y se
// ignoran las lecturas de la brújula — si pasa este tiempo sin una lectura
// de rumbo GPS válida (te parás, o el GPS pierde precisión un rato), se
// vuelve a confiar en la brújula del teléfono para no quedarse con un
// rumbo viejo pegado.
const VENTANA_RUMBO_GPS_MS = 4000;

/** GPS real convertido al plano local (metros) del lote — portado de
 * `activarGPS` del prototipo, pero con `origen` inferido en vez de fijo a
 * un lote de ejemplo (ver `inferirOrigenDesdePuntos`).
 *
 * El rumbo (`heading`, usado para girar el mapa en modo trabajo — ver
 * MapaCampo) sale de DOS fuentes, no solo la brújula:
 * 1. El RUMBO DEL GPS (`pos.coords.heading`, "curso sobre el terreno":
 *    hacia dónde te estás moviendo de verdad, calculado por el propio GPS
 *    a partir de tus últimas posiciones) — se usa como fuente principal
 *    mientras estás caminando de verdad (ver VELOCIDAD_MIN_RUMBO_GPS). No
 *    depende para nada del magnetómetro, así que no le afectan ni paredes,
 *    ni estructuras metálicas, ni la funda del celular — a pedido del
 *    usuario, que probó la brújula sola adentro de una casa y notó que
 *    "avanzaba de costado" (clásico de interferencia magnética).
 * 2. La BRÚJULA del teléfono (`watchHeadingAsync`, magnetómetro) — de
 *    respaldo, para cuando no hay rumbo GPS confiable (parado quieto, GPS
 *    recién arrancando, señal pobre).
 * Ninguna de las dos es infalible en el 100% de los casos (ninguna app de
 * navegación lo es), pero para caminar al aire libre en un campo abierto
 * —el uso real acá— el rumbo del GPS es mucho más confiable que la
 * brújula sola.
 *
 * `useFocusEffect` (no un `useEffect` a secas) para suscribirse/
 * desuscribirse: sin esto, al entrar a cargar un punto desde Modo trabajo
 * (`router.push`, que NO desmonta la pantalla de atrás — React Navigation
 * la deja montada en la pila), el GPS y sobre todo la brújula seguían
 * recibiendo actualizaciones de fondo mientras la persona escribía en el
 * teclado numérico — la brújula puede disparar varias veces por segundo,
 * cada una disparando un re-render + una animación de Reanimated en una
 * pantalla que ni se ve. Es sospechoso número uno de una falla reportada
 * ahí mismo (el teclado "parpadeaba" justo al entrar desde Modo trabajo, no
 * desde Vista general) — de fondo compitiendo por el hilo de JS justo
 * cuando se toca "Listo". Con `useFocusEffect`, el GPS/brújula se cortan
 * solos apenas la pantalla pierde el foco (se abre el punto encima) y se
 * retoman solos al volver — de paso, ahorra batería de verdad (antes
 * seguían prendidos aunque no se vieran en pantalla). */
export function useGps(origen: LatLon | null) {
  const [posicion, setPosicion] = useState<XY | null>(null);
  const [estado, setEstado] = useState<EstadoGps>("buscando");
  const [heading, setHeading] = useState(0); // grados, 0 = norte arriba
  const [headingDisponible, setHeadingDisponible] = useState(false);
  const subPosicionRef = useRef<Location.LocationSubscription | null>(null);
  const subHeadingRef = useRef<Location.LocationSubscription | null>(null);
  // Timestamp de la última vez que el RUMBO DEL GPS (no la brújula) fue
  // válido y se usó — mientras esté "fresco" (ver VENTANA_RUMBO_GPS_MS),
  // las lecturas de la brújula se ignoran a propósito (ver más abajo).
  const ultimoRumboGpsRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!origen) return;
      let cancelado = false;

      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!cancelado) setEstado("no-disponible");
          return;
        }

        subPosicionRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 1 },
          (pos) => {
            if (cancelado) return;
            setPosicion(latLonAXY(origen, { lat: pos.coords.latitude, lon: pos.coords.longitude }));
            setEstado("activo");

            // `coords.heading` es el CURSO sobre el terreno (-1 si no hay
            // dato) — se prioriza por sobre la brújula mientras estés
            // caminando a un paso real (ver el comentario grande arriba).
            const curso = pos.coords.heading;
            const velocidad = pos.coords.speed ?? 0;
            if (curso != null && curso >= 0 && velocidad >= VELOCIDAD_MIN_RUMBO_GPS) {
              setHeading(curso);
              setHeadingDisponible(true);
              ultimoRumboGpsRef.current = Date.now();
            }
          }
        );

        try {
          subHeadingRef.current = await Location.watchHeadingAsync((h) => {
            if (cancelado) return;
            // El rumbo del GPS todavía está fresco (caminando de verdad) —
            // no se pisa con la lectura de la brújula, que es la fuente de
            // respaldo, no la principal mientras hay una mejor disponible.
            if (Date.now() - ultimoRumboGpsRef.current < VENTANA_RUMBO_GPS_MS) return;
            setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
            setHeadingDisponible(true);
          });
        } catch {
          // Algunos dispositivos/emuladores no traen brújula — no es fatal,
          // el mapa queda orientado al norte fijo y se puede rotar a mano.
          setHeadingDisponible(false);
        }
      })();

      return () => {
        cancelado = true;
        subPosicionRef.current?.remove();
        subHeadingRef.current?.remove();
      };
    }, [origen])
  );

  return { posicion, estado, heading, headingDisponible };
}
