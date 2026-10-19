// ---------- Partidas de Switch (Espada / Escudo) ----------
//
// Lee el archivo «main» de la partida (el de la carpeta de guardado de Eden, Ryujinx, yuzu...
// o el que saca JKSV de la consola). Aquí solo se lee; escribir está en ./escribirswitch.js, que
// usa estas mismas piezas.
//
// Va cifrado con un XOR fijo de 0x7F bytes que se repite (los 32 últimos bytes, un SHA-256, no).
// Descifrado, son bloques seguidos, cada uno con su llave (u32) y su tipo, y cifrados además con
// un xorshift que empieza en la llave. Los bloques se buscan por la llave. Lo saca todo PKHeX
// (github.com/kwsch/PKHeX: SwishCrypto, SCBlock y SAV8SWSH).

export const TAM_POKEMON = 0x148; // los datos que se guardan (con la suma)
export const TAM_HUECO = 0x158;   // en el equipo y también en las cajas (con nivel, PS...)
export const POR_CAJA = 30;
export const CAJAS = 32;

export const XOR = [
  0xa0, 0x92, 0xd1, 0x06, 0x07, 0xdb, 0x32, 0xa1, 0xae, 0x01, 0xf5, 0xc5, 0x1e, 0x84, 0x4f, 0xe3,
  0x53, 0xca, 0x37, 0xf4, 0xa7, 0xb0, 0x4d, 0xa0, 0x18, 0xb7, 0xc2, 0x97, 0xda, 0x5f, 0x53, 0x2b,
  0x75, 0xfa, 0x48, 0x16, 0xf8, 0xd4, 0x8a, 0x6f, 0x61, 0x05, 0xf4, 0xe2, 0xfd, 0x04, 0xb5, 0xa3,
  0x0f, 0xfc, 0x44, 0x92, 0xcb, 0x32, 0xe6, 0x1b, 0xb9, 0xb1, 0x2e, 0x01, 0xb0, 0x56, 0x53, 0x36,
  0xd2, 0xd1, 0x50, 0x3d, 0xde, 0x5b, 0x2e, 0x0e, 0x52, 0xfd, 0xdf, 0x2f, 0x7b, 0xca, 0x63, 0x50,
  0xa4, 0x67, 0x5d, 0x23, 0x17, 0xc0, 0x52, 0xe1, 0xa6, 0x30, 0x7c, 0x2b, 0xb6, 0x70, 0x36, 0x5b,
  0x2a, 0x27, 0x69, 0x33, 0xf5, 0x63, 0x7b, 0x36, 0x3f, 0x26, 0x9b, 0xa3, 0xed, 0x7a, 0x53, 0x00,
  0xa4, 0x48, 0xb3, 0x50, 0x9e, 0x14, 0xa0, 0x52, 0xde, 0x7e, 0x10, 0x2b, 0x1b, 0x77, 0x6e
];
export const HASH = 0x20;

// Los bloques que se usan, por su llave
export const LLAVES = {
  cajas: 0x0d66012c,
  equipo: 0x2985fe5d,
  entrenador: 0xf25c070e,
  nombresCajas: 0x19722c89,
  abiertas: 0x71825204,
  bolsa: 0x1177c2c4
};

// Tipos de bloque: 1-3 sin datos (los sí/no), 4 objeto (con su largo), 5 lista (cuántos y de
// qué tipo); los demás, un número de este tamaño
const OBJETO = 4;
const LISTA = 5;
const TAMANOS = { 3: 1, 8: 1, 9: 2, 10: 4, 11: 8, 12: 1, 13: 2, 14: 4, 15: 8, 16: 4, 17: 8 };

// Edición (byte 0xDE de cada Pokémon y 0xA4 del entrenador). También las de otros juegos: los
// que llegan por HOME no son capturas de Galar.
const VERSIONES = {
  24: "X", 25: "Y", 26: "Zafiro Alfa", 27: "Rubí Omega", 30: "Sol", 31: "Luna", 32: "Ultrasol", 33: "Ultraluna",
  34: "Pokémon GO", 35: "Rojo", 36: "Verde", 37: "Azul", 38: "Amarillo", 39: "Oro", 40: "Plata", 41: "Cristal",
  42: "Let's Go, Pikachu!", 43: "Let's Go, Eevee!", 44: "Espada", 45: "Escudo", 47: "Leyendas Arceus",
  48: "Diamante Brillante", 49: "Perla Reluciente", 50: "Escarlata", 51: "Púrpura"
};

