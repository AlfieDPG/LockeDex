// ---------- Negro 2 / Blanco 2: los datos que se randomizan ----------
//
// Dónde está cada cosa (rutas de NitroFS, comprobadas con la ROM española de Blanco 2):
//   a/0/1/6  datos de cada Pokémon (76 bytes): estadísticas base 0-5, tipos 6-7, objetos que
//            llevan los salvajes 12/14/16 (u16), habilidades 24-26, compatibilidad con las MT
//            40-52 (bits) y con los tutores 60-75 (bits)
//   a/0/1/8  ataques por nivel: [ataque u16, nivel u16] hasta 0xFFFF 0xFFFF
//   a/0/1/9  evoluciones: 7 de [método u16, dato u16, especie u16]
//   a/0/2/1  ataques: tipo 0, categoría 2, potencia 3, precisión 4, PP 5
//   a/0/2/4  objetos: precio u16 en 0
//   a/0/9/1  entrenadores (byte 0: 1 = ataques propios, 2 = objetos; byte 2: tipo de combate;
//            byte 3: cuántos Pokémon; byte 12: marcas de la IA)
//   a/0/9/2  sus Pokémon: [dificultad, habilidad/género, nivel u16, especie u16, forma u16],
//            luego el objeto (u16) y los 4 ataques (u16) si los lleva
//   a/1/2/7  salvajes: por estación (1 o 4), 232 bytes: 7 probabilidades (una por tipo de zona) y
//            8 bytes, y los huecos de 4 bytes [especie | forma << 11 (u16), nivel mín., nivel máx.]
//   a/1/6/3  intercambios: da (u32 en 4), forma (8), IVs (6 × u32 en 0x10), naturaleza (0x2C),
//            objeto (u32 en 0x4C), pide (u32 en 0x5C)
//   a/2/8/2  tiendas: lista de objetos (u16)
//   a/0/5/6  scripts: el 854 lleva las tres iniciales; el 1240 y el 1241, los objetos del suelo
//            y los escondidos; y los estáticos, cada uno en los suyos (./estaticos-bw2.js)

import { leerNarc, crearNarc } from "./rom-nds.js";
import { ESTATICOS_BW2 } from "./estaticos-bw2.js";
import { leerTextos, escribirTextos } from "./textos-bw.js";
import { descomprimirLZ } from "./lz.js";

export const ULTIMA_ESPECIE = 649;
export const ULTIMO_ATAQUE = 559;
export const ULTIMO_OBJETO = 638;
export const ULTIMA_HABILIDAD = 164;

// Juegos que se saben randomizar, por las tres primeras letras del código de la ROM
export const JUEGOS_BW2 = { IRE: "Negro 2", IRD: "Blanco 2" };

const RUTAS = {
  datos: "a/0/1/6", aprende: "a/0/1/8", evoluciones: "a/0/1/9", ataques: "a/0/2/1", objetos: "a/0/2/4",
  entrenadores: "a/0/9/1", equipos: "a/0/9/2", salvajes: "a/1/2/7", intercambios: "a/1/6/3", tiendas: "a/2/8/2",
  scripts: "a/0/5/6"
};
const SCRIPT_INICIALES = 854;
const INICIALES = [[0x58b, 0x590, 0x595], [0x5c0, 0x5c5, 0x5ca], [0x5e2, 0x5e7, 0x5ec]]; // cada una, en tres sitios
const SCRIPTS_OBJETOS = [[1240, 0x28, 0x800c], [1241, 0x2a, 0x8000]]; // [script, orden, variable]: suelo y escondidos
const FIN_LISTA_SCRIPTS = 0xfd13;
// El intercambio que no se usa: en Blanco 2 el 24, en Negro 2 el 25 (cada uno tiene el suyo)
const intercambioSinUsar = (rom) => (rom.codigo.startsWith("IRD") ? 24 : 25);
const CLAROS = "a/2/7/3";
const claroDeVersion = (rom) => (rom.codigo.startsWith("IRD") ? 0 : 1);
export const TIENDAS_MT = [7, 10, 12, 17, 24];
export const TIENDAS_NORMALES = [0, 1, 2, 3, 4, 5];
// Las especiales por las que se pasa en la historia; la primera, la de Ciudad Hiun
export const TIENDAS_HISTORIA = [9, 11, 14, 15, 16, 18, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31];
export const TIENDA_PRIMERA = 27;

// Tipos por su número en el juego (como en js/comun/tipos.js)
export const TIPOS = [
  "normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel",
  "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark"
];

// Métodos de evolución (gen 5)
export const EVO = {
  nivel: 4, intercambio: 5, intercambioObjeto: 6, intercambioEspecial: 7, piedra: 8, belleza: 16,
  piedraMacho: 17, piedraHembra: 18, objetoDia: 19, objetoNoche: 20, ataque: 21, otroEnEquipo: 22
};

