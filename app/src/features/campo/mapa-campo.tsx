import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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

// Niveles fijos de zoom para modo trabajo — botones +/- en vez de pellizcar
// con los dedos (como un GPS de mano tipo Garmin eTrex, que tiene dos
// botones físicos de zoom, sin pinch). De paso resuelve que pellizcar
// contaba como "interacción" y disparaba "Volver a mi marcha" sin querer:
// como ya no hay gesto de pinch en modo trabajo, ese problema desaparece
// solo. Vista general sigue con pellizcar para zoom, como antes.
const NIVELES_ZOOM = [ZOOM_MIN, 0.8, 1, 1.3, 1.6, 2, ZOOM_MAX];
const NIVEL_ZOOM_INICIAL = NIVELES_ZOOM.indexOf(1);

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
  /** Solo modo trabajo: sube/baja un escalón fijo de zoom (ver
   * NIVELES_ZOOM). No cuenta como interacción — no dispara "Volver a mi
   * marcha". */
  acercar: () => void;
  alejar: () => void;
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

  // ---- Gestos: pinch (zoom, solo vista general) + pan (arrastrar) +
  // rotación con 2 dedos ----
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
  // Índice actual dentro de NIVELES_ZOOM (solo modo trabajo, con los
  // botones +/-) — no hace falta que sea reactivo, solo lo lee acercar()/
  // alejar()/restablecer().
  const indiceZoomRef = useRef(NIVEL_ZOOM_INICIAL);

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
    indiceZoomRef.current = NIVEL_ZOOM_INICIAL;
    setInteractuado(false);
    onInteraccion?.(false);
  }

  function irANivelZoom(indice: number) {
    const clamped = Math.max(0, Math.min(NIVELES_ZOOM.length - 1, indice));
    indiceZoomRef.current = clamped;
    const nuevaEscala = NIVELES_ZOOM[clamped];
    scale.value = withTiming(nuevaEscala);
    savedScale.value = nuevaEscala;
    // A propósito NO se llama avisarInteraccion acá — acercar/alejar con
    // los botones no tiene que pausar el seguimiento de rumbo ni mostrar
    // "Volver a mi marcha", que era justo la queja con el pellizco.
  }

  useImperativeHandle(
    ref,
    () => ({
      restablecer,
      acercar: () => irANivelZoom(indiceZoomRef.current + 1),
      alejar: () => irANivelZoom(indiceZoomRef.current - 1),
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

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

  // Pellizcar para hacer zoom solo en vista general — en modo trabajo el
  // zoom es con los botones +/- (ver acercar/alejar), no con los dedos,
  // así que acá directamente no hay gesto de pinch que pueda pisar el
  // seguimiento de rumbo por accidente (era el reclamo: pellizcar
  // disparaba "Volver a mi marcha" sin querer).
  const pinch = Gesture.Pinch()
    .enabled(!pantallaCompleta)
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

  // Escala y rotación pivotean, por default, sobre el centro geométrico de
  // la vista a la que se aplican — no hay forma de pedirles otro pivote sin
  // arriesgarse a APIs nuevas de estilo poco probadas (transformOrigin dio
  // un crash nativo en una prueba real, ver historial). En vez de eso, en
  // modo trabajo agrandamos la altura de esta vista para que SU centro
  // natural caiga justo sobre el ancla (donde está "Yo", fijo — ver más
  // abajo): como el ancla ya está centrada en X, alcanza con estirar el
  // alto para 2×anclaY manteniendo el borde de arriba en el mismo lugar
  // (top:0) — así ningún punto/etiqueta necesita recalcular su posición,
  // sólo cambia dónde cae el centro de la vista. El sobrante de abajo
  // queda recortado por el overflow:hidden del contenedor de afuera, igual
  // que ya se recorta cualquier otro contenido que se sale al girar/hacer
  // zoom.
  const altoGrupo = pantallaCompleta ? anclaY * 2 : alto;
  const estiloAnimado = useAnimatedStyle(() => ({
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

  // Solo modo trabajo: el marcador "Yo" está fuera del grupo que
  // gira/escala/arrastra (ver JSX), pero necesita moverse CON el arrastre
  // (pan) — arrastrar el mapa con dos dedos tiene que mover "Yo" también,
  // es lo lógico, y "Volver a mi marcha" te devuelve a los dos al lugar
  // original. Lo que "Yo" no hace es rotar ni escalar con el resto: girar
  // o hacer zoom tienen que pivotear alrededor suyo, no moverlo — por eso
  // solo toma translateX/Y acá, nunca scale ni rotateZ.
  const estiloYoArrastrado = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  // Su flecha, aparte, necesita sumar a mano la rotación que tendría si
  // estuviera adentro del grupo — heading más la rotación actual del mapa
  // en grados — para seguir apuntando bien (el translate de arriba no la
  // afecta, así que esto es independiente).
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
        <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: ancho, height: altoGrupo }, estiloAnimado]}>
          {/* El width/height del SVG tienen que coincidir con el tamaño real
              de esta vista (altoGrupo, no el `alto` de la pantalla) — si no
              coinciden, el SVG reescala su contenido para "entrar" en el
              tamaño real, desalineando el perímetro de los puntos (que se
              posicionan aparte, con estilos normales, sin ese reescalado). */}
          <Svg width={ancho} height={altoGrupo} style={{ position: "absolute", top: 0, left: 0 }}>
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

      {/* Modo trabajo: "Yo" arranca en el ancla (centro, un poco hacia
          abajo) y se mueve CON el arrastre (estiloYoArrastrado), pero girar
          o hacer zoom pivotea a su alrededor en vez de moverlo — por eso
          está fuera del grupo con el transform animado completo, no
          adentro (ese grupo sí tiene scale/rotateZ, que "Yo" no debe
          heredar). "Volver a mi marcha" devuelve todo al lugar original. */}
      {pantallaCompleta && miPos && (
        <Animated.View
          style={[styles.yoMarker, { left: anclaX - 12, top: anclaY - 12 }, estiloYoArrastrado]}
        >
          <View style={styles.yoMarkerPulso} />
          <Animated.View style={estiloFlechaYoFija}>
            <Navigation size={13} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
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
