import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";
import { Navigation } from "lucide-react-native";

import type { XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";

const MAP_PAD = 26; // px de margen alrededor de la grilla
const MAP_SCALE_MAX = 3.2; // px por metro, a zoom 1x
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;

export interface PuntoMapa {
  id: string;
  x: number;
  y: number;
  confirmado: boolean;
}

interface MapaCampoProps {
  puntos: PuntoMapa[];
  perimetro: XY[];
  miPos: XY | null;
  puntoCercanoId: string | null;
  enRango: boolean;
  heading: number;
  /** "Modo trabajo": pantalla completa, la cámara te sigue. Si es false es
   * la vista general: encuadra todo el lote, fija. */
  pantallaCompleta: boolean;
  puedeTocarPuntos: boolean;
  onTapPunto: (id: string) => void;
  ancho: number;
  alto: number;
  /** Avisa cuando el mapa deja de estar en su posición original (zoom 1x,
   * sin arrastrar, sin girar) — para que la pantalla que lo contiene pueda
   * mostrar un botón "Restablecer"/"Volver a mi marcha". */
  onInteraccion?: (interactuado: boolean) => void;
  /** Solo modo trabajo: el mapa entero rota para que "arriba" sea siempre
   * hacia donde estás caminando (heading-up), portado de `contenidoMapa`
   * del prototipo (rotate(-heading) sobre todo el mapa). Se pausa apenas el
   * usuario toca el mapa con los dedos — cualquier gesto manual gana. */
  seguirRumbo?: boolean;
}

export interface MapaCampoHandle {
  /** Vuelve a zoom 1x, sin arrastre ni giro — animado. */
  restablecer: () => void;
}

/** El mapa de campo — portado de `contenidoMapa` del prototipo. En vez de
 * recalcular el layout en cada frame de gesto (como hacía el prototipo con
 * CSS), acá el layout base se calcula una sola vez con `toPx` y el
 * pinch/pan/rotate interactivo se aplica como una transformada GPU sobre
 * todo el grupo — más fluido en un dispositivo real. */
export const MapaCampo = forwardRef<MapaCampoHandle, MapaCampoProps>(function MapaCampo(
  {
    puntos,
    perimetro,
    miPos,
    puntoCercanoId,
    enRango,
    heading,
    pantallaCompleta,
    puedeTocarPuntos,
    onTapPunto,
    ancho,
    alto,
    onInteraccion,
    seguirRumbo,
  },
  ref
) {
  const bounds = useMemo(() => {
    const xs = perimetro.map((p) => p.x);
    const ys = perimetro.map((p) => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [perimetro]);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);

  const baseScaleFit = Math.min((ancho - MAP_PAD * 2) / spanX, (alto - MAP_PAD * 2) / spanY, MAP_SCALE_MAX);
  const baseScale = pantallaCompleta ? Math.min(baseScaleFit * 1.8, MAP_SCALE_MAX) : baseScaleFit;
  const anclaX = ancho / 2;
  const anclaY = alto * 0.72; // como en cualquier GPS de navegación: más lote "adelante" que "atrás"

  function toPx(xm: number, ym: number): { left: number; top: number } {
    if (pantallaCompleta) {
      if (!miPos) return { left: anclaX, top: anclaY };
      return { left: anclaX + (xm - miPos.x) * baseScale, top: anclaY + (ym - miPos.y) * baseScale };
    }
    return { left: MAP_PAD + (xm - bounds.minX) * baseScale, top: MAP_PAD + (ym - bounds.minY) * baseScale };
  }

  const tamPunto = pantallaCompleta ? 24 : 18;
  const tamFuente = pantallaCompleta ? 11 : 8.5;
  const colorBorderPendiente = pantallaCompleta ? colors.text : colors.warning;
  const colorFillCompleto = pantallaCompleta ? "#6FCF5C" : colors.primaryConfirm;
  const colorBorderCompleto = pantallaCompleta ? colors.text : colors.primary;
  const colorEtiqueta = pantallaCompleta ? "#F2E9C9" : colors.textMuted;

  // ---- Gestos: pinch (zoom) + pan (arrastrar) + rotación con 2 dedos ----
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const rotacion = useSharedValue(0);
  const savedRotacion = useSharedValue(0);
  // Espejo en React state de "hay un gesto manual pisando la vista" — lo
  // necesitamos acá adentro (no solo afuera, vía onInteraccion) para poder
  // pausar el useEffect de seguirRumbo de abajo.
  const [interactuado, setInteractuado] = useState(false);

  function avisarInteraccion() {
    setInteractuado(true);
    onInteraccion?.(true);
  }

  function restablecer() {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    savedTranslateX.value = 0;
    translateY.value = withTiming(0);
    savedTranslateY.value = 0;
    rotacion.value = withTiming(0);
    savedRotacion.value = 0;
    setInteractuado(false);
    onInteraccion?.(false);
  }

  useImperativeHandle(ref, () => ({ restablecer }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Portado de `rotate(-headingUsado)` sobre todo `mapWorld` en el
  // prototipo: mientras nadie tocó el mapa a mano, rota el grupo entero
  // para que arriba sea tu rumbo real — el marcador "Yo" ya rota al revés
  // (`heading` sobre sí mismo, ver más abajo) así que dentro de este grupo
  // queda siempre apuntando derecho para arriba.
  useEffect(() => {
    if (!seguirRumbo || interactuado) return;
    const rad = (-heading * Math.PI) / 180;
    rotacion.value = withTiming(rad, { duration: 350 });
    savedRotacion.value = rad;
  }, [heading, seguirRumbo, interactuado]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      "worklet";
      const nuevo = savedScale.value * e.scale;
      scale.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nuevo));
    })
    .onEnd(() => {
      "worklet";
      savedScale.value = scale.value;
      runOnJS(avisarInteraccion)();
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      "worklet";
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      "worklet";
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(avisarInteraccion)();
    });

  const rotar = Gesture.Rotation()
    .onUpdate((e) => {
      "worklet";
      rotacion.value = savedRotacion.value + e.rotation;
    })
    .onEnd(() => {
      "worklet";
      savedRotacion.value = rotacion.value;
      runOnJS(avisarInteraccion)();
    });

  const gestoCompuesto = Gesture.Simultaneous(pinch, pan, rotar);

  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotateZ: `${rotacion.value}rad` },
    ],
  }));

  const puntosPerimetro = perimetro.map((p) => {
    const pos = toPx(p.x, p.y);
    return `${pos.left},${pos.top}`;
  });

  const posMi = miPos ? toPx(miPos.x, miPos.y) : null;

  return (
    <View
      style={[
        styles.contenedor,
        pantallaCompleta ? styles.contenedorPantallaCompleta : styles.contenedorEncuadrado,
        { width: ancho, height: alto },
      ]}
    >
      <GestureDetector gesture={gestoCompuesto}>
        <Animated.View style={[StyleSheet.absoluteFill, estiloAnimado]}>
          <Svg width={ancho} height={alto} style={StyleSheet.absoluteFill}>
            <Polygon
              points={puntosPerimetro.join(" ")}
              fill={pantallaCompleta ? "rgba(255,255,255,0.06)" : "rgba(59,143,92,0.08)"}
              stroke={pantallaCompleta ? "#F2E9C9" : colors.primary}
              strokeWidth={pantallaCompleta ? 2 : 1.5}
              strokeDasharray={pantallaCompleta ? undefined : "4 3"}
            />
          </Svg>

          {puntos.map((p) => {
            const pos = toPx(p.x, p.y);
            const cercano = puntoCercanoId === p.id;
            // Portado del prototipo: la distancia al punto (enRango) es
            // solo informativa (ver tarjeta de distancia en modo trabajo,
            // que muestra "Acercate al punto" / "En rango"), no bloquea el
            // toque — cualquier punto se puede cargar desde cualquier
            // distancia. Lo único que sí restringe es el rol (Monitoreador
            // solo desde Modo trabajo, ver `puedeTocarPuntos`).
            const tocable = puedeTocarPuntos;
            return (
              <Pressable
                key={p.id}
                disabled={!tocable}
                hitSlop={10}
                onPress={() => onTapPunto(p.id)}
                style={[
                  styles.punto,
                  {
                    width: tamPunto,
                    height: tamPunto,
                    borderRadius: tamPunto / 2,
                    left: pos.left - tamPunto / 2,
                    top: pos.top - tamPunto / 2,
                    backgroundColor: p.confirmado ? colorFillCompleto : colors.surface,
                    borderColor: p.confirmado ? colorBorderCompleto : colorBorderPendiente,
                    borderWidth: pantallaCompleta ? 3 : 2,
                    shadowOpacity: cercano && enRango ? 1 : 0,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.puntoLabel,
                    { color: colorEtiqueta, fontSize: tamFuente, top: tamPunto + 1, left: tamPunto / 2 - 20 },
                  ]}
                >
                  {p.id}
                </Text>
              </Pressable>
            );
          })}

          {posMi && (
            <View style={[styles.yoMarker, { left: posMi.left - 12, top: posMi.top - 12 }]}>
              <View style={styles.yoMarkerPulso} />
              <Navigation size={13} color="#FFFFFF" style={{ transform: [{ rotate: `${heading}deg` }] }} />
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

export { ZOOM_MIN, ZOOM_MAX };

const styles = StyleSheet.create({
  contenedor: { overflow: "hidden" },
  // Vista general: recuadro clarito con borde, como una tarjeta más.
  contenedorEncuadrado: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Modo trabajo: fondo oscuro de borde a borde, sin recuadro — los colores
  // pensados para pantalla completa (etiquetas color hueso, perímetro
  // claro) están pensados para verse sobre este fondo, no sobre el claro.
  contenedorPantallaCompleta: { backgroundColor: colors.mapaOscuro },
  punto: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  puntoLabel: {
    position: "absolute",
    width: 40,
    fontWeight: "700",
    textAlign: "center",
  },
  yoMarker: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.info,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  yoMarkerPulso: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.info,
    opacity: 0.35,
  },
});