// Zonas de los salvajes: hierba, hierba alta (dobles), hierba que se mueve, surf, surf con
// burbujas, pesca y pesca con burbujas
export const ZONAS = [
  { id: "hierba", huecos: 12 }, { id: "hierba-doble", huecos: 12 }, { id: "hierba-especial", huecos: 12 },
  { id: "surf", huecos: 5 }, { id: "surf-especial", huecos: 5 }, { id: "pesca", huecos: 5 }, { id: "pesca-especial", huecos: 5 }
];
const POR_ESTACION = 232;
const ORDEN_STATS = [0, 1, 2, 4, 5, 3]; // dónde va cada estadística (PS, Ata, Def, AtE, DfE, Vel)

// Los entrenadores importantes: líderes (y sus equipos del modo reto), Alto Mando, campeón, los
// hermanos del restaurante y el rival (sus tres versiones, una por inicial)
const LIDERES = [
  0x9c, 0x2fc, 0x9d, 0x2fd, 0x9a, 0x2fe, 0x99, 0x2ff, 0x9e, 0x300, 0x9b, 0x301, 0x9f, 0x302, 0xa0, 0x303,
  0x26, 0x304, 0x8f, 0x309, 0x28, 0x305, 0x91, 0x30a, 0x29, 0x307, 0x92, 0x30c, 0x27, 0x306, 0x90, 0x30b,
  0x155, 0x308, 0x218, 0x30d, 0x1f0, 0x1ee, 0x1ef, 0x246, 0x1c8, 0xca, 0xc9
];
const RIVAL = [0xa1, 0xa6, 0x24c, 0x170, 0x17a, 0x2bd, 0x31a, 0x2ac, 0x2b5, 0x2b8];
export const IMPORTANTES = new Set([...LIDERES, ...RIVAL.flatMap((i) => [i, i + 1, i + 2])]);

// Cada gimnasio (su líder, con sus equipos del modo reto, y los entrenadores de dentro), cada
// miembro del Alto Mando (normal, reto y revancha) y el campeón: los de un mismo tipo, si se pide
export const GRUPOS_JEFES = [
  [0x9c, 0x2fc, 0xab, 0xac],
  [0x9d, 0x2fd, 0xb2, 0xb3],
  [0x9a, 0x2fe, 0x2de, 0x2df, 0x2e0, 0x2e1],
  [0x99, 0x2ff, 0x26d, 0x94, 0xcf, 0xd0, 0xd1],
  [0x9e, 0x300, 0x13f, 0x140, 0x141, 0x142, 0x143, 0x144, 0x145],
  [0x9b, 0x301, 0x95, 0x96, 0x97, 0x98, 0x14c],
  [0x9f, 0x302, 0x17d, 0x17e, 0x17f, 0x180, 0x181],
  [0xa0, 0x303, 0x15e, 0x15f, 0x160, 0x161, 0x162, 0x163],
  [0x26, 0x304, 0x8f, 0x309],
  [0x28, 0x305, 0x91, 0x30a],
  [0x29, 0x307, 0x92, 0x30c],
  [0x27, 0x306, 0x90, 0x30b],
  [0x155, 0x308, 0x218, 0x30d]
];

// Los que no pasan a combate doble: el primer combate con el rival (un solo Pokémon) y los que
// luchan a tu lado
export const SIN_DOBLES = new Set([0xa1, 0xa2, 0xa3, 0x168, 0x169, 0x16a, 0x16b, 0x16c, 0x16d]);

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
function poner16(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >> 8) & 0xff;
}
function poner32(b, i, v) {
  poner16(b, i, v & 0xffff);
  poner16(b, i + 2, (v >>> 16) & 0xffff);
}

export function esBW2(rom) {
  return Boolean(JUEGOS_BW2[rom.codigo.slice(0, 3)]);
}

// ---------- Leer ----------

function leerEspecies(narcs) {
  const especies = [];
  for (let id = 1; id <= ULTIMA_ESPECIE; id++) {
    const d = narcs.datos.archivos[id];
    const stats = ORDEN_STATS.map((o) => d[o]); // PS, Ata, Def, AtE, DfE, Vel
    const e = narcs.evoluciones.archivos[id];
    const evoluciones = [];
    for (let k = 0; k < 7; k++) {
      const metodo = u16(e, k * 6);
      const especie = u16(e, k * 6 + 4);
      if (metodo && especie) evoluciones.push({ metodo, dato: u16(e, k * 6 + 2), especie });
    }
    especies[id] = {
      id, stats, total: stats.reduce((a, b) => a + b, 0),
      tipos: [...new Set([TIPOS[d[6]], TIPOS[d[7]]])].filter(Boolean),
      habilidades: [d[24], d[25], d[26]],
      objetos: [u16(d, 12), u16(d, 14), u16(d, 16)],
      mt: d.slice(40, 53),
      tutor: d.slice(60, 76),
      evoluciones,
      previa: 0
    };
  }
  for (const e of especies) if (e) for (const evo of e.evoluciones) if (especies[evo.especie]) especies[evo.especie].previa = e.id;
  return especies;
}

function leerAprende(narcs) {
  const aprende = [];
  for (let id = 1; id <= ULTIMA_ESPECIE; id++) {
    const a = narcs.aprende.archivos[id];
    const lista = [];
    for (let i = 0; i + 3 < a.length; i += 4) {
      if (u16(a, i) === 0xffff && u16(a, i + 2) === 0xffff) break;
      lista.push([u16(a, i), u16(a, i + 2)]);
    }
    aprende[id] = lista;
  }
  return aprende;
}

