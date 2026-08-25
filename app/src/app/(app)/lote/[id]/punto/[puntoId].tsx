import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Image,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, Lock, MapPin, Pencil, X } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { fetchLote } from "@/lib/db/lotes";
import { fetchPuntosDeLote } from "@/lib/db/puntos";
import { fetchCarga, guardarYConfirmarCarga, reabrirCarga, agregarFotoACarga, quitarFotoDeCarga } from "@/lib/db/cargas";
import { fetchUsuarios } from "@/lib/db/equipo";
import { subirFoto, getFotoUrl, eliminarFoto } from "@/lib/storage/fotos";
import { puedeAdministrarLotes } from "@/lib/roles";
import type { Carga, Lote, Punto, Usuario } from "@/types/domain";
import { colors } from "@/theme/colors";
import { ACCESORIO_TECLADO, NumberField, YesNoField } from "@/features/campo/campos-carga";

interface FormCarga {
  bicho: number;
  babosa: number;
  huevoBabosas: boolean;
  gusanoArroz: boolean;
  isocaCortadora: boolean;
  gusanoBlanco: boolean;
  observaciones: string;
}

const FORM_VACIO: FormCarga = {
  bicho: 0,
  babosa: 0,
  huevoBabosas: false,
  gusanoArroz: false,
  isocaCortadora: false,
  gusanoBlanco: false,
  observaciones: "",
};

/** Carga de datos de un punto — portado de PointSheet del prototipo. Los
 * campos se editan en memoria y se guardan todos juntos al confirmar (no
 * escritura por tecla, ver comentario en guardarYConfirmarCarga); las fotos
 * sí se suben al toque porque son una acción puntual, no texto en curso. */
