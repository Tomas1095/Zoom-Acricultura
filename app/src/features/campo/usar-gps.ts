import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

import { latLonAXY } from "@/lib/geo/geometria";
import type { LatLon, XY } from "@/lib/geo/geometria";

export type EstadoGps = "buscando" | "activo" | "no-disponible";

/** GPS real convertido al plano local (metros) del lote — portado de
 * `activarGPS` del prototipo, pero con `origen` inferido en vez de fijo a
 * un lote de ejemplo (ver `inferirOrigenDesdePuntos`). */
export function useGps(origen: LatLon | null) {
  const [posicion, setPosicion] = useState<XY | null>(null);
  const [estado, setEstado] = useState<EstadoGps>("buscando");
  const [heading, setHeading] = useState(0); // grados, 0 = norte arriba
  const [headingDisponible, setHeadingDisponible] = useState(false);
  const subPosicionRef = useRef<Location.LocationSubscription | null>(null);
  const subHeadingRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
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
  }, [origen]);

  return { posicion, estado, heading, headingDisponible };
}
