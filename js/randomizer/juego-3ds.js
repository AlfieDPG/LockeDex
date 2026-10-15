// ---------- Juegos de 3DS (6.ª y 7.ª generación) ----------
//
// Pokémon X, Y, Rubí Omega, Zafiro Alfa, Sol y Luna. Los datos están en GARC del RomFS (se leen de un
// .3ds ya descifrado, ver ./rom-3ds.js). Cada juego se prepara con prepararRom(sesion), que lee de
// antemano los GARC que hacen falta; después todo es síncrono, como en los motores de DS (leerBW2,
// escribirBW2...). Lo que cambia no vuelve al .3ds: sale como archivos sueltos (LayeredFS).
//
//   personal      una entrada por especie: 0x40 (XY), 0x50 (ORAS) o 0x54 (SM) bytes; la última es la suma de todas
//   evoluciones   8 de [método u16, dato u16, especie u16] (6.ª) o [método, dato, especie, forma u8, nivel u8] (7.ª)
//   ataques que aprende   [ataque u16, nivel u16]... y [0xFFFF, 0xFFFF]
//   ataques       36 bytes: uno por archivo (XY) o un «mini» «WD» en el primero (ORAS y SM)
//   entrenadores  un archivo de datos y otro con sus Pokémon
//   salvajes      huecos de [especie | forma << 11 u16, nivel, nivel máx.] (6.ª), comprimidos (LZ11)

import { leerGarc, crearGarc, leerMini, crearMini, descomprimirLZ11, comprimirLZ11 } from "./rom-3ds.js";
import { leerTextos6, escribirTextos6, aTexto } from "./textos-3ds.js";

export const ULTIMA_ESPECIE = 802;
export const ULTIMO_ATAQUE = 719;
export const ULTIMA_HABILIDAD = 232;

export const TIPOS = [
  "normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel",
  "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark", "fairy"
];

// Los métodos de evolución de 6.ª y 7.ª generación son los de la 5.ª (con alguno más al final)
export const EVO = {
  nivel: 4, intercambio: 5, intercambioObjeto: 6, intercambioEspecial: 7, piedra: 8, belleza: 16,
  piedraMacho: 17, piedraHembra: 18, objetoDia: 19, objetoNoche: 20, ataque: 21, otroEnEquipo: 22
};
// Los métodos de 7.ª generación en los que el dato es un nivel (va en un byte aparte)
const EVO_CON_NIVEL = new Set([4, 9, 10, 11, 12, 13, 14, 15, 23, 24, 28, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41]);

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
function poner16(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >> 8) & 0xff;
}

// ---------- Cada juego ----------

const tres = (x) => [x - 1, x, x + 1]; // los rivales van de tres en tres: uno por inicial

const XY = {
  id: "xy", gen: 6,
  rutas: {
    salvajes: "a/0/1/2", entrenadores: "a/0/3/8", equipos: "a/0/4/0", textoEs: "a/0/7/8",
    ataques: "a/2/1/2", aprende: "a/2/1/4", evoluciones: "a/2/1/5", datos: "a/2/1/8"
  },
  // Los textos de todos los idiomas (japonés, japonés, inglés, francés, italiano, alemán, español, coreano)
  textoRutas: ["a/0/7/2", "a/0/7/3", "a/0/7/4", "a/0/7/5", "a/0/7/6", "a/0/7/7", "a/0/7/8", "a/0/7/9"],
  ultimaEspecie: 721, tamDatos: 0x40, ultimoAtaque: 617, ultimaHabilidad: 188,
  textos: { especies: 80, ataques: 13, habilidades: 34, entrenadores: 21, clases: 20, objetos: 96 },
  lideres: [6, 76, 21, 22, 23, 24, 25, 26, 269, 271, 187, 270, 276, 303, 525, 526],
  rivales: [...[596, 575, 581, 578, 584, 607, 587, 590, 593, 599, 435, 130, 329, 184, 332, 604, 335, 338, 341, 519, 137, 321].flatMap(tres)],
  grupos: [
    [6, 39, 40, 48], [76, 64, 63, 106, 105], [21, 83, 84, 146, 147], [22, 121, 122, 123, 124],
    [23, 461, 462, 463, 464, 465, 466, 467, 468, 469, 28, 29, 30], [24, 245, 250, 248, 243], [25, 170, 171, 172, 365, 366],
    [26, 168, 169, 31, 32], [269], [271], [187], [270]
  ],
  extras: [174, 175, 304, 344, 345, 346, 347, 348, 349, 350, 351, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 324, 325, 438, 439, 573, 327, 328],
  legendarios: [716, 717, 718, 719, 720, 721],
  habilidadesNunca: [176],
  // Las iniciales: los regalos del DllField.cro (cada 0x18 bytes: especie u16, forma +4, nivel +5) y lo que se ve al elegir (DllPoke3Select.cro)
  iniciales: { cro: "DllField.cro", desde: 0xf805c, tam: 0x18, forma: 4, pantalla: "DllPoke3Select.cro", extra: 0x10, texto: 63 },
  // Las MT: en el programa, tras esta marca, 92 ataques y 5 MO; y las MT 93 a 100, 97 u16 más allá del inicio
  tm: { prefijo: "D400AE02AF02B002", dos: 97, hm: 5, objetos: 99, ataquesTexto: 15, descObjetos: 99, descAtaques: 15 },
  // Los objetos: los datos de cada uno (el precio, en el primer u16) y las tiendas, en el programa: listas de u16 una tras otra
  objetos: {
    datos: "a/2/2/0", localizador: "0400110004000300",
    tamanos: [2, 11, 14, 17, 18, 19, 19, 19, 19, 1, 4, 10, 3, 9, 1, 1, 3, 3, 5, 5, 6, 7, 5, 5, 8, 3],
    mt: [18, 19, 22, 23], normales: [0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 15], historia: [10, 11, 12, 13, 16, 17, 20, 21, 24, 25]
  }
};

