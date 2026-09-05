import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";

import { latLonAXY } from "@/lib/geo/geometria";
import type { LatLon, XY } from "@/lib/geo/geometria";

export type EstadoGps = "buscando" | "activo" | "no-disponible";

/** GPS real convertido al plano local (metros) del lote — portado de
 * `activarGPS` del prototipo, pero con `origen` inferido en vez de fijo a
 * un lote de ejemplo (ver `inferirOrigenDesdePuntos`).
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
          }
        );

        try {
          subHeadingRef.current = await Location.watchHeadingAsync((h) => {
            if (cancelado) return;
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