// ---------- Descifrar ----------

function avanzar(estado) {
  estado = (estado ^ (estado << 2)) >>> 0;
  estado = (estado ^ (estado >>> 15)) >>> 0;
  return (estado ^ (estado << 13)) >>> 0;
}

// Los bytes del xorshift de un bloque, de uno en uno
export function xorshift(llave) {
  let estado = llave >>> 0;
  let unos = 0;
  for (let n = estado; n; n &= n - 1) unos++;
  for (let i = 0; i < unos; i++) estado = avanzar(estado);
  let cuenta = 0;
  return () => {
    const byte = (estado >>> (cuenta * 8)) & 0xff;
    if (cuenta === 3) {
      estado = avanzar(estado);
      cuenta = 0;
    } else {
      cuenta++;
    }
    return byte;
  };
}

// Map llave -> { datos (descifrados), inicio (dónde empiezan en el archivo), cabecera (cuántos
// bytes del xorshift van antes de los datos: los del tipo y el tamaño) }, solo de los bloques de
// LLAVES (de los demás basta con saltarlos). Error si el archivo no acaba justo donde acaba el
// último bloque.
function bloques(bytes) {
  const largo = bytes.length - HASH;
  const datos = new Uint8Array(largo);
  for (let i = 0; i < largo; i++) datos[i] = bytes[i] ^ XOR[i % XOR.length];
  const vista = new DataView(datos.buffer);
  const buscados = new Set(Object.values(LLAVES));
  const salida = new Map();

  let o = 0;
  while (o < largo) {
    if (o + 5 > largo) throw new Error("Bloque cortado.");
    const llave = vista.getUint32(o, true);
    const siguiente = xorshift(llave);
    const numero = () => (siguiente() | (siguiente() << 8) | (siguiente() << 16) | (siguiente() << 24)) >>> 0;
    o += 4;
    const tipo = datos[o++] ^ siguiente();
    let tam;
    let cabecera = 1;
    if (tipo >= 1 && tipo <= 3) tam = 0;
    else if (tipo === OBJETO) {
      tam = vista.getUint32(o, true) ^ numero();
      o += 4;
      cabecera += 4;
    } else if (tipo === LISTA) {
      const cuantos = vista.getUint32(o, true) ^ numero();
      const sub = datos[o + 4] ^ siguiente();
      o += 5;
      cabecera += 5;
      if (!TAMANOS[sub]) throw new Error("Tipo de lista desconocido.");
      tam = cuantos * TAMANOS[sub];
    } else if (TAMANOS[tipo]) tam = TAMANOS[tipo];
    else throw new Error("Tipo de bloque desconocido.");
    if (tam < 0 || o + tam > largo) throw new Error("Bloque cortado.");

    if (buscados.has(llave)) {
      const bloque = datos.slice(o, o + tam);
      for (let i = 0; i < tam; i++) bloque[i] ^= siguiente();
      salida.set(llave, { datos: bloque, inicio: o, cabecera });
    }
    o += tam;
  }
  return salida;
}

// Las partidas de Espada / Escudo pesan entre 1,4 y 1,8 MB (según los DLC)
function tamanoPosible(bytes) {
  return bytes.length > 0x100000 && bytes.length < 0x400000;
}

// Descifrada y con lo que hace falta, o null. Lo de abrirSwSh, sin la caché.
function abrir(bytes) {
  if (!tamanoPosible(bytes)) return null;
  let mapa;
  try {
    mapa = bloques(bytes);
  } catch (error) {
    return null;
  }
  const cajas = mapa.get(LLAVES.cajas);
  const equipo = mapa.get(LLAVES.equipo);
  const entrenador = mapa.get(LLAVES.entrenador);
  if (!cajas || !equipo || !entrenador || cajas.datos.length < CAJAS * POR_CAJA * TAM_HUECO || equipo.datos.length <= 6 * TAM_HUECO) return null;
  return mapa;
}