const ORAS = {
  id: "oras", gen: 6, miniAtaques: true,
  rutas: {
    salvajes: "a/0/1/3", entrenadores: "a/0/3/6", equipos: "a/0/3/8", textoEs: "a/0/7/7",
    ataques: "a/1/8/9", aprende: "a/1/9/1", evoluciones: "a/1/9/2", datos: "a/1/9/5"
  },
  textoRutas: ["a/0/7/1", "a/0/7/2", "a/0/7/3", "a/0/7/4", "a/0/7/5", "a/0/7/6", "a/0/7/7", "a/0/7/8"],
  ultimaEspecie: 721, tamDatos: 0x50, ultimoAtaque: 621, ultimaHabilidad: 191,
  textos: { especies: 98, ataques: 14, habilidades: 37, entrenadores: 22, clases: 21, objetos: 114 },
  lideres: [561, 563, 567, 569, 570, 571, 552, 572, 943, 553, 554, 555, 556, 557, 909, 910, 911, 912, 913, 680, 942, 235, 236, 271, 178, 231, 266],
  rivales: [1, 289, 674, 292, 527, 699, 4, 295, 677, 298, 530, 906].flatMap(tres),
  grupos: [
    [561, 562, 22, 667], [563, 60, 56, 59], [567, 34, 568, 614, 35], [569, 81, 824, 83, 615, 823, 613, 85],
    [570, 63, 64, 65, 66, 67, 68, 69], [571, 115, 517, 516, 118, 730], [552, 157, 158, 159, 226, 320, 225],
    [572, 943, 647, 342, 594, 646, 338, 339, 340, 341], [553, 909], [554, 910], [555, 911], [556, 912]
  ],
  extras: [683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 518, 583, 944, 946],
  legendarios: [716, 717, 718, 719, 720, 721],
  // Las del clima primigenio (solo Groudon, Kyogre y Rayquaza) y Cambio de Táctica
  habilidadesNunca: [176, 189, 190, 191],
  iniciales: { cro: "DllField.cro", desde: 0xf906c, tam: 0x24, forma: 4, pantalla: "DllPoke3Select.cro", extra: 0, texto: 77 },
  // Igual, con dos MO más (Golpe Roca y Buceo, en otro sitio de la lista de MO)
  tm: { prefijo: "D400AE02AF02B002", dos: 98, hm: 5, hmExtra: [10, 28], descObjetos: 117, descAtaques: 16 },
  objetos: {
    datos: "a/1/9/7", localizador: "04001100120004000300",
    tamanos: [3, 10, 14, 17, 18, 19, 19, 19, 19, 1, 9, 6, 4, 3, 8, 8, 3, 3, 4, 3, 6, 8, 7, 4],
    mt: [12, 15, 22, 23], normales: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], historia: [10, 11, 13, 14, 16, 17, 18, 19, 20, 21],
    // Los escondidos: 170 entradas de 14 bytes tras esta marca (el objeto, 2 bytes más allá)
    ocultos: { prefijo: "A100A200A300A400A5001400010053004A0084000900", cuantos: 170, salto: 0xe, desfase: 2 }
  }
};

// Sol y Luna (en Luna, los salvajes están en a/0/8/3)
const SM = {
  id: "sm", gen: 7, miniAtaques: true,
  rutas: {
    entrenadores: "a/1/0/5", equipos: "a/1/0/6", textoEs: "a/0/3/6",
    ataques: "a/0/1/1", aprende: "a/0/1/3", evoluciones: "a/0/1/4", datos: "a/0/1/7"
  },
  textoRutas: ["a/0/3/0", "a/0/3/1", "a/0/3/2", "a/0/3/3", "a/0/3/4", "a/0/3/5", "a/0/3/6", "a/0/3/7", "a/0/3/8", "a/0/3/9"],
  ultimaEspecie: 802, tamDatos: 0x54, ultimoAtaque: 719, ultimaHabilidad: 232, salvajesGrande: "a/0/8/3",
  textos: { especies: 55, ataques: 113, habilidades: 96, entrenadores: 105, clases: 106, objetos: 36 },
  lideres: [23, 152, 349, 90, 153, 351, 154, 403, 155, 359, 149, 350, 156, 352, 129, 413, 414, 138, 235, 236, 400, 131, 158],
  rivales: [477, 6, 9, 12, 76, 82, 438, 217, 220, 447, 450, 482, 356].flatMap(tres),
  grupos: [[23, 152, 349], [90, 153, 351], [154, 403], [155, 359], [149, 350], [156, 352]],
  extras: [79, 185, 239, 240, 415, 416, 417, 418, 419, 441, 52, 215, 216, 396, 144, 398, 146, 405, 167, 481, 435, 467, 89, 238, 401, 75, 74, 412, 132, 241, 360, 410],
  // Tipo Nulo y Silvally, los Ultraentes, los Tapus, Cosmog y sus evoluciones, Necrozma, Magearna y Marshadow
  legendarios: [772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802],
  // Las iniciales: los tres primeros regalos del GARC de estáticos (cada 0x14 bytes: especie u16, forma +2, nivel +3)
  inicialesGarc: { ruta: "a/1/5/5", tam: 0x14, forma: 2, textoHistoria: "a/0/4/6", texto: 41 },
  // Las 100 MT, seguidas, tras esta marca del programa (que en Sol y Luna viene sin comprimir)
  tm: { prefijo: "034003410342034303", dos: 92, hm: 0, descObjetos: 35, descAtaques: 112 },
  // Cambio de Táctica, Disfraz, Unión (Greninja), Escudo Limitado, Dominio de Poder, Sistema Alfa
  habilidadesNunca: [176, 197, 208, 209, 210, 211, 225]
};

