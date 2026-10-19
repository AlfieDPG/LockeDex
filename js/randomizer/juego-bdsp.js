// ---------- Diamante Brillante y Perla Reluciente ----------
//
// Los datos van en bundles de Unity (ver ./unity.js) dentro de la carpeta «romfs»:
//   Pml/personal_masterdatas   PersonalTable (estadísticas, tipos, habilidades, objetos, MT en machine1-4),
//                              EvolveTable (de 5 en 5: método, dato, especie, forma, nivel), WazaOboeTable
//                              (de 2 en 2: nivel, ataque), WazaTable (los ataques) e ItemTable (precios y qué
//                              ataque enseña cada MT)
//   Dpr/masterdatas            TrainerTable (TrainerData y TrainerPoke, uno por entrenador) y ShopTable
//   Dpr/scriptableobjects/gamesettings   FieldEncountTable_d y _p: los salvajes de cada zona y los legendarios
//   Dpr/ev_script              fld_item: los objetos del suelo (el objeto va como un float en el script)
//   Message/                   los textos (el diálogo de elegir inicial)
// Las iniciales van en el programa: se cambian con un parche IPS (exefs) por versión. Los intercambios, en los scripts.

import { abrirBundle, leerPorNombre, leerOriginal, cambiarPorNombre, guardarBundle } from "./unity.js";

export const ULTIMA_ESPECIE = 493;
export const ULTIMO_ATAQUE = 826;
export const ULTIMA_HABILIDAD = 267;

export const TIPOS = [
  "normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel",
  "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark", "fairy"
];
// Las iniciales van en el programa: en cada versión (Diamante y Perla, 1.0.0 a 1.3.0), su build ID y dónde están las
// funciones que dan la inicial y la del rival (get_DefaultPokeNo y get_RivalPokeNo). En cada una, tres «mov wN, #especie»:
// en +0xC8 (Planta), +0x154 (Fuego) y +0x158 (Agua). Referencia: Ai0796/BDSP-Randomizers
const VERSIONES = [
  ["F87FC6075104EC4D9642A4AA6BB22216", 0x1bbbbb0, 0x1bbbf30], ["EA058A067CBD6943A6CF65B4588B6098", 0x238c6b0, 0x238ca30],
  ["D9E96FB92878E3458AAE7E8D31AB32A9", 0x1fea960, 0x1feace0], ["1B5215DF918BA04BB3894852387F82FF", 0x238e470, 0x238e7f0],
  ["BC259F7EE8E79A4995CDC79E69CAC6CD", 0x237ccf0, 0x237d070], ["35B9D8779B1951418FB609945CCC8C7E", 0x2334e30, 0x23351b0],
  ["94CEAE325C205C4B9D6F7235552F28FD", 0x2cf13d0, 0x2cf1750], ["1284AB14C1477243AE2A3550EF828709", 0x1bbbbe0, 0x1bbbf60],
  ["609FAC97880FA04CA6A8626D54A2BAB2", 0x238c6d0, 0x238ca50], ["3C70CAE153DF0B4F8A7B24C60FD8D0E7", 0x238dd00, 0x238e080],
  ["5D3A3B56321FFD4CB5B5AEDC62550AFB", 0x238e490, 0x238e810], ["046D130F0873314A81D795C157E44A2F", 0x237cd10, 0x237d090],
  ["D75246EC33C2F64BB1D8C893D4823FFC", 0x2334e50, 0x23351d0], ["38F59CBDA2EB9C44B72F94C4D25935A2", 0x238c8e0, 0x238cc60]
];
const INICIALES = [387, 390, 393];
const IDIOMAS = ["jpn", "jpn_kanji", "english", "french", "italian", "german", "spanish", "korean", "simp_chinese", "trad_chinese"];

// Los métodos de evolución en los que el dato es un nivel (va en el quinto número)
const EVO_CON_NIVEL = new Set([4, 9, 10, 11, 12, 13, 14, 15, 23, 24, 28, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41, 46, 47]);

const BASE = "Data/StreamingAssets/AssetAssistant/";
const RUTAS = {
  personal: BASE + "Pml/personal_masterdatas",
  datos: BASE + "Dpr/masterdatas",
  ajustes: BASE + "Dpr/scriptableobjects/gamesettings",
  scripts: BASE + "Dpr/ev_script"
};
// Los textos: los nombres y las categorías de cada idioma, en common_msbt; los diálogos, en el bundle de cada idioma
const MENSAJES = BASE + "Message/";

