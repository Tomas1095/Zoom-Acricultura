import { useMemo, useState } from "react";
import { Image, View } from "react-native";
import Svg, { Line, Polygon, Text as TextoSvg } from "react-native-svg";

import { calcularCeldasDensidad, elegirEscalaBarra, type RangoDensidad } from "@/lib/geo/densidad";
import type { LatLon, XY } from "@/lib/geo/geometria";
import { construirUrlSatelital } from "@/lib/geo/satelital";
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
  /** Para pedir la imagen satelital de fondo (necesita el origen real del
   * lote en lat/lon — ver `inferirOrigenDesdePuntos`). Sin esto, o si la
   * imagen falla (sin señal, servicio caído), el mapa se ve igual que
   * antes, sobre el fondo claro liso. */
  origen?: LatLon | null;
}

/** Mapa de densidad — portado de la parte SVG de `DensidadView` del
 * prototipo, con la imagen satelital de fondo (Esri World Imagery,
 * gratuita — ver `lib/geo/satelital.ts`). A diferencia de `MapaCampo` en
 * modo trabajo, esta vista nunca rota ni escala con gestos — es una foto
 * fija — así que las celdas del Voronoi se dibujan con `<Polygon>` de
 * react-native-svg sin problema (el bug de renderizado que encontramos era
 * específico de transforms de rotación grandes de Reanimated, que acá no
 * existen).
 *
 * Sin fondo/borde propio a propósito — el marco lo pone quien lo use (ver
 * ResultadosView), así el mapa y la leyenda comparten un mismo recuadro en
 * vez de quedar cada uno en su caja. */
export function MapaDensidad({ puntos, perimetro, rangos, nivelColores, ancho, alto, origen }: MapaDensidadProps) {
  const [satelitalOk, setSatelitalOk] = useState(true);

  const { toPx, escala, minX, minY } = useMemo(() => {
    const todasX = puntos.map((p) => p.x).concat(perimetro.map((v) => v.x));
    const todasY = puntos.map((p) => p.y).concat(perimetro.map((v) => v.y));
    const minX = todasX.length > 0 ? Math.min(...todasX) : 0;
    const minY = todasY.length > 0 ? Math.min(...todasY) : 0;
    const spanX = Math.max(1, (todasX.length > 0 ? Math.max(...todasX) : 0) - minX);
    const spanY = Math.max(1, (todasY.length > 0 ? Math.max(...todasY) : 0) - minY);
    const escala = Math.min((ancho - PAD * 2) / spanX, (alto - PAD * 2) / spanY, ESCALA_MAX);
    return {
      escala,
      minX,
      minY,
      toPx: (x: number, y: number) => ({ left: PAD + (x - minX) * escala, top: PAD + (y - minY) * escala }),
    };
  }, [puntos, perimetro, ancho, alto]);

  const satUrl = origen ? construirUrlSatelital(origen, minX, minY, escala, ancho, alto, PAD, PAD) : null;

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
  // Con la foto satelital de fondo el perímetro/escala se leen mejor en
  // blanco (como en el prototipo) — sobre el fondo claro liso, mejor
  // mantener los colores oscuros de siempre.
  const mostrandoSatelital = !!satUrl && satelitalOk;
  const colorPerimetro = mostrandoSatelital ? "#FFFFFF" : colors.primaryDark;
  const colorEscala = mostrandoSatelital ? "#FFFFFF" : colors.text;

  return (
    <View style={{ width: ancho, height: alto }}>
      {satUrl && satelitalOk && (
        <Image
          source={{ uri: satUrl }}
          resizeMode="stretch"
          style={{ position: "absolute", top: 0, left: 0, width: ancho, height: alto }}
          onError={() => setSatelitalOk(false)}
        />
      )}
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

        {perimetroPx.map((a, i) => {
          const b = perimetroPx[(i + 1) % perimetroPx.length];
          return (
            <Line
              key={`lado-${i}`}
              x1={a.left}
              y1={a.top}
              x2={b.left}
              y2={b.top}
              stroke={colorPerimetro}
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
          stroke={colorEscala}
          strokeWidth={2}
        />
        <Line x1={barraX} y1={barraY - 4} x2={barraX} y2={barraY + 4} stroke={colorEscala} strokeWidth={2} />
        <Line
          x1={barraX + escalaBarra.px}
          y1={barraY - 4}
          x2={barraX + escalaBarra.px}
          y2={barraY + 4}
          stroke={colorEscala}
          strokeWidth={2}
        />
        <TextoSvg x={barraX + escalaBarra.px / 2} y={barraY - 8} fontSize={10} fill={colorEscala} textAnchor="middle">
          {escalaBarra.metros} m
        </TextoSvg>
      </Svg>
    </View>
  );
}
