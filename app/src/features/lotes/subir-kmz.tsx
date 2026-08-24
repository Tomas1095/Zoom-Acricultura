import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Upload } from "lucide-react-native";

import { generarGrillaDesdePerimetro } from "@/lib/geo/geometria";
import { elegirArchivoKmz, extraerPerimetroDeArchivo } from "@/lib/kmz/parsear-kmz";
import { guardarGrillaGenerada } from "@/lib/db/kmz";
import { colors } from "@/theme/colors";

interface SubirKmzProps {
  loteId: string;
  onListo: () => void;
}

/** Sube el KMZ de un lote y genera su grilla real de muestreo — reemplaza
 * los datos hardcodeados del prototipo (ver reference/CONTEXTO.md,
 * "Procesamiento del KMZ"). Solo lo usan administradores. */
export function SubirKmz({ loteId, onListo }: SubirKmzProps) {
  const [haPorPunto, setHaPorPunto] = useState("1.5");
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState("");

  async function subir() {
    const ha = Number(haPorPunto.replace(",", "."));
    if (!Number.isFinite(ha) || ha <= 0) {
      Alert.alert("Valor inválido", "Ingresá un número mayor a 0 para hectáreas por punto.");
      return;
    }

    setProcesando(true);
    try {
      setPaso("Abriendo selector de archivos…");
      const archivo = await elegirArchivoKmz();
      if (!archivo) {
        setProcesando(false);
        return;
      }

      setPaso("Leyendo el KMZ…");
      const perimetro = await extraerPerimetroDeArchivo(archivo);

      setPaso("Generando la grilla de muestreo…");
      const grilla = generarGrillaDesdePerimetro(perimetro, ha);

      setPaso("Guardando…");
      await guardarGrillaGenerada(loteId, grilla, ha);

      onListo();
    } catch (e: any) {
      Alert.alert("No se pudo procesar el KMZ", e.message ?? String(e));
    } finally {
      setProcesando(false);
      setPaso("");
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Este lote todavía no tiene grilla</Text>
      <Text style={styles.texto}>
        Subí el KMZ del lote para generar la grilla de puntos de muestreo sobre el perímetro real.
      </Text>

      <Text style={styles.label}>Hectáreas por punto</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={haPorPunto}
        onChangeText={setHaPorPunto}
        editable={!procesando}
      />

      <Pressable style={[styles.boton, procesando && styles.botonDeshabilitado]} onPress={subir} disabled={procesando}>
        {procesando ? (
          <>
            <ActivityIndicator color={colors.surface} size="small" />
            <Text style={styles.botonTexto}>{paso}</Text>
          </>
        ) : (
          <>
            <Upload size={16} color={colors.surface} />
            <Text style={styles.botonTexto}>Subir KMZ</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
    marginTop: 16,
  },
  titulo: { fontSize: 15, fontWeight: "700", color: colors.text },
  texto: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.text,
  },
  boton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  botonDeshabilitado: { opacity: 0.7 },
  botonTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
});