// Los entrenadores (por su número): Benito (los tres de cada combate, uno por inicial), líderes (los de la historia
// y las revanchas), Alto Mando, Campeona y comandantes del Equipo Galaxia
const RIVALES = [351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 481, 493, 494, 663, 664, 665, 666, 667, 668, 220, 308, 309, 310, 311, 312, 313, 314, 401];
const LIDERES = [175, 179, 240, 241, 242, 243, 244, 245, 676, 677, 678, 679, 680, 681, 682, 683, 185, 186, 187, 188, 696, 697, 698, 699, 701, 702, 703, 704, 191, 700, 705];
const GRUPOS = [[175], [179], [240], [241], [242], [243], [244], [245], [185], [186], [187], [188], [191]];
// Los que no se tocan (los combates de la historia que no son de verdad: el tutorial de captura...)
const NO_TOCAR = new Set([487, 488, 489, 490, 491, 492]);
// Las listas de salvajes de cada zona que llevan Pokémon (cada una, [{ monsNo, minlv?, maxlv? }])
const LISTAS = ["ground_mons", "tairyo", "day", "night", "swayGrass", "gbaRuby", "gbaSapp", "gbaEme", "gbaFire", "gbaLeaf", "water_mons", "boro_mons", "ii_mons", "sugoi_mons"];
// Huecos libres al final de las tiendas especiales (para añadir sin quitar nada)
const HUECOS_LIBRES = 4;
// Los comandos de los scripts que dan un objeto del suelo (el objeto, en el segundo argumento)
const COMANDOS_OBJETO = new Set([41, 187, 194]);

// (los objetos llevan BigInt: en las referencias a otros objetos)
const json = (x) => JSON.stringify(x, (k, v) => (typeof v === "bigint" ? `${v}n` : v));
const igual = (a, b) => json(a) === json(b);
// Un float guardado como sus bits en un entero
const deBits = (i) => new Float32Array(new Int32Array([i]).buffer)[0];
const aBits = (f) => new Int32Array(new Float32Array([f]).buffer)[0];

// Los bundles abiertos de cada sesión
const abiertos = new WeakMap();
function bundles(sesion) {
  if (!abiertos.has(sesion)) {
    const b = {};
    for (const [k, ruta] of Object.entries(RUTAS)) b[k] = abrirBundle(sesion.archivo(ruta));
    abiertos.set(sesion, b);
  }
  return abiertos.get(sesion);
}

// Guarda en la sesión el bundle (si algo ha cambiado)
function guardar(sesion, clave) {
  const bytes = guardarBundle(bundles(sesion)[clave]);
  if (bytes) sesion.cambiar(RUTAS[clave], bytes);
}

// ---------- El juego ----------

export function perfilDe(sesion) {
  return {
    id: "bdsp", gen: 8, nombre: sesion.titulo,
    ultimaEspecie: ULTIMA_ESPECIE, ultimoAtaque: ULTIMO_ATAQUE, ultimaHabilidad: ULTIMA_HABILIDAD,
    ultimoObjeto: 959, objetosGen: 7,
    tipos: TIPOS,
    habilidadesNunca: [176, 197, 208, 209, 210, 211, 225, 241, 248, 258, 266, 267],
    legendarios: [],
    maxEvoluciones: 8,
    sinMT: false, bitsMT: { tm: 100, hm: 0, extra: 0 }, bloquesMT: 13,
    tutores: false, tutorInfo: null, claros: false, iniciales: true,
    lideres: LIDERES, rivales: RIVALES, grupos: GRUPOS, importantes: new Set([...LIDERES, ...RIVALES]),
    sinDobles: [],
    preciosEnDecenas: false
  };
}

export async function prepararRom(sesion) {
  await sesion.cargar(Object.values(RUTAS));
  // Los textos (para el diálogo de elegir inicial), si están en la carpeta
  const textos = [MENSAJES + "common_msbt", ...IDIOMAS.map((i) => MENSAJES + i)].filter((r) => sesion.tiene(r));
  await sesion.cargar(textos);
  return perfilDe(sesion);
}

