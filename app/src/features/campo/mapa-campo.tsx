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
  // Fondo claro en los dos modos (no oscuro en pantalla completa como en
  // una primera versión) — así que la etiqueta necesita un color oscuro
  // legible sobre claro en ambos casos, no el hueso que se pensó para
  // fondo oscuro.
  const colorEtiqueta = colors.textMuted;

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
      // El zoom solo no cuenta como "interacción" en modo trabajo — acercar
      // o alejar no debería pausar el seguimiento de rumbo ni mostrar
      // "Volver a mi marcha" (eso sí pasa con arrastrar o girar). En vista
      // general el zoom sigue contando para "Restablecer", como se pidió.
      if (!seguirRumbo) {
        runOnJS(avisarInteraccion)();
      }
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

  // En modo trabajo, escala y rotación tienen que pivotear sobre el ancla
  // (donde está "Yo", fijo — ver más abajo), no sobre el centro de la vista
  // (el default). Si no, cualquier rotación de rumbo corría todo el
  // grupo — lote, puntos y perímetro — lejos de "Yo" en vez de girarlo a
  // su alrededor, que es exactamente el bug que reportó el usuario ("el
  // punto azul me queda afuera del mapa"). translate no lo necesita (una
  // traslación no tiene "pivote"). En vista general se deja el default
  // (centro), como corresponde a un mapa fijo sin ancla.
  const estiloAnimado = useAnimatedStyle(() => ({
    transformOrigin: pantallaCompleta ? [anclaX, anclaY, 0] : undefined,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotateZ: `${rotacion.value}rad` },
    ],
  }));

  // Contra-rotación para que la numeración de cada punto se lea siempre en
  // horizontal, gire lo que gire el mapa — un solo estilo animado
  // reutilizado en todas las etiquetas (no se puede llamar useAnimatedStyle
  // adentro del .map() de abajo, así que va una vez acá arriba).
  const estiloContraRotacionEtiqueta = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${-rotacion.value}rad` }],
  }));

  // Solo modo trabajo: el marcador "Yo" queda fijo en el ancla (ver JSX,
  // está fuera del grupo que gira/escala/arrastra), así que su flecha
  // necesita sumar a mano la rotación que tendría el grupo — heading más
  // la rotación actual del mapa en grados — para seguir apuntando bien.
  const estiloFlechaYoFija = useAnimatedStyle(() => ({
    transform: [{ rotate: `${heading + (rotacion.value * 180) / Math.PI}deg` }],
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
            {/* Mismo verde tenue de relleno y borde sólido en los dos modos
                — en pantalla completa un poco más grueso, nomás, porque
                se ve a más distancia. */}
            <Polygon
              points={puntosPerimetro.join(" ")}
              fill="rgba(59,143,92,0.08)"
              stroke={colors.primary}
              strokeWidth={pantallaCompleta ? 2.5 : 1.5}
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
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    styles.puntoLabel,
                    { color: colorEtiqueta, fontSize: tamFuente, top: tamPunto + 1, left: tamPunto / 2 - 20 },
                    estiloContraRotacionEtiqueta,
                  ]}
                >
                  {p.id}
                </Animated.Text>
              </Pressable>
            );
          })}

          {/* Vista general: "Yo" es un punto más del mapa, gira y se mueve
              con el resto (no hay "ancla" en esta vista). En modo trabajo
              va afuera, fijo — ver más abajo. */}
          {!pantallaCompleta && posMi && (
            <View style={[styles.yoMarker, { left: posMi.left - 12, top: posMi.top - 12 }]}>
              <View style={styles.yoMarkerPulso} />
              <Navigation size={13} color="#FFFFFF" style={{ transform: [{ rotate: `${heading}deg` }] }} />
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Modo trabajo: "Yo" queda clavado en el ancla (centro, un poco hacia
          abajo) pase lo que pase con el gesto — solo el lote y los puntos
          se mueven/giran/escalan debajo. Por eso está fuera del grupo con
          el transform animado, no adentro. */}
      {pantallaCompleta && miPos && (
        <View style={[styles.yoMarker, { left: anclaX - 12, top: anclaY - 12 }]}>
          <View style={styles.yoMarkerPulso} />
          <Animated.View style={estiloFlechaYoFija}>
            <Navigation size={13} color="#FFFFFF" />
          </Animated.View>
        </View>
      )}
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
  // Modo trabajo: mismo fondo claro que vista general, pero de borde a
  // borde (sin recuadro ni radio, ya que ocupa toda la pantalla).
  contenedorPantallaCompleta: { backgroundColor: colors.background },
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