export function perfilDe(sesion) {
  const codigo = sesion.codigo || "";
  const base = codigo.startsWith("CTR-P-EK") ? XY : codigo.startsWith("CTR-P-EC") ? ORAS : codigo.startsWith("CTR-P-BN") ? SM : null;
  if (!base) return null;
  const importantes = [...base.lideres, ...base.rivales, ...base.extras];
  const iniciales = Boolean(base.iniciales || base.inicialesGarc);
  return {
    id: base.id, gen: base.gen, base,
    nombre: sesion.nombreJuego || codigo,
    ultimaEspecie: base.ultimaEspecie, ultimoAtaque: base.ultimoAtaque, ultimaHabilidad: base.ultimaHabilidad, ultimoObjeto: 638,
    tipos: TIPOS, habilidadesNunca: base.habilidadesNunca, legendarios: base.legendarios,
    // Lo que todavía no se hace en 3DS
    sinObjetos: !base.objetos, sinMT: !base.tm, tutores: false, claros: false, iniciales,
    bitsMT: { tm: 100, hm: base.tm ? base.tm.hm + (base.tm.hmExtra ? base.tm.hmExtra.length : 0) : 0, extra: 0 },
    bloquesMT: 14,
    lideres: base.lideres, rivales: base.rivales, grupos: base.grupos, importantes: new Set(importantes),
    sinDobles: [],
    preciosEnDecenas: false,
    tiendas: { mt: base.objetos ? base.objetos.mt : [], normales: base.objetos ? base.objetos.normales : [], historia: base.objetos ? base.objetos.historia : [], primera: -1, saltar: [], cuantas: 0 },
    rutas: base.rutas
  };
}

// Los GARC que hay que leer de antemano
export async function prepararRom(sesion) {
  const perfil = perfilDe(sesion);
  if (!perfil) throw new Error("Este .3ds no es de ningún juego de 6.ª ni 7.ª generación que se sepa randomizar.");
  await sesion.cargar(Object.values(perfil.rutas));
  const ini = perfil.base.iniciales;
  if (ini) await sesion.cargar([ini.cro, ini.pantalla]);
  if (perfil.base.tm) await sesion.cargarCodigo();
  if (perfil.base.objetos) await sesion.cargar([perfil.base.objetos.datos]);
  // Los textos de todos los idiomas (para los nombres de los entrenadores)
  await sesion.cargar(perfil.base.textoRutas);
  if (perfil.base.inicialesGarc) await sesion.cargar([perfil.base.inicialesGarc.ruta, perfil.base.inicialesGarc.textoHistoria]);
  // Los salvajes de Sol y Luna: un GARC de 350 MB del que solo hacen falta unas pocas entradas (la 9 de cada 11)
  if (perfil.base.salvajesGrande) await sesion.cargarParcial(perfil.base.salvajesGrande, (i) => i % 11 === 9);
  return perfil;
}

// ---------- Leer ----------

function nombresDe(sesion, perfil, cual) {
  const g = leerGarc(sesion.archivo(perfil.rutas.textoEs));
  return leerTextos6(g.archivos[perfil.base.textos[cual]]).lineas.map(aTexto);
}

export function nombresPokemon(sesion) {
  return nombresDe(sesion, perfilDe(sesion), "especies");
}

function leerEspecies(garcDatos, garcEvo, perfil) {
  const especies = [];
  const gen7 = perfil.gen === 7;
  const tamEvo = gen7 ? 8 : 6;
  for (let id = 1; id <= perfil.ultimaEspecie; id++) {
    const d = garcDatos.archivos[id];
    const stats = [d[0], d[1], d[2], d[4], d[5], d[3]]; // PS, Ata, Def, AtE, DfE, Vel
    const suma = stats.reduce((a, b) => a + b, 0);
    const e = garcEvo.archivos[id];
    const evoluciones = [];
    for (let k = 0; k < 8; k++) {
      const metodo = u16(e, k * tamEvo);
      const especie = u16(e, k * tamEvo + 4);
      if (!metodo || !especie) continue;
      const evo = { metodo, dato: u16(e, k * tamEvo + 2), especie };
      if (gen7) {
        // El nivel va en su propio byte; la forma, en otro
        const nivel = e[k * 8 + 7];
        evo.forma = e[k * 8 + 6];
        evo.nivelOriginal = nivel;
        evo.especieOriginal = especie;
        evo.metodoOriginal = metodo;
        evo.paramOriginal = evo.dato;
        if (EVO_CON_NIVEL.has(metodo)) evo.dato = nivel;
      }
      evoluciones.push(evo);
    }
    especies[id] = {
      id, stats, total: suma, totalOriginal: suma,
      tipos: [...new Set([TIPOS[d[6]], TIPOS[d[7]]])].filter(Boolean),
      habilidades: [d[24], d[25] === d[24] ? 0 : d[25], d[26]],
      objetos: [u16(d, 12), u16(d, 14), 0],
      mt: d.slice(40, 54),
      tutor: new Uint8Array(0),
      evoluciones,
      previa: 0
    };
  }
  for (const e of especies) if (e) for (const evo of e.evoluciones) if (especies[evo.especie]) especies[evo.especie].previa = e.id;
  return especies;
}

function leerAprende(garc, perfil) {
  const aprende = [];
  for (let id = 1; id <= perfil.ultimaEspecie; id++) {
    const a = garc.archivos[id];
    const lista = [];
    for (let i = 0; i + 3 < a.length; i += 4) {
      if (u16(a, i) === 0xffff && u16(a, i + 2) === 0xffff) break;
      lista.push([u16(a, i), u16(a, i + 2)]);
    }
    aprende[id] = lista;
  }
  return aprende;
}

// Los datos de un ataque (en ORAS y SM, un paquete «WD» en el primer archivo)
function datosDeAtaque(garc, perfil, id) {
  return perfil.base.miniAtaques ? leerMini(garc.archivos[0])[id] : garc.archivos[id];
}

