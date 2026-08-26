import { useMemo } from "react";
import Svg, { Line, Polygon } from "react-native-svg";

import type { XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";

const PAD = 18;
const ESCALA_MAX = 3.2;

interface MapaManchoneoProps {
  perimetro: XY[];
  manchones: XY[][];
  ancho: number;
  alto: number;
}

/** Mapa de la zona de aplicación (manchoneo) — perímetro del lote + los
 * polígonos calculados por `calcularZonaAplicacion` resaltados encima. Sin
 * fondo/borde propio a propósito, mismo criterio que MapaDensidad: el marco
 * lo pone quien lo use. Estático (no rota ni escala con gestos), así que
 * `<Polygon>` de react-native-svg es seguro acá. */
export function MapaManchoneo({ perimetro, manchones, ancho, alto }: MapaManchoneoProps) {
  const toPx = useMemo(() => {
    const xs = perimetro.map((p) => p.x);
    const ys = perimetro.map((p) => p.y);
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const spanX = Math.max(1, (xs.length > 0 ? Math.max(...xs) : 0) - minX);
    const spanY = Math.max(1, (ys.length > 0 ? Math.max(...ys) : 0) - minY);
    const escala = Math.min((ancho - PAD * 2) / spanX, (alto - PAD * 2) / spanY, ESCALA_MAX);
    return (x: number, y: number) => ({ left: PAD + (x - minX) * escala, top: PAD + (y - minY) * escala });
  }, [perimetro, ancho, alto]);

  const perimetroPx = perimetro.map((v) => toPx(v.x, v.y));

  return (
    <Svg width={ancho} height={alto}>
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
  );
}