// Descifrar es pasar por todo el archivo (1,5 MB): se hace una vez por partida. Las partidas no
// se cambian nunca en el sitio (el editor trabaja sobre copias), así que vale con el array.
const abiertas = new WeakMap();

// Map llave -> { datos, inicio, cabecera } (ver bloques), o null si no es una partida de
// Espada / Escudo. No hay que cambiar los datos que devuelve: son los de la caché.
export function abrirSwSh(bytes) {
  if (!abiertas.has(bytes)) abiertas.set(bytes, abrir(bytes));
  return abiertas.get(bytes);
}

export function esPartidaSwSh(bytes) {
  return Boolean(abrirSwSh(bytes));
}

// ---------- Pokémon ----------

export const ORDEN = [
  [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 3, 1, 2], [0, 2, 3, 1], [0, 3, 2, 1],
  [1, 0, 2, 3], [1, 0, 3, 2], [2, 0, 1, 3], [3, 0, 1, 2], [2, 0, 3, 1], [3, 0, 2, 1],
  [1, 2, 0, 3], [1, 3, 0, 2], [2, 1, 0, 3], [3, 1, 0, 2], [2, 3, 0, 1], [3, 2, 0, 1],
  [1, 2, 3, 0], [1, 3, 2, 0], [2, 1, 3, 0], [3, 1, 2, 0], [2, 3, 1, 0], [3, 2, 1, 0]
];
export const TROZO = 0x50;

// XOR con el generador lineal desde la llave (los datos de equipo vuelven a empezar). Cifra y
// descifra igual.
export function xorPokemon(vista, llave) {
  let semilla = llave;
  for (let i = 8; i < vista.byteLength; i += 2) {
    if (i === TAM_POKEMON) semilla = llave;
    semilla = (Math.imul(semilla, 0x41c64e6d) + 0x6073) >>> 0;
    vista.setUint16(i, vista.getUint16(i, true) ^ (semilla >>> 16), true);
  }
}

export function ordenDe(llave) {
  return ORDEN[((llave >>> 13) & 31) % 24];
}

export function sumaPokemon(vista) {
  let suma = 0;
  for (let i = 8; i < TAM_POKEMON; i += 2) suma = (suma + vista.getUint16(i, true)) & 0xffff;
  return suma;
}

// Como en 3DS, con trozos de 80 bytes: el XOR y deshacer el barajado. null si no cuadra la suma
// (los huecos vacíos sí cuadran: van todos a ceros, especie 0 incluida).
export function descifrar(cifrado) {
  const datos = new Uint8Array(cifrado);
  const vista = new DataView(datos.buffer);
  const llave = vista.getUint32(0, true);
  xorPokemon(vista, llave);

  const copia = datos.slice(8, 8 + TROZO * 4);
  ordenDe(llave).forEach((origen, destino) =>
    datos.set(copia.subarray(origen * TROZO, (origen + 1) * TROZO), 8 + destino * TROZO)
  );

  if (sumaPokemon(vista) !== vista.getUint16(6, true)) return null;
  return vista;
}

// Texto en UTF-16 terminado en 0
export function texto(vista, inicio, maximo) {
  let salida = "";
  for (let i = 0; i < maximo && inicio + i * 2 + 1 < vista.byteLength; i++) {
    const c = vista.getUint16(inicio + i * 2, true);
    if (!c) break;
    salida += String.fromCharCode(c);
  }
  return salida;
}

