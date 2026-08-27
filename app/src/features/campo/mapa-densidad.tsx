import { useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import Svg, { Line, Polygon } from "react-native-svg";
import { Navigation } from "lucide-react-native";

import { calcularCeldasDensidad, elegirEscalaBarra, type RangoDensidad } from "@/lib/geo/densidad";
import type { LatLon, XY } from "@/lib/geo/geometria";
import { construirUrlSatelital } from "@/lib/geo/satelital";
import { colors } from "@/theme/colors";

const PAD = 18;
const ESCALA_MAX = 3.2;
// Segmentos alternados de la barra de escala tipo regla — blanco y negro
// fijos (no según el tema/foto) porque es la convención cartográfica
// estándar, se lee igual de bien sobre cualquier foto.
const SEGMENTOS_ESCALA = 4;

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
  /** Encabezado de la leyenda ("Nº BB/m²" / "Nº Babosas/m²"). */
  etiquetaLeyenda: string;
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
 * Título, norte, leyenda, escala y atribución van TODOS adentro del
 * rectángulo del mapa (superpuestos a la foto) — como pidió el usuario,
 * mostrando un mapa real armado así (título arriba, norte arriba a la
 * derecha, leyenda abajo a la izquierda, escala abajo a la derecha). Por
 * eso ya no trae fondo/borde propio: el mapa en sí ES el recuadro
 * completo, ResultadosView/SalidasView solo le dan el tamaño. */
export function MapaDensidad({
  puntos,
  perimetro,
  rangos,
  nivelColores,
  etiquetaLeyenda,
  ancho,
  alto,
  origen,
}: MapaDensidadProps) {
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
  // Con la foto satelital de fondo, todo el texto/líneas superpuestas se
  // leen mejor en blanco con sombra (como en el prototipo/mapa real) —
  // sobre el fondo claro liso (sin foto), mejor mantener los colores
  // oscuros de siempre.
  const mostrandoSatelital = !!satUrl && satelitalOk;
  const colorPerimetro = mostrandoSatelital ? "#FFFFFF" : colors.primaryDark;
  const colorTexto = mostrandoSatelital ? "#FFFFFF" : colors.text;
  const sombraTexto = mostrandoSatelital
    ? { textShadowColor: "rgba(0,0,0,0.65)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
    : {};

  return (
    <View style={{ width: ancho, height: alto, overflow: "hidden" }}>
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
      </Svg>

      {/* Título — arriba, centrado */}
      <Text style={[estTitulo, { color: colorTexto }, sombraTexto]} numberOfLines={1}>
        Mapa de densidad poblacional
      </Text>

      {/* Norte — arriba a la derecha */}
      <View style={estNorte} pointerEvents="none">
        <Navigation size={14} color={colorTexto} />
        <Text style={[estNorteTexto, { color: colorTexto }, sombraTexto]}>N</Text>
      </View>

      {/* Leyenda — abajo a la izquierda, adentro del rectángulo */}
      <View style={estLeyenda} pointerEvents="none">
        <Text style={[estLeyendaTitulo, { color: colorTexto }, sombraTexto]}>{etiquetaLeyenda}</Text>
        {rangos.map((r, i) => (
          <View key={i} style={estLeyendaFila}>
            <View style={[estLeyendaMuestra, { backgroundColor: nivelColores[i] }]} />
            <Text style={[estLeyendaTexto, { color: colorTexto }, sombraTexto]}>{r.label}</Text>
          </View>
        ))}
      </View>

      {/* Escala — abajo a la derecha, tipo regla (segmentos blanco/negro
          alternados), adentro del rectángulo */}
      <View style={[estEscalaWrap, { right: 10 }]} pointerEvents="none">
        <View style={estEscalaBarraFila}>
          {Array.from({ length: SEGMENTOS_ESCALA }).map((_, i) => (
            <View
              key={i}
              style={{
                width: escalaBarra.px / SEGMENTOS_ESCALA,
                height: 6,
                backgroundColor: i % 2 === 0 ? "#000000" : "#FFFFFF",
                borderWidth: 0.5,
                borderColor: "#000000",
              }}
            />
          ))}
        </View>
        <View style={estEscalaEtiquetas}>
          <Text style={[estEscalaTexto, { color: colorTexto }, sombraTexto]}>0</Text>
          <Text style={[estEscalaTexto, { color: colorTexto }, sombraTexto]}>{escalaBarra.metros} m</Text>
        </View>
      </View>

      {/* Atribución — obligatoria al usar imágenes de Esri */}
      {mostrandoSatelital && (
        <Text style={[estAtribucion, sombraTexto]} numberOfLines={1}>
          Esri, Maxar, Earthstar Geographics
        </Text>
      )}
    </View>
  );
}

const estTitulo = {
  position: "absolute" as const,
  top: 8,
  left: 8,
  right: 8,
  fontSize: 13,
  fontWeight: "800" as const,
  fontStyle: "italic" as const,
  textAlign: "center" as const,
};
const estNorte = { position: "absolute" as const, top: 8, right: 8, alignItems: "center" as const };
const estNorteTexto = { fontSize: 9, fontWeight: "800" as const };
const estLeyenda = { position: "absolute" as const, bottom: 8, left: 8, gap: 2, maxWidth: "55%" as const };
const estLeyendaTitulo = { fontSize: 10, fontWeight: "800" as const, marginBottom: 2 };
const estLeyendaFila = { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 };
const estLeyendaMuestra = { width: 9, height: 9, borderRadius: 2, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.3)" };
const estLeyendaTexto = { fontSize: 9 };
const estEscalaWrap = { position: "absolute" as const, bottom: 22, alignItems: "center" as const };
const estEscalaBarraFila = { flexDirection: "row" as const };
const estEscalaEtiquetas = { flexDirection: "row" as const, justifyContent: "space-between" as const, width: "100%" as const, marginTop: 2 };
const estEscalaTexto = { fontSize: 8.5, fontWeight: "700" as const };
const estAtribucion = {
  position: "absolute" as const,
  bottom: 2,
  right: 8,
  fontSize: 7,
  color: "#FFFFFF",
};
