import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/theme/colors";

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
  /** Poner en `true` mientras `onConfirmar` está haciendo algo async que
   * abre su propia ventana nativa (compartir, un selector de archivos,
   * etc.) — deja el modal ABIERTO con un spinner en vez de cerrarlo al
   * toque. Esto importa en iOS: presentar la hoja de compartir mientras
   * este modal todavía está en pantalla (no cerrándose) es lo único que
   * anda confiable — cerrar este modal y, en el mismo instante, abrir la
   * hoja de compartir hace que la segunda no llegue a aparecer (choque de
   * animaciones de UIKit, sin ningún error visible). Quien use esto tiene
   * que recién poner `visible={false}` cuando `onConfirmar` ya terminó. */
  confirmando?: boolean;
  onCancelar: () => void;
  onConfirmar: (valores: Record<string, string>) => void;
}

/** Modal chico genérico para "nombre de X" / "editar nombre de X" — evita
 * repetir el mismo TextInput + Cancelar/Guardar en cada formulario del
 * árbol de lotes (y, con `confirmando`, en las exportaciones). */
export function PromptModal({
  visible,
  titulo,
  fields,
  textoConfirmar = "Guardar",
  confirmando = false,
  onCancelar,
  onConfirmar,
}: PromptModalProps) {
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      const iniciales: Record<string, string> = {};
      fields.forEach((f) => (iniciales[f.key] = f.valorInicial ?? ""));
      setValores(iniciales);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function confirmar() {
    if (confirmando) return;
    const primerCampoVacio = fields[0] && !valores[fields[0].key]?.trim();
    if (primerCampoVacio) return;
    onConfirmar(valores);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !confirmando && onCancelar()}>
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
                editable={!confirmando}
              />
            </View>
          ))}
          <View style={styles.botones}>
            <Pressable
              style={[styles.boton, styles.botonCancelar, confirmando && styles.botonDeshabilitado]}
              onPress={onCancelar}
              disabled={confirmando}
            >
              <Text style={styles.botonCancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.boton, styles.botonConfirmar]} onPress={confirmar} disabled={confirmando}>
              {confirmando ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Text style={styles.botonConfirmarTexto}>{textoConfirmar}</Text>
              )}
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
  botonDeshabilitado: { opacity: 0.5 },
  botonCancelar: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  botonCancelarTexto: { color: colors.textMuted, fontWeight: "600" },
  botonConfirmar: { backgroundColor: colors.primaryConfirm },
  botonConfirmarTexto: { color: colors.surface, fontWeight: "700" },
});