function leerEntrenadores(garcDatos, garcEquipos, perfil) {
  const oras = perfil.id === "oras";
  const gen7 = perfil.gen === 7;
  const entrenadores = [];
  for (let i = 1; i < garcDatos.archivos.length; i++) {
    const t = garcDatos.archivos[i];
    const p = garcEquipos.archivos[i];
    const pokemon = [];
    let conAtaques = true;
    let conObjetos = true;
    let combate;
    let clase;
    if (gen7) {
      // 20 bytes: clase, ..., tipo de combate (2), cuántos (3); cada Pokémon, 32 bytes
      clase = t[0];
      combate = t[2];
      for (let k = 0; k < t[3]; k++) {
        const o = k * 32;
        pokemon.push({
          habilidad: p[o], dificultad: p[o + 1], nivel: u16(p, o + 14), especie: u16(p, o + 16), forma: u16(p, o + 18),
          objeto: u16(p, o + 20), ataques: [0, 1, 2, 3].map((m) => u16(p, o + 24 + m * 2))
        });
      }
    } else {
      const formato = oras ? u16(t, 0) : t[0];
      const desde = oras ? 6 : 2;
      conAtaques = Boolean(formato & 1);
      conObjetos = Boolean(formato & 2);
      combate = t[desde];
      clase = oras ? u16(t, 2) : t[1];
      let pos = 0;
      for (let k = 0; k < t[desde + 1]; k++) {
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
    }
    entrenadores.push({ indice: i, clase, combate, conAtaques, conObjetos, importante: perfil.importantes.has(i), pokemon });
  }
  return entrenadores;
}

// Los salvajes de cada archivo (6.ª): [nombre, dónde empiezan, cuántos huecos] (XY / ORAS)
const BLOQUES_XY = [
  ["hierba", 0, 12], ["flores-amarillas", 48, 12], ["flores-moradas", 96, 12], ["flores-rojas", 144, 12], ["hierba-alta", 192, 12],
  ["surf", 240, 5], ["romperrocas", 260, 5], ["vieja", 280, 3], ["buena", 292, 3], ["super", 304, 3],
  ["horda-comun", 316, 5], ["horda-rara", 336, 5], ["horda-muy-rara", 356, 5]
];
const BLOQUES_ORAS = [
  ["hierba", 0, 12], ["hierba-alta", 48, 12], ["dexnav", 96, 3], ["surf", 108, 5], ["romperrocas", 128, 5],
  ["vieja", 148, 3], ["buena", 160, 3], ["super", 172, 3], ["horda-comun", 184, 5], ["horda-rara", 204, 5], ["horda-muy-rara", 224, 5]
];

// Dónde empiezan los datos de un archivo de salvajes (y cuánto ocupan), o null si no tiene
function sitioSalvajes(b, perfil) {
  const oras = perfil.id === "oras";
  const desde = u32(b, 0x10) + (oras ? 0x0e : 0x10);
  const tam = oras ? 0xf6 : 0x178;
  const fin = oras ? u32(b, 0x14) : b.length;
  return fin - desde >= tam ? { desde, tam } : null;
}

function leerSalvajes(garc, perfil) {
  if (perfil.gen !== 6) return [];
  const oras = perfil.id === "oras";
  const bloques = oras ? BLOQUES_ORAS : BLOQUES_XY;
  const cuantos = garc.archivos.length - (oras ? 2 : 1);
  const salvajes = [];
  for (let archivo = 0; archivo < cuantos; archivo++) {
    const b = garc.archivos[archivo];
    const sitio = sitioSalvajes(b, perfil);
    if (!sitio) continue;
    const zonas = [];
    for (const [nombre, base, n] of bloques) {
      const huecos = [];
      for (let i = 0; i < n; i++) {
        const p = sitio.desde + base + i * 4;
        const v = u16(b, p);
        huecos.push({ especie: v & 0x7ff, forma: v >> 11, min: b[p + 2], max: b[p + 3], vacio: (v & 0x7ff) === 0 });
      }
      if (huecos.some((h) => h.especie)) zonas.push({ zona: nombre, clase: nombre, base, huecos });
    }
    if (zonas.length) salvajes.push({ archivo, estaciones: [zonas] });
  }
  return salvajes;
}

// Los salvajes de 7.ª generación: en cada entrada 9 + 11 × zona, un paquete «EA» de tablas; cada tabla, dos mitades
// (día y noche) de 0x164 bytes: nivel mínimo y máximo (0 y 1), 10 huecos de [especie | forma << 11 u16, u16] desde 0xC,
// otros 7 grupos de 10 detrás (los que acuden en una llamada de ayuda, 40 bytes más allá cada uno) y 6 de ayuda por clima (0x14C)
const TABLA_SM = 0x164;
const huecosSM = (base) => [
  ...Array.from({ length: 80 }, (_, k) => base + 0xc + (k % 10) * 4 + Math.floor(k / 10) * 40),
  ...Array.from({ length: 6 }, (_, k) => base + 0x14c + k * 4)
];

function leerSalvajesSM(sesion, perfil) {
  const p = sesion.parcial(perfil.base.salvajesGrande);
  const salvajes = [];
  const entradas = new Map();
  p.archivos.forEach((comprimido, archivo) => {
    if (!comprimido || comprimido.length < 5 || comprimido[0] !== 0x11) return;
    const e = descomprimirLZ11(comprimido);
    if (!e.length) return;
    entradas.set(archivo, e);
    const zonas = [];
    const piezas = leerMini(e);
    piezas.forEach((pieza, t) => {
      if (!pieza.length) return;
      const desde = pieza.byteOffset - e.byteOffset + 4;
      [["dia", 0], ["noche", TABLA_SM]].forEach(([nombre, mitad]) => {
        const base = desde + mitad;
        const min = e[base];
        const max = e[base + 1];
        const huecos = huecosSM(base).map((pos) => {
          const v = u16(e, pos);
          return { especie: v & 0x7ff, forma: v >> 11, min, max, vacio: (v & 0x7ff) === 0, pos };
        });
        if (huecos.some((h) => h.especie)) zonas.push({ zona: `tabla${t}-${nombre}`, clase: "sm", base, huecos });
      });
    });
    if (zonas.length) salvajes.push({ archivo, estaciones: [zonas] });
  });
  return { salvajes, entradas };
}

// Las tres iniciales
function leerIniciales(sesion, perfil) {
  const b = perfil.base;
  if (b.iniciales) {
    const cro = sesion.archivo(b.iniciales.cro);
    return [0, 1, 2].map((i) => u16(cro, b.iniciales.desde + i * b.iniciales.tam));
  }
  if (b.inicialesGarc) {
    const f = leerGarc(sesion.archivo(b.inicialesGarc.ruta)).archivos[0];
    return [0, 1, 2].map((i) => u16(f, i * b.inicialesGarc.tam));
  }
  return [];
}

// Los objetos: precios (un u16 al principio de los datos de cada uno), tiendas y objetos escondidos (ORAS)
function leerObjetos(sesion, perfil) {
  const ob = perfil.base.objetos;
  const vacio = { precios: [], tiendas: [], objetosSuelo: [] };
  if (!ob) return vacio;
  const garc = leerGarc(sesion.archivo(ob.datos));
  const precios = [0];
  for (let id = 1; id < garc.archivos.length; id++) precios[id] = u16(garc.archivos[id], 0);
  const tiendas = [];
  let pos = buscarCodigo(sesion.code, ob.localizador);
  if (pos >= 0) {
    ob.tamanos.forEach((n, indice) => {
      const objetos = [];
      const huecos = [];
      for (let k = 0; k < n; k++, pos += 2) {
        objetos.push(u16(sesion.code, pos));
        huecos.push(pos);
      }
      tiendas.push({ indice, objetos, huecos });
    });
  }
  const objetosSuelo = [];
  if (ob.ocultos) {
    const marca = buscarCodigo(sesion.code, ob.ocultos.prefijo);
    if (marca >= 0) {
      const inicio = marca + ob.ocultos.prefijo.length / 2;
      for (let i = 0; i < ob.ocultos.cuantos; i++) {
        const p = inicio + i * ob.ocultos.salto + ob.ocultos.desfase;
        objetosSuelo.push({ codigo: true, pos: p, objeto: u16(sesion.code, p) });
      }
    }
  }
  return { precios, tiendas, objetosSuelo };
}

export function leerBW2(sesion) {
  const perfil = perfilDe(sesion);
  if (!perfil) throw new Error("Este .3ds no es de ningún juego de 6.ª ni 7.ª generación que se sepa randomizar.");
  const r = perfil.rutas;
  const garcs = {
    datos: leerGarc(sesion.archivo(r.datos)), aprende: leerGarc(sesion.archivo(r.aprende)), evoluciones: leerGarc(sesion.archivo(r.evoluciones)),
    ataques: leerGarc(sesion.archivo(r.ataques)), entrenadores: leerGarc(sesion.archivo(r.entrenadores)), equipos: leerGarc(sesion.archivo(r.equipos))
  };
  if (r.salvajes) {
    garcs.salvajes = leerGarc(sesion.archivo(r.salvajes));
    // Los salvajes van comprimidos (LZ11), salvo el último (o los dos últimos, en ORAS)
    const sinComprimir = perfil.id === "oras" ? 2 : 1;
    garcs.salvajes = { ...garcs.salvajes, archivos: garcs.salvajes.archivos.map((x, i) => (i < garcs.salvajes.archivos.length - sinComprimir ? descomprimirLZ11(x) : x)) };
  }
  let salvajesSM = null;
  if (perfil.base.salvajesGrande) {
    salvajesSM = leerSalvajesSM(sesion, perfil);
    garcs.salvajesSM = salvajesSM.entradas;
  }
  const especies = leerEspecies(garcs.datos, garcs.evoluciones, perfil);
  const aprende = leerAprende(garcs.aprende, perfil);
  const ataques = [];
  for (let id = 1; id <= perfil.ultimoAtaque; id++) {
    const d = datosDeAtaque(garcs.ataques, perfil, id);
    ataques[id] = { id, tipo: TIPOS[d[0]], categoria: d[2], potencia: d[3], precision: d[4], pp: d[5] };
  }
  return {
    perfil, garcs, especies, aprende, ataques,
    salvajes: salvajesSM ? salvajesSM.salvajes : garcs.salvajes ? leerSalvajes(garcs.salvajes, perfil) : [],
    entrenadores: leerEntrenadores(garcs.entrenadores, garcs.equipos, perfil),
    iniciales: leerIniciales(sesion, perfil), inicialesOriginales: leerIniciales(sesion, perfil),
    estaticos: [], intercambios: [], ...leerObjetos(sesion, perfil), claros: null
  };
}

// ---------- Escribir ----------

export function escribirBW2(sesion, datos) {
  const { perfil, garcs } = datos;
  const r = perfil.rutas;
  const gen7 = perfil.gen === 7;
  const guardar = (ruta, nuevos) => {
    if (!Object.keys(nuevos).length) return;
    sesion.cambiar(ruta, crearGarc(sesion.archivo(ruta), nuevos));
  };

  // Datos de las especies
  const nuevosDatos = {};
  const tam = perfil.base.tamDatos;
  for (let id = 1; id <= perfil.ultimaEspecie; id++) {
    const e = datos.especies[id];
    const d = garcs.datos.archivos[id].slice();
    const antes = d.slice();
    [d[0], d[1], d[2], d[3], d[4], d[5]] = [e.stats[0], e.stats[1], e.stats[2], e.stats[5], e.stats[3], e.stats[4]];
    d[6] = TIPOS.indexOf(e.tipos[0]);
    d[7] = TIPOS.indexOf(e.tipos[1] || e.tipos[0]);
    d[24] = e.habilidades[0];
    d[25] = e.habilidades[1] || e.habilidades[0];
    d[26] = e.habilidades[2];
    poner16(d, 12, e.objetos[0]);
    poner16(d, 14, e.objetos[1]);
    if (e.mt && e.mt.length === 14) d.set(e.mt, 40);
    if (d.some((v, i) => v !== antes[i])) nuevosDatos[id] = d;
  }
  if (Object.keys(nuevosDatos).length) {
    // El último archivo es la suma de todos los demás: se actualiza también
    const n = garcs.datos.archivos.length;
    const todo = garcs.datos.archivos[n - 1].slice();
    for (let i = 1; i < n - 1; i++) todo.set(nuevosDatos[i] || garcs.datos.archivos[i], tam * i);
    nuevosDatos[n - 1] = todo;
    guardar(r.datos, nuevosDatos);
  }

  // Evoluciones
  const nuevasEvo = {};
  const tamEvo = gen7 ? 8 : 6;
  for (let id = 1; id <= perfil.ultimaEspecie; id++) {
    const e = datos.especies[id];
    const d = garcs.evoluciones.archivos[id].slice();
    const antes = d.slice();
    for (let k = 0; k < 8; k++) {
      const evo = e.evoluciones[k];
      const o = k * tamEvo;
      // Un hueco que ya estaba vacío se queda como estaba
      if (!evo && !u16(antes, o)) continue;
      poner16(d, o, evo ? evo.metodo : 0);
      poner16(d, o + 4, evo ? evo.especie : 0);
      if (!gen7) {
        poner16(d, o + 2, evo ? evo.dato : 0);
        continue;
      }
      const conNivel = evo && EVO_CON_NIVEL.has(evo.metodo);
      // En los de nivel, el dato de antes se queda si el método no ha cambiado
      poner16(d, o + 2, evo && !conNivel ? evo.dato : evo && evo.metodo === evo.metodoOriginal ? evo.paramOriginal : 0);
      // Si la especie ha cambiado, la forma de antes ya no vale
      d[o + 6] = evo && evo.especie === evo.especieOriginal ? evo.forma || 0 : 0;
      d[o + 7] = evo ? (conNivel ? evo.dato : evo.nivelOriginal || 0) : 0;
    }
    if (d.some((v, i) => v !== antes[i])) nuevasEvo[id] = d;
  }
  guardar(r.evoluciones, nuevasEvo);

  // Ataques que aprenden
  const nuevosAprende = {};
  for (let id = 1; id <= perfil.ultimaEspecie; id++) {
    const lista = datos.aprende[id];
    const d = new Uint8Array(lista.length * 4 + 4);
    lista.forEach(([ataque, nivel], k) => {
      poner16(d, k * 4, ataque);
      poner16(d, k * 4 + 2, nivel);
    });
    poner16(d, lista.length * 4, 0xffff);
    poner16(d, lista.length * 4 + 2, 0xffff);
    const o = garcs.aprende.archivos[id];
    if (d.length !== o.length || d.some((v, i) => v !== o[i])) nuevosAprende[id] = d;
  }
  guardar(r.aprende, nuevosAprende);

  // Datos de los ataques
  const cambiadoAtaque = new Map();
  for (let id = 1; id <= perfil.ultimoAtaque; id++) {
    const a = datos.ataques[id];
    const d = datosDeAtaque(garcs.ataques, perfil, id).slice();
    const antes = d.slice();
    d[0] = TIPOS.indexOf(a.tipo);
    d[3] = a.potencia;
    d[4] = a.precision;
    d[5] = a.pp;
    if (d.some((v, i) => v !== antes[i])) cambiadoAtaque.set(id, d);
  }
  if (cambiadoAtaque.size) {
    const nuevosAtaques = {};
    if (perfil.base.miniAtaques) {
      const nuevos = [];
      for (const [id, d] of cambiadoAtaque) nuevos[id] = d;
      nuevosAtaques[0] = crearMini(garcs.ataques.archivos[0], nuevos);
    } else {
      for (const [id, d] of cambiadoAtaque) nuevosAtaques[id] = d;
    }
    guardar(r.ataques, nuevosAtaques);
  }

  // Entrenadores
  const oras = perfil.id === "oras";
  const desde = oras ? 6 : 2;
  const nuevosEntr = {};
  const nuevosEquipos = {};
  for (const t of datos.entrenadores) {
    const td = garcs.entrenadores.archivos[t.indice].slice();
    let p;
    // Si pasa a ser doble, la IA tiene que saberlo (que no ataque a los suyos)
    const eraSimple = (oras ? td[6] : gen7 ? td[2] : td[2]) === 0;
    const bandera = () => {
      if (!(t.combate === 1 && eraSimple)) return;
      if (gen7) td[12] |= 0x08;
      else if (oras) td[16] |= 0x80;
      else td[12] |= 0x80;
    };
    if (gen7) {
      bandera();
      td[2] = t.combate;
      td[3] = t.pokemon.length;
      p = new Uint8Array(t.pokemon.length * 32);
      const original = garcs.equipos.archivos[t.indice];
      t.pokemon.forEach((poke, k) => {
        const o = k * 32;
        // Lo que no se toca (naturaleza, EVs, IVs...), como estaba; si es nuevo, como el último
        if (original.length >= o + 32) p.set(original.subarray(o, o + 32), o);
        else if (k) p.set(p.subarray(o - 32, o), o);
        p[o] = poke.habilidad;
        p[o + 1] = poke.dificultad;
        poner16(p, o + 14, poke.nivel);
        poner16(p, o + 16, poke.especie);
        poner16(p, o + 18, poke.forma);
        poner16(p, o + 20, poke.objeto || 0);
        (poke.ataques || [0, 0, 0, 0]).forEach((m, j) => poner16(p, o + 24 + j * 2, m));
      });
    } else {
      const formatoAntes = oras ? u16(td, 0) : td[0];
      const formato = (formatoAntes & ~3) | (t.conAtaques ? 1 : 0) | (t.conObjetos ? 2 : 0);
      if (oras) poner16(td, 0, formato);
      else td[0] = formato;
      bandera();
      td[desde] = t.combate;
      td[desde + 1] = t.pokemon.length;
      p = new Uint8Array(t.pokemon.length * (8 + (t.conObjetos ? 2 : 0) + (t.conAtaques ? 8 : 0)));
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
    }
    const to = garcs.entrenadores.archivos[t.indice];
    const po = garcs.equipos.archivos[t.indice];
    if (td.some((v, i) => v !== to[i])) nuevosEntr[t.indice] = td;
    if (p.length !== po.length || p.some((v, i) => v !== po[i])) nuevosEquipos[t.indice] = p;
  }
  guardar(r.entrenadores, nuevosEntr);
  guardar(r.equipos, nuevosEquipos);

  // Objetos: precios, tiendas y escondidos (en el programa)
  const b = perfil.base;
  if (b.objetos) {
    for (const t of datos.tiendas) t.huecos.forEach((pos, k) => poner16(sesion.code, pos, t.objetos[k]));
    for (const o of datos.objetosSuelo) poner16(sesion.code, o.pos, o.objeto);
    const garc = leerGarc(sesion.archivo(b.objetos.datos));
    const nuevos = {};
    datos.precios.forEach((precio, id) => {
      if (id && garc.archivos[id] && u16(garc.archivos[id], 0) !== precio) {
        const d = garc.archivos[id].slice();
        poner16(d, 0, precio);
        nuevos[id] = d;
      }
    });
    guardar(b.objetos.datos, nuevos);
  }

  // Iniciales (el dibujo, el nombre y el grito salen de la especie)
  if (datos.iniciales.length && datos.iniciales.some((id, i) => id !== datos.inicialesOriginales[i])) {
    if (b.iniciales) {
      const cro = sesion.archivo(b.iniciales.cro);
      datos.iniciales.forEach((id, i) => {
        poner16(cro, b.iniciales.desde + i * b.iniciales.tam, id);
        cro[b.iniciales.desde + i * b.iniciales.tam + b.iniciales.forma] = 0;
      });
      sesion.cambiar(b.iniciales.cro, cro);
      const pantalla = sesion.archivo(b.iniciales.pantalla);
      const o = u16(pantalla, 0xb8) + b.iniciales.extra;
      datos.iniciales.forEach((id, i) => {
        poner16(pantalla, o + i * 0x54, id);
        pantalla[o + i * 0x54 + 2] = 0;
      });
      sesion.cambiar(b.iniciales.pantalla, pantalla);
    } else if (b.inicialesGarc) {
      const f = leerGarc(sesion.archivo(b.inicialesGarc.ruta)).archivos[0].slice();
      datos.iniciales.forEach((id, i) => {
        poner16(f, i * b.inicialesGarc.tam, id);
        f[i * b.inicialesGarc.tam + b.inicialesGarc.forma] = 0;
      });
      sesion.cambiar(b.inicialesGarc.ruta, crearGarc(sesion.archivo(b.inicialesGarc.ruta), { 0: f }));
    }
  }

  // Salvajes de Sol y Luna
  if (perfil.base.salvajesGrande) {
    const nuevos = {};
    for (const { archivo, estaciones } of datos.salvajes) {
      const e = garcs.salvajesSM.get(archivo).slice();
      const antes = e.slice();
      for (const z of estaciones[0]) {
        const vivo = z.huecos.find((h) => !h.vacio);
        if (vivo) {
          e[z.base] = vivo.min;
          e[z.base + 1] = vivo.max;
        }
        for (const h of z.huecos) if (!h.vacio) poner16(e, h.pos, h.especie | (h.forma << 11));
      }
      if (e.some((v, i) => v !== antes[i])) nuevos[archivo] = comprimirLZ11(e);
    }
    sesion.cambiarParcial(perfil.base.salvajesGrande, nuevos);
  }

  // Salvajes (6.ª)
  if (perfil.gen === 6) {
    const nuevosSalvajes = {};
    for (const { archivo, estaciones } of datos.salvajes) {
      const b = garcs.salvajes.archivos[archivo].slice();
      const antes = b.slice();
      const sitio = sitioSalvajes(b, perfil);
      for (const z of estaciones[0]) {
        z.huecos.forEach((h, i) => {
          if (h.vacio) return;
          const p = sitio.desde + z.base + i * 4;
          poner16(b, p, h.especie | (h.forma << 11));
          b[p + 2] = h.min;
          b[p + 3] = h.max;
        });
      }
      if (b.some((v, i) => v !== antes[i])) nuevosSalvajes[archivo] = comprimirLZ11(b);
    }
    guardar(r.salvajes, nuevosSalvajes);
  }
}

// ---------- Lo que todavía no se hace en 3DS ----------

// ---------- MT ----------

function buscarCodigo(code, hex) {
  const patron = hex.match(/../g).map((x) => parseInt(x, 16));
  let sitio = -1;
  for (let i = 0; i + patron.length <= code.length; i++) {
    if (code[i] !== patron[0] || !patron.every((b, k) => code[i + k] === b)) continue;
    if (sitio >= 0) return -1; // dos veces: no vale
    sitio = i;
  }
  return sitio;
}

// Los ataques de las 100 MT (92 seguidas y las 8 últimas, más allá) y de las MO
export function leerMovimientos(sesion) {
  const perfil = perfilDe(sesion);
  const { tm } = perfil.base;
  const marca = buscarCodigo(sesion.code, tm.prefijo);
  if (marca < 0) throw new Error("No se han encontrado las MT.");
  const inicio = marca + tm.prefijo.length / 2;
  const lista = (desde, cuantos) => Array.from({ length: cuantos }, (_, k) => u16(sesion.code, desde + k * 2));
  const mt = [...lista(inicio, 92), ...lista(inicio + tm.dos * 2, 8)];
  const mo = lista(inicio + 92 * 2, tm.hm);
  for (const extra of tm.hmExtra || []) mo.push(u16(sesion.code, inicio + 92 * 2 + extra));
  return { mt, mo, tutor: [], inicio };
}

export function escribirMovimientos(sesion, m) {
  const { tm } = perfilDe(sesion).base;
  m.mt.slice(0, 92).forEach((id, k) => poner16(sesion.code, m.inicio + k * 2, id));
  m.mt.slice(92).forEach((id, k) => poner16(sesion.code, m.inicio + (tm.dos + k) * 2, id));
}
// Lo que se baraja son los números de cada nombre (el del entrenador n está en la línea n - 1; el de cada clase,
// en su número), no los textos: así vale para todos los idiomas
export function leerNombresEntrenadores(sesion) {
  const perfil = perfilDe(sesion);
  const n = nombresDe(sesion, perfil, "entrenadores").length;
  return { nombres: Array.from({ length: n + 1 }, (_, i) => i), clases: Array.from({ length: nombresDe(sesion, perfil, "clases").length }, (_, i) => i) };
}
// Cambia unas líneas de un archivo de texto (en español) de un GARC de textos: cambios(lineas) las modifica
function cambiarTexto(sesion, ruta, indice, cambios) {
  const garc = leerGarc(sesion.archivo(ruta));
  const lineas = leerTextos6(garc.archivos[indice]).lineas;
  cambios(lineas);
  sesion.cambiar(ruta, crearGarc(sesion.archivo(ruta), { [indice]: escribirTextos6(garc.archivos[indice], lineas) }));
}

// Que lo que se lee cuadre: las iniciales (nombre y tipo, en la pantalla de elegir) y la descripción de cada MT
export function actualizarTextos(sesion, { iniciales, mt, entrenadores }) {
  const perfil = perfilDe(sesion);
  const b = perfil.base;
  if (entrenadores) {
    // Los nombres y las clases barajados, en todos los idiomas: cada uno coge el texto del que le toca
    for (const ruta of b.textoRutas) {
      const garc = leerGarc(sesion.archivo(ruta));
      const nombres = leerTextos6(garc.archivos[b.textos.entrenadores]).lineas;
      const clases = leerTextos6(garc.archivos[b.textos.clases]).lineas;
      const nuevosNombres = nombres.slice();
      entrenadores.nombres.forEach((de, i) => {
        if (i >= 1 && de >= 1 && nombres[de - 1] !== undefined) nuevosNombres[i - 1] = nombres[de - 1];
      });
      const nuevasClases = clases.map((x, i) => (entrenadores.clases[i] !== undefined && clases[entrenadores.clases[i]] !== undefined ? clases[entrenadores.clases[i]] : x));
      sesion.cambiar(ruta, crearGarc(sesion.archivo(ruta), {
        [b.textos.entrenadores]: escribirTextos6(garc.archivos[b.textos.entrenadores], nuevosNombres),
        [b.textos.clases]: escribirTextos6(garc.archivos[b.textos.clases], nuevasClases)
      }));
    }
  }
  if (mt && b.tm) {
    // MT01 a 92 son los objetos 328 en adelante; MT93 a 95, del 618; MT96 a 100, del 690
    const garc = leerGarc(sesion.archivo(b.rutas.textoEs));
    const descObjetos = leerTextos6(garc.archivos[b.tm.descObjetos]).lineas;
    const descAtaques = leerTextos6(garc.archivos[b.tm.descAtaques]).lineas;
    mt.forEach((ataque, k) => {
      const objeto = k < 92 ? 328 + k : k < 95 ? 618 + (k - 92) : 690 + (k - 95);
      if (descAtaques[ataque] !== undefined) descObjetos[objeto] = descAtaques[ataque];
    });
    sesion.cambiar(b.rutas.textoEs, crearGarc(sesion.archivo(b.rutas.textoEs), {
      [b.tm.descObjetos]: escribirTextos6(garc.archivos[b.tm.descObjetos], descObjetos)
    }));
  }
  if (!iniciales || !iniciales.length || !(b.iniciales || b.inicialesGarc)) return;
  const nombres = nombresPokemon(sesion);
  const nuevas = iniciales.ahora.map((id) => nombres[id] || "");
  if (b.iniciales) {
    // «Nombre, Pokémon de tipo Planta» (el nombre va como variable; solo cambia el tipo)
    cambiarTexto(sesion, b.rutas.textoEs, b.iniciales.texto, (t) => {
      for (let k = 0; k < 3; k++) t[1 + k] = t[1 + k].replace(/tipo \S+$/, `tipo ${iniciales[k].tipo}`);
    });
  } else {
    const hist = b.inicialesGarc;
    cambiarTexto(sesion, hist.textoHistoria, hist.texto, (t) => {
      for (let k = 0; k < 3; k++) {
        t[1 + k] = `${nuevas[k]}, de tipo ${iniciales[k].tipo}`;
        t[4 + k] = t[4 + k].replace(/de tipo [^\u0000-\u001f?]+\?/, `de tipo ${iniciales[k].tipo}?`);
        t[11 + k] = `¡${nuevas[k]} te está mirando fijamente!`;
        t[14 + k] = `${nuevas[k].slice(0, 3)}...`;
        t[17 + k] = `¡${nuevas[k]}!`;
      }
    });
  }
}
export function ponerAspectoIniciales() {}
export function ponerPokedexNacional() {}
export function ponerTextoRapido() {}
export function ponerCombatesDobles() {}