function leerSalvajes(narcs) {
  return narcs.salvajes.archivos.map((a, archivo) => {
    const estaciones = [];
    for (let base = 0; base + POR_ESTACION <= a.length; base += POR_ESTACION) {
      const zonas = [];
      let pos = base + 8;
      ZONAS.forEach((zona, z) => {
        const huecos = [];
        for (let h = 0; h < zona.huecos; h++, pos += 4) {
          huecos.push({ especie: u16(a, pos) & 0x7ff, forma: u16(a, pos) >> 11, min: a[pos + 2], max: a[pos + 3] });
        }
        if (a[base + z]) zonas.push({ zona: zona.id, z, huecos });
      });
      estaciones.push(zonas);
    }
    return { archivo, estaciones };
  });
}

function leerEntrenadores(narcs) {
  const entrenadores = [];
  for (let i = 1; i < narcs.entrenadores.archivos.length; i++) {
    const t = narcs.entrenadores.archivos[i];
    const p = narcs.equipos.archivos[i];
    const conAtaques = Boolean(t[0] & 1);
    const conObjetos = Boolean(t[0] & 2);
    const pokemon = [];
    let pos = 0;
    for (let k = 0; k < t[3]; k++) {
      const poke = { dificultad: p[pos], habilidad: p[pos + 1], nivel: u16(p, pos + 2), especie: u16(p, pos + 4), forma: u16(p, pos + 6), objeto: 0 };
      pos += 8;
      if (conObjetos) {
        poke.objeto = u16(p, pos);
        pos += 2;
      }
      if (conAtaques) {
        poke.ataques = [0, 1, 2, 3].map((m) => u16(p, pos + m * 2));
        pos += 8;
      }
      pokemon.push(poke);
    }
    // combate: 0 individual, 1 doble, 2 triple, 3 rotatorio
    entrenadores.push({ indice: i, clase: t[1], combate: t[2], conAtaques, conObjetos, importante: IMPORTANTES.has(i), pokemon });
  }
  return entrenadores;
}

// Los objetos del suelo y escondidos: una lista de punteros (relativos) a trozos de script que
// empiezan por «fijar variable, objeto»
function leerObjetosSuelo(narcs) {
  const lista = [];
  for (const [archivo, orden, variable] of SCRIPTS_OBJETOS) {
    const s = narcs.scripts.archivos[archivo];
    for (let pos = 0; pos + 4 <= s.length && u16(s, pos) !== FIN_LISTA_SCRIPTS; pos += 4) {
      const destino = pos + 4 + new DataView(s.buffer, s.byteOffset).getInt32(pos, true);
      if (destino < 0 || destino + 8 > s.length) break;
      if (u16(s, destino + 2) === orden && u16(s, destino + 4) === variable) lista.push({ archivo, pos: destino + 6, objeto: u16(s, destino + 6) });
    }
  }
  return lista;
}

// ---------- MT y tutores (el programa principal y el overlay 36, descomprimidos) ----------
//
// Las 95 MT: una lista de u16 detrás de la marca «87 03 88 03» (TM01-92, luego 6 MO y TM93-95).
// Los 60 ataques de los tutores: u16 cada 12 bytes en el overlay 36, en un sitio que cambia de
// una versión a otra (se busca el que tiene sentido).
const PREFIJO_MT = [0x87, 0x03, 0x88, 0x03];
const SITIOS_TUTOR = [0x51538, 0x5152c, 0x51530];
const TUTORES = 60;
const OVERLAY_TUTORES = 36;

export function leerMovimientos(rom) {
  const arm9 = rom.leerArm9();
  let marca = -1;
  for (let i = 0; i + 4 <= arm9.length && marca < 0; i++) if (PREFIJO_MT.every((b, k) => arm9[i + k] === b)) marca = i + 4;
  if (marca < 0) throw new Error("No se han encontrado las MT.");
  const lista = (inicio, cuantos) => Array.from({ length: cuantos }, (_, k) => u16(arm9, inicio + k * 2));
  const mt = [...lista(marca, 92), ...lista(marca + 98 * 2, 3)]; // las 95 MT, sin las MO
  const mo = lista(marca + 92 * 2, 6);

  const overlay = rom.leerOverlay(OVERLAY_TUTORES);
  const sitio = SITIOS_TUTOR.find((base) => {
    const ids = Array.from({ length: TUTORES }, (_, k) => u16(overlay, base + k * 12));
    return ids.every((id) => id > 0 && id <= ULTIMO_ATAQUE) && new Set(ids).size === TUTORES;
  });
  if (sitio === undefined) throw new Error("No se han encontrado los tutores.");
  const tutor = Array.from({ length: TUTORES }, (_, k) => u16(overlay, sitio + k * 12));
  return { arm9, overlay, marca, sitio, mt, mo, tutor, cambiados: false };
}

