import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { ArrowUpDown, Copy, Crown, MapPin, Star, Trash2, UserPlus } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import * as db from "@/lib/db/equipo";
import { etiquetaRol } from "@/lib/roles";
import type { Rol, Usuario } from "@/types/domain";
import { colors } from "@/theme/colors";
import { AccesosUsuarioModal } from "./accesos-usuario-modal";

/** "Mi equipo" — portado de EquipoView. Solo entran acá socio_fundador y
 * socio_gerente (ver puedeGestionarEquipo en roles.ts / la navegación que
 * arma esta pantalla). */
export function EquipoScreen() {
  const { usuario: yo } = useAuth();
  const insets = useSafeAreaInsets();
  const [cargando, setCargando] = useState(true);
  const [miembros, setMiembros] = useState<Usuario[]>([]);
  const [codigoRecienGenerado, setCodigoRecienGenerado] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [viendoAccesosDe, setViendoAccesosDe] = useState<Usuario | null>(null);
  // Subgrupo personal (ver migración 0013 / lib/db/equipo.ts) — quiénes
  // marcó ESTE usuario como "los suyos". Es una preferencia de quien mira
  // la pantalla, no algo que cambie lo que ve el resto del equipo.
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<"todos" | "mios">("todos");

  const refrescar = useCallback(async () => {
    if (!yo) return;
    try {
      const [usuarios, favoritosDeYo] = await Promise.all([db.fetchUsuarios(yo.comunidadId), db.fetchFavoritosEquipo()]);
      setMiembros(usuarios.filter((u) => u.activo));
      setFavoritos(favoritosDeYo);
    } catch (e: any) {
      Alert.alert("No se pudo cargar el equipo", e.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }, [yo]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  async function toggleFavorito(u: Usuario) {
    if (!yo) return;
    const yaEsFavorito = favoritos.has(u.id);
    // Optimista: la pantalla responde al toque ya mismo, sin esperar el
    // viaje a Supabase — si falla, se revierte y se avisa.
    setFavoritos((prev) => {
      const next = new Set(prev);
      yaEsFavorito ? next.delete(u.id) : next.add(u.id);
      return next;
    });
    try {
      if (yaEsFavorito) await db.desmarcarFavoritoEquipo(yo.id, u.id);
      else await db.marcarFavoritoEquipo(yo.id, u.id);
    } catch (e: any) {
      setFavoritos((prev) => {
        const next = new Set(prev);
        yaEsFavorito ? next.add(u.id) : next.delete(u.id);
        return next;
      });
      Alert.alert("No se pudo guardar", e.message ?? String(e));
    }
  }

  async function generarCodigo() {
    if (!yo) return;
    setGenerando(true);
    try {
      const codigo = await db.generarInvitacion(yo.id);
      setCodigoRecienGenerado(codigo);
    } catch (e: any) {
      Alert.alert("No se pudo generar el código", e.message ?? String(e));
    } finally {
      setGenerando(false);
    }
  }

  async function copiarCodigo() {
    if (!codigoRecienGenerado) return;
    await Clipboard.setStringAsync(codigoRecienGenerado);
    Alert.alert("Copiado", "El código se copió al portapapeles.");
  }

  function compartirCodigo() {
    if (!codigoRecienGenerado) return;
    Share.share({
      message: `Te invito a sumarte al equipo de Zoom Agricultura. Usá este código al registrarte: ${codigoRecienGenerado}`,
    });
  }

  async function conManejoDeError(accion: () => Promise<void>) {
    try {
      await accion();
      await refrescar();
    } catch (e: any) {
      Alert.alert("Ocurrió un error", e.message ?? String(e));
    }
  }

  function confirmarQuitar(u: Usuario) {
    Alert.alert("Quitar del equipo", `¿Quitar a ${u.nombre} del equipo?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => conManejoDeError(() => db.eliminarMiembro(u.id)) },
    ]);
  }

  function confirmarTransferir(u: Usuario) {
    Alert.alert(
      "Transferir Socio Fundador",
      `${u.nombre} va a pasar a ser el Socio Fundador y vos vas a quedar como Socio Gerente. Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Transferir", style: "destructive", onPress: () => conManejoDeError(() => db.transferirFundador(u.id)) },
      ]
    );
  }

  function confirmarCambioRol(u: Usuario, nuevoRol: Rol) {
    Alert.alert("Confirmar cambio de rol", `¿Cambiar a ${u.nombre} a ${etiquetaRol(nuevoRol)}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar",
        onPress: () =>
          conManejoDeError(() => db.cambiarRolUsuario(u.id, nuevoRol as "socio_gerente" | "encargado" | "monitoreador")),
      },
    ]);
  }

  /** Un solo botón de "cambiar rol" en vez de varios sueltos (toggle de
   * texto + flechas) — a pedido del usuario: ese botón de texto largo
   * ("→ Encargado") se usaba poco y ocupaba mucho lugar en la fila. Acá
   * arma las opciones que corresponden según el rol actual de `u` y lo que
   * puede tocar `yo` (mismos límites que había antes, ver los `if`
   * comentados que reemplaza) y las muestra en un solo cartel. Subir de
   * Socio Gerente a Socio Fundador queda AFUERA de acá a propósito — ese es
   * "Transferir Socio Fundador" (ver confirmarTransferir), una acción
   * mucho más sensible con su propio botón (Crown), no un escalón más de
   * este menú. */
  function mostrarOpcionesRol(u: Usuario) {
    const opciones: { texto: string; nuevoRol: Rol }[] = [];
    if (u.rol === "monitoreador") {
      opciones.push({ texto: `Subir a ${etiquetaRol("encargado")}`, nuevoRol: "encargado" });
    } else if (u.rol === "encargado") {
      if (yo?.rol === "socio_fundador") {
        opciones.push({ texto: `Subir a ${etiquetaRol("socio_gerente")}`, nuevoRol: "socio_gerente" });
      }
      opciones.push({ texto: `Bajar a ${etiquetaRol("monitoreador")}`, nuevoRol: "monitoreador" });
    } else if (u.rol === "socio_gerente" && yo?.rol === "socio_fundador") {
      opciones.push({ texto: `Bajar a ${etiquetaRol("encargado")}`, nuevoRol: "encargado" });
    }
    if (opciones.length === 0) return;
    Alert.alert(
      `Cambiar rol de ${u.nombre}`,
      `Actualmente es ${etiquetaRol(u.rol)}.`,
      [
        ...opciones.map((o) => ({ text: o.texto, onPress: () => confirmarCambioRol(u, o.nuevoRol) })),
        { text: "Cancelar", style: "cancel" as const },
      ]
    );
  }

  function puedeCambiarRol(u: Usuario) {
    if (!yo) return false;
    if (u.rol === "monitoreador" || u.rol === "encargado") return true;
    if (u.rol === "socio_gerente") return yo.rol === "socio_fundador";
    return false;
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const totalCount = miembros.length;
  const miosCount = miembros.filter((u) => favoritos.has(u.id)).length;
  const miembrosAMostrar = filtro === "mios" ? miembros.filter((u) => favoritos.has(u.id)) : miembros;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 10 + insets.bottom }]}>
      <Pressable style={styles.generarBtn} onPress={generarCodigo} disabled={generando}>
        <UserPlus size={16} color={colors.surface} />
        <Text style={styles.generarTexto}>{generando ? "Generando…" : "Invitar a alguien"}</Text>
      </Pressable>

      {codigoRecienGenerado && (
        <View style={styles.codigoCard}>
          <Text style={styles.codigoLabel}>Código generado — compartilo, sirve una sola vez</Text>
          <Text style={styles.codigo}>{codigoRecienGenerado}</Text>
          <View style={styles.codigoBotones}>
            <Pressable style={styles.codigoBoton} onPress={copiarCodigo}>
              <Copy size={13} color={colors.primaryDark} />
              <Text style={styles.codigoBotonTexto}>Copiar</Text>
            </Pressable>
            <Pressable style={styles.codigoBoton} onPress={compartirCodigo}>
              <Text style={styles.codigoBotonTexto}>Compartir</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Subgrupo personal — a pedido del usuario: con mucha gente en el
       * equipo (parte de otro Socio, no la suya), quería una forma de
       * filtrar de un vistazo a "los suyos" sin tener que buscar entre
       * todos cada vez. Marca la estrellita de cada fila más abajo. */}
      <View style={styles.subgrupoCard}>
        <View style={styles.subgrupoBotones}>
          <Pressable
            style={[styles.filtroBoton, filtro === "todos" && styles.filtroBotonActivo]}
            onPress={() => setFiltro("todos")}
          >
            <Text style={[styles.filtroBotonTexto, filtro === "todos" && styles.filtroBotonTextoActivo]}>
              Todos · {totalCount}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filtroBoton, filtro === "mios" && styles.filtroBotonActivo]}
            onPress={() => setFiltro("mios")}
          >
            <Text style={[styles.filtroBotonTexto, filtro === "mios" && styles.filtroBotonTextoActivo]}>
              Los míos · {miosCount}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.subgrupoAyuda}>
          Tocá la estrellita en cada persona para sumarla o sacarla de tu subgrupo — es una marca personal tuya.
        </Text>
      </View>

      <Text style={styles.seccionLabel}>Miembros del equipo</Text>
      {filtro === "mios" && miembrosAMostrar.length === 0 && (
        <Text style={styles.vacio}>Todavía no marcaste a nadie como tuyo — tocá la estrellita en "Todos".</Text>
      )}
      {miembrosAMostrar.map((u) => {
        const esUnoMismo = u.id === yo?.id;
        return (
          <View key={u.id} style={styles.miembroCard}>
            <View style={[styles.dot, { backgroundColor: u.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.miembroNombre}>
                {u.nombre} {esUnoMismo && "(vos)"}
              </Text>
              <Text style={styles.miembroRol}>{etiquetaRol(u.rol)}</Text>
            </View>

            {!esUnoMismo && u.rol !== "socio_fundador" && (
              <View style={styles.accionesFila}>
                <Pressable style={styles.iconBtn} onPress={() => toggleFavorito(u)}>
                  <Star
                    size={16}
                    color={favoritos.has(u.id) ? colors.accentGold : colors.borderStrong}
                    fill={favoritos.has(u.id) ? colors.accentGold : "none"}
                  />
                </Pressable>

                {/* Ver/sacar accesos por lote — solo tiene sentido para
                    Monitoreador: es el único rol que depende de la tabla
                    `accesos` para ver algo (Socio/Encargado ven todo el
                    árbol siempre, sin necesitar accesos puntuales). Primero
                    en la fila — a pedido del usuario, es lo que más usa. */}
                {u.rol === "monitoreador" && (
                  <>
                    <View style={styles.separador} />
                    <Pressable style={styles.iconBtn} onPress={() => setViendoAccesosDe(u)}>
                      <MapPin size={16} color={colors.info} />
                    </Pressable>
                  </>
                )}

                {puedeCambiarRol(u) && (
                  <Pressable style={styles.iconBtn} onPress={() => mostrarOpcionesRol(u)}>
                    <ArrowUpDown size={17} color={colors.primary} />
                  </Pressable>
                )}
                {yo?.rol === "socio_fundador" && u.rol === "socio_gerente" && (
                  <Pressable style={styles.iconBtn} onPress={() => confirmarTransferir(u)}>
                    <Crown size={17} color={colors.accentGold} />
                  </Pressable>
                )}
                <Pressable style={styles.iconBtn} onPress={() => confirmarQuitar(u)}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
      {viendoAccesosDe && (
        <AccesosUsuarioModal usuario={viendoAccesosDe} onCerrar={() => setViendoAccesosDe(null)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 10 },
  generarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 13,
  },
  generarTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
  codigoCard: {
    backgroundColor: colors.successBg,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  codigoLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  codigo: { fontSize: 20, fontWeight: "800", color: colors.primaryDark, letterSpacing: 1 },
  codigoBotones: { flexDirection: "row", gap: 10, marginTop: 4 },
  codigoBoton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codigoBotonTexto: { fontSize: 12, fontWeight: "700", color: colors.text },
  subgrupoCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  subgrupoBotones: { flexDirection: "row", gap: 6 },
  filtroBoton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  filtroBotonActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  filtroBotonTexto: { fontSize: 12, fontWeight: "700", color: colors.text },
  filtroBotonTextoActivo: { color: colors.surface },
  subgrupoAyuda: { fontSize: 11, color: colors.accentGoldMuted, lineHeight: 15 },
  seccionLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginTop: 8 },
  vacio: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 12 },
  miembroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  miembroNombre: { fontSize: 14, fontWeight: "700", color: colors.text },
  miembroRol: { fontSize: 11, color: colors.accentGold, fontWeight: "600", marginTop: 1 },
  accionesFila: { flexDirection: "row", alignItems: "center", gap: 2 },
  separador: { width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 4 },
  iconBtn: { padding: 6 },
});
