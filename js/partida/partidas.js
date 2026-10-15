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
import { leerPartidaDS, esPartidaDS } from "./nds.js";
import { convertirPartida } from "./convertir.js";
import { marcarCapturas } from "./rutas.js";
import { hierbaEnPueblos } from "../randomizer/reglas.js";
import { CLAVE_HIERBA_RUTAS } from "../comun/selector-juego.js";

// NO cambiar esta clave: si se cambia, se pierden las partidas vinculadas
const CLAVE = "poketeams-partidas-v1";

// Juegos que se saben leer (ids de js/comun/juegos.js)
export const JUEGOS_LEIBLES = ["dp", "platino", "hgss", "bw", "b2w2", "xy", "oras", "sm", "usum"];

const NOMBRES = {
  dp: "Diamante / Perla", platino: "Platino", hgss: "HeartGold / SoulSilver", bw: "Negro / Blanco",
  b2w2: "Negro 2 / Blanco 2", xy: "X / Y", oras: "Rubí Omega / Zafiro Alfa", sm: "Sol / Luna", usum: "Ultrasol / Ultraluna"
};

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

// Lee el archivo y lo guarda. Devuelve { partida } o { error } (texto para enseñar; con
// reintentar o dudoso, puede que a la próxima sí se pueda).
export async function procesarArchivo(locke, bytes, archivo = "") {
  const deDS = !esPartida3DS(bytes) && esPartidaDS(bytes);
  // dudoso: puede ser una partida a medio guardar (el emulador escribiendo justo entonces)
  if (!deDS && !esPartida3DS(bytes)) return { error: "Ese archivo no es una partida que se sepa leer.", dudoso: true };

  let leida;
  try {
    leida = deDS ? leerPartidaDS(bytes) : leerPartida3DS(bytes);
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
  // Con la hierba en los pueblos del randomizer, esos pueblos también son lugares de captura (y
  // Rutas los enseña, como al llegar desde el locke)
  const conHierba = hierbaEnPueblos(locke);
  if (conHierba) {
    const juegos = leer(CLAVE_HIERBA_RUTAS, {}) || {};
    if (!juegos[leida.juego]) escribir(CLAVE_HIERBA_RUTAS, { ...juegos, [leida.juego]: true });
  }
  const marcadas = marcarCapturas(nueva, leida.juego, mirados, conHierba);

  const partida = {
    ...nueva,
    actualizada: Date.now(),
    archivo,
    cajasMuertos,
    mirados: [...mirados],
    muertosVistos: anterior.muertosVistos || [],
    creados: anterior.creados || []
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

// Los Pokémon metidos desde la web (nuevos, clonados, de un equipo): no son capturas de
// ninguna ruta ni muertos que apuntar. Se apuntan antes de escribirlos, para que la lectura de
// después ya los encuentre.
export function marcarMetidos(idLocke, llaves) {
  const partida = partidaDe(idLocke);
  if (!partida) return;
  partida.mirados = [...new Set([...(partida.mirados || []), ...llaves])];
  partida.muertosVistos = [...new Set([...(partida.muertosVistos || []), ...llaves])];
  guardarPartida(idLocke, partida);
}

// Los creados de cero en la web (no los clonados): su juego de origen se ve como «LockeDex»
export function marcarCreados(idLocke, llaves, creados = true) {
  const partida = partidaDe(idLocke);
  if (!partida) return;
  const antes = new Set(partida.creados || []);
  for (const llave of llaves) {
    if (creados) antes.add(llave);
    else antes.delete(llave);
  }
  partida.creados = [...antes];
  guardarPartida(idLocke, partida);
}

export function esCreado(idLocke, llave) {
  return ((partidaDe(idLocke) || {}).creados || []).includes(llave);
}

// El equipo de la partida para un combate (como los de «Mis equipos» en elegir-equipo.js)
export function equipoParaCombate(idLocke) {
  const partida = partidaDe(idLocke);
  if (!partida || !partida.equipo.length) return null;
  const pokemon = partida.equipo.filter((p) => !p.huevo).map((p) => pokemonParaCopia(p));
  return JSON.parse(JSON.stringify({ nombre: "Equipo de la partida", pokemon }));
}
