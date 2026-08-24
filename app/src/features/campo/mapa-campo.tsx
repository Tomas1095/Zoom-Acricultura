import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
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
}

/** El mapa de campo — portado de `contenidoMapa` del prototipo. En vez de
 * recalcular el layout en cada frame de gesto (como hacía el prototipo con
 * CSS), acá el layout base se calcula una sola vez con `toPx` y el
 * pinch/pan/rotate interactivo se aplica como una transformada GPU sobre
 * todo el grupo — más fluido en un dispositivo real. */
export function MapaCampo({
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
}: MapaCampoProps) {
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

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      "worklet";
      const nuevo = savedScale.value * e.scale;
      scale.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nuevo));
    })
    .onEnd(() => {
      "worklet";
      savedScale.value = scale.value;
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
    });

  const rotar = Gesture.Rotation()
    .onUpdate((e) => {
      "worklet";
      rotacion.value = savedRotacion.value + e.rotation;
    })
    .onEnd(() => {
      "worklet";
      savedRotacion.value = rotacion.value;
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
    <View style={[styles.contenedor, { width: ancho, height: alto }]}>
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
            // En modo trabajo solo se puede cargar el punto más cercano y en
            // rango (te tenés que acercar de verdad); en vista general lo
            // único que restringe es el rol (ver `puedeTocarPuntos`, que ya
            // viene calculado según si sos Monitoreador).
            const tocable = puedeTocarPuntos && (!pantallaCompleta || (cercano && enRango));
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
                <Text style={[styles.puntoLabel, { color: colorEtiqueta, fontSize: tamFuente, top: tamPunto + 1 }]}>
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
}

export { ZOOM_MIN, ZOOM_MAX };

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colors.background,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
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
