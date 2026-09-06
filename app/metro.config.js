// Config de Metro por default (no había ninguna en el proyecto hasta
// ahora) — hace falta a partir de acá para poder exportar la app para web
// (ver la versión de PC, tareas de oficina): expo-sqlite trae su propia
// implementación para web (un motor SQLite compilado a WebAssembly,
// wa-sqlite.wasm — se usa para la cola offline del modo trabajo, ver
// lib/offline/db.ts), pero Metro no sabe tratar un archivo .wasm como un
// asset importable si no se le dice — sin esto, exportar para web fallaba
// con "Unable to resolve module ... wa-sqlite.wasm" (el archivo existe,
// Metro no sabía qué hacer con la extensión).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

module.exports = config;