// El color del disco de cada MT: una tabla en el programa principal (detrás de esta marca), con
// la paleta de cada objeto en (objeto × 4 + 2)
const PREFIJO_PALETAS = [0xfd, 0x03, 0xfe, 0x03, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x00];
const PALETA_DE_TIPO = {
  fighting: 398, dragon: 399, water: 400, psychic: 401, normal: 402, poison: 403, ice: 404, grass: 405, fire: 406,
  dark: 407, steel: 408, electric: 409, ground: 410, ghost: 411, rock: 412, flying: 413, bug: 610
};
const MT01 = 328;
const MT93 = 618;

// ataques: los de leerBW2 (para el tipo de cada uno)
export function escribirMovimientos(rom, m, ataques) {
  let paletas = -1;
  for (let i = 0; i + PREFIJO_PALETAS.length <= m.arm9.length && paletas < 0; i++) {
    if (PREFIJO_PALETAS.every((b, k) => m.arm9[i + k] === b)) paletas = i;
  }
  if (paletas >= 0) {
    m.mt.forEach((id, k) => {
      const objeto = k < 92 ? MT01 + k : MT93 + (k - 92);
      const tipo = ataques[id] && ataques[id].tipo;
      poner16(m.arm9, paletas + objeto * 4 + 2, PALETA_DE_TIPO[tipo] || PALETA_DE_TIPO.ghost);
    });
  }
  m.mt.slice(0, 92).forEach((id, k) => poner16(m.arm9, m.marca + k * 2, id));
  m.mt.slice(92).forEach((id, k) => poner16(m.arm9, m.marca + (98 + k) * 2, id));
  m.tutor.forEach((id, k) => poner16(m.overlay, m.sitio + k * 12, id));
  rom.escribirArm9(m.arm9);
  rom.escribirOverlay(OVERLAY_TUTORES, m.overlay);
}

export function leerBW2(rom) {
  if (!esBW2(rom)) throw new Error("Esta ROM no es de Negro 2 ni de Blanco 2.");
  const narcs = Object.fromEntries(Object.entries(RUTAS).map(([nombre, ruta]) => [nombre, leerNarc(rom.archivo(ruta))]));

  const ataques = narcs.ataques.archivos.map((a, id) =>
    id && id <= ULTIMO_ATAQUE ? { id, tipo: TIPOS[a[0]], categoria: a[2], potencia: a[3], precision: a[4], pp: a[5] } : null
  );
  const script = narcs.scripts.archivos[SCRIPT_INICIALES];

  const estaticos = ESTATICOS_BW2.map((e) => {
    const [archivo, pos] = e.especie[0];
    const nivel = e.nivel[0] ? narcs.scripts.archivos[e.nivel[0][0]][e.nivel[0][1]] : 0;
    return { ...e, actual: u16(narcs.scripts.archivos[archivo], pos), nivelActual: nivel };
  });

  const intercambios = narcs.intercambios.archivos
    .map((t, archivo) => ({
      archivo, da: u32(t, 4), pide: u32(t, 0x5c), objeto: u32(t, 0x4c),
      ivs: [0, 1, 2, 3, 4, 5].map((k) => u32(t, 0x10 + k * 4))
    }))
    // Los 24 primeros son restos de Negro / Blanco que no se usan
    .filter((t) => t.archivo >= 24 && t.archivo !== intercambioSinUsar(rom) && t.da && t.da <= ULTIMA_ESPECIE);

  // Claros ocultos: por claro, en la parte de esta versión, 3 rarezas x 4 grupos: especie (u16),
  // nivel máximo (+8), nivel (+12), género (+16) y forma (+20)
  const claros = leerNarc(rom.archivo(CLAROS));
  const version = claroDeVersion(rom);
  const huecosClaros = [];
  claros.archivos.forEach((a, archivo) => {
    for (let rareza = 0; rareza < 3; rareza++) {
      for (let grupo = 0; grupo < 4; grupo++) {
        const base = version * 78 + rareza * 26;
        if (base + 26 > a.length) continue;
        huecosClaros.push({ archivo, pos: base + grupo * 2, forma: base + 20 + grupo, especie: u16(a, base + grupo * 2) });
      }
    }
  });

  const tiendas = narcs.tiendas.archivos.map((t, indice) => ({ indice, objetos: Array.from({ length: t.length / 2 }, (_, k) => u16(t, k * 2)) }));
  const precios = narcs.objetos.archivos.map((o) => (o.length >= 2 ? u16(o, 0) : 0));

  return {
    narcs,
    especies: leerEspecies(narcs),
    aprende: leerAprende(narcs),
    ataques,
    salvajes: leerSalvajes(narcs),
    entrenadores: leerEntrenadores(narcs),
    iniciales: INICIALES.map((sitios) => u16(script, sitios[0])),
    estaticos,
    intercambios,
    objetosSuelo: leerObjetosSuelo(narcs),
    tiendas,
    precios,
    claros: { narc: claros, huecos: huecosClaros }
  };
}

// ---------- Escribir ----------

