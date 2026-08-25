import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes } from "@/lib/roles";
import { colors } from "@/theme/colors";
import { useDatosCampo } from "@/features/campo/usar-datos-campo";
import { MapaDensidad, type PuntoDensidad } from "@/features/campo/mapa-densidad";
import { NIVEL_COLORES, rangosDe, type Plaga } from "@/lib/geo/densidad";

const ALTO_MAPA = 420;

/** Mapa de densidad poblacional — portado de la pestaña "Resultados" /
 * `DensidadView` del prototipo. Sin imagen satelital (ver nota en
 * `lib/geo/densidad.ts`); el fondo es el mismo estilo claro del resto de la
 * app. Igual que en el prototipo, el Monitoreador no tiene acceso — ahí era
 * la pestaña "Resultados", oculta para ese rol (ver prototipo, comentario
 * "el monitoreador no ve Resultados/Salidas"). */
export default function DensidadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { usuario } = useAuth();
  const { cargando, lote, puntos, cargas } = useDatosCampo(id);
  const { width } = useWindowDimensions();
  const [plaga, setPlaga] = useState<Plaga>("bicho");

  const anchoMapa = Math.min(width - 32, 400);
  const rangos = rangosDe(plaga);
  const etiqueta = plaga === "bicho" ? "Nº BB/m²" : "Nº Babosas/m²";

  const puntosDensidad: PuntoDensidad[] = useMemo(
    () =>
      puntos.map((p) => ({
        id: `${p.linea}.${p.puntoNum}`,
        x: p.x,
        y: p.y,
        valor: (cargas.get(p.id)?.[plaga] ?? 0) * 4, // se carga por cuadrante de 1/4 m²
      })),
    [puntos, cargas, plaga]
  );

  const cargados = puntos.filter((p) => cargas.get(p.id)?.cargado).length;

  if (cargando || !lote) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!usuario || !puedeAdministrarLotes(usuario.rol)) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.aviso}>Esta vista no está disponible para tu rol.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.plagaToggle}>
        <Text
          onPress={() => setPlaga("bicho")}
          style={[styles.plagaBoton, plaga === "bicho" && styles.plagaBotonActivo]}
        >
          Bichos bolita
        </Text>
        <Text
          onPress={() => setPlaga("babosa")}
          style={[styles.plagaBoton, plaga === "babosa" && styles.plagaBotonActivo]}
        >
          Babosas
        </Text>
      </View>

      <Text style={styles.titulo}>Mapa de densidad poblacional</Text>

      <View style={styles.filaMapa}>
        <View style={styles.leyenda}>
          <Text style={styles.leyendaTitulo}>{etiqueta}</Text>
          {rangos.map((r, i) => (
            <View key={i} style={styles.leyendaFila}>
              <View style={[styles.leyendaMuestra, { backgroundColor: NIVEL_COLORES[i] }]} />
              <Text style={styles.leyendaTexto}>{r.label}</Text>
            </View>
          ))}
        </View>

        <MapaDensidad
          puntos={puntosDensidad}
          perimetro={lote.perimetro}
          rangos={rangos}
          nivelColores={NIVEL_COLORES}
          ancho={anchoMapa}
          alto={ALTO_MAPA}
        />
      </View>

      <Text style={styles.pie}>
        {cargados}/{puntos.length} puntos cargados — valores llevados a m² (× 4 sobre el dato cargado a campo,
        tomado en 1/4 m²)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  aviso: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
  container: { padding: 16, gap: 12, alignItems: "center", backgroundColor: colors.background },
  plagaToggle: { flexDirection: "row", gap: 8 },
  plagaBoton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    overflow: "hidden",
  },
  plagaBotonActivo: {
    backgroundColor: colors.primaryConfirm,
    borderColor: colors.primaryConfirm,
    color: colors.surface,
  },
  titulo: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  filaMapa: { width: "100%", alignItems: "center", gap: 10 },
  leyenda: { width: "100%", maxWidth: 400, gap: 3 },
  leyendaTitulo: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 2 },
  leyendaFila: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaMuestra: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  leyendaTexto: { fontSize: 12, color: colors.text },
  pie: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
});
