import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/theme/colors";

/** Esperar esto DESPUÉS de cerrar el modal (poner `visible={false}`) y ANTES
 * de disparar algo que abra su propia ventana nativa (la hoja de compartir,
 * un selector de archivos, etc.) — en iOS, presentar una encima de la otra
 * sin esta pausa hace que la segunda no llegue a aparecer, sin tirar ningún
 * error (choque de animaciones de UIKit). Quien use `onConfirmar` para
 * disparar algo así tiene que awaitear esto primero. */
export function esperarCierreModal(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

export interface PromptField {
  key: string;
  label: string;
  placeholder?: string;
  valorInicial?: string;
  autoCapitalize?: "sentences" | "words" | "none";
}

interface PromptModalProps {
  visible: boolean;
  titulo: string;
  fields: PromptField[];
  textoConfirmar?: string;
  onCancelar: () => void;
  onConfirmar: (valores: Record<string, string>) => void;
}

/** Modal chico genérico para "nombre de X" / "editar nombre de X" — evita
 * repetir el mismo TextInput + Cancelar/Guardar en cada formulario del
 * árbol de lotes. */
export function PromptModal({ visible, titulo, fields, textoConfirmar = "Guardar", onCancelar, onConfirmar }: PromptModalProps) {
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      const iniciales: Record<string, string> = {};
      fields.forEach((f) => (iniciales[f.key] = f.valorInicial ?? ""));
      setValores(iniciales);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function confirmar() {
    const primerCampoVacio = fields[0] && !valores[fields[0].key]?.trim();
    if (primerCampoVacio) return;
    onConfirmar(valores);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>{titulo}</Text>
          {fields.map((f) => (
            <View key={f.key} style={styles.campo}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                placeholder={f.placeholder}
                placeholderTextColor={colors.textMuted}
                autoCapitalize={f.autoCapitalize ?? "sentences"}
                value={valores[f.key] ?? ""}
                onChangeText={(t) => setValores((v) => ({ ...v, [f.key]: t }))}
                autoFocus={f === fields[0]}
              />
            </View>
          ))}
          <View style={styles.botones}>
            <Pressable style={[styles.boton, styles.botonCancelar]} onPress={onCancelar}>
              <Text style={styles.botonCancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.boton, styles.botonConfirmar]} onPress={confirmar}>
              <Text style={styles.botonConfirmarTexto}>{textoConfirmar}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(27,46,31,0.45)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, gap: 12 },
  titulo: { fontSize: 16, fontWeight: "700", color: colors.text },
  campo: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  botones: { flexDirection: "row", gap: 10, marginTop: 8 },
  boton: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
  botonCancelar: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  botonCancelarTexto: { color: colors.textMuted, fontWeight: "600" },
  botonConfirmar: { backgroundColor: colors.primaryConfirm },
  botonConfirmarTexto: { color: colors.surface, fontWeight: "700" },
});
