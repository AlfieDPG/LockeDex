// ---------- Partidas vinculadas a los lockes ----------
//
// Lo leído de la partida de cada locke se guarda en tus datos (y con sesión, en tu cuenta,
// como tus equipos): nunca en el locke, que lo leen los demás. Así se ve también desde otro
// sitio, aunque leer el archivo solo se pueda en el ordenador donde está.
//
//   localStorage «poketeams-partidas-v1»:
//     { idLocke: { juego, version, entrenador, actualizada, archivo, equipo, cajas,
//                  cajasMuertos: [posiciones], mirados: [llaves], muertosVistos: [llaves] } }

import { leer, escribir } from "../comun/almacen.js";
import { pokemonParaCopia } from "../comun/pokemon.js";
import { leerPartida3DS, esPartida3DS } from "./tresds.js";
import { convertirPartida } from "./convertir.js";
import { marcarCapturas } from "./rutas.js";

// NO cambiar esta clave: si se cambia, se pierden las partidas vinculadas
const CLAVE = "poketeams-partidas-v1";

// Juegos que se saben leer (ids de js/comun/juegos.js)
export const JUEGOS_LEIBLES = ["xy", "oras", "sm", "usum"];

const NOMBRES = { xy: "X / Y", oras: "Rubí Omega / Zafiro Alfa", sm: "Sol / Luna", usum: "Ultrasol / Ultraluna" };

export function sePuedeLeer(locke) {
  return Boolean(locke && JUEGOS_LEIBLES.includes(locke.juego));
}

function todas() {
  return leer(CLAVE, {}) || {};
}

export function partidaDe(idLocke) {
  return todas()[idLocke] || null;
}

function guardarPartida(idLocke, partida) {
  const lista = todas();
  if (partida) lista[idLocke] = partida;
  else delete lista[idLocke];
  escribir(CLAVE, lista);
}

export function olvidarPartida(idLocke) {
  guardarPartida(idLocke, null);
}

// Las cajas de los muertos (con muchas vidas no caben en una): las que se marquen o, la
// primera vez, las que se llamen como tal
const NOMBRE_CEMENTERIO = /muert|cementerio|tumba|\brip\b|dead|grave|fallec/i;

export function cajasMuertosDe(partida) {
  if (!partida) return [];
  if (partida.cajasMuertos) return partida.cajasMuertos;
  // Las guardadas cuando solo había una
  return partida.cajaMuertos >= 0 ? [partida.cajaMuertos] : [];
}

export function alternarCajaMuertos(idLocke, posicion) {
  const partida = partidaDe(idLocke);
  if (!partida) return;
  const cajas = cajasMuertosDe(partida);
  partida.cajasMuertos = cajas.includes(posicion) ? cajas.filter((i) => i !== posicion) : [...cajas, posicion].sort((a, b) => a - b);
  delete partida.cajaMuertos;
  guardarPartida(idLocke, partida);
}

// Lee el archivo y lo guarda. Devuelve { partida } o { error } (texto para enseñar).
export async function procesarArchivo(locke, bytes, archivo = "") {
  if (!esPartida3DS(bytes)) return { error: "Ese archivo no es una partida que se sepa leer." };

  let leida;
  try {
    leida = leerPartida3DS(bytes);
  } catch (error) {
    // Lo normal: el emulador estaba a mitad de guardar
    return { error: "No se ha podido leer la partida.", reintentar: true };
  }
  if (locke.juego && leida.juego !== locke.juego) {
    return { error: `Esa partida es de ${NOMBRES[leida.juego] || leida.juego} y el locke, de ${NOMBRES[locke.juego] || locke.juego}.` };
  }

  const nueva = await convertirPartida(leida);
  const anterior = partidaDe(locke.id) || {};
  const cajasMuertos = anterior.juego
    ? cajasMuertosDe(anterior)
    : nueva.cajas.flatMap((caja, i) => (NOMBRE_CEMENTERIO.test(caja.nombre) ? [i] : []));

  const mirados = new Set(anterior.mirados || []);
  const marcadas = marcarCapturas(nueva, leida.juego, mirados);

  const partida = {
    ...nueva,
    actualizada: Date.now(),
    archivo,
    cajasMuertos,
    mirados: [...mirados],
    muertosVistos: anterior.muertosVistos || []
  };
  guardarPartida(locke.id, partida);
  return { partida, marcadas, primera: !anterior.juego };
}

// Los de la caja de los muertos que no se han apuntado ni descartado todavía. Los que ya
// están en el cementerio del locke (misma especie y mote) se dan por apuntados.
export function muertosSinApuntar(idLocke, enCementerio) {
  const partida = partidaDe(idLocke);
  if (!partida) return [];
  const vistos = new Set(partida.muertosVistos || []);
  const yaEstan = new Set(enCementerio.map((muerto) => `${muerto.especie}|${(muerto.mote || "").toLowerCase()}`));
  const enCajas = cajasMuertosDe(partida).flatMap((i) => (partida.cajas[i] ? partida.cajas[i].pokemon : []));
  return enCajas.filter(
    (p) => !vistos.has(p.llave) && !yaEstan.has(`${p.id}|${(p.mote || "").toLowerCase()}`)
  );
}

export function marcarMuertosVistos(idLocke, llaves) {
  const partida = partidaDe(idLocke);
  if (!partida) return;
  partida.muertosVistos = [...new Set([...(partida.muertosVistos || []), ...llaves])];
  guardarPartida(idLocke, partida);
}

// El equipo de la partida para un combate (como los de «Mis equipos» en elegir-equipo.js)
export function equipoParaCombate(idLocke) {
  const partida = partidaDe(idLocke);
  if (!partida || !partida.equipo.length) return null;
  const pokemon = partida.equipo.filter((p) => !p.huevo).map((p) => pokemonParaCopia(p));
  return JSON.parse(JSON.stringify({ nombre: "Equipo de la partida", pokemon }));
}