export function nombresPokemon() {
  return [];
}

// ---------- Leer ----------

function leerEspecies(personal, evoluciones) {
  const especies = [];
  for (let id = 1; id <= ULTIMA_ESPECIE; id++) {
    const p = personal[id];
    if (!p || !p.valid_flag) continue;
    const ar = evoluciones[id].ar;
    const evos = [];
    for (let k = 0; k + 4 < ar.length; k += 5) {
      const [metodo, dato, especie, forma, nivel] = ar.slice(k, k + 5);
      if (!metodo || !especie) continue;
      evos.push({ metodo, dato: EVO_CON_NIVEL.has(metodo) ? nivel : dato, especie, forma, nivelOriginal: nivel, especieOriginal: especie, metodoOriginal: metodo, paramOriginal: dato });
    }
    // Las 100 MT: machine1 a machine3 (32 cada una) y 4 de machine4
    const mt = new Uint8Array(13);
    [p.machine1, p.machine2, p.machine3, p.machine4].forEach((m, k) => {
      for (let b = 0; b < 32 && k * 32 + b < 100; b++) if ((m >>> b) & 1) mt[(k * 32 + b) >> 3] |= 1 << ((k * 32 + b) & 7);
    });
    const stats = [p.basic_hp, p.basic_atk, p.basic_def, p.basic_spatk, p.basic_spdef, p.basic_agi];
    const total = stats.reduce((a, b) => a + b, 0);
    especies[id] = {
      id, stats, total, totalOriginal: total,
      tipos: [...new Set([TIPOS[p.type1], TIPOS[p.type2]])].filter(Boolean),
      habilidades: [p.tokusei1, p.tokusei2 === p.tokusei1 ? 0 : p.tokusei2, p.tokusei3],
      objetos: [p.item1, p.item2, p.item3], genero: p.sex,
      mt, tutor: new Uint8Array(0), evoluciones: evos, previa: 0
    };
  }
  for (const e of especies) if (e) for (const evo of e.evoluciones) if (especies[evo.especie]) especies[evo.especie].previa = e.id;
  return especies;
}

function leerEntrenadores(tabla, perfil) {
  const entrenadores = [];
  tabla.TrainerPoke.forEach((tp, i) => {
    const td = tabla.TrainerData[i];
    if (!td || NO_TOCAR.has(tp.ID)) return;
    const pokemon = [];
    for (let n = 1; n <= 6; n++) {
      if (!tp[`P${n}MonsNo`]) break;
      pokemon.push({
        especie: tp[`P${n}MonsNo`], forma: tp[`P${n}FormNo`], nivel: tp[`P${n}Level`], habilidad: tp[`P${n}Tokusei`],
        objeto: tp[`P${n}Item`], ataques: [1, 2, 3, 4].map((m) => tp[`P${n}Waza${m}`])
      });
    }
    if (!pokemon.length) return;
    entrenadores.push({ indice: i, clase: td.TypeID, combate: td.FightType, conAtaques: true, conObjetos: true, importante: perfil.importantes.has(tp.ID), pokemon });
  });
  return entrenadores;
}

// Los salvajes de Diamante (_d) y de Perla (_p): cada zona, un área; además el Jardín Trofeo, los árboles de miel
// (con sus Pokémon raros) y la Gran Pradera. Los legendarios, como estáticos (los de Perla, iguales que los de Diamante)
function leerSalvajes(tablas) {
  const salvajes = [];
  const estaticos = [];
  for (const [version, t] of Object.entries(tablas)) {
    t.table.forEach((zona, z) => {
      const zonas = [];
      for (const lista of LISTAS) {
        const huecos = (zona[lista] || []).map((m) => ({ especie: m.monsNo, forma: 0, min: m.minlv ?? 0, max: m.maxlv ?? 0, vacio: !m.monsNo, m, nivel: "minlv" in m }));
        if (huecos.some((h) => h.especie)) zonas.push({ zona: lista, huecos });
      }
      if (zonas.length) salvajes.push({ archivo: `${version}:${zona.zoneID}:${z}`, estaciones: [zonas] });
    });
    const extra = (nombre, lista, campo) => {
      const huecos = lista.map((m) => ({ especie: m[campo], forma: 0, min: 0, max: 0, vacio: !m[campo], m, campo }));
      if (huecos.some((h) => h.especie)) salvajes.push({ archivo: `${version}:${nombre}`, estaciones: [[{ zona: nombre, huecos }]] });
    };
    extra("jardin", t.urayama, "monsNo");
    extra("pradera", t.safari, "MonsNo");
    extra("miel-normal", t.honeytree, "Normal");
    extra("miel-raro", t.honeytree, "Rare");
    t.legendpoke.forEach((l, k) => {
      const copiaDe = version === "p" ? k : undefined;
      estaticos.push({ tabla: "legendario", fb: l, actual: l.monsNo, nivelActual: 0, ignorar: !l.monsNo || l.monsNo > ULTIMA_ESPECIE, ...(copiaDe !== undefined ? { copiaDe } : {}) });
    });
  }
  return { salvajes, estaticos };
}