// La orden «28 00 A1 40 04 00» se cambia por un salto (1E 00 y la distancia, 4 bytes) a un trozo
// nuevo al final del script que la repite y sigue con «DE 00 00 00 FD 01 05 00». Es el arreglo de
// UPR-ZX al cambiar las iniciales: sin él, un evento de después falla.
const ORDEN_INICIALES = [0x28, 0x00, 0xa1, 0x40, 0x04, 0x00];
const TROZO_INICIALES = [...ORDEN_INICIALES, 0xde, 0x00, 0x00, 0x00, 0xfd, 0x01, 0x05, 0x00];

function arreglarScriptIniciales(script) {
  const yaEsta = TROZO_INICIALES.every((b, k) => script[script.length - TROZO_INICIALES.length + k] === b);
  if (yaEsta) return script;
  let sitio = -1;
  for (let i = 0; i + ORDEN_INICIALES.length <= script.length && sitio < 0; i++) {
    if (ORDEN_INICIALES.every((b, k) => script[i + k] === b)) sitio = i;
  }
  if (sitio <= 0) return script; // un script distinto: se deja
  const nuevo = new Uint8Array(script.length + TROZO_INICIALES.length);
  nuevo.set(script);
  nuevo.set(TROZO_INICIALES, script.length);
  nuevo[sitio] = 0x1e;
  nuevo[sitio + 1] = 0x00;
  new DataView(nuevo.buffer).setInt32(sitio + 2, script.length - (sitio + 6), true);
  return nuevo;
}

function escribirEspecies(narcs, especies) {
  for (const e of especies) {
    if (!e) continue;
    const d = narcs.datos.archivos[e.id];
    e.stats.forEach((s, k) => (d[ORDEN_STATS[k]] = s));
    d[6] = TIPOS.indexOf(e.tipos[0]);
    d[7] = TIPOS.indexOf(e.tipos[1] || e.tipos[0]);
    e.habilidades.forEach((h, k) => (d[24 + k] = h));
    e.objetos.forEach((o, k) => poner16(d, 12 + k * 2, o));
    d.set(e.mt, 40);
    d.set(e.tutor, 60);
    const v = narcs.evoluciones.archivos[e.id];
    v.fill(0);
    e.evoluciones.slice(0, 7).forEach((evo, k) => {
      poner16(v, k * 6, evo.metodo);
      poner16(v, k * 6 + 2, evo.dato);
      poner16(v, k * 6 + 4, evo.especie);
    });
  }
}

function escribirAprende(narcs, aprende) {
  for (let id = 1; id <= ULTIMA_ESPECIE; id++) {
    const lista = aprende[id] || [];
    const a = new Uint8Array(lista.length * 4 + 4);
    lista.forEach(([ataque, nivel], k) => {
      poner16(a, k * 4, ataque);
      poner16(a, k * 4 + 2, nivel);
    });
    poner16(a, lista.length * 4, 0xffff);
    poner16(a, lista.length * 4 + 2, 0xffff);
    narcs.aprende.archivos[id] = a;
  }
}

function escribirSalvajes(narcs, salvajes) {
  for (const { archivo, estaciones } of salvajes) {
    const a = narcs.salvajes.archivos[archivo];
    estaciones.forEach((zonas, e) => {
      for (const { z, huecos } of zonas) {
        let pos = e * POR_ESTACION + 8 + ZONAS.slice(0, z).reduce((t, zona) => t + zona.huecos * 4, 0);
        for (const h of huecos) {
          poner16(a, pos, (h.especie & 0x7ff) | (h.forma << 11));
          a[pos + 2] = h.min;
          a[pos + 3] = h.max;
          pos += 4;
        }
      }
    });
  }
}

// Cada equipo se vuelve a montar: puede tener más Pokémon, objetos o ataques que antes
function escribirEntrenadores(narcs, entrenadores) {
  for (const t of entrenadores) {
    const cabecera = narcs.entrenadores.archivos[t.indice];
    cabecera[0] = (cabecera[0] & ~3) | (t.conAtaques ? 1 : 0) | (t.conObjetos ? 2 : 0);
    cabecera[3] = t.pokemon.length;
    // Uno que pasa a combate doble: sin esa marca de la IA, se atacaría a su propio Pokémon
    if (cabecera[2] === 0 && t.combate === 1) {
      cabecera[2] = 1;
      cabecera[12] |= 0x80;
    }
    const tam = 8 + (t.conObjetos ? 2 : 0) + (t.conAtaques ? 8 : 0);
    const p = new Uint8Array(tam * t.pokemon.length);
    let pos = 0;
    for (const poke of t.pokemon) {
      p[pos] = poke.dificultad;
      p[pos + 1] = poke.habilidad;
      poner16(p, pos + 2, poke.nivel);
      poner16(p, pos + 4, poke.especie);
      poner16(p, pos + 6, poke.forma);
      pos += 8;
      if (t.conObjetos) {
        poner16(p, pos, poke.objeto || 0);
        pos += 2;
      }
      if (t.conAtaques) {
        (poke.ataques || [0, 0, 0, 0]).forEach((m, k) => poner16(p, pos + k * 2, m));
        pos += 8;
      }
    }
    narcs.equipos.archivos[t.indice] = p;
  }
}

