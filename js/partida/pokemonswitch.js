// ---------- Un Pokémon de una partida de Switch, para editarlo ----------
//
// Lo mismo que ./pokemon3ds.js (mismos nombres y mismo objeto «editable»), con los offsets de los
// Pokémon de gen 8 (PK8 y PB8 de PKHeX: Espada / Escudo y Diamante Brillante / Perla Reluciente
// guardan igual a los Pokémon). La diferencia con 3DS: en las cajas también van con el nivel y
// las estadísticas (0x158 bytes en todas partes), así que siempre se recalculan.
//
// Entre los dos juegos solo cambian dos lugares especiales: el de «ninguno» (Espada / Escudo, 0;
// Perla Reluciente, 65535) y el de la guardería. Por eso pokemonGen8(lugares) da las funciones
// de cada uno; las sueltas son las de Espada / Escudo.
//
// Lo que no se toca aquí (recuerdos, cintas, marcas, nivel Dinamax, entrenador que lo tiene...) se
// queda tal cual estaba.

import { TAM_HUECO } from "./switch.js";
import { estadisticas } from "./pokemon3ds.js";
import { ritmoDe, experienciaPara, nivelDe } from "./convertir.js";

// Orden de la web (PS, Ataque, Defensa, At. Esp., Def. Esp., Velocidad) -> sitio en el Pokémon
const EVS = [0x26, 0x27, 0x28, 0x2a, 0x2b, 0x29];
const BITS_IV = [0, 5, 10, 20, 25, 15];

const MAX_MOTE = 12;
const GENEROS = ["M", "F", ""];

// Lugares especiales de gen 8 (0x122 dónde se conoció, 0x120 dónde se recibió el huevo)
const LUGAR_INTERCAMBIO = 30001; // los creados aquí: así no cuentan como captura de ninguna ruta
export const LUGARES_SWSH = { ninguno: 0, guarderia: 60002 };
export const LUGARES_BDSP = { ninguno: 65535, guarderia: 60010 };
const POKE_BALL = 4;

function texto(vista, inicio, maximo) {
  let salida = "";
  for (let i = 0; i < maximo; i++) {
    const c = vista.getUint16(inicio + i * 2, true);
    if (!c) break;
    salida += String.fromCharCode(c);
  }
  return salida;
}

// 12 letras y el 0 del final; lo que sobra, a ceros
function escribirTexto(vista, inicio, cadena) {
  const letras = [...cadena].slice(0, MAX_MOTE);
  for (let i = 0; i <= MAX_MOTE; i++) vista.setUint16(inicio + i * 2, letras[i] ? letras[i].charCodeAt(0) : 0, true);
}

function esShiny(vista) {
  const pid = vista.getUint32(0x1c, true);
  return (vista.getUint16(0x0c, true) ^ vista.getUint16(0x0e, true) ^ (pid >>> 16) ^ (pid & 0xffff)) < 16;
}

// Dónde está la amistad que cuenta: la del entrenador original o, si lo tiene otro, la suya
function sitioAmistad(datos) {
  return datos[0xc4] === 1 ? 0xc8 : 0x112;
}

function ponerFecha(datos, inicio, fecha) {
  datos[inicio] = fecha.getFullYear() % 100;
  datos[inicio + 1] = fecha.getMonth() + 1;
  datos[inicio + 2] = fecha.getDate();
}

export function leerEditable(crudo) {
  const v = new DataView(crudo.buffer, crudo.byteOffset, crudo.byteLength);
  const iv32 = v.getUint32(0x8c, true);
  const especie = v.getUint16(0x08, true);
  const experiencia = v.getUint32(0x10, true);
  const huevo = Boolean((iv32 >>> 30) & 1);
  const apodado = Boolean(iv32 >>> 31);
  return {
    especie,
    forma: v.getUint16(0x24, true),
    genero: GENEROS[(crudo[0x22] >> 2) & 3] || "",
    apodado,
    mote: apodado && !huevo ? texto(v, 0x58, MAX_MOTE) : "", // el de los huevos es «Huevo»
    shiny: esShiny(v),
    objeto: v.getUint16(0x0a, true),
    habilidad: v.getUint16(0x14, true),
    numHabilidad: crudo[0x16] & 7, // 1, 2 o 4 (la oculta)
    naturaleza: crudo[0x21], // la que cuenta para las estadísticas (cambia con las mentas)
    experiencia,
    nivel: nivelDe(especie, experiencia),
    evs: EVS.map((o) => crudo[o]),
    ivs: BITS_IV.map((b) => (iv32 >>> b) & 31),
    amistad: crudo[sitioAmistad(crudo)],
    ataques: [0, 1, 2, 3].map((i) => ({ id: v.getUint16(0x72 + i * 2, true), pp: crudo[0x7a + i], masPP: crudo[0x7e + i] })),
    huevo,
    ball: crudo[0x124],
    lugar: v.getUint16(0x122, true), // dónde se conoció (0 en los huevos)
    version: crudo[0xde], // juego de origen
    entrenador: texto(v, 0xf8, MAX_MOTE), // entrenador original
    idioma: crudo[0xe2],
    enEquipo: true
  };
}