// Las tiendas: la normal (todas las listas de la Tienda Pokémon juntas, la 0) y cada tienda especial (por su número)
function leerTiendas(t) {
  const normal = [...new Set(t.FS.filter((x) => x.ZoneID === -1).map((x) => x.ItemNo))];
  const tiendas = [{ indice: 0, objetos: [...normal, 0], originales: normal }];
  const ids = [...new Set(t.FixedShop.map((x) => x.ShopID))];
  ids.forEach((id, k) => tiendas.push({ indice: k + 1, shopID: id, objetos: [...t.FixedShop.filter((x) => x.ShopID === id).map((x) => x.ItemNo), ...new Array(HUECOS_LIBRES).fill(0)] }));
  const especiales = tiendas.slice(1).map((x) => x.indice);
  return { tiendas, tipo: { normales: [0], mt: [], historia: [0, ...especiales], primera: 0, saltar: [], cuantas: tiendas.length } };
}

// Los objetos del suelo: en los scripts de fld_item, el comando que da el objeto lleva su número como float
function leerObjetosSuelo(scripts) {
  const lista = [];
  for (const s of scripts.Scripts || []) {
    const c = s.Commands && s.Commands[0];
    if (!c || !c.Arg || c.Arg.length < 2 || !COMANDOS_OBJETO.has(c.Arg[0].data)) continue;
    const bits = c.Arg[1].data;
    const valor = deBits(bits);
    // Los que son un número de verdad (los demás son variables)
    if (bits < 0x3f800000 || !Number.isInteger(valor) || valor < 1 || valor > 1822) continue;
    lista.push({ objeto: valor, arg: c.Arg[1] });
  }
  return lista;
}

export function leerBW2(sesion) {
  const perfil = perfilDe(sesion);
  const b = bundles(sesion);
  const personal = leerPorNombre(b.personal, "PersonalTable");
  const evolucion = leerPorNombre(b.personal, "EvolveTable");
  const oboe = leerPorNombre(b.personal, "WazaOboeTable");
  const waza = leerPorNombre(b.personal, "WazaTable");
  const items = leerPorNombre(b.personal, "ItemTable");
  const entrenadores = leerPorNombre(b.datos, "TrainerTable");
  const shop = leerPorNombre(b.datos, "ShopTable");
  const tablas = { d: leerPorNombre(b.ajustes, "FieldEncountTable_d"), p: leerPorNombre(b.ajustes, "FieldEncountTable_p") };
  let fld = null;
  try {
    fld = leerPorNombre(b.scripts, "fld_item");
  } catch (e) {
    fld = null;
  }

  const especies = leerEspecies(personal.Personal, evolucion.Evolve);
  const aprende = [];
  for (const e of especies) {
    if (!e) continue;
    const ar = oboe.WazaOboe[e.id].ar;
    const lista = [];
    for (let k = 0; k + 1 < ar.length; k += 2) lista.push([ar[k + 1], ar[k]]);
    aprende[e.id] = lista;
  }
  const ataques = [];
  for (const w of waza.Waza) {
    if (!w.isValid || !w.wazaNo || w.wazaNo > ULTIMO_ATAQUE) continue;
    ataques[w.wazaNo] = { id: w.wazaNo, tipo: TIPOS[w.type], categoria: w.category, potencia: w.power, precision: w.hitPer, pp: w.basePP };
  }
  // Las MT: qué objeto es cada una (las 100 primeras máquinas)
  const maquinas = items.WazaMachine.filter((m) => m.machineNo >= 1 && m.machineNo <= 100).sort((a, c) => a.machineNo - c.machineNo);
  perfil.mtItems = maquinas.map((m) => m.itemNo);
  // Los objetos: los que no tienen dibujo o no van en ningún bolsillo no están en el juego
  const precios = [];
  for (const it of items.Item) if (it.no && it.iconid >= 0 && it.fld_pocket !== 9) precios[it.no] = it.price;
  perfil.objetosInexistentes = (id) => precios[id] === undefined;
  const t = leerTiendas(shop);
  perfil.tiendas = t.tipo;
  const s = leerSalvajes(tablas);
  return {
    perfil, especies, aprende, ataques, salvajes: s.salvajes, entrenadores: leerEntrenadores(entrenadores, perfil),
    iniciales: INICIALES.slice(), inicialesOriginales: INICIALES.slice(), estaticos: s.estaticos, intercambios: [], totems: [],
    precios, tiendas: t.tiendas, objetosSuelo: fld ? leerObjetosSuelo(fld) : [], claros: null,
    bd: { personal, evolucion, oboe, waza, items, entrenadores, shop, tablas, fld, maquinas }
  };
}

