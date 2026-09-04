import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Upload } from "lucide-react-native";

import { generarGrillaDesdePerimetro, type LatLon } from "@/lib/geo/geometria";
import { elegirArchivoKmz, extraerPerimetroDeArchivo } from "@/lib/kmz/parsear-kmz";
import { guardarGrillaGenerada } from "@/lib/db/kmz";
import { colors } from "@/theme/colors";
import { OrientacionGrilla } from "./orientacion-grilla";

interface SubirKmzProps {
  loteId: string;
  onListo: () => void;
}

/** Sube el KMZ de un lote y genera su grilla real de muestreo — reemplaza
 * los datos hardcodeados del prototipo (ver reference/CONTEXTO.md,
 * "Procesamiento del KMZ"). Solo lo usan administradores.
 *
 * Después de leer el KMZ, antes de guardar nada, se abre "Orientación de
 * la grilla" (ver orientacion-grilla.tsx) — a pedido del usuario, para
 * poder ajustar a mano el ángulo de las filas de muestreo si el
 * automático no le sirve. Recién al confirmar ahí se genera la grilla
 * DEFINITIVA (con el ángulo elegido) y se guarda — es la única vez que se
 * puede elegir: una vez creado el lote, la orientación queda fija. */
export function SubirKmz({ loteId, onListo }: SubirKmzProps) {
  const [haPorPunto, setHaPorPunto] = useState("1.5");
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState("");
  // Perímetro ya leído del KMZ, esperando que la persona confirme la
  // orientación — null significa "sin nada pendiente", muestra el
  // formulario de siempre en vez del modal de orientación.
  const [pendiente, setPendiente] = useState<{ perimetro: LatLon[][]; ha: number } | null>(null);

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
      setPendiente({ perimetro, ha });
    } catch (e: any) {
      Alert.alert("No se pudo procesar el KMZ", e.message ?? String(e));
    } finally {
      setProcesando(false);
      setPaso("");
    }
  }

  async function confirmarOrientacion(anguloGrados: number) {
    if (!pendiente) return;
    const { perimetro, ha } = pendiente;
    setPendiente(null);
    setProcesando(true);
    setPaso("Generando la grilla de muestreo…");
    try {
      const grilla = generarGrillaDesdePerimetro(perimetro, ha, anguloGrados);
      setPaso("Guardando…");
      await guardarGrillaGenerada(loteId, grilla, ha);
      onListo();
    } catch (e: any) {
      Alert.alert("No se pudo generar la grilla", e.message ?? String(e));
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

      {/* Montado solo mientras hay algo pendiente (no con visible=false
          permanente) — a propósito: así cada KMZ nuevo arranca con una
          instancia nueva de OrientacionGrilla, con su propio estado del
          ángulo desde cero, en vez de arrastrar el ángulo que se haya
          dejado tocado en una subida anterior de esta misma sesión. */}
      {pendiente && (
        <OrientacionGrilla
          visible
          perimetro={pendiente.perimetro}
          haPorPunto={pendiente.ha}
          onConfirmar={confirmarOrientacion}
          onCancelar={() => setPendiente(null)}
        />
      )}
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