export function escribirBW2(rom, datos) {
  const { narcs } = datos;
  escribirEspecies(narcs, datos.especies);
  escribirAprende(narcs, datos.aprende);
  escribirSalvajes(narcs, datos.salvajes);
  escribirEntrenadores(narcs, datos.entrenadores);

  // Datos de los ataques
  for (const a of datos.ataques) {
    if (!a) continue;
    const d = narcs.ataques.archivos[a.id];
    d[0] = TIPOS.indexOf(a.tipo);
    d[2] = a.categoria;
    d[3] = a.potencia;
    d[4] = a.precision;
    d[5] = a.pp;
  }

  // Iniciales (y el arreglo del script si cambian)
  const script = narcs.scripts.archivos[SCRIPT_INICIALES];
  const cambianIniciales = INICIALES.some((sitios, i) => u16(script, sitios[0]) !== datos.iniciales[i]);
  INICIALES.forEach((sitios, i) => sitios.forEach((sitio) => poner16(script, sitio, datos.iniciales[i])));
  if (cambianIniciales) narcs.scripts.archivos[SCRIPT_INICIALES] = arreglarScriptIniciales(narcs.scripts.archivos[SCRIPT_INICIALES]);

  // Estáticos: la especie en todos sus sitios y la forma a 0
  for (const e of datos.estaticos) {
    if (e.nueva === undefined) continue;
    for (const [archivo, pos] of e.especie) poner16(narcs.scripts.archivos[archivo], pos, e.nueva);
    for (const [archivo, pos] of e.forma) narcs.scripts.archivos[archivo][pos] = 0;
  }

  // Intercambios (la naturaleza, al azar del juego; la forma, la normal)
  for (const t of datos.intercambios) {
    const a = narcs.intercambios.archivos[t.archivo];
    poner32(a, 4, t.da);
    poner32(a, 8, 0);
    t.ivs.forEach((iv, k) => poner32(a, 0x10 + k * 4, iv));
    poner32(a, 0x4c, t.objeto);
    poner32(a, 0x5c, t.pide);
  }

  for (const o of datos.objetosSuelo) poner16(narcs.scripts.archivos[o.archivo], o.pos, o.objeto);

  // Claros ocultos
  let clarosCambian = false;
  for (const h of datos.claros.huecos) {
    const a = datos.claros.narc.archivos[h.archivo];
    if (u16(a, h.pos) === h.especie) continue;
    poner16(a, h.pos, h.especie);
    a[h.forma] = 0;
    clarosCambian = true;
  }
  if (clarosCambian) rom.cambiar(CLAROS, crearNarc(datos.claros.narc));

  for (const t of datos.tiendas) {
    const a = new Uint8Array(t.objetos.length * 2);
    t.objetos.forEach((o, k) => poner16(a, k * 2, o));
    narcs.tiendas.archivos[t.indice] = a;
  }

  datos.precios.forEach((precio, id) => {
    const o = narcs.objetos.archivos[id];
    if (o && o.length >= 2) poner16(o, 0, precio);
  });

  for (const [nombre, ruta] of Object.entries(RUTAS)) {
    const nuevo = crearNarc(narcs[nombre]);
    const viejo = rom.archivo(ruta);
    if (nuevo.length !== viejo.length || nuevo.some((b, i) => b !== viejo[i])) rom.cambiar(ruta, nuevo);
  }
}

// ---------- Textos ----------
//
// Lo que se cambia para que lo que se lee cuadre con lo randomizado:
//   · la descripción de cada MT (en a/0/0/2, el 63), la de su ataque nuevo (el 402)
//   · el tipo de cada inicial en la pantalla de elegir (a/0/0/3, el 169: entradas 37, 36 y 35)
//   · los nombres de los Pokémon en lo que dicen los de los intercambios (a/0/0/3)
//   · los nombres de los entrenadores y de sus clases (a/0/0/2, el 382 y el 383)
// Todo lo de un archivo, de una vez: los textos del sistema son enormes (5 MB) y, si crecen,
// moverlos puede no caber.
const TEXTOS_SISTEMA = "a/0/0/2";
const TEXTOS_HISTORIA = "a/0/0/3";
const DESCRIPCION_OBJETOS = 63;
const DESCRIPCION_ATAQUES = 402;
const NOMBRES_POKEMON = 90;
const TEXTO_INICIALES = 169;
const ENTRADA_INICIALES = [37, 36, 35];
const TEXTOS_INTERCAMBIOS = [537, 555, 193, 594, 628];

export function nombresPokemon(rom) {
  return leerTextos(leerNarc(rom.archivo(TEXTOS_SISTEMA)).archivos[NOMBRES_POKEMON]).entradas.map((e) => e.texto);
}