// Copia del Pokémon con los cambios. Como aplicarEditable de ./pokemon3ds.js.
export function aplicarEditable(crudo, editable, opciones, lugares = LUGARES_SWSH) {
  const { base, nombreEspecie, nombreHuevo = "Huevo" } = opciones;
  const antes = leerEditable(crudo);
  const datos = new Uint8Array(crudo);
  const v = new DataView(datos.buffer);
  const e = editable;
  const huevo = e.huevo === undefined ? antes.huevo : Boolean(e.huevo);
  const hoy = new Date();

  v.setUint16(0x08, e.especie, true);
  v.setUint16(0x0a, e.objeto || 0, true);
  v.setUint16(0x14, e.habilidad, true);
  datos[0x16] = (datos[0x16] & ~7) | e.numHabilidad;
  // La naturaleza y la de las estadísticas, la misma (como sin mentas)
  if (e.naturaleza !== antes.naturaleza) datos[0x20] = datos[0x21] = e.naturaleza;
  datos[0x22] = (datos[0x22] & 0xf3) | (Math.max(0, GENEROS.indexOf(e.genero)) << 2);
  v.setUint16(0x24, e.forma, true);
  if (e.ball) datos[0x124] = e.ball;

  // La experiencia solo se cambia si cambia el nivel o la especie (que puede crecer a otro
  // ritmo): así no se pierde lo que llevaba hacia el siguiente nivel
  const nivel = Math.max(1, Math.min(100, e.nivel));
  if (e.especie !== antes.especie || nivel !== antes.nivel) {
    v.setUint32(0x10, experienciaPara(ritmoDe(e.especie), nivel), true);
  }

  // Huevo: como los de la guardería (sin lugar ni fecha de conocerse hasta que eclosione).
  // Al dejar de serlo, se ha conocido hoy.
  if (huevo && !antes.huevo) {
    v.setUint16(0x120, lugares.guarderia, true);
    ponerFecha(datos, 0x119, hoy);
    v.setUint16(0x122, lugares.ninguno, true);
    datos.fill(0, 0x11c, 0x11f);
    datos[0x125] &= 0x80;
  } else if (!huevo && antes.huevo) {
    if (!datos[0x11c]) ponerFecha(datos, 0x11c, hoy);
    datos[0x125] = (datos[0x125] & 0x80) | nivel;
  }

  // Origen: dónde se conoció (los huevos no tienen), el juego y el entrenador original
  if (e.lugar !== undefined && !huevo) v.setUint16(0x122, e.lugar, true);
  if (e.version) datos[0xde] = e.version;
  const entrenador = String(e.entrenador ?? antes.entrenador).trim();
  if (entrenador && entrenador !== antes.entrenador) escribirTexto(v, 0xf8, entrenador);

  EVS.forEach((o, i) => (datos[o] = Math.max(0, Math.min(252, e.evs[i]))));
  let iv32 = 0;
  BITS_IV.forEach((b, i) => (iv32 |= (Math.max(0, Math.min(31, e.ivs[i])) & 31) << b));
  const mote = huevo ? "" : String(e.mote || "").trim();
  if (huevo) iv32 |= 3 << 30; // los huevos llevan el nombre «Huevo» como mote
  else if (mote) iv32 |= 1 << 31;
  v.setUint32(0x8c, iv32 >>> 0, true);

  // El nombre: el mote o, sin él, el de la especie. Solo si cambia algo (el que trae la partida
  // es el bueno, con sus mayúsculas y en su idioma)
  if (huevo !== antes.huevo || mote !== antes.mote || e.especie !== antes.especie) {
    escribirTexto(v, 0x58, huevo ? nombreHuevo : mote || nombreEspecie);
  }

  // Shiny: la mitad alta del PID se ajusta a la ID y la SID del entrenador
  if (e.shiny !== antes.shiny) {
    const pid = v.getUint32(0x1c, true);
    const bajo = pid & 0xffff;
    const ids = v.getUint16(0x0c, true) ^ v.getUint16(0x0e, true);
    const alto = e.shiny ? ids ^ bajo : (ids ^ bajo ^ 0x8000) & 0xffff;
    v.setUint32(0x1c, ((alto << 16) | bajo) >>> 0, true);
  }

  datos[sitioAmistad(datos)] = Math.max(0, Math.min(255, e.amistad));

  e.ataques.forEach((ataque, i) => {
    v.setUint16(0x72 + i * 2, (ataque && ataque.id) || 0, true);
    datos[0x7a + i] = ataque && ataque.id ? ataque.pp : 0;
    datos[0x7e + i] = ataque && ataque.id ? ataque.masPP : 0;
  });

  // El nivel y las estadísticas van guardados (en las cajas también): se vuelven a calcular
  if (base) ponerDatosDeEquipo(datos, base);
  return datos;
}

