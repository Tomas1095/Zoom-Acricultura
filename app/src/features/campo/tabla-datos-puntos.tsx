import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { Carga, Punto } from "@/types/domain";
import { colors } from "@/theme/colors";

interface TablaDatosPuntosProps {
  puntos: Punto[];
  cargas: Map<string, Carga>;
}

const ANCHO_PUNTO = 56;
const ANCHO_NUM = 92;
const ANCHO_BOOL = 100;

const COLUMNAS = [
  { key: "bicho", etiqueta: "Bichos bolita /m²", ancho: ANCHO_NUM },
  { key: "babosa", etiqueta: "Babosas /m²", ancho: ANCHO_NUM },
  { key: "huevoBabosas", etiqueta: "Huevo babosas", ancho: ANCHO_BOOL },
  { key: "gusanoArroz", etiqueta: "Gusano de arroz", ancho: ANCHO_BOOL },
  { key: "isocaCortadora", etiqueta: "Isoca cortadora", ancho: ANCHO_BOOL },
  { key: "gusanoBlanco", etiqueta: "Gusano blanco", ancho: ANCHO_BOOL },
] as const;

/** Tabla "Datos" — portada tal cual de `TablaDatosPuntos` del prototipo: un
 * resumen de todos los puntos de muestreo, útil para ver todo junto en vez
 * de entrar mapa por mapa. Scrollea (horizontal por las columnas, vertical
 * por la cantidad de puntos) — a diferencia de "Mapas", acá sí tiene
 * sentido: es una tabla, no un mapa que tiene que entrar fijo en pantalla. */
export function TablaDatosPuntos({ puntos, cargas }: TablaDatosPuntosProps) {
  const filas = [...puntos].sort((a, b) => a.linea - b.linea || a.puntoNum - b.puntoNum);
  const cargados = filas.filter((p) => cargas.get(p.id)?.cargado).length;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.fila, styles.filaHeader]}>
            <Text style={[styles.celda, styles.celdaHeader, { width: ANCHO_PUNTO }]}>Punto</Text>
            {COLUMNAS.map((col) => (
              <Text key={col.key} style={[styles.celda, styles.celdaHeader, { width: col.ancho }]}>
                {col.etiqueta}
              </Text>
            ))}
          </View>

          {filas.map((p) => {
            const c = cargas.get(p.id);
            return (
              <View key={p.id} style={styles.fila}>
                <Text style={[styles.celda, styles.celdaPunto, { width: ANCHO_PUNTO }]}>
                  {p.linea}.{p.puntoNum}
                </Text>
                <Text style={[styles.celda, { width: ANCHO_NUM }]}>{c?.cargado ? c.bicho * 4 : "—"}</Text>
                <Text style={[styles.celda, { width: ANCHO_NUM }]}>{c?.cargado ? c.babosa * 4 : "—"}</Text>
                <Text style={[styles.celda, { width: ANCHO_BOOL }]}>
                  {c?.cargado ? (c.huevoBabosas ? "Sí" : "No") : "—"}
                </Text>
                <Text style={[styles.celda, { width: ANCHO_BOOL }]}>
                  {c?.cargado ? (c.gusanoArroz ? "Sí" : "No") : "—"}
                </Text>
                <Text style={[styles.celda, { width: ANCHO_BOOL }]}>
                  {c?.cargado ? (c.isocaCortadora ? "Sí" : "No") : "—"}
                </Text>
                <Text style={[styles.celda, { width: ANCHO_BOOL }]}>
                  {c?.cargado ? (c.gusanoBlanco ? "Sí" : "No") : "—"}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Text style={styles.pie}>
        {cargados}/{filas.length} puntos cargados — valores de conteo llevados a m² (× 4 sobre el dato tomado en
        1/4 m²)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, paddingBottom: 4 },
  fila: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  filaHeader: { backgroundColor: colors.border, borderBottomColor: colors.borderStrong },
  celda: { paddingVertical: 9, paddingHorizontal: 8, fontSize: 12.5, color: colors.text, textAlign: "center" },
  celdaHeader: { fontWeight: "700", color: colors.accentGold, fontSize: 11 },
  celdaPunto: { fontWeight: "800", textAlign: "left" },
  pie: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
});