export function interpretar(v, enEquipo) {
  const especie = v.getUint16(0x08, true);
  if (!especie) return null;

  const pid = v.getUint32(0x1c, true);
  const tid = v.getUint16(0x0c, true);
  const sid = v.getUint16(0x0e, true);
  const ivs = v.getUint32(0x8c, true);
  const p = {
    especie,
    forma: v.getUint8(0x24),
    genero: ["M", "F", ""][(v.getUint8(0x22) >> 2) & 3] || "",
    mote: (ivs >>> 31) ? texto(v, 0x58, 12) : "",
    huevo: Boolean((ivs >>> 30) & 1),
    shiny: (tid ^ sid ^ (pid >>> 16) ^ (pid & 0xffff)) < 16,
    objeto: v.getUint16(0x0a, true),
    habilidad: v.getUint16(0x14, true),
    naturaleza: v.getUint8(0x21), // la de las estadísticas (cambia con las mentas)
    experiencia: v.getUint32(0x10, true),
    ataques: [0x72, 0x74, 0x76, 0x78].map((o) => v.getUint16(o, true)).filter(Boolean),
    ivs: [0, 5, 10, 20, 25, 15].map((b) => (ivs >>> b) & 31), // PS, Ata, Def, AtE, DfE, Vel
    evs: [0x26, 0x27, 0x28, 0x2a, 0x2b, 0x29].map((o) => v.getUint8(o)),
    lugar: v.getUint16(0x122, true),
    lugarHuevo: v.getUint16(0x120, true),
    nivelCaptura: v.getUint8(0x125) & 0x7f,
    fechaCaptura: `20${String(v.getUint8(0x11c)).padStart(2, "0")}-${String(v.getUint8(0x11d)).padStart(2, "0")}-${String(v.getUint8(0x11e)).padStart(2, "0")}`,
    ball: v.getUint8(0x124),
    origen: VERSIONES[v.getUint8(0xde)] || "",
    entrenador: texto(v, 0xf8, 12),
    llave: v.getUint32(0, true)
  };
  if (enEquipo) {
    p.nivel = v.getUint8(0x148);
    p.ps = v.getUint16(0x8a, true);
    p.psMax = v.getUint16(0x14a, true);
  }
  return p;
}

function leerPokemon(bloque, inicio, enEquipo) {
  const v = descifrar(bloque.buffer.slice(bloque.byteOffset + inicio, bloque.byteOffset + inicio + TAM_HUECO));
  return v ? interpretar(v, enEquipo) : null;
}

// ---------- Partida ----------

// Cuántas cajas hay abiertas (se van abriendo según se llenan)
export function cajasAbiertasSwSh(bytes) {
  const abiertas = abrirSwSh(bytes).get(LLAVES.abiertas);
  return abiertas && abiertas.datos[0] ? Math.min(CAJAS, abiertas.datos[0]) : CAJAS;
}

export function leerPartidaSwSh(bytes) {
  const mapa = abrirSwSh(bytes);
  if (!mapa) throw new Error("No parece una partida de Espada / Escudo.");

  const ent = mapa.get(LLAVES.entrenador).datos;
  const vistaEnt = new DataView(ent.buffer);

  const eq = mapa.get(LLAVES.equipo).datos;
  const cuantos = Math.min(6, eq[6 * TAM_HUECO]);
  const equipo = [];
  for (let i = 0; i < cuantos; i++) {
    const p = leerPokemon(eq, i * TAM_HUECO, true);
    if (p) equipo.push(p);
  }

  const cj = mapa.get(LLAVES.cajas).datos;
  const nombres = mapa.get(LLAVES.nombresCajas) && mapa.get(LLAVES.nombresCajas).datos;
  const vistaNombres = nombres && new DataView(nombres.buffer);
  const cajas = [];
  for (let c = 0; c < CAJAS; c++) {
    const pokemon = [];
    for (let s = 0; s < POR_CAJA; s++) {
      const p = leerPokemon(cj, (c * POR_CAJA + s) * TAM_HUECO, false);
      if (p) pokemon.push({ ...p, hueco: s });
    }
    cajas.push({ nombre: (vistaNombres && texto(vistaNombres, c * 0x22, 16)) || `Caja ${c + 1}`, pokemon });
  }

  return {
    juego: "swsh",
    version: VERSIONES[ent[0xa4]] || "",
    gen: 8,
    entrenador: texto(vistaEnt, 0xb0, 12),
    abiertas: cajasAbiertasSwSh(bytes),
    equipo,
    cajas
  };
}

// Lo del entrenador que hace falta para crear un Pokémon suyo (pokemonswitch.js, crearPokemon)
export function entrenadorSwSh(bytes) {
  const ent = abrirSwSh(bytes).get(LLAVES.entrenador).datos;
  const v = new DataView(ent.buffer, ent.byteOffset, ent.byteLength);
  return {
    tid: v.getUint16(0xa0, true),
    sid: v.getUint16(0xa2, true),
    version: ent[0xa4],
    genero: ent[0xa5],
    idioma: ent[0xa7],
    nombre: ent.slice(0xb0, 0xb0 + 0x1a)
  };
}
