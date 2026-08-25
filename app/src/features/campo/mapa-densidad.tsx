import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Line, Polygon, Text as TextoSvg } from "react-native-svg";

import { calcularCeldasDensidad, elegirEscalaBarra, type RangoDensidad } from "@/lib/geo/densidad";
import type { XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";

const PAD = 18;
const ESCALA_MAX = 3.2;

export interface PuntoDensidad {
  id: string;
  x: number;
  y: number;
  valor: number; // ya llevado a m² (conteo cargado × 4)
}

interface MapaDensidadProps {
  puntos: PuntoDensidad[];
  perimetro: XY[];
  rangos: RangoDensidad[];
  nivelColores: readonly string[];
  ancho: number;
  alto: number;
}

/** Mapa de densidad — portado de la parte SVG de `DensidadView` del
 * prototipo, sin la imagen satelital (ver nota en `lib/geo/densidad.ts`).
 * A diferencia de `MapaCampo` en modo trabajo, esta vista nunca rota ni
 * escala con gestos — es una foto fija — así que las celdas del Voronoi se
 * dibujan con `<Polygon>` de react-native-svg sin problema (el bug de
 * renderizado que encontramos era específico de transforms de rotación
 * grandes de Reanimated, que acá no existen). */
export function MapaDensidad({ puntos, perimetro, rangos, nivelColores, ancho, alto }: MapaDensidadProps) {
  const { toPx, escala } = useMemo(() => {
    const todasX = puntos.map((p) => p.x).concat(perimetro.map((v) => v.x));
    const todasY = puntos.map((p) => p.y).concat(perimetro.map((v) => v.y));
    const minX = todasX.length > 0 ? Math.min(...todasX) : 0;
    const minY = todasY.length > 0 ? Math.min(...todasY) : 0;
    const spanX = Math.max(1, (todasX.length > 0 ? Math.max(...todasX) : 0) - minX);
    const spanY = Math.max(1, (todasY.length > 0 ? Math.max(...todasY) : 0) - minY);
    const escala = Math.min((ancho - PAD * 2) / spanX, (alto - PAD * 2) / spanY, ESCALA_MAX);
    return {
      escala,
      toPx: (x: number, y: number) => ({ left: PAD + (x - minX) * escala, top: PAD + (y - minY) * escala }),
    };
  }, [puntos, perimetro, ancho, alto]);

  const celdas = useMemo(() => {
    try {
      return calcularCeldasDensidad(puntos, perimetro, rangos);
    } catch {
      return []; // igual que el prototipo: si algo falla, se muestra el mapa vacío en vez de romper la pantalla
    }
  }, [puntos, perimetro, rangos]);

  const perimetroPx = perimetro.map((v) => toPx(v.x, v.y));
  const escalaBarra = elegirEscalaBarra(escala);
  const barraX = ancho - escalaBarra.px - 18;
  const barraY = alto - 16;

  return (
    <View style={[styles.caja, { width: ancho, height: alto }]}>
      <Svg width={ancho} height={alto}>
        {celdas.map((c) => (
          <Polygon
            key={c.id}
            points={c.poligono.map((p) => `${toPx(p.x, p.y).left},${toPx(p.x, p.y).top}`).join(" ")}
            fill={nivelColores[c.nivel]}
            stroke={colors.surface}
            strokeWidth={0.5}
          />
        ))}

        {perimetroPx.map((a, i) => {
          const b = perimetroPx[(i + 1) % perimetroPx.length];
          return (
            <Line
              key={`lado-${i}`}
              x1={a.left}
              y1={a.top}
              x2={b.left}
              y2={b.top}
              stroke={colors.primaryDark}
              strokeWidth={2}
            />
          );
        })}

        {/* escala gráfica proporcional real, igual que el prototipo */}
        <Line
          x1={barraX}
          y1={barraY}
          x2={barraX + escalaBarra.px}
          y2={barraY}
          stroke={colors.text}
          strokeWidth={2}
        />
        <Line x1={barraX} y1={barraY - 4} x2={barraX} y2={barraY + 4} stroke={colors.text} strokeWidth={2} />
        <Line
          x1={barraX + escalaBarra.px}
          y1={barraY - 4}
          x2={barraX + escalaBarra.px}
          y2={barraY + 4}
          stroke={colors.text}
          strokeWidth={2}
        />
        <TextoSvg x={barraX + escalaBarra.px / 2} y={barraY - 8} fontSize={10} fill={colors.text} textAnchor="middle">
          {escalaBarra.metros} m
        </TextoSvg>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