// Nivel, PS (llenos, y sin estado: curado) y estadísticas
function ponerDatosDeEquipo(datos, base) {
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const e = leerEditable(datos);
  const [ps, ataque, defensa, ataqueEsp, defensaEsp, velocidad] = estadisticas(base, e.nivel, e.naturaleza, e.evs, e.ivs, e.especie);
  v.setUint16(0x8a, ps, true);
  v.setUint32(0x94, 0, true);
  datos[0x148] = e.nivel;
  [ps, ataque, defensa, velocidad, ataqueEsp, defensaEsp].forEach((valor, i) => v.setUint16(0x14a + i * 2, valor, true));
}

// En Switch el equipo y las cajas guardan lo mismo: al pasar al equipo solo se cura
export function paraEquipo(crudo, base) {
  const datos = new Uint8Array(crudo);
  if (base) ponerDatosDeEquipo(datos, base);
  return datos;
}

export function paraCaja(crudo) {
  return new Uint8Array(crudo);
}

function alAzar() {
  const numero = new Uint32Array(1);
  crypto.getRandomValues(numero);
  return numero[0];
}

// Copia con otra llave: para la web es otro Pokémon (la llave es lo que los distingue)
export function conLlaveNueva(crudo) {
  const datos = paraCaja(crudo);
  new DataView(datos.buffer).setUint32(0, alAzar() || 1, true);
  return datos;
}

// Un Pokémon nuevo, como si lo hubiera conseguido el entrenador de la partida (switch.js,
// entrenadorSwSh; bdsp.js, entrenadorBDSP) por intercambio hoy. editable y opciones, como en
// aplicarEditable.
export function crearPokemon(entrenador, editable, opciones, lugares = LUGARES_SWSH) {
  const datos = new Uint8Array(TAM_HUECO);
  const v = new DataView(datos.buffer);
  v.setUint32(0x00, alAzar() || 1, true);
  v.setUint32(0x1c, alAzar(), true);
  v.setUint16(0x0c, entrenador.tid, true);
  v.setUint16(0x0e, entrenador.sid, true);
  datos.set(entrenador.nombre, 0xf8);
  datos[0x50] = alAzar() & 0xff; // altura y peso (los salvajes los llevan al azar)
  datos[0x51] = alAzar() & 0xff;
  datos[0xde] = entrenador.version;
  datos[0xe2] = entrenador.idioma;
  ponerFecha(datos, 0x11c, new Date());
  v.setUint16(0x120, lugares.ninguno, true); // no viene de un huevo
  v.setUint16(0x122, LUGAR_INTERCAMBIO, true);
  datos[0x124] = POKE_BALL;
  datos[0x125] = (entrenador.genero ? 0x80 : 0) | Math.max(1, Math.min(100, editable.nivel));
  datos[0x20] = datos[0x21] = editable.naturaleza; // la de verdad y la de las estadísticas
  return aplicarEditable(datos, editable, opciones, lugares);
}

// Las funciones de un juego (lugares: LUGARES_SWSH o LUGARES_BDSP), con los mismos nombres que
// las de ./pokemon3ds.js y ./pokemonds.js
export function pokemonGen8(lugares) {
  return {
    leerEditable, paraEquipo, paraCaja, conLlaveNueva, esHuevo, especieDe, formaDe,
    aplicarEditable: (crudo, editable, opciones) => aplicarEditable(crudo, editable, opciones, lugares),
    crearPokemon: (entrenador, editable, opciones) => crearPokemon(entrenador, editable, opciones, lugares)
  };
}

// true si es un huevo
export function esHuevo(crudo) {
  return Boolean((new DataView(crudo.buffer, crudo.byteOffset, crudo.byteLength).getUint32(0x8c, true) >>> 30) & 1);
}

export function especieDe(crudo) {
  return crudo[0x08] | (crudo[0x09] << 8);
}

export function formaDe(crudo) {
  return crudo[0x24] | (crudo[0x25] << 8);
}