// ---------- Escribir ----------

export function escribirBW2(sesion, datos) {
  const { bd } = datos;
  const b = bundles(sesion);
  const poner = (bundle, nombre, nuevo, antes) => {
    if (!igual(nuevo, antes)) cambiarPorNombre(bundle, nombre, nuevo);
  };
  const copia = (x) => structuredClone(x);

  // Especies, evoluciones y ataques que aprenden
  const personal = copia(bd.personal);
  const evolucion = copia(bd.evolucion);
  const oboe = copia(bd.oboe);
  for (const e of datos.especies) {
    if (!e) continue;
    const p = personal.Personal[e.id];
    [p.basic_hp, p.basic_atk, p.basic_def, p.basic_spatk, p.basic_spdef, p.basic_agi] = e.stats;
    p.type1 = TIPOS.indexOf(e.tipos[0]);
    p.type2 = TIPOS.indexOf(e.tipos[1] || e.tipos[0]);
    p.tokusei1 = e.habilidades[0];
    p.tokusei2 = e.habilidades[1] || e.habilidades[0];
    p.tokusei3 = e.habilidades[2] || e.habilidades[0];
    [p.item1, p.item2, p.item3] = e.objetos;
    ["machine1", "machine2", "machine3", "machine4"].forEach((campo, k) => {
      let m = p[campo];
      for (let bit = 0; bit < 32 && k * 32 + bit < 100; bit++) {
        const i = k * 32 + bit;
        const si = (e.mt[i >> 3] >> (i & 7)) & 1;
        m = si ? m | (1 << bit) : m & ~(1 << bit);
      }
      p[campo] = m >>> 0;
    });
    evolucion.Evolve[e.id].ar = e.evoluciones.flatMap((evo) => {
      const conNivel = EVO_CON_NIVEL.has(evo.metodo);
      const dato = !conNivel ? evo.dato : evo.metodo === evo.metodoOriginal ? evo.paramOriginal : 0;
      const forma = evo.especie === evo.especieOriginal ? evo.forma || 0 : 0;
      return [evo.metodo, dato, evo.especie, forma, conNivel ? evo.dato : evo.nivelOriginal || 0];
    });
    oboe.WazaOboe[e.id].ar = (datos.aprende[e.id] || []).flatMap(([ataque, nivel]) => [nivel, ataque]);
  }
  poner(b.personal, "PersonalTable", personal, bd.personal);
  poner(b.personal, "EvolveTable", evolucion, bd.evolucion);
  poner(b.personal, "WazaOboeTable", oboe, bd.oboe);

  // Datos de los ataques
  const waza = copia(bd.waza);
  for (const w of waza.Waza) {
    const a = datos.ataques[w.wazaNo];
    if (!a) continue;
    w.type = TIPOS.indexOf(a.tipo);
    w.power = a.potencia;
    w.hitPer = a.precision;
    w.basePP = a.pp;
  }
  poner(b.personal, "WazaTable", waza, bd.waza);

  // Precios (sobre lo ya cambiado: las MT se escriben antes, en escribirMovimientos)
  const items = leerPorNombre(b.personal, "ItemTable");
  for (const it of items.Item) if (datos.precios[it.no] !== undefined) it.price = Math.max(0, Math.round(datos.precios[it.no]));
  poner(b.personal, "ItemTable", items, leerOriginal(b.personal, "ItemTable"));

  escribirEntrenadores(datos, b, copia, poner);
  escribirSalvajes(datos, b, copia, poner);
  escribirTiendas(datos, b, copia, poner);

  // Objetos del suelo (cambiados en su sitio, en lo leído)
  if (bd.fld) {
    const fld = copia(bd.fld);
    let k = 0;
    const objetos = datos.objetosSuelo;
    for (const s of fld.Scripts || []) {
      const c = s.Commands && s.Commands[0];
      if (!c || !c.Arg || c.Arg.length < 2 || !COMANDOS_OBJETO.has(c.Arg[0].data)) continue;
      const bits = c.Arg[1].data;
      const valor = deBits(bits);
      if (bits < 0x3f800000 || !Number.isInteger(valor) || valor < 1 || valor > 1822) continue;
      c.Arg[1].data = aBits(objetos[k++].objeto);
    }
    poner(b.scripts, "fld_item", fld, bd.fld);
  }

  for (const clave of Object.keys(RUTAS)) guardar(sesion, clave);
  if (datos.iniciales.some((id, k) => id !== INICIALES[k])) escribirIniciales(sesion, datos.iniciales, datos.especies);
}

