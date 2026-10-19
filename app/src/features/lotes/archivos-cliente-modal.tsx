import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { File } from "expo-file-system";
import { FileSpreadsheet, Trash2, Upload } from "lucide-react-native";

import {
  eliminarArchivoCliente,
  fetchArchivosCliente,
  getArchivoClienteUrl,
  subirArchivoCliente,
} from "@/lib/db/archivos-cliente";
import type { ArchivoCliente } from "@/types/domain";
import { colors } from "@/theme/colors";
import { PromptModal } from "@/components/prompt-modal";

interface ArchivosClienteModalProps {
  clienteId: string;
  clienteNombre: string;
  onCerrar: () => void;
}

// Del `uri` del archivo elegido en el selector — solo para prellenar el
// nombre en el modal de confirmación (ver `pendiente`), la persona lo
// puede editar libre antes de subir. Android no siempre entrega el nombre
// real en la URL (a veces es un ID opaco de un content://), así que esto
// es un mejor esfuerzo, no una garantía — por eso el nombre siempre se
// confirma a mano antes de subir, nunca se sube directo sin preguntar.
function nombreDesdeUri(uri: string): string {
  const sinQuery = uri.split("?")[0];
  const ultimo = sinQuery.split("/").pop() ?? "archivo";
  try {
    return decodeURIComponent(ultimo);
  } catch {
    return ultimo;
  }
}

/** Archivos sueltos subidos a mano para un cliente — a pedido del usuario,
 * para el Excel "resumen de aplicación de cebo" que arma en su computadora
 * y entrega a cada cliente. Abierto desde el ícono de información al lado
 * de cada cliente en ArbolLotes. A diferencia de InformesEstablecimientoModal,
 * acá SÍ se puede subir y borrar (pedido explícito del usuario). */
export function ArchivosClienteModal({ clienteId, clienteNombre, onCerrar }: ArchivosClienteModalProps) {
  const [cargando, setCargando] = useState(true);
  const [archivos, setArchivos] = useState<ArchivoCliente[]>([]);
  const [abriendoId, setAbriendoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  // Archivo ya elegido del selector del sistema, esperando que la persona
  // confirme/edite el nombre antes de subirlo de verdad — null significa
  // "nada pendiente", ver PromptModal más abajo.
  const [pendiente, setPendiente] = useState<File | null>(null);

  async function cargar() {
    try {
      setArchivos(await fetchArchivosCliente(clienteId));
    } catch (e: any) {
      Alert.alert("No se pudieron cargar los archivos", e.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function elegirArchivo() {
    try {
      // Sin mimeType (undefined) a propósito — mismo motivo que el
      // selector de KMZ (ver parsear-kmz.ts): filtrar por un mimeType
      // puntual puede hacer que iOS esconda justo el archivo que se
      // busca si su tipo no calza exacto. Cualquier archivo sirve acá,
      // es solo un adjunto que la app ni abre ni interpreta.
      const resultado = (await File.pickFileAsync()) as unknown as File | File[] | null;
      if (!resultado) return;
      const archivo = Array.isArray(resultado) ? resultado[0] : resultado;
      if (archivo) setPendiente(archivo);
    } catch {
      // Cancelado — algunos dispositivos rechazan la promesa en vez de
      // devolver null, se trata igual, no es un error real.
    }
  }

  async function confirmarSubida(valores: Record<string, string>) {
    if (!pendiente) return;
    setSubiendo(true);
    try {
      await subirArchivoCliente(clienteId, pendiente, valores.nombre);
      setPendiente(null);
      await cargar();
    } catch (e: any) {
      Alert.alert("No se pudo subir el archivo", e.message ?? String(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function abrir(archivo: ArchivoCliente) {
    setAbriendoId(archivo.id);
    try {
      const url = await getArchivoClienteUrl(archivo.storagePath);
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert("No se pudo abrir el archivo", e.message ?? String(e));
    } finally {
      setAbriendoId(null);
    }
  }

  function pedirBorrar(archivo: ArchivoCliente) {
    Alert.alert("¿Borrar este archivo?", `Se va a eliminar "${archivo.nombreArchivo}". No se puede deshacer.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          setEliminandoId(archivo.id);
          try {
            await eliminarArchivoCliente(archivo.id, archivo.storagePath);
            setArchivos((prev) => prev.filter((a) => a.id !== archivo.id));
          } catch (e: any) {
            Alert.alert("No se pudo borrar el archivo", e.message ?? String(e));
          } finally {
            setEliminandoId(null);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Archivos de "{clienteNombre}"</Text>
          <Text style={styles.subtitulo}>Excel de resumen de aplicación de cebo y otros adjuntos</Text>

          {cargando ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : archivos.length === 0 ? (
            <Text style={styles.vacio}>Todavía no se subió ningún archivo acá.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              {archivos.map((archivo) => (
                <View key={archivo.id} style={styles.fila}>
                  <Pressable style={styles.filaBoton} onPress={() => abrir(archivo)} disabled={abriendoId !== null}>
                    {abriendoId === archivo.id ? (
                      <ActivityIndicator size="small" color={colors.primaryDark} />
                    ) : (
                      <FileSpreadsheet size={16} color={colors.primaryDark} />
                    )}
                    <Text style={styles.nombreArchivo} numberOfLines={2}>
                      {archivo.nombreArchivo}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.borrarBtn}
                    onPress={() => pedirBorrar(archivo)}
                    disabled={eliminandoId !== null}
                  >
                    {eliminandoId === archivo.id ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Trash2 size={15} color={colors.danger} />
                    )}
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable style={styles.subirBtn} onPress={elegirArchivo} disabled={subiendo}>
            <Upload size={14} color={colors.surface} />
            <Text style={styles.subirTexto}>Subir archivo</Text>
          </Pressable>

          <Pressable style={styles.cerrarBtn} onPress={onCerrar}>
            <Text style={styles.cerrarTexto}>Listo</Text>
          </Pressable>
        </View>
      </View>

      <PromptModal
        visible={pendiente !== null}
        titulo="Nombre del archivo"
        fields={pendiente ? [{ key: "nombre", label: "Nombre", valorInicial: nombreDesdeUri(pendiente.uri) }] : []}
        textoConfirmar="Subir"
        confirmando={subiendo}
        onCancelar={() => setPendiente(null)}
        onConfirmar={confirmarSubida}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(27,46,31,0.45)", justifyContent: "flex-end" },
  card: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 4 },
  titulo: { fontSize: 16, fontWeight: "700", color: colors.text },
  subtitulo: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  vacio: { color: colors.textMuted, textAlign: "center", paddingVertical: 20 },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filaBoton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  nombreArchivo: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.text },
  borrarBtn: { padding: 8 },
  subirBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  subirTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
  cerrarBtn: { marginTop: 8, backgroundColor: colors.background, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cerrarTexto: { color: colors.text, fontWeight: "700" },
});