export default function PuntoScreen() {
  const { id: loteId, puntoId: etiqueta } = useLocalSearchParams<{ id: string; puntoId: string }>();
  const { usuario } = useAuth();

  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);
  const [punto, setPunto] = useState<Punto | null>(null);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [usuarioQueCargo, setUsuarioQueCargo] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormCarga>(FORM_VACIO);
  const [mostrarObservaciones, setMostrarObservaciones] = useState(false);
  const [confirmoReapertura, setConfirmoReapertura] = useState(false);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const observacionesRef = useRef<TextInput>(null);

  const refrescar = useCallback(async () => {
    try {
      const [l, puntos, usuarios] = await Promise.all([fetchLote(loteId), fetchPuntosDeLote(loteId), fetchUsuarios()]);
      setLote(l);
      const [linea, puntoNum] = etiqueta.split(".").map(Number);
      const p = puntos.find((x) => x.linea === linea && x.puntoNum === puntoNum) ?? null;
      setPunto(p);
      if (l && p) {
        const c = await fetchCarga(p.id, l.campanaActual);
        setCarga(c);
        setForm(
          c
            ? {
                bicho: c.bicho,
                babosa: c.babosa,
                huevoBabosas: c.huevoBabosas,
                gusanoArroz: c.gusanoArroz,
                isocaCortadora: c.isocaCortadora,
                gusanoBlanco: c.gusanoBlanco,
                observaciones: c.observaciones,
              }
            : FORM_VACIO
        );
        setMostrarObservaciones(!!c?.observaciones);
        setUsuarioQueCargo(c?.cargadoPorId ? usuarios.find((u) => u.id === c.cargadoPorId) ?? null : null);
      }
    } catch (e: any) {
      Alert.alert("No se pudo cargar el punto", e.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }, [loteId, etiqueta]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  // URLs firmadas para mostrar las fotos ya subidas (el bucket es privado).
  useEffect(() => {
    if (!carga || carga.fotos.length === 0) return;
    carga.fotos.forEach((path) => {
      if (fotoUrls[path]) return;
      getFotoUrl(path)
        .then((url) => setFotoUrls((prev) => ({ ...prev, [path]: url })))
        .catch(() => {});
    });
  }, [carga, fotoUrls]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (!usuario || !lote || !punto) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.aviso}>No se encontró el punto.</Text>
      </View>
    );
  }

  const isOwner = carga?.cargadoPorId === usuario.id;
  const puedeEditarSiConfirma = isOwner || puedeAdministrarLotes(usuario.rol);
  // Bloqueado sin ninguna posibilidad de pedir permiso: es el punto de otra
  // persona y no tenés acceso para tocarlo (Monitoreador sobre punto ajeno).
  const bloqueadoDelTodo = !!carga?.confirmado && !puedeEditarSiConfirma;
  // Está cerrado, pero SE PUEDE pedir editarlo — falta el "sí, quiero editar".
  const necesitaConfirmarReapertura = !!carga?.confirmado && puedeEditarSiConfirma && !confirmoReapertura;
  const camposDeshabilitados = bloqueadoDelTodo || necesitaConfirmarReapertura;

  async function handleReabrir() {
    if (!lote || !punto) return;
    try {
      await reabrirCarga(punto.id, lote.campanaActual);
      setConfirmoReapertura(true);
    } catch (e: any) {
      Alert.alert("No se pudo reabrir el punto", e.message ?? String(e));
    }
  }

  async function handleGuardar() {
    if (!lote || !punto || !usuario) return;
    setGuardando(true);
    try {
      await guardarYConfirmarCarga(punto.id, lote.campanaActual, form, usuario.id);
      router.back();
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message ?? String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function subirYGuardarFoto(uri: string) {
    if (!lote || !punto || !usuario) return;
    setSubiendoFoto(true);
    try {
      const path = await subirFoto(lote.id, punto.id, uri);
      await agregarFotoACarga(punto.id, lote.campanaActual, path, usuario.id);
      const c = await fetchCarga(punto.id, lote.campanaActual);
      setCarga(c);
    } catch (e: any) {
      Alert.alert("No se pudo subir la foto", e.message ?? String(e));
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function elegirFoto() {
    Alert.alert("Adjuntar foto", undefined, [
      {
        text: "Tomar foto",
        onPress: async () => {
          const permiso = await ImagePicker.requestCameraPermissionsAsync();
          if (permiso.status !== "granted") {
            Alert.alert("Sin permiso", "Habilitá el acceso a la cámara para sacar la foto.");
            return;
          }
          const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.6 });
          if (!resultado.canceled) await subirYGuardarFoto(resultado.assets[0].uri);
        },
      },
      {
        text: "Elegir de la galería",
        onPress: async () => {
          const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (permiso.status !== "granted") {
            Alert.alert("Sin permiso", "Habilitá el acceso a tus fotos.");
            return;
          }
          const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.6 });
          if (!resultado.canceled) await subirYGuardarFoto(resultado.assets[0].uri);
        },
      },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  async function quitarFoto(path: string) {
    if (!lote || !punto) return;
    try {
      await quitarFotoDeCarga(punto.id, lote.campanaActual, path);
      await eliminarFoto(path);
      const c = await fetchCarga(punto.id, lote.campanaActual);
      setCarga(c);
    } catch (e: any) {
      Alert.alert("No se pudo quitar la foto", e.message ?? String(e));
    }
  }

  return (
    // automaticallyAdjustKeyboardInsets (iOS, requiere New Architecture — ya
    // activa en este proyecto) es el reemplazo nativo de KeyboardAvoidingView
    // acá: ajusta solo el contentInset del ScrollView y sube lo justo y
    // necesario para que el campo enfocado quede visible arriba del teclado,
    // sin los cálculos manuales de offset que traía KeyboardAvoidingView (y
    // que no daban con la altura justa en esta pantalla).
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    >
      <View style={styles.filaTitulo}>
        <MapPin size={16} color={colors.primaryDark} />
        <Text style={styles.titulo}>Punto {etiqueta}</Text>
      </View>

      {usuarioQueCargo && (
        <View style={[styles.tagUsuario, { borderColor: usuarioQueCargo.color }]}>
          <Text style={[styles.tagUsuarioTexto, { color: usuarioQueCargo.color }]}>
            Cargado por {usuarioQueCargo.nombre}
          </Text>
        </View>
      )}

      {bloqueadoDelTodo && (
        <View style={styles.bannerBloqueado}>
          <Lock size={13} color={colors.danger} />
          <Text style={styles.bannerBloqueadoTexto}>
            Ya fue muestreado por {usuarioQueCargo?.nombre ?? "otra persona"} — no podés editarlo.
          </Text>
        </View>
      )}

      {necesitaConfirmarReapertura && !bloqueadoDelTodo && (
        <View style={styles.bannerReapertura}>
          <Text style={styles.bannerReaperturaTexto}>
            Punto cerrado por {usuarioQueCargo?.nombre ?? "otra persona"} — ¿querés editarlo?
          </Text>
          <View style={styles.bannerReaperturaBotones}>
            <Pressable style={styles.botonCancelar} onPress={() => router.back()}>
              <Text style={styles.botonCancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.botonReabrir} onPress={handleReabrir}>
              <Text style={styles.botonReabrirTexto}>Sí, editar</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.grupoLabel}>Conteos</Text>
      <NumberField
        label="Bichos bolita"
        value={form.bicho}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, bicho: v }))}
      />
      <NumberField
        label="Babosas"
        value={form.babosa}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, babosa: v }))}
      />

      {/* Una sola barra "Listo" para toda la pantalla (conteos y
          observaciones) — ver comentario en ACCESORIO_TECLADO. */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESORIO_TECLADO}>
          <View style={styles.barraAccesoria}>
            <Pressable style={styles.botonListoAccesorio} onPress={() => Keyboard.dismiss()}>
              <Text style={styles.botonListoAccesorioTexto}>Listo</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}

      <Text style={styles.grupoLabel}>Presencia</Text>
      <YesNoField
        label="Huevo de babosas"
        value={form.huevoBabosas}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, huevoBabosas: v }))}
      />
      <YesNoField
        label="Gusano de arroz"
        value={form.gusanoArroz}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, gusanoArroz: v }))}
      />
      <YesNoField
        label="Isoca cortadora"
        value={form.isocaCortadora}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, isocaCortadora: v }))}
      />
      <YesNoField
        label="Gusano blanco"
        value={form.gusanoBlanco}
        disabled={camposDeshabilitados}
        onChange={(v) => setForm((f) => ({ ...f, gusanoBlanco: v }))}
      />

      {!camposDeshabilitados && (
        <>
          <Pressable style={styles.botonSecundario} onPress={() => setMostrarObservaciones((v) => !v)}>
            <Pencil size={15} color={colors.primaryDark} />
            <Text style={styles.botonSecundarioTexto}>
              Observaciones{form.observaciones ? " (con texto)" : ""}
            </Text>
          </Pressable>
          {mostrarObservaciones && (
            <TextInput
              ref={observacionesRef}
              style={styles.observaciones}
              placeholder="Anotá algo puntual sobre este punto…"
              placeholderTextColor={colors.textMuted}
              multiline
              value={form.observaciones}
              onChangeText={(t) => setForm((f) => ({ ...f, observaciones: t }))}
              inputAccessoryViewID={Platform.OS === "ios" ? ACCESORIO_TECLADO : undefined}
            />
          )}

          {carga && carga.fotos.length > 0 && (
            <View style={styles.fotosFila}>
              {carga.fotos.map((path) => (
                <View key={path} style={styles.fotoItem}>
                  {fotoUrls[path] && <Image source={{ uri: fotoUrls[path] }} style={styles.fotoImg} />}
                  <Pressable style={styles.fotoQuitar} onPress={() => quitarFoto(path)}>
                    <X size={11} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Pressable style={styles.botonSecundario} onPress={elegirFoto} disabled={subiendoFoto}>
            <Camera size={15} color={colors.primaryDark} />
            <Text style={styles.botonSecundarioTexto}>
              {subiendoFoto
                ? "Subiendo…"
                : carga && carga.fotos.length > 0
                  ? "Agregar otra foto"
                  : "Adjuntar foto"}
            </Text>
          </Pressable>
        </>
      )}

      {bloqueadoDelTodo ? (
        <Pressable style={styles.botonBloqueado} onPress={() => router.back()}>
          <Lock size={15} color={colors.surface} />
          <Text style={styles.botonBloqueadoTexto}>Cerrado por {usuarioQueCargo?.nombre ?? "otra persona"}</Text>
        </Pressable>
      ) : necesitaConfirmarReapertura ? null : (
        <Pressable style={styles.botonConfirmar} onPress={handleGuardar} disabled={guardando}>
          <Check size={15} color={colors.surface} />
          <Text style={styles.botonConfirmarTexto}>
            {guardando ? "Guardando…" : carga?.confirmado ? "Guardar cambios" : "Confirmar y cerrar punto"}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  aviso: { color: colors.textMuted },
  container: { padding: 20, gap: 4, backgroundColor: colors.background },
  filaTitulo: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  titulo: { fontSize: 18, fontWeight: "800", color: colors.text },
  tagUsuario: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  tagUsuarioTexto: { fontSize: 11, fontWeight: "700" },
  bannerBloqueado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  bannerBloqueadoTexto: { flex: 1, fontSize: 12, color: colors.danger, fontWeight: "600" },
  bannerReapertura: {
    backgroundColor: colors.warningBg,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  bannerReaperturaTexto: { fontSize: 13, color: colors.text, fontWeight: "600" },
  bannerReaperturaBotones: { flexDirection: "row", gap: 8 },
  botonCancelar: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", backgroundColor: colors.surface },
  botonCancelarTexto: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  botonReabrir: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center", backgroundColor: colors.primaryConfirm },
  botonReabrirTexto: { color: colors.surface, fontWeight: "700", fontSize: 13 },
  grupoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 2,
  },
  botonSecundario: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  botonSecundarioTexto: { color: colors.primaryDark, fontWeight: "600", fontSize: 13 },
  observaciones: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    // paddingBottom más grande que el resto (no un padding parejo) — le da
    // al ajuste automático del teclado un colchón real debajo del cursor,
    // que si no quedaba justo tapado por el borde del teclado/la barra
    // "Listo" cuando escribías la última línea.
    paddingBottom: 34,
    marginTop: 8,
    minHeight: 70,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  barraAccesoria: {
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 8,
  },
  botonListoAccesorio: { paddingHorizontal: 14, paddingVertical: 6 },
  botonListoAccesorioTexto: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  fotosFila: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  fotoItem: { width: 64, height: 64 },
  fotoImg: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  fotoQuitar: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  botonBloqueado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 20,
  },
  botonBloqueadoTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
  botonConfirmar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 20,
  },
  botonConfirmarTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
});