// ---------- Iniciales ----------

// «mov wN, #imm» de ARM64 (movz de 32 bits), en little endian
const mov = (registro, valor) => {
  const x = (0x52800000 | ((valor & 0xffff) << 5) | registro) >>> 0;
  return [x & 0xff, (x >> 8) & 0xff, (x >> 16) & 0xff, x >>> 24];
};

// Un parche IPS32 por versión (el emulador aplica el de la suya: van por su build ID). El rival se lleva la que tiene
// ventaja sobre la tuya, como en el juego: con Planta, la de Fuego; con Fuego, la de Agua; con Agua, la de Planta
function parcheIniciales([planta, fuego, agua], inicial, rival) {
  const cambios = [
    [inicial + 0xc8, mov(0, planta)], [inicial + 0xc8 + 0x8c, mov(8, fuego)], [inicial + 0xc8 + 0x90, mov(9, agua)],
    [rival + 0xc8, mov(0, fuego)], [rival + 0xc8 + 0x8c, mov(8, agua)], [rival + 0xc8 + 0x90, mov(8, planta)]
  ];
  const salida = [..."IPS32"].map((c) => c.charCodeAt(0));
  for (const [sitio, bytes] of cambios) {
    const p = sitio + 0x100; // las direcciones del NSO van detrás de su cabecera
    salida.push((p >>> 24) & 0xff, (p >> 16) & 0xff, (p >> 8) & 0xff, p & 0xff, 0, bytes.length, ...bytes);
  }
  salida.push(..."EEOF".split("").map((c) => c.charCodeAt(0)));
  return Uint8Array.from(salida);
}

// La inicial que escoges queda en la variable 246, y muchos scripts la comparan con Turtwig, Chimchar y Piplup (qué
// equipo lleva Benito, qué te dicen...): en esas comparaciones (los números van como float), las nuevas
const VARIABLE_INICIAL = 246;
function scriptsIniciales(sesion, iniciales, especies) {
  const ab = bundles(sesion).scripts;
  // Cada fase de la línea de antes (Turtwig, Grotle, Torterra...), por la misma fase de la nueva (o la última que tenga)
  const linea = (id) => {
    const l = [id];
    for (let e = especies[id]; e && e.evoluciones.length && l.length < 3; e = especies[e.evoluciones[0].especie]) l.push(e.evoluciones[0].especie);
    return l;
  };
  const nuevo = new Map();
  INICIALES.forEach((antes, k) => {
    const ahora = linea(iniciales[k]);
    [antes, antes + 1, antes + 2].forEach((fase, i) => nuevo.set(aBits(fase), aBits(ahora[Math.min(i, ahora.length - 1)])));
  });
  for (const nombre of ab.porNombre.keys()) {
    let objeto;
    try {
      objeto = leerPorNombre(ab, nombre);
    } catch (e) {
      continue;
    }
    if (!Array.isArray(objeto.Scripts)) continue;
    let cambio = false;
    for (const s of objeto.Scripts) {
      for (const c of s.Commands || []) {
        const args = c.Arg || [];
        if (!args.some((a) => a.argType === 2 && a.data === VARIABLE_INICIAL)) continue;
        for (const a of args) {
          if (a.argType === 1 && nuevo.has(a.data) && nuevo.get(a.data) !== a.data) {
            a.data = nuevo.get(a.data);
            cambio = true;
          }
        }
      }
    }
    if (cambio) cambiarPorNombre(ab, nombre, objeto);
  }
  guardar(sesion, "scripts");
}

