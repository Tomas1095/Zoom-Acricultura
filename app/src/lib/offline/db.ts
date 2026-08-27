// Base SQLite local para la cola de cambios pendientes — separada de
// Supabase a propósito: tiene que sobrevivir sin red, así que no puede
// depender del server para nada. Un solo archivo de base, abierto una vez
// por sesión de la app (openDatabaseSync es sincrónico y liviano, no hace
// falta cachear la promesa como con las async).

import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

let db: SQLiteDatabase | null = null;

/** Abre (o crea, si es la primera vez que corre en el dispositivo) la base
 * de la cola offline. Una sola tabla: cada fila es "un cambio que todavía
 * no se pudo subir al server". */
export function getDb(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync("cola_offline.db");
  db.execSync(`
    CREATE TABLE IF NOT EXISTS cambios_pendientes (
      id TEXT PRIMARY KEY NOT NULL,
      tipo TEXT NOT NULL,
      punto_id TEXT NOT NULL,
      campana TEXT NOT NULL,
      payload TEXT NOT NULL,
      creado_en TEXT NOT NULL,
      intentos INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT
    );
  `);
  return db;
}
