import { useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Svg, { Line, Polygon } from "react-native-svg";

import { calcularCeldasDensidad, type RangoDensidad } from "@/lib/geo/densidad";
import { puntoEnPoligono, type XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";

const PAD = 18;
const ESCALA_MAX = 3.2;
const ZOOM_MAX = 4;
// Tamaño del "agarre" de cada vértice en modo edición — bastante más grande
// que el punto en sí (que se dibuja chico, ver VERTICE_RADIO_VISUAL) para
// que el dedo no falle el toque en un mapa chico como este. Van adentro del
// mismo contenido que hace zoom nativo (ver más abajo), así que también se
// agrandan al pellizcar, como pidió el usuario.
const VERTICE_RADIO_TOQUE = 13;
const VERTICE_RADIO_VISUAL = 5;

export interface PuntoDensidadManchoneo {
  id: string;
  x: number;
  y: number;
  valor: number;
}

interface MapaManchoneoProps {
  perimetro: XY[];
  manchones: XY[][];
  // Mapa de densidad de fondo (mismo cálculo que MapaDensidad) — el usuario
  // necesita ver dónde está parado el manchón respecto de la densidad real,
  // no solo el contorno solo contra un fondo vacío.
  puntosDensidad: PuntoDensidadManchoneo[];
  rangos: RangoDensidad[];
  nivelColores: readonly string[];
  ancho: number;
  alto: number;
  /** Modo edición: muestra los "agarres" en cada vértice de cada manchón,
   * arrastrables con el dedo. Fuera de este modo el mapa es puramente
   * visual, igual que antes. */
  editable?: boolean;
  /** Se llama UNA vez al soltar el dedo (no en cada micro-movimiento del
   * arrastre — ver el comentario largo más abajo, en VerticeArrastrable),
   * con la posición final ya validada contra el perímetro. */
  onEditarVertice?: (manchonIndex: number, verticeIndex: number, nuevo: XY) => void;
}

/** Mapa de la zona de aplicación (manchoneo): densidad de fondo (para
 * ubicar el manchón contra los datos reales) + perímetro del lote + el/los
 * polígono(s) de `calcularZonaAplicacion`, dibujados SIN relleno (solo el
 * contorno) para no taparla. Sin fondo/borde propio a propósito, mismo
 * criterio que MapaDensidad: el marco lo pone quien lo use.
 *
 * Pellizcar para hacer zoom usa el zoom nativo de `ScrollView` (soportado
 * en iOS, que es donde se prueba esta app) en vez de un `Animated.View`
 * con pinch armado a mano: mucho más simple y, sobre todo, evita tener que
 * invertir a mano la matriz de transform para saber dónde cayó el dedo
 * sobre cada vértice — con el zoom nativo, los `GestureDetector` de cada
 * vértice (adentro del contenido escalado) siguen recibiendo coordenadas
 * ya corregidas por iOS, sin ningún cálculo extra de nuestra parte. */
export function MapaManchoneo({
  perimetro,
  manchones,
  puntosDensidad,
  rangos,
  nivelColores,
  ancho,
  alto,
  editable,
  onEditarVertice,
}: MapaManchoneoProps) {
  const { toPx, escala } = useMemo(() => {
    const xs = perimetro.map((p) => p.x);
    const ys = perimetro.map((p) => p.y);
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const spanX = Math.max(1, (xs.length > 0 ? Math.max(...xs) : 0) - minX);
    const spanY = Math.max(1, (ys.length > 0 ? Math.max(...ys) : 0) - minY);
    const escala = Math.min((ancho - PAD * 2) / spanX, (alto - PAD * 2) / spanY, ESCALA_MAX);
    return { escala, toPx: (x: number, y: number) => ({ left: PAD + (x - minX) * escala, top: PAD + (y - minY) * escala }) };
  }, [perimetro, ancho, alto]);

  const perimetroPx = perimetro.map((v) => toPx(v.x, v.y));

  const celdas = useMemo(() => {
    try {
      return calcularCeldasDensidad(puntosDensidad, perimetro, rangos);
    } catch {
      return [];
    }
  }, [puntosDensidad, perimetro, rangos]);

  // Vista previa en vivo del vértice que se está arrastrando ahora mismo —
  // vive ACÁ (no en salidas-view.tsx) a propósito: mientras dura el
  // arrastre, solo este componente (mapa chico) se vuelve a dibujar en cada
  // micro-movimiento, no toda la pantalla de Salidas con sus resúmenes y
  // demás cálculos — eso era lo que hacía sentir lento el arrastre. El
  // padre (salidas-view.tsx, con `onEditarVertice`) recién se entera —y
  // recalcula el área real— una sola vez, al soltar el dedo.
  const [enVivo, setEnVivo] = useState<{ manchonIndex: number; verticeIndex: number; punto: XY } | null>(null);
  const manchonesRender = useMemo(() => {
    if (!enVivo) return manchones;
    return manchones.map((m, i) =>
      i !== enVivo.manchonIndex ? m : m.map((v, j) => (j !== enVivo.verticeIndex ? v : enVivo.punto))
    );
  }, [manchones, enVivo]);

  function commit(manchonIndex: number, verticeIndex: number, punto: XY) {
    setEnVivo(null);
    onEditarVertice?.(manchonIndex, verticeIndex, punto);
  }

  return (
    <ScrollView
      style={{ width: ancho, height: alto }}
      contentContainerStyle={{ width: ancho, height: alto }}
      minimumZoomScale={1}
      maximumZoomScale={ZOOM_MAX}
      pinchGestureEnabled
      bouncesZoom={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: ancho, height: alto }}>
        <Svg width={ancho} height={alto} style={{ position: "absolute", top: 0, left: 0 }}>
          {celdas.map((c) => (
            <Polygon
              key={c.id}
              points={c.poligono.map((p) => `${toPx(p.x, p.y).left},${toPx(p.x, p.y).top}`).join(" ")}
              fill={nivelColores[c.nivel]}
              stroke={colors.surface}
              strokeWidth={0.5}
            />
          ))}

          {/* Sin relleno a propósito (fill="none") — a pedido del usuario,
              así el manchón no tapa la densidad de fondo, solo marca el
              contorno de la zona de aplicación. */}
          {manchonesRender.map((m, i) => (
            <Polygon
              key={i}
              points={m.map((p) => `${toPx(p.x, p.y).left},${toPx(p.x, p.y).top}`).join(" ")}
              fill="none"
              stroke={colors.primary}
              strokeWidth={2.5}
            />
          ))}

          {perimetroPx.map((a, i) => {
            const b = perimetroPx[(i + 1) % perimetroPx.length];
            return (
              <Line key={`lado-${i}`} x1={a.left} y1={a.top} x2={b.left} y2={b.top} stroke={colors.primaryDark} strokeWidth={2} />
            );
          })}
        </Svg>

        {editable &&
          manchonesRender.map((m, manchonIndex) =>
            m.map((v, verticeIndex) => (
              <VerticeArrastrable
                key={`${manchonIndex}-${verticeIndex}`}
                puntoReal={v}
                manchonIndex={manchonIndex}
                verticeIndex={verticeIndex}
                escala={escala}
                perimetro={perimetro}
                toPx={toPx}
                onEnVivo={(mi, vi, punto) => setEnVivo({ manchonIndex: mi, verticeIndex: vi, punto })}
                onCommit={commit}
              />
            ))
          )}
      </View>
    </ScrollView>
  );
}

interface VerticeArrastrableProps {
  puntoReal: XY;
  manchonIndex: number;
  verticeIndex: number;
  escala: number;
  perimetro: XY[];
  toPx: (x: number, y: number) => { left: number; top: number };
  onEnVivo: (manchonIndex: number, verticeIndex: number, nuevo: XY) => void;
  onCommit: (manchonIndex: number, verticeIndex: number, nuevo: XY) => void;
}

/** Un "agarre" individual — su propio `GestureDetector`, así cada vértice se
 * arrastra de forma independiente sin pisar a los demás (ni al pan/zoom
 * nativo del `ScrollView` que lo contiene: al empezar el toque justo sobre
 * el agarre, este gesto se queda con el toque). `.maxPointers(1)` para no
 * competir con el pellizco de 2 dedos del zoom.
 *
 * Mientras dura el arrastre, la posición candidata se acumula en un ref
 * (no en un `useState` de React) y solo dispara `onEnVivo` — la vista
 * previa liviana del padre (`MapaManchoneo`), ver ahí el porqué. Recién al
 * soltar (`onEnd`) se llama a `onCommit`, que es lo que de verdad llega
 * hasta salidas-view.tsx y recalcula el área. */
function VerticeArrastrable({
  puntoReal,
  manchonIndex,
  verticeIndex,
  escala,
  perimetro,
  toPx,
  onEnVivo,
  onCommit,
}: VerticeArrastrableProps) {
  const acumRef = useRef(puntoReal);

  function iniciar() {
    acumRef.current = puntoReal;
  }
  function mover(dx: number, dy: number) {
    const candidato = { x: acumRef.current.x + dx / escala, y: acumRef.current.y + dy / escala };
    // El freno: si el movimiento saca al vértice del lote, se descarta —
    // el vértice se queda en la última posición válida en vez de seguir a
    // la fuerza al dedo, así que no hace falta "rebotar" ni recortar nada,
    // el próximo micro-movimiento simplemente sigue probando desde acá.
    if (!puntoEnPoligono(candidato.x, candidato.y, perimetro)) return;
    acumRef.current = candidato;
    onEnVivo(manchonIndex, verticeIndex, candidato);
  }
  function finalizar() {
    onCommit(manchonIndex, verticeIndex, acumRef.current);
  }

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      "worklet";
      runOnJS(iniciar)();
    })
    .onChange((e) => {
      "worklet";
      runOnJS(mover)(e.changeX, e.changeY);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(finalizar)();
    });

  const punto = toPx(puntoReal.x, puntoReal.y);

  return (
    <GestureDetector gesture={pan}>
      <View style={[estVertice, { left: punto.left - VERTICE_RADIO_TOQUE, top: punto.top - VERTICE_RADIO_TOQUE }]}>
        <View style={estVerticeVisual} />
      </View>
    </GestureDetector>
  );
}

const estVertice = {
  position: "absolute" as const,
  width: VERTICE_RADIO_TOQUE * 2,
  height: VERTICE_RADIO_TOQUE * 2,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const estVerticeVisual = {
  width: VERTICE_RADIO_VISUAL * 2,
  height: VERTICE_RADIO_VISUAL * 2,
  borderRadius: VERTICE_RADIO_VISUAL,
  backgroundColor: colors.surface,
  borderWidth: 2,
  borderColor: colors.primaryDark,
};
