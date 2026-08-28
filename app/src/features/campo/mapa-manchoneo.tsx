import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Svg, { Line, Polygon } from "react-native-svg";

import { puntoEnPoligono, type XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";

const PAD = 18;
const ESCALA_MAX = 3.2;
// Tamaño del "agarre" de cada vértice en modo edición — bastante más grande
// que el punto en sí (que se dibuja chico, ver VERTICE_RADIO_VISUAL) para
// que el dedo no falle el toque en un mapa chico como este.
const VERTICE_RADIO_TOQUE = 13;
const VERTICE_RADIO_VISUAL = 5;

interface MapaManchoneoProps {
  perimetro: XY[];
  manchones: XY[][];
  ancho: number;
  alto: number;
  /** Modo edición: muestra los "agarres" en cada vértice de cada manchón,
   * arrastrables con el dedo. Fuera de este modo el mapa es puramente
   * visual, igual que antes. */
  editable?: boolean;
  /** Se llama con la nueva posición (en el mismo plano x,y real que
   * `perimetro`/`manchones`, no en píxeles de pantalla) cada vez que un
   * arrastre mueve un vértice a un lugar válido — ver el freno del límite
   * más abajo. `salidas-view.tsx` es quien de verdad guarda el cambio. */
  onEditarVertice?: (manchonIndex: number, verticeIndex: number, nuevo: XY) => void;
}

/** Mapa de la zona de aplicación (manchoneo) — perímetro del lote + los
 * polígonos calculados por `calcularZonaAplicacion` resaltados encima. Sin
 * fondo/borde propio a propósito, mismo criterio que MapaDensidad: el marco
 * lo pone quien lo use. El polígono/perímetro en sí es estático (no rota ni
 * escala con gestos), así que `<Polygon>`/`<Line>` de react-native-svg son
 * seguros acá — lo único con gestos son los "agarres" de los vértices en
 * modo edición, que son `View`s comunes superpuestas (react-native-svg no
 * es un buen target para gestos táctiles individuales). */
export function MapaManchoneo({ perimetro, manchones, ancho, alto, editable, onEditarVertice }: MapaManchoneoProps) {
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

  // Arrastrar un vértice: `dx`/`dy` vienen en píxeles de pantalla (el mapa
  // no tiene su propio pan/zoom, así que no hace falta deshacer ninguna
  // transformación más que la escala) — se convierten a metros reales y se
  // prueba la posición candidata contra el perímetro del lote. Si cae
  // afuera, el cambio se descarta (no se llama a onEditarVertice): como
  // cada evento de arrastre es un incremento chico sobre la posición
  // anterior (ya válida), el vértice simplemente deja de moverse apenas
  // toca el borde — el límite del lote actúa de freno, no de rebote ni de
  // teletransporte a ningún lado.
  function moverVertice(manchonIndex: number, verticeIndex: number, dx: number, dy: number) {
    const actual = manchones[manchonIndex]?.[verticeIndex];
    if (!actual) return;
    const candidato = { x: actual.x + dx / escala, y: actual.y + dy / escala };
    if (!puntoEnPoligono(candidato.x, candidato.y, perimetro)) return;
    onEditarVertice?.(manchonIndex, verticeIndex, candidato);
  }

  return (
    <View style={{ width: ancho, height: alto }}>
      <Svg width={ancho} height={alto} style={StyleSheet.absoluteFill}>
        {manchones.map((m, i) => (
          <Polygon
            key={i}
            points={m.map((p) => `${toPx(p.x, p.y).left},${toPx(p.x, p.y).top}`).join(" ")}
            fill={colors.primary}
            fillOpacity={0.35}
            stroke={colors.primaryDark}
            strokeWidth={1.5}
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
        manchones.map((m, manchonIndex) =>
          m.map((v, verticeIndex) => (
            <VerticeArrastrable
              key={`${manchonIndex}-${verticeIndex}`}
              punto={toPx(v.x, v.y)}
              onMover={(dx, dy) => moverVertice(manchonIndex, verticeIndex, dx, dy)}
            />
          ))
        )}
    </View>
  );
}

interface VerticeArrastrableProps {
  punto: { left: number; top: number };
  onMover: (deltaXPx: number, deltaYPx: number) => void;
}

/** Un "agarre" individual — su propio `GestureDetector`, así cada vértice se
 * arrastra de forma independiente sin pisar a los demás. `.onChange` (no
 * `.onUpdate`) a propósito: cada evento ya es el incremento desde el
 * anterior, así que si `onMover`/`moverVertice` lo rechaza (fuera del lote)
 * no hace falta "recordar" ningún punto de partida — el siguiente
 * incremento sigue probando desde la última posición válida. */
function VerticeArrastrable({ punto, onMover }: VerticeArrastrableProps) {
  const pan = Gesture.Pan().onChange((e) => {
    "worklet";
    runOnJS(onMover)(e.changeX, e.changeY);
  });
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
