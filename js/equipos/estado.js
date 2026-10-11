import { copiaProfunda } from "../comun/utilidades.js";
import { leer, escribir } from "../comun/almacen.js";

// NO cambiar estas claves: si se cambian, se pierden los equipos guardados
const CLAVE_EQUIPO = "poketeams-equipo-v1";
const CLAVE_GUARDADOS = "poketeams-equipos-v1";
const CLAVE_ACTUAL = "poketeams-actual-v1";

export const MAX_EQUIPO = 6;

// Equipo que se está editando. Es un objeto para que todos los módulos vean los cambios.
export const estado = {
  equipo: [], // los Pokémon del equipo actual
  nombre: "",
  id: null    // id en «Mis equipos» (null si todavía no se ha guardado)
};

// ---------- Equipo actual ----------

export function cargarEstado() {
  estado.equipo = leer(CLAVE_EQUIPO, []);
  const actual = leer(CLAVE_ACTUAL, null);
  estado.nombre = (actual && actual.nombre) || "";
  estado.id = (actual && actual.id) || null;
}

export function guardarEquipo() {
  escribir(CLAVE_EQUIPO, estado.equipo);
}

export function guardarActual() {
  escribir(CLAVE_ACTUAL, { nombre: estado.nombre, id: estado.id });
}

export function reemplazarEquipo(pokemon, nombre, id) {
  estado.equipo = pokemon;
  estado.nombre = nombre;
  estado.id = id;
  guardarEquipo();
  guardarActual();
}

// ---------- Equipos guardados ----------

export function leerGuardados() {
  return leer(CLAVE_GUARDADOS, []);
}

export function escribirGuardados(lista) {
  return escribir(CLAVE_GUARDADOS, lista);
}

// Coloca los equipos guardados en ese orden y en esos grupos (el usuario los ha arrastrado):
// [{ id, grupo }] (grupo "" = sin grupo). Los que no estén en la lista se quedan al final.
export function colocarGuardados(orden) {
  const guardados = leerGuardados();
  const porId = new Map(guardados.map((g) => [g.id, g]));
  const colocados = orden
    .map(({ id, grupo }) => {
      const guardado = porId.get(id);
      if (!guardado) return null;
      porId.delete(id);
      if (grupo) guardado.grupo = grupo;
      else delete guardado.grupo;
      return guardado;
    })
    .filter(Boolean);
  escribirGuardados([...colocados, ...porId.values()]);
}

// ---------- Grupos de «Mis equipos» ----------
//
// [{ id, nombre, plegado }], en el orden en que salen. Cada equipo guardado dice el suyo en
// «grupo» (el id); sin él, va suelto. Como las carpetas de Showdown: al exportarlos todos van
// como «Grupo/Equipo» y al importar se crean solos.

const CLAVE_GRUPOS = "poketeams-grupos-v1";

export function leerGrupos() {
  return leer(CLAVE_GRUPOS, []);
}

export function escribirGrupos(lista) {
  return escribir(CLAVE_GRUPOS, lista);
}

// El grupo con ese nombre (sin distinguir mayúsculas); si no hay, se crea
export function grupoConNombre(nombre) {
  const grupos = leerGrupos();
  const limpio = nombre.trim();
  const existente = grupos.find((g) => g.nombre.trim().toLowerCase() === limpio.toLowerCase());
  if (existente) return existente;
  const nuevo = { id: `g${Date.now()}${Math.floor(Math.random() * 1000)}`, nombre: limpio, plegado: false };
  escribirGrupos([...grupos, nuevo]);
  return nuevo;
}

// La cara de Mundo Misterioso elegida en «Mis equipos» (mis-equipos.js). Al guardar el
// equipo desde «Crear equipo» se conserva la que tuviera cada Pokémon.
export function guardarCara(idEquipo, posicion, cara) {
  const guardados = leerGuardados();
  const equipo = guardados.find((g) => g.id === idEquipo);
  if (!equipo || !equipo.pokemon[posicion]) return;
  equipo.pokemon[posicion].cara = cara;
  escribirGuardados(guardados);
}

function conLasCarasDe(pokemon, anteriores) {
  return pokemon.map((p, i) => {
    const antes = anteriores[i];
    const mismo = antes && antes.id === p.id && antes.idForma === p.idForma;
    const copia = { ...p };
    if (mismo && antes.cara) copia.cara = antes.cara;
    return copia;
  });
}

function nombreParaGuardar() {
  return estado.nombre.trim() || "Equipo sin nombre";
}

// Las stats, descripciones y datos de combate se descargan solos al pasar el ratón:
// no cuentan como un cambio del usuario
// (la cara tampoco: se elige en «Mis equipos» y no cambia el equipo)
const DATOS_AUTOMATICOS = new Set(["stats", "descripcion", "fuente", "potencia", "precision", "categoria", "cara"]);

function sinStats(clave, valor) {
  return DATOS_AUTOMATICOS.has(clave) ? undefined : valor;
}

export function hayCambiosSinGuardar() {
  if (estado.equipo.length === 0) return false;
  const guardado = leerGuardados().find((g) => g.id === estado.id);
  if (!guardado) return true;
  return (
    JSON.stringify(guardado.pokemon, sinStats) !== JSON.stringify(estado.equipo, sinStats) ||
    guardado.nombre !== nombreParaGuardar()
  );
}

// Guarda el equipo actual en «Mis equipos». Devuelve false si el navegador no lo permite.
export function guardarEnMisEquipos() {
  const guardados = leerGuardados();
  const existente = guardados.find((g) => g.id === estado.id);

  if (existente) {
    existente.nombre = nombreParaGuardar();
    existente.pokemon = conLasCarasDe(copiaProfunda(estado.equipo), existente.pokemon);
    existente.actualizado = Date.now();
  } else {
    estado.id = String(Date.now());
    guardados.unshift({ // los equipos nuevos salen los primeros
      id: estado.id,
      nombre: nombreParaGuardar(),
      pokemon: copiaProfunda(estado.equipo),
      actualizado: Date.now()
    });
  }

  const ok = escribirGuardados(guardados);
  guardarActual();
  return ok;
}