function escribirIniciales(sesion, iniciales, especies) {
  for (const [id, inicial, rival] of VERSIONES) sesion.cambiar(`@exefs/${id}.ips`, parcheIniciales(iniciales, inicial, rival));
  scriptsIniciales(sesion, iniciales, especies);
  // El diálogo de elegir: «¿Quieres a Turtwig, el Pokémon Hojita?», en cada idioma (el nombre y la categoría)
  if (!sesion.tiene(MENSAJES + "common_msbt")) return;
  const comun = abrirBundle(sesion.archivo(MENSAJES + "common_msbt"));
  const lineas = (nombre) => {
    try {
      return leerPorNombre(comun, nombre).labelDataArray.map((l) => l.wordDataArray.map((w) => w.str).join(""));
    } catch (e) {
      return null;
    }
  };
  for (const idioma of IDIOMAS) {
    const ruta = MENSAJES + idioma;
    const nombres = lineas(`${idioma}_ss_monsname`);
    const categorias = lineas(`${idioma}_ss_zkn_type`);
    if (!sesion.tiene(ruta) || !nombres || !categorias) continue;
    const ab = abrirBundle(sesion.archivo(ruta));
    const objeto = `${idioma}_dp_scenario1`;
    if (!ab.porNombre.has(objeto)) continue;
    const msg = leerPorNombre(ab, objeto);
    INICIALES.forEach((antes, k) => {
      const ahora = iniciales[k];
      if (ahora === antes) return;
      const label = msg.labelDataArray.find((l) => l.labelName === `8-EV_POKESELECT_0${k + 2}`);
      if (!label) return;
      for (const w of label.wordDataArray) {
        if (w.str === nombres[antes]) w.str = nombres[ahora];
        else if (w.str === categorias[antes]) w.str = categorias[ahora];
      }
    });
    cambiarPorNombre(ab, objeto, msg);
    const bytes = guardarBundle(ab);
    if (bytes) sesion.cambiar(ruta, bytes);
  }
}

function escribirEntrenadores(datos, b, copia, poner) {
  const tabla = copia(datos.bd.entrenadores);
  for (const t of datos.entrenadores) {
    const tp = tabla.TrainerPoke[t.indice];
    const td = tabla.TrainerData[t.indice];
    td.FightType = t.combate;
    const campos = Object.keys(tp).filter((k) => /^P1[A-Z]/.test(k)).map((k) => k.slice(2));
    for (let n = 1; n <= 6; n++) {
      const poke = t.pokemon[n - 1];
      if (!poke) {
        for (const c of campos) if (typeof tp[`P${n}${c}`] === "number") tp[`P${n}${c}`] = 0;
        continue;
      }
      // Uno nuevo: como el anterior
      if (!tp[`P${n}MonsNo`] && n > 1) for (const c of campos) tp[`P${n}${c}`] = tp[`P${n - 1}${c}`];
      const cambia = tp[`P${n}MonsNo`] !== poke.especie;
      tp[`P${n}MonsNo`] = poke.especie;
      tp[`P${n}FormNo`] = poke.forma || 0;
      tp[`P${n}Level`] = poke.nivel;
      tp[`P${n}Item`] = poke.objeto || 0;
      // La habilidad va por su número: la de la especie nueva (la primera, si no se ha elegido)
      const e = datos.especies[poke.especie];
      if (cambia || !poke.habilidad) tp[`P${n}Tokusei`] = e ? e.habilidades[0] : tp[`P${n}Tokusei`];
      (poke.ataques || [0, 0, 0, 0]).forEach((m, k) => (tp[`P${n}Waza${k + 1}`] = m));
    }
  }
  poner(b.datos, "TrainerTable", tabla, datos.bd.entrenadores);
}

