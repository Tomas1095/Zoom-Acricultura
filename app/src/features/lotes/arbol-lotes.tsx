import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronRight, Info, Navigation, Pencil, Plus, Trash2, Users } from "lucide-react-native";

import { PromptModal } from "@/components/prompt-modal";
import { useAuth } from "@/lib/auth-context";
import * as db from "@/lib/db/lotes";
import { fetchCargasDeLote, fetchCentroDeLote, fetchPuntosDeLote } from "@/lib/db/puntos";
import { fetchUsuarios } from "@/lib/db/equipo";
import { urlComoLlegar } from "@/lib/geo/como-llegar";
import { formatearHectareas } from "@/lib/format";
import { guardarCacheArbol, leerCacheArbol } from "@/lib/offline/cache-arbol";
import { precargarLotes } from "@/lib/offline/cache-lote";
import { fetchResumenLote, type ResumenAvanceLote } from "@/lib/offline/resumen";
import type { Cliente, Establecimiento, Lote, Usuario } from "@/types/domain";
import { colors } from "@/theme/colors";
import { AccesoModal } from "./acceso-modal";

interface InfoLote {
  puntosTotal: number;
  /** Solo quienes tienen acceso a este lote, con cuántos puntos cargó cada
   * uno — portado de "Quién hizo qué" del prototipo (ArbolLotesView). */
  desglose: Array<{ usuarioId: string; cantidad: number }>;
}

type ModalState =
  | { tipo: "nuevoCliente" }
  | { tipo: "editarCliente"; cliente: Cliente }
  | { tipo: "nuevoEstablecimiento"; clienteId: string }
  | { tipo: "nuevoLote"; establecimientoId: string }
  | { tipo: "editarLote"; lote: Lote }
  | { tipo: "acceso"; lote: Lote }
  | null;

/** Árbol Cliente → Establecimiento → Lote, con CRUD para administradores.
 * Portado de ArbolLotesView del prototipo — acá cada acción pega contra
 * Supabase en vez de mutar estado en memoria. */
