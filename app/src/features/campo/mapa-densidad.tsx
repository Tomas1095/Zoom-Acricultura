import { useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import Svg, { Line, Polygon } from "react-native-svg";

import {
  calcularCeldasDensidad,
  elegirEscalaBarra,
  graduarEscalaBarra,
  ROSA_VIENTOS_KITES,
  type RangoDensidad,
} from "@/lib/geo/densidad";
import type { LatLon, XY } from "@/lib/geo/geometria";
import { construirUrlSatelital } from "@/lib/geo/satelital";
import { colors } from "@/theme/colors";

const PAD = 18;
const ESCALA_MAX = 3.2;
// Tamaño (en px) del cuadrado donde entra la rosa de los vientos —
// el viewBox de ROSA_VIENTOS_KITES es 36×36, ver lib/geo/densidad.ts. Chico
// a propósito: el mapa del informe (en pantalla) mide apenas ~220px de
// ancho, no puede comerse medio título.
const TAMANO_ROSA = 24;

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
 * Título, rosa de los vientos, leyenda, escala y atribución van TODOS
 * adentro del rectángulo del mapa (superpuestos a la foto) — como pidió el
 * usuario, mostrando un mapa real armado así (título arriba, rosa de los
 * vientos arriba a la derecha, leyenda abajo a la izquierda, escala
 * graduada abajo a la derecha — mismo estilo que los informes reales,
 * hechos en ArcGIS). Por eso ya no trae fondo/borde propio: el mapa en sí
 * ES el recuadro completo, ResultadosView/SalidasView solo le dan el
 * tamaño. */
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
  const escalaGraduada = useMemo(
    () => graduarEscalaBarra(escalaBarra.metros, escalaBarra.px),
    [escalaBarra.metros, escalaBarra.px]
  );
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

      {/* Título — arriba, centrado (con lugar reservado a la derecha para
          la rosa de los vientos, así no se solapan) */}
      <Text style={[estTitulo, { color: colorTexto }, sombraTexto]} numberOfLines={1}>
        Mapa de densidad poblacional
      </Text>

      {/* Rosa de los vientos — arriba a la derecha, como en los informes
          reales (4 picos blanco/negro alternados + N/E/S/O) en vez de una
          simple flecha */}
      <View style={estRosaWrap} pointerEvents="none">
        <Svg
          width={TAMANO_ROSA}
          height={TAMANO_ROSA}
          viewBox="0 0 36 36"
          style={{ position: "absolute", top: ROSA_MARGEN, left: ROSA_MARGEN }}
        >

          {ROSA_VIENTOS_KITES.map((k, i) => (
            <Polygon
              key={i}
              points={k.puntos.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={k.color}
              stroke="#000000"
              strokeWidth={0.6}
            />
          ))}
        </Svg>
        <Text style={[estRosaN, { color: colorTexto }, sombraTexto]}>N</Text>
        <Text style={[estRosaS, { color: colorTexto }, sombraTexto]}>S</Text>
        <Text style={[estRosaE, { color: colorTexto }, sombraTexto]}>E</Text>
        <Text style={[estRosaO, { color: colorTexto }, sombraTexto]}>O</Text>
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

      {/* Escala — abajo a la derecha, regla graduada (primer cuarto
          subdividido en octavos, como en los informes reales) adentro del
          rectángulo */}
      <View style={[estEscalaWrap, { right: 10, width: escalaGraduada.anchoTotalPx }]} pointerEvents="none">
        <View style={estEscalaBarraFila}>
          {escalaGraduada.segmentos.map((s, i) => (
            <View
              key={i}
              style={{ width: s.anchoPx, height: 6, backgroundColor: s.color, borderWidth: 0.5, borderColor: "#000000" }}
            />
          ))}
        </View>
        <View style={{ width: escalaGraduada.anchoTotalPx, height: 10 }}>
          {escalaGraduada.etiquetas.map((e, i) => (
            <Text
              key={i}
              style={[
                estEscalaTexto,
                { color: colorTexto, position: "absolute", left: e.posicionPx, transform: [{ translateX: -8 }] },
                sombraTexto,
              ]}
            >
              {e.texto}
            </Text>
          ))}
        </View>
      </View>

      {/* Atribución — obligatoria al usar imágenes de Esri */}
      {mostrandoSatelital && (
        <Text style={[estAtribucion, sombraTexto]} numberOfLines={1}>
          Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community
        </Text>
      )}
    </View>
  );
}

// Espacio, adentro de estRosaWrap, reservado para las letras N/S/E/O
// alrededor del dibujo de la rosa de los vientos.
const ROSA_MARGEN = 7;
const ROSA_CAJA = TAMANO_ROSA + ROSA_MARGEN * 2;

const estTitulo = {
  position: "absolute" as const,
  top: 8,
  left: 8,
  right: ROSA_CAJA + 10,
  fontSize: 13,
  fontWeight: "800" as const,
  fontStyle: "italic" as const,
  textAlign: "center" as const,
};
const estRosaWrap = { position: "absolute" as const, top: 4, right: 4, width: ROSA_CAJA, height: ROSA_CAJA };
const estRosaLetra = { position: "absolute" as const, fontSize: 7, fontWeight: "800" as const };
const estRosaN = { ...estRosaLetra, top: 0, left: 0, right: 0, textAlign: "center" as const };
const estRosaS = { ...estRosaLetra, bottom: 0, left: 0, right: 0, textAlign: "center" as const };
const estRosaE = { ...estRosaLetra, top: ROSA_CAJA / 2 - 6, right: 0 };
const estRosaO = { ...estRosaLetra, top: ROSA_CAJA / 2 - 6, left: 0 };
const estLeyenda = { position: "absolute" as const, bottom: 8, left: 8, gap: 2, maxWidth: "55%" as const };
const estLeyendaTitulo = { fontSize: 10, fontWeight: "800" as const, marginBottom: 2 };
const estLeyendaFila = { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 };
const estLeyendaMuestra = { width: 9, height: 9, borderRadius: 2, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.3)" };
const estLeyendaTexto = { fontSize: 9 };
const estEscalaWrap = { position: "absolute" as const, bottom: 22, alignItems: "flex-start" as const };
const estEscalaBarraFila = { flexDirection: "row" as const };
const estEscalaTexto = { fontSize: 7.5, fontWeight: "700" as const };
const estAtribucion = {
  position: "absolute" as const,
  bottom: 2,
  right: 8,
  fontSize: 7,
  color: "#FFFFFF",
};