function escribirSalvajes(datos, b, copia, poner) {
  for (const area of datos.salvajes) {
    for (const z of area.estaciones[0]) {
      for (const h of z.huecos) {
        if (h.vacio) continue;
        if (h.campo) h.m[h.campo] = h.especie;
        else {
          h.m.monsNo = h.especie;
          if (h.nivel) {
            h.m.minlv = h.min;
            h.m.maxlv = h.max;
          }
        }
      }
    }
  }
  for (const e of datos.estaticos) {
    const nueva = e.copiaDe !== undefined ? datos.estaticos[e.copiaDe].nueva : e.nueva;
    if (nueva === undefined || nueva === e.actual || e.ignorar) continue;
    e.fb.monsNo = nueva;
    e.fb.formNo = 0;
    e.fb.waza1 = e.fb.waza2 = e.fb.waza3 = e.fb.waza4 = 0;
  }
  // (los huecos apuntan a lo leído: se compara con el bundle tal cual)
  poner(b.ajustes, "FieldEncountTable_d", datos.bd.tablas.d, leerOriginal(b.ajustes, "FieldEncountTable_d"));
  poner(b.ajustes, "FieldEncountTable_p", datos.bd.tablas.p, leerOriginal(b.ajustes, "FieldEncountTable_p"));
}

function escribirTiendas(datos, b, copia, poner) {
  const shop = copia(datos.bd.shop);
  const normal = datos.tiendas[0];
  for (const id of normal.objetos.filter((x) => x && !normal.originales.includes(x))) shop.FS.push({ ItemNo: id, BadgeNum: 0, ZoneID: -1 });
  const especiales = datos.tiendas.slice(1);
  shop.FixedShop = especiales.flatMap((t) => t.objetos.filter(Boolean).map((ItemNo) => ({ ItemNo, ShopID: t.shopID })));
  poner(b.datos, "ShopTable", shop, datos.bd.shop);
}

// ---------- MT y textos ----------

// Qué ataque enseña cada MT (las 100)
export function leerMovimientos(sesion) {
  const items = leerPorNombre(bundles(sesion).personal, "ItemTable");
  const mt = items.WazaMachine.filter((m) => m.machineNo >= 1 && m.machineNo <= 100).sort((a, c) => a.machineNo - c.machineNo).map((m) => m.wazaNo);
  return { mt, tutor: [] };
}

export function escribirMovimientos(sesion, m) {
  const b = bundles(sesion);
  const items = leerPorNombre(b.personal, "ItemTable");
  // Si ya se cambió (los precios), se parte de eso
  for (const w of items.WazaMachine) if (w.machineNo >= 1 && w.machineNo <= 100) w.wazaNo = m.mt[w.machineNo - 1];
  cambiarPorNombre(b.personal, "ItemTable", items);
  guardar(sesion, "personal");
}

// Los nombres de los entrenadores: lo que se baraja es qué etiqueta de nombre lleva cada uno (así vale para todos los
// idiomas); las clases no se tocan
export function leerNombresEntrenadores(sesion) {
  const tabla = leerPorNombre(bundles(sesion).datos, "TrainerTable");
  return { nombres: tabla.TrainerData.map((_, i) => i), clases: [] };
}

export function actualizarTextos(sesion, { entrenadores }) {
  if (!entrenadores) return;
  const b = bundles(sesion);
  const tabla = leerPorNombre(b.datos, "TrainerTable");
  const antes = tabla.TrainerData.map((t) => t.NameLabel);
  tabla.TrainerData.forEach((t, i) => {
    const de = entrenadores.nombres[i];
    if (de !== undefined && antes[de]) t.NameLabel = antes[de];
  });
  cambiarPorNombre(b.datos, "TrainerTable", tabla);
  guardar(sesion, "datos");
}

export function ponerAspectoIniciales() {}
export function ponerCombatesDobles() {}
export function ponerTextoRapido() {}
export function ponerPokedexNacional() {}