// cambios: { mt (los 95 ataques nuevos), iniciales: [{ tipo }] (en español), intercambios: Map
// (nombre viejo -> nuevo) }
export function actualizarTextos(rom, { mt, iniciales, intercambios, entrenadores }) {
  const sistema = leerNarc(rom.archivo(TEXTOS_SISTEMA));
  const historia = leerNarc(rom.archivo(TEXTOS_HISTORIA));
  const leer = (narc, n) => leerTextos(narc.archivos[n]).entradas.map((e) => e.texto);
  const poner = (narc, n, textos) => (narc.archivos[n] = escribirTextos(narc.archivos[n], textos));
  let cambiaSistema = false;
  let cambiaHistoria = false;

  if (mt) {
    const descripciones = leer(sistema, DESCRIPCION_OBJETOS);
    const deAtaques = leer(sistema, DESCRIPCION_ATAQUES);
    mt.forEach((id, k) => (descripciones[k < 92 ? MT01 + k : MT93 + (k - 92)] = deAtaques[id] || ""));
    poner(sistema, DESCRIPCION_OBJETOS, descripciones);
    cambiaSistema = true;
  }

  // Nombres de entrenadores y de sus clases (los de leerNombresEntrenadores, ya cambiados)
  if (entrenadores) {
    poner(sistema, NOMBRES_ENTRENADORES, entrenadores.nombres);
    poner(sistema, CLASES_ENTRENADORES, entrenadores.clases);
    cambiaSistema = true;
  }

  if (iniciales) {
    const textos = leer(historia, TEXTO_INICIALES);
    iniciales.forEach(({ tipo }, i) => {
      const n = ENTRADA_INICIALES[i];
      textos[n] = textos[n].replace(/tipo [^.-￿]+\./, `tipo ${tipo}.`);
    });
    poner(historia, TEXTO_INICIALES, textos);
    cambiaHistoria = true;
  }

  if (intercambios && intercambios.size) {
    // Todos a la vez (un nombre nuevo puede ser el viejo de otro intercambio)
    const patron = new RegExp([...intercambios.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    for (const n of TEXTOS_INTERCAMBIOS) {
      const textos = leer(historia, n).map((t) => t.replace(patron, (viejo) => intercambios.get(viejo)));
      poner(historia, n, textos);
    }
    cambiaHistoria = true;
  }

  if (cambiaSistema) rom.cambiar(TEXTOS_SISTEMA, crearNarc(sistema));
  if (cambiaHistoria) rom.cambiar(TEXTOS_HISTORIA, crearNarc(historia));
}
// ---------- Cómo se ven y suenan las iniciales al elegir ----------
//
// a/2/0/2 lleva lo de la pantalla de elegir: la paleta de cada inicial (archivos 0, 2 y 4) y su
// dibujo sin comprimir (12, 13 y 14). Se copian de los dibujos de cada Pokémon (a/0/0/4, 20
// archivos por especie: el 0, el dibujo comprimido con LZ; el 18, la paleta). Los gritos van en
// el overlay 316, tres u16 detrás de una marca.
const DIBUJOS_INICIALES = "a/2/0/2";
const DIBUJOS_POKEMON = "a/0/0/4";
const OVERLAY_GRITOS = 316;
const PREFIJO_GRITOS = [0x08, 0x0a, 0x07, 0x00, 0x00, 0x08, 0x00, 0x00];

export function ponerAspectoIniciales(rom, iniciales) {
  const pantalla = leerNarc(rom.archivo(DIBUJOS_INICIALES));
  const dibujos = leerNarc(rom.archivo(DIBUJOS_POKEMON));
  iniciales.forEach((id, i) => {
    const dibujo = descomprimirLZ(dibujos.archivos[id * 20]);
    if (!dibujo) return;
    pantalla.archivos[i * 2] = dibujos.archivos[id * 20 + 18].slice();
    pantalla.archivos[12 + i] = dibujo;
  });
  rom.cambiar(DIBUJOS_INICIALES, crearNarc(pantalla));

  const overlay = rom.leerOverlay(OVERLAY_GRITOS);
  let sitio = -1;
  for (let i = 0; i + PREFIJO_GRITOS.length <= overlay.length && sitio < 0; i++) {
    if (PREFIJO_GRITOS.every((b, k) => overlay[i + k] === b)) sitio = i + PREFIJO_GRITOS.length;
  }
  if (sitio < 0) return;
  iniciales.forEach((id, i) => poner16(overlay, sitio + i * 2, id));
  rom.escribirOverlay(OVERLAY_GRITOS, overlay);
}

// ---------- Nombres de los entrenadores ----------
//
// En a/0/0/2: el 382, el nombre de cada entrenador (la entrada n, el entrenador n); el 383, el de
// cada clase («Dama», «Pescador»...).
const NOMBRES_ENTRENADORES = 382;
const CLASES_ENTRENADORES = 383;

export function leerNombresEntrenadores(rom) {
  const narc = leerNarc(rom.archivo(TEXTOS_SISTEMA));
  const leer = (n) => leerTextos(narc.archivos[n]).entradas.map((e) => e.texto);
  return { nombres: leer(NOMBRES_ENTRENADORES), clases: leer(CLASES_ENTRENADORES) };
}

// ---------- Retoques del juego ----------

// Dónde está el patrón, si está una sola vez (si no, -1)
function buscar(bytes, patron) {
  let sitio = -1;
  for (let i = 0; i + patron.length <= bytes.length; i++) {
    if (bytes[i] !== patron[0] || !patron.every((b, k) => bytes[i + k] === b)) continue;
    if (sitio >= 0) return -1;
    sitio = i;
  }
  return sitio;
}
const hex = (texto) => texto.match(/../g).map((x) => parseInt(x, 16));

// Pokédex Nacional desde el principio: cuando te dan la Pokédex (en el script 854), también la
// nacional (la orden C6 01). Las órdenes «cerrar mensaje» y «marca de la Pokédex» (6 bytes) se
// cambian por una llamada (04 00 y la distancia) a un trozo nuevo al final que las repite, da la
// nacional y vuelve (05 00).
const DONDE_POKEDEX = hex("3f0023006209a9001705");
const ORDEN_NACIONAL = [0xc6, 0x01];
const VOLVER = [0x05, 0x00];

export function ponerPokedexNacional(rom) {
  const scripts = leerNarc(rom.archivo(RUTAS.scripts));
  const script = scripts.archivos[SCRIPT_INICIALES];
  const sitio = buscar(script, DONDE_POKEDEX);
  if (sitio < 0) throw new Error("No se ha encontrado dónde se da la Pokédex.");
  const trozo = [...DONDE_POKEDEX.slice(0, 6), ...ORDEN_NACIONAL, ...VOLVER];
  const nuevo = new Uint8Array(script.length + trozo.length);
  nuevo.set(script);
  nuevo.set(trozo, script.length);
  nuevo[sitio] = 0x04;
  nuevo[sitio + 1] = 0x00;
  new DataView(nuevo.buffer).setInt32(sitio + 2, script.length - (sitio + 6), true);
  scripts.archivos[SCRIPT_INICIALES] = nuevo;
  rom.cambiar(RUTAS.scripts, crearNarc(scripts));
}

// Texto instantáneo (lo mismo que UPR-ZX, buscado por su forma): en la rutina que escribe los
// textos, fuera la espera entre letra y letra («beq; b» → nada) y, al acabar una letra, a por la
// siguiente sin esperar al próximo fotograma (el «bne» de 0xB8 bytes más allá salta atrás).
const ESPERA_TEXTO = hex("a87f002800d081e0");
const DE_ESPERA_A_SIGUIENTE = 0xb8;

export function ponerTextoRapido(rom) {
  const arm9 = rom.leerArm9();
  const sitio = buscar(arm9, ESPERA_TEXTO) + 4;
  const salto = sitio + DE_ESPERA_A_SIGUIENTE;
  if (sitio < 4 || arm9[salto] !== 0x02 || arm9[salto + 1] !== 0xd1) throw new Error("No se ha encontrado la rutina del texto.");
  arm9.set([0xc0, 0x46, 0xc0, 0x46], sitio);
  arm9.set([0xc5, 0xd1], salto);
  rom.escribirArm9(arm9);
}

// Todos los combates dobles (como UPR-ZX): los entrenadores ya van marcados como dobles (en
// escribirBW2); aquí, que el juego lo lleve bien. Los que ya eran dobles cambian de caja de texto
// (a/0/8/9); en el overlay 36, que un entrenador doble suelto use las cajas de uno normal, te vea
// aunque lleves un solo Pokémon y no busque a su pareja si no la tiene; en el programa principal,
// que solo mire al entrenador que toca al elegir la caja de texto.
const CAJAS_ENTRENADORES = "a/0/8/9";
const OVERLAY_CAMPO = 36;

export function ponerCombatesDobles(rom, yaDobles) {
  const cajas = leerNarc(rom.archivo(CAJAS_ENTRENADORES));
  const lista = cajas.archivos[0];
  const CAMBIO = { 3: 0, 5: 2, 6: 0x18 };
  for (let i = 0; i + 4 <= lista.length; i += 4) {
    const caja = u16(lista, i + 2);
    if (yaDobles.has(u16(lista, i)) && CAMBIO[caja] !== undefined) poner16(lista, i + 2, CAMBIO[caja]);
  }
  rom.cambiar(CAJAS_ENTRENADORES, crearNarc(cajas));

  const campo = rom.leerOverlay(OVERLAY_CAMPO);
  const tras = (patron) => {
    const i = buscar(campo, hex(patron));
    if (i < 0) throw new Error("Este juego no admite los combates dobles.");
    return i + 8;
  };
  let o = tras("0004000c03d10320");
  campo[o - 2] = 0;
  campo[o] = 2;
  campo[o + 2] = 0x18;
  o = tras("0224e3e7012817d1");
  poner16(campo, o, 0x46c0); // nop
  poner16(campo, o + 2, 0x46c0);
  o = tras("0a9906980904090c");
  poner16(campo, o + 0x10, u16(campo, o + 0x0e));
  poner16(campo, o + 0x0e, u16(campo, o + 0x0c));
  poner16(campo, o + 0x0c, u16(campo, o + 0x0a));
  poner16(campo, o + 0x0a, 0xd0c7); // beq al caso de un entrenador solo
  poner16(campo, o + 0x08, 0x2800); // cmp r0, #0
  rom.escribirOverlay(OVERLAY_CAMPO, campo);

  const arm9 = rom.leerArm9();
  const i = buscar(arm9, hex("6088a8420ad1a088"));
  if (i < 0) throw new Error("Este juego no admite los combates dobles.");
  arm9[i + 4] = 2;
  rom.escribirArm9(arm9);
}