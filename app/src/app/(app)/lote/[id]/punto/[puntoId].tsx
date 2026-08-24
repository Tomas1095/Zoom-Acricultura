import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme/colors";

/** Stub — acá va la carga real de datos del punto (PointSheet del
 * prototipo: bicho, babosa, humedad, fotos, observaciones, confirmar) con
 * su cola offline. Próximo paso de la migración. */
export default function PuntoScreen() {
  const { puntoId } = useLocalSearchParams<{ puntoId: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Punto {puntoId}</Text>
      <Text style={styles.aviso}>
        Acá va el formulario de carga (cantidad de bichos/babosas, humedad, fotos, observaciones) con
        cola offline — próximo paso de la migración.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 8 },
  titulo: { fontSize: 20, fontWeight: "800", color: colors.text },
  aviso: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