export function ArbolLotes() {
  const { usuario } = useAuth();
  const puedeEliminar = usuario?.rol === "socio_fundador" || usuario?.rol === "socio_gerente";

  const [cargando, setCargando] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [expClientes, setExpClientes] = useState<Set<string>>(new Set());
  const [expEstablecimientos, setExpEstablecimientos] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [infoAbierta, setInfoAbierta] = useState<Set<string>>(new Set());
  const [infoPorLote, setInfoPorLote] = useState<Record<string, InfoLote | "cargando">>({});
  const [buscandoComoLlegar, setBuscandoComoLlegar] = useState<string | null>(null);
  // Resumen de avance por lote, visible directo en el árbol — pedido
  // explícito del usuario: quiere verlo sin tener que entrar a cada lote
  // (a diferencia del panel "Info", que sí requiere tocarlo para abrirse).
  // Acá SIEMPRE es el total del lote (sin usuarioId), a diferencia de
  // MisLotes que lo filtra por el Monitoreador — ver lib/offline/resumen.ts.
  const [resumenes, setResumenes] = useState<Record<string, ResumenAvanceLote>>({});
  const [usandoCache, setUsandoCache] = useState(false);

  const refrescar = useCallback(async () => {
    if (!usuario) return;
    let arbol: db.Arbol;
    try {
      const [arbolLive, todosLosUsuarios] = await Promise.all([db.fetchArbol(), fetchUsuarios()]);
      arbol = arbolLive;
      setClientes(arbol.clientes);
      setEstablecimientos(arbol.establecimientos);
      setLotes(arbol.lotes);
      setUsuarios(todosLosUsuarios);
      setUsandoCache(false);
      guardarCacheArbol(usuario.id, arbol);
      // Con solo entrar a esta pantalla (que pasa siempre, apenas hay
      // sesión) ya queda todo listo para trabajar offline en cualquier
      // lote — no hace falta abrir cada uno a mano. Ver
      // lib/offline/cache-lote.ts.
      precargarLotes(arbol.lotes);
    } catch (e: any) {
      // Sin señal: esta es la PRIMERA pantalla que ve un Socio/Encargado
      // al entrar — sin este respaldo, no había forma de siquiera ver el
      // árbol para poder entrar a un lote y seguir trabajando offline (eso
      // sí ya andaba, ver lib/offline/cache-lote.ts). "Quién hizo qué" y
      // los avatares de usuarios sí se pierden sin señal (no son
      // necesarios para navegar ni cargar puntos) — ver
      // lib/offline/cache-arbol.ts.
      const cache = await leerCacheArbol(usuario.id);
      if (cache) {
        arbol = cache;
        setClientes(cache.clientes);
        setEstablecimientos(cache.establecimientos);
        setLotes(cache.lotes);
        setUsandoCache(true);
      } else {
        Alert.alert("No se pudo cargar", e.message ?? String(e));
        setCargando(false);
        return;
      }
    }

    // Aparte y sin bloquear el árbol — cada pill de resumen aparece
    // apenas se calcula, sin esperar a todos los lotes. Sin señal esto
    // también va a fallar solo (fetchResumenLote pega contra el server) —
    // cada fila se queda sin el resumen, no rompe el resto.
    const conGrilla = arbol.lotes.filter((l) => l.tieneGrilla);
    conGrilla.forEach((l) => {
      fetchResumenLote(l.id, l.campanaActual)
        .then((r) => setResumenes((prev) => ({ ...prev, [l.id]: r })))
        .catch(() => {});
    });
    setCargando(false);
  }, [usuario]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  }

  async function conManejoDeError(accion: () => Promise<void>) {
    try {
      await accion();
      await refrescar();
    } catch (e: any) {
      Alert.alert("Ocurrió un error", e.message ?? String(e));
    }
  }

  function confirmarBorrado(titulo: string, mensaje: string, onConfirmar: () => Promise<void>) {
    Alert.alert(titulo, mensaje, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => conManejoDeError(onConfirmar) },
    ]);
  }

  async function toggleInfo(lote: Lote) {
    const abierta = infoAbierta.has(lote.id);
    setInfoAbierta((prev) => {
      const next = new Set(prev);
      abierta ? next.delete(lote.id) : next.add(lote.id);
      return next;
    });
    if (!abierta && infoPorLote[lote.id] === undefined) {
      setInfoPorLote((prev) => ({ ...prev, [lote.id]: "cargando" }));
      try {
        const [puntos, cargas, accesos] = await Promise.all([
          fetchPuntosDeLote(lote.id),
          fetchCargasDeLote(lote.id, lote.campanaActual),
          db.fetchAccesos(lote.id),
        ]);
        const conteos = new Map<string, number>();
        for (const carga of cargas.values()) {
          if (!carga.cargado || !carga.cargadoPorId) continue;
          conteos.set(carga.cargadoPorId, (conteos.get(carga.cargadoPorId) ?? 0) + 1);
        }
        const desglose = accesos
          .map((usuarioId) => ({ usuarioId, cantidad: conteos.get(usuarioId) ?? 0 }))
          .sort((a, b) => b.cantidad - a.cantidad);
        setInfoPorLote((prev) => ({ ...prev, [lote.id]: { puntosTotal: puntos.length, desglose } }));
      } catch (e: any) {
        Alert.alert("No se pudo cargar la info", e.message ?? String(e));
      }
    }
  }

  async function comoLlegar(lote: Lote) {
    setBuscandoComoLlegar(lote.id);
    try {
      const centro = await fetchCentroDeLote(lote.id);
      if (!centro) {
        Alert.alert("Sin ubicación todavía", "Este lote no tiene puntos generados.");
        return;
      }
      Linking.openURL(urlComoLlegar(centro));
    } catch (e: any) {
      Alert.alert("No se pudo calcular la ruta", e.message ?? String(e));
    } finally {
      setBuscandoComoLlegar(null);
    }
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        {usandoCache && (
          <Text style={styles.avisoCache}>
            📡 Sin señal — mostrando el último árbol guardado en este celular, puede no estar al día.
          </Text>
        )}
        {clientes.length === 0 && (
          <Text style={styles.vacio}>Todavía no hay clientes cargados. Empezá agregando uno.</Text>
        )}

        {clientes.map((c) => {
          const estsDelCliente = establecimientos.filter((e) => e.clienteId === c.id);
          const abierto = expClientes.has(c.id);
          return (
            <View key={c.id} style={styles.clienteCard}>
              <View style={styles.filaHeader}>
                <Pressable
                  style={styles.filaHeaderBtn}
                  onPress={() => toggle(expClientes, c.id, setExpClientes)}
                >
                  {abierto ? (
                    <ChevronDown size={16} color={colors.text} />
                  ) : (
                    <ChevronRight size={16} color={colors.text} />
                  )}
                  <Text style={styles.clienteNombre}>{c.nombre}</Text>
                </Pressable>
                <View style={styles.accionesFila}>
                  <Pressable
                    style={styles.iconBtn}
                    onPress={() => setModal({ tipo: "nuevoEstablecimiento", clienteId: c.id })}
                  >
                    <Plus size={14} color={colors.primaryDark} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => setModal({ tipo: "editarCliente", cliente: c })}>
                    <Pencil size={13} color={colors.accentGold} />
                  </Pressable>
                  {puedeEliminar && (
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() =>
                        confirmarBorrado(
                          "Eliminar cliente",
                          `Se va a eliminar "${c.nombre}" y todos sus establecimientos y lotes. Esta acción no se puede deshacer.`,
                          () => db.eliminarCliente(c.id)
                        )
                      }
                    >
                      <Trash2 size={13} color={colors.danger} />
                    </Pressable>
                  )}
                </View>
              </View>

              {abierto && (
                <View style={styles.hijos}>
                  {estsDelCliente.length === 0 && <Text style={styles.vacioChico}>Sin establecimientos todavía.</Text>}
                  {estsDelCliente.map((e) => {
                    const lotesDelEst = lotes.filter((l) => l.establecimientoId === e.id);
                    const estAbierto = expEstablecimientos.has(e.id);
                    return (
                      <View key={e.id} style={styles.establecimientoCard}>
                        <View style={styles.filaHeader}>
                          <Pressable
                            style={styles.filaHeaderBtn}
                            onPress={() => toggle(expEstablecimientos, e.id, setExpEstablecimientos)}
                          >
                            {estAbierto ? (
                              <ChevronDown size={14} color={colors.text} />
                            ) : (
                              <ChevronRight size={14} color={colors.text} />
                            )}
                            <Text style={styles.establecimientoNombre}>{e.nombre}</Text>
                          </Pressable>
                          <View style={styles.accionesFila}>
                            <Pressable
                              style={styles.iconBtn}
                              onPress={() => setModal({ tipo: "nuevoLote", establecimientoId: e.id })}
                            >
                              <Plus size={13} color={colors.primaryDark} />
                            </Pressable>
                            {puedeEliminar && (
                              <Pressable
                                style={styles.iconBtn}
                                onPress={() =>
                                  confirmarBorrado(
                                    "Eliminar establecimiento",
                                    `Se va a eliminar "${e.nombre}" y todos sus lotes.`,
                                    () => db.eliminarEstablecimiento(e.id)
                                  )
                                }
                              >
                                <Trash2 size={12} color={colors.danger} />
                              </Pressable>
                            )}
                          </View>
                        </View>

                        {estAbierto && (
                          <View style={styles.hijos}>
                            {lotesDelEst.length === 0 && (
                              <Text style={styles.vacioChico}>Sin lotes todavía.</Text>
                            )}
                            {lotesDelEst.map((l) => {
                              const infoEstaAbierta = infoAbierta.has(l.id);
                              const infoValor = infoPorLote[l.id];
                              const resumen = resumenes[l.id];
                              return (
                                <View key={l.id} style={styles.loteRow}>
                                  <View style={styles.loteFilaSuperior}>
                                    <Pressable style={styles.loteInfo} onPress={() => router.push(`/(app)/lote/${l.id}`)}>
                                      <Text style={styles.loteNombre}>{l.nombre}</Text>
                                      <Text style={styles.loteDetalle}>
                                        {l.cultivo}
                                        {l.tieneGrilla
                                          ? ` · ${formatearHectareas(l.hectareas)} ha`
                                          : " · sin grilla (falta subir el KMZ)"}
                                      </Text>
                                      {resumen && resumen.totalPuntos > 0 && (
                                        <Text style={styles.loteResumen}>
                                          {resumen.completados}/{resumen.totalPuntos} completados
                                          {resumen.completados > 0 &&
                                            ` · ${resumen.sincronizados}/${resumen.completados} sincronizados`}
                                        </Text>
                                      )}
                                    </Pressable>
                                    <View style={styles.accionesFila}>
                                      <Pressable style={styles.iconBtn} onPress={() => setModal({ tipo: "acceso", lote: l })}>
                                        <Users size={13} color={colors.info} />
                                      </Pressable>
                                      <Pressable style={styles.iconBtn} onPress={() => setModal({ tipo: "editarLote", lote: l })}>
                                        <Pencil size={13} color={colors.accentGold} />
                                      </Pressable>
                                      {puedeEliminar && (
                                        <Pressable
                                          style={styles.iconBtn}
                                          onPress={() =>
                                            confirmarBorrado(
                                              "Eliminar lote",
                                              `Se va a eliminar "${l.nombre}" y todos sus datos de monitoreo.`,
                                              () => db.eliminarLote(l.id)
                                            )
                                          }
                                        >
                                          <Trash2 size={13} color={colors.danger} />
                                        </Pressable>
                                      )}
                                    </View>
                                  </View>

                                  {l.tieneGrilla && (
                                    <View style={styles.lotePillsFila}>
                                      <Pressable style={styles.lotePill} onPress={() => toggleInfo(l)}>
                                        <Info size={11} color={colors.primaryDark} />
                                        <Text style={styles.lotePillTexto}>Info</Text>
                                      </Pressable>
                                      <Pressable
                                        style={styles.lotePill}
                                        onPress={() => comoLlegar(l)}
                                        disabled={buscandoComoLlegar === l.id}
                                      >
                                        <Navigation size={11} color={colors.primaryDark} />
                                        <Text style={styles.lotePillTexto}>
                                          {buscandoComoLlegar === l.id ? "Buscando…" : "Cómo llegar"}
                                        </Text>
                                      </Pressable>
                                    </View>
                                  )}

                                  {infoEstaAbierta && (
                                    <View style={styles.loteInfoPanel}>
                                      <Text style={styles.loteInfoLinea}>Hectáreas: {formatearHectareas(l.hectareas)}</Text>
                                      <Text style={styles.loteInfoLinea}>Hectáreas por punto: {l.haPorPunto}</Text>
                                      <Text style={styles.loteInfoLinea}>
                                        Puntos de muestreo:{" "}
                                        {infoValor === "cargando" || infoValor === undefined ? "…" : infoValor.puntosTotal}
                                      </Text>
                                      <Text style={styles.loteInfoLinea}>Campaña: {l.campanaActual}</Text>

                                      {infoValor !== "cargando" && infoValor !== undefined && (
                                        <View style={styles.desgloseBox}>
                                          <Text style={styles.desgloseTitulo}>
                                            Quién hizo qué —{" "}
                                            {infoValor.desglose.reduce((s, d) => s + d.cantidad, 0)}/
                                            {infoValor.puntosTotal} puntos
                                          </Text>
                                          {infoValor.desglose.length === 0 ? (
                                            <Text style={styles.desgloseVacio}>
                                              Todavía no le diste acceso a este lote a nadie.
                                            </Text>
                                          ) : (
                                            infoValor.desglose.map(({ usuarioId, cantidad }) => {
                                              const persona = usuarios.find((u) => u.id === usuarioId);
                                              if (!persona) return null;
                                              return (
                                                <View key={usuarioId} style={styles.desgloseFila}>
                                                  <View style={[styles.desgloseAvatar, { backgroundColor: persona.color }]}>
                                                    <Text style={styles.desgloseAvatarTexto}>
                                                      {persona.nombre.charAt(0).toUpperCase()}
                                                    </Text>
                                                  </View>
                                                  <Text style={styles.desgloseNombre}>{persona.nombre}</Text>
                                                  <Text style={styles.desgloseCantidad}>{cantidad} puntos</Text>
                                                </View>
                                              );
                                            })
                                          )}
                                        </View>
                                      )}
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <Pressable style={styles.agregarClienteBtn} onPress={() => setModal({ tipo: "nuevoCliente" })}>
          <Plus size={15} color={colors.surface} />
          <Text style={styles.agregarClienteTexto}>Nuevo cliente</Text>
        </Pressable>
      </ScrollView>

      <PromptModal
        visible={modal?.tipo === "nuevoCliente"}
        titulo="Nuevo cliente"
        fields={[{ key: "nombre", label: "Nombre", placeholder: "Ej: Baltan Agropecuaria" }]}
        onCancelar={() => setModal(null)}
        onConfirmar={(v) => {
          setModal(null);
          conManejoDeError(() => db.crearCliente(v.nombre.trim()).then(() => {}));
        }}
      />

      <PromptModal
        visible={modal?.tipo === "editarCliente"}
        titulo="Editar cliente"
        fields={[{ key: "nombre", label: "Nombre", valorInicial: modal?.tipo === "editarCliente" ? modal.cliente.nombre : "" }]}
        onCancelar={() => setModal(null)}
        onConfirmar={(v) => {
          if (modal?.tipo !== "editarCliente") return;
          const id = modal.cliente.id;
          setModal(null);
          conManejoDeError(() => db.editarCliente(id, v.nombre.trim()));
        }}
      />

      <PromptModal
        visible={modal?.tipo === "nuevoEstablecimiento"}
        titulo="Nuevo establecimiento"
        fields={[{ key: "nombre", label: "Nombre", placeholder: "Ej: Tres Esquinas" }]}
        onCancelar={() => setModal(null)}
        onConfirmar={(v) => {
          if (modal?.tipo !== "nuevoEstablecimiento") return;
          const clienteId = modal.clienteId;
          setModal(null);
          conManejoDeError(async () => {
            await db.crearEstablecimiento(clienteId, v.nombre.trim());
            setExpClientes((prev) => new Set(prev).add(clienteId));
          });
        }}
      />

      <PromptModal
        visible={modal?.tipo === "nuevoLote"}
        titulo="Nuevo lote"
        fields={[
          { key: "nombre", label: "Nombre", placeholder: "Ej: 39 has" },
          { key: "cultivo", label: "Cultivo (opcional)", placeholder: "Ej: Soja" },
        ]}
        onCancelar={() => setModal(null)}
        onConfirmar={(v) => {
          if (modal?.tipo !== "nuevoLote") return;
          const establecimientoId = modal.establecimientoId;
          setModal(null);
          conManejoDeError(async () => {
            await db.crearLote(establecimientoId, v.nombre.trim(), v.cultivo?.trim() ?? "");
            setExpEstablecimientos((prev) => new Set(prev).add(establecimientoId));
          });
        }}
      />

      <PromptModal
        visible={modal?.tipo === "editarLote"}
        titulo="Editar lote"
        fields={[{ key: "nombre", label: "Nombre", valorInicial: modal?.tipo === "editarLote" ? modal.lote.nombre : "" }]}
        onCancelar={() => setModal(null)}
        onConfirmar={(v) => {
          if (modal?.tipo !== "editarLote") return;
          const id = modal.lote.id;
          setModal(null);
          conManejoDeError(() => db.editarLote(id, v.nombre.trim()));
        }}
      />

      {modal?.tipo === "acceso" && (
        <AccesoModal lote={modal.lote} onCerrar={() => setModal(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12 },
  vacio: { color: colors.textMuted, textAlign: "center", marginTop: 24 },
  avisoCache: {
    fontSize: 11.5,
    color: colors.warning,
    backgroundColor: colors.warningBg,
    borderRadius: 8,
    padding: 10,
    fontWeight: "600",
  },
  vacioChico: { color: colors.textMuted, fontSize: 12, paddingVertical: 6 },
  agregarClienteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 12,
  },
  agregarClienteTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
  clienteCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  filaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filaHeaderBtn: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  clienteNombre: { fontSize: 15, fontWeight: "700", color: colors.text },
  establecimientoNombre: { fontSize: 14, fontWeight: "600", color: colors.text },
  accionesFila: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 8 },
  hijos: { marginTop: 8, marginLeft: 10, gap: 8 },
  establecimientoCard: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  loteRow: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  loteFilaSuperior: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  loteInfo: { flex: 1 },
  loteNombre: { fontSize: 13, fontWeight: "700", color: colors.text },
  loteDetalle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  loteResumen: { fontSize: 11, color: colors.primaryDark, fontWeight: "600", marginTop: 2 },
  lotePillsFila: { flexDirection: "row", gap: 8 },
  lotePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  lotePillTexto: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  loteInfoPanel: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },
  loteInfoLinea: { fontSize: 12, color: colors.text },
  desgloseBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  desgloseTitulo: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  desgloseVacio: { fontSize: 12, color: colors.textMuted, fontStyle: "italic" },
  desgloseFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  desgloseAvatar: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  desgloseAvatarTexto: { fontSize: 10, fontWeight: "800", color: colors.surface },
  desgloseNombre: { flex: 1, fontSize: 12.5, fontWeight: "600", color: colors.text },
  desgloseCantidad: { fontSize: 12, color: colors.textMuted },
});
