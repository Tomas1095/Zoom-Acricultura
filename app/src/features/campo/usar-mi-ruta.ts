import { useCallback, useEffect, useState } from "react";

import { cargarMiRuta, cargarRutaConfirmada, guardarMiRuta, guardarRutaConfirmada } from "@/lib/local/mi-ruta";

/** Recorrido personal (ayuda memoria) — portado del manejo de estado de
 * `miRuta`/`modoMarcarRuta`/`rutaConfirmada` del prototipo. Solo tiene
 * sentido en vista general (se marca ahí); Modo trabajo lo muestra de solo
 * lectura pasándole `miRuta` a MapaCampo, sin usar este hook. */
export function useMiRuta(loteId: string, usuarioId: string | undefined) {
  const [miRuta, setMiRuta] = useState<string[]>([]);
  const [rutaConfirmada, setRutaConfirmada] = useState(false);
  const [modoMarcarRuta, setModoMarcarRuta] = useState(false);
  const [pidiendoEditar, setPidiendoEditar] = useState(false);

  useEffect(() => {
    if (!usuarioId) return;
    let cancelado = false;
    (async () => {
      const [ruta, confirmada] = await Promise.all([
        cargarMiRuta(loteId, usuarioId),
        cargarRutaConfirmada(loteId, usuarioId),
      ]);
      if (cancelado) return;
      setMiRuta(ruta);
      setRutaConfirmada(ruta.length > 0 && confirmada);
    })();
    return () => {
      cancelado = true;
    };
  }, [loteId, usuarioId]);

  const alternarPunto = useCallback(
    (id: string) => {
      if (!usuarioId) return;
      setMiRuta((r) => {
        const next = r.includes(id) ? r.filter((p) => p !== id) : [...r, id];
        guardarMiRuta(loteId, usuarioId, next);
        return next;
      });
    },
    [loteId, usuarioId]
  );

  function empezarAMarcar() {
    setPidiendoEditar(false);
    setRutaConfirmada(false);
    if (usuarioId) guardarRutaConfirmada(loteId, usuarioId, false);
    setModoMarcarRuta(true);
  }

  function terminarDeMarcar() {
    setModoMarcarRuta(false);
    setMiRuta((r) => {
      if (r.length > 0 && usuarioId) {
        setRutaConfirmada(true);
        guardarRutaConfirmada(loteId, usuarioId, true);
      }
      return r;
    });
  }

  function borrarTodo() {
    setPidiendoEditar(false);
    setModoMarcarRuta(false);
    setRutaConfirmada(false);
    setMiRuta([]);
    if (usuarioId) {
      guardarMiRuta(loteId, usuarioId, []);
      guardarRutaConfirmada(loteId, usuarioId, false);
    }
  }

  return {
    miRuta,
    rutaConfirmada,
    modoMarcarRuta,
    pidiendoEditar,
    setPidiendoEditar,
    alternarPunto,
    empezarAMarcar,
    terminarDeMarcar,
    borrarTodo,
  };
}
