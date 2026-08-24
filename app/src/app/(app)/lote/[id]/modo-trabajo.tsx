import { useEffect, useMemo } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useKeepAwake } from "expo-keep-awake";

import { colors } from "@/theme/colors";
import { useDatosCampo } from "@/features/campo/usar-datos-campo";
import { MapaCampo, type PuntoMapa } from "@/features/campo/mapa-campo";
import { GpsEstadoPill } from "@/features/campo/gps-estado-pill";

/** Modo trabajo — portado de UbicacionView del prototipo en su modo
 * pantalla completa: la cámara te sigue caminando, letras y puntos más
 * grandes (pensado para leerse al sol), y acá sí se puede cargar
 * cualquier rol, siempre que el punto sea el más cercano y estés en rango. */
export default function ModoTrabajoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const { cargando, lote, puntos, cargas, gps, puntoCercano, enRango } = useDatosCampo(id);

  useKeepAwake(); // la pantalla no se apaga mientras estás caminando el lote

  const puntosMapa: PuntoMapa[] = useMemo(
    () =>
      puntos.map((p) => ({
        id: `${p.linea}.${p.puntoNum}`,
        x: p.x,
        y: p.y,
        confirmado: cargas.get(p.id)?.confirmado ?? false,
      })),
    [puntos, cargas]
  );

  if (cargando || !lote) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.surface} size="large" />
      </View>
    );
  }

  const etiquetaCercano = puntoCercano ? `${puntoCercano.punto.linea}.${puntoCercano.punto.puntoNum}` : null;

  return (
    <View style={styles.container}>
      <MapaCampo
        puntos={puntosMapa}
        perimetro={lote.perimetro}
        miPos={gps.posicion}
        puntoCercanoId={etiquetaCercano}
        enRango={enRango}
        heading={gps.heading}
        pantallaCompleta
        puedeTocarPuntos
        onTapPunto={(pid) => router.push(`/(app)/lote/${lote.id}/punto/${pid}`)}
        ancho={width}
        alto={height}
      />

      <Pressable style={styles.volver} onPress={() => router.back()}>
        <ChevronLeft size={22} color={colors.text} />
      </Pressable>

      <View style={styles.pillTop}>
        <GpsEstadoPill estado={gps.estado} />
      </View>

      {puntoCercano && (
        <View style={[styles.tarjetaDistancia, { borderColor: enRango ? colors.primary : colors.warning }]}>
          <View>
            <Text style={styles.tarjetaPunto}>Punto {etiquetaCercano}</Text>
            <Text style={[styles.tarjetaEstado, { color: enRango ? colors.primary : colors.warning }]}>
              {enRango ? "En rango — podés muestrear" : "Acercate al punto"}
            </Text>
          </View>
          <Text style={styles.tarjetaDistanciaValor}>{puntoCercano.distancia.toFixed(1)} m</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryDark },
  container: { flex: 1, backgroundColor: colors.primaryDark },
  volver: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pillTop: { position: "absolute", top: 58, right: 16 },
  tarjetaDistancia: {
    position: "absolute",
    bottom: 28,
    left: 16,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tarjetaPunto: { fontSize: 15, fontWeight: "800", color: colors.text },
  tarjetaEstado: { fontSize: 12, fontWeight: "700", marginTop: 1 },
  tarjetaDistanciaValor: { fontSize: 20, fontWeight: "800", color: colors.text },
});
