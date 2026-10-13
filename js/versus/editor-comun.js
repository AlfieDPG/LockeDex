// Lo que comparten el editor de Pokémon (./editor.js), «Meter equipo» (./meter-equipo.js) y
// mover Pokémon en la ventana «Partida» (./partida.js): los datos de cada juego (especies,
// formas, objetos, balls...) y los cambios en la partida, que se guardan todos juntos.

import { quitarAcentos, normalizarNombre } from "../comun/utilidades.js";
import { imagenConRespaldo, urlsIconoObjeto } from "../comun/imagenes.js";
import { tiposEs } from "../comun/tipos.js";
import { cargarDatos, datos, buscarPorNombreIngles } from "../comun/datos.js";
import { pedirJSON, URL_API } from "../comun/api.js";
import { formasDeTipoDe } from "../comun/formas.js";
import { generoDe, generosPosibles } from "../comun/pokemon.js";
import { cargarPokedex } from "../pokedex/datos.js";
import { NATURALEZAS, entrenoDe } from "../equipos/entreno.js";
import { apuntarSuceso } from "../comun/lockes.js";
import { leerArchivo, escribirPartida } from "../partida/vinculo.js";
import { editarHuecos } from "../partida/escribir3ds.js";
import { abrirHuecos, cambiosDe, mirar, llaveDe } from "../partida/huecos3ds.js";
import { marcarMetidos, marcarCreados, esCreado } from "../partida/partidas.js";
import { JUEGOS, leerPartida3DS } from "../partida/tresds.js";
import { leerMochila } from "../partida/mochila3ds.js";
import { FORMAS, convertirPartida } from "../partida/convertir.js";
import { OBJETOS_EN, LUGARES_GEN6 } from "../partida/datos-3ds.js";
import { cargarDatosEditor } from "../partida/datos-editor.js";

// Lo último que existe en cada juego (números de especie, objeto, ataque y habilidad)
export const LIMITES = {
  xy: { especies: 721, objetos: 717, ataques: 617, habilidades: 188 },
  oras: { especies: 721, objetos: 775, ataques: 621, habilidades: 191 }
};

// Los ataques que aprende subiendo de nivel, en PokeAPI
const GRUPOS = { xy: "x-y", oras: "omega-ruby-alpha-sapphire" };

// Las formas que se pueden elegir en gen 6: las que no son de Alola ni de gen 7
const ULTIMA_FORMA_GEN6 = 10090;

export const ESPAÑOL = 7; // idioma de la partida
const HUEVO = { 1: "タマゴ", 2: "Egg", 3: "Œuf", 4: "Uovo", 5: "Ei", 7: "Huevo", 8: "알" };

// Estadísticas base que cambiaron después de gen 7 (la Pokédex trae las de ahora)
const BASES_ANTIGUAS = { 681: [60, 50, 150, 50, 150, 60] }; // Aegislash

// Las balls, por su número en el juego (del 1 al 25)
const BALLS = [
  "Master Ball", "Ultra Ball", "Great Ball", "Poke Ball", "Safari Ball", "Net Ball", "Dive Ball", "Nest Ball",
  "Repeat Ball", "Timer Ball", "Luxury Ball", "Premier Ball", "Dusk Ball", "Heal Ball", "Quick Ball", "Cherish Ball",
  "Fast Ball", "Level Ball", "Lure Ball", "Heavy Ball", "Love Ball", "Friend Ball", "Moon Ball", "Sport Ball", "Dream Ball"
];

// ---------- Datos ----------

let filasPokedex = null; // clave de la Pokédex -> fila
export const infoAtaques = new Map(); // id -> { tipo, pp }
const listas = new Map(); // "objetos-xy"... -> lista para el autocompletado

let delEditor = null; // datos/partida-3ds.json (js/partida/datos-editor.js)

// Todo lo que hace falta para abrir un Pokémon sin esperar a nada más. La ventana «Partida» lo
// pide al abrirse, así que al pulsar el primero ya está.
export async function prepararDatos() {
  const [pokedex, , editor] = await Promise.all([cargarPokedex(), cargarDatos(), cargarDatosEditor()]);
  if (!filasPokedex) filasPokedex = new Map(pokedex.map((fila) => [fila.clave, fila]));
  delEditor = editor;
}

export function nombreEspecie(id, idioma = ESPAÑOL) {
  const entrada = datos.pokemon.find((p) => p.id === id);
  if (!entrada) return `#${id}`;
  return idioma === ESPAÑOL ? entrada.es : entrada.en;
}

export function nombreHuevo(idioma) {
  return HUEVO[idioma] || HUEVO[2];
}

function filaNormal(especie) {
  return filasPokedex.get(especie) || [...filasPokedex.values()].find((fila) => fila.numero === especie && fila.normal);
}

// Los objetos van por su número en el juego (OBJETOS_EN): el nombre en español, por el inglés
export function objetosDe(juego) {
  const clave = `objetos-${juego}`;
  if (!listas.has(clave)) {
    const vistos = new Set();
    const lista = [];
    OBJETOS_EN.slice(0, LIMITES[juego].objetos + 1).forEach((en, id) => {
      if (!id || !en || vistos.has(en)) return;
      vistos.add(en);
      const es = (buscarPorNombreIngles(datos.objetos, en) || {}).es || en;
      lista.push({ id, es, en, buscar: quitarAcentos(`${es} ${en}`) });
    });
    listas.set(clave, lista);
  }
  return listas.get(clave);
}

export function hastaLimite(nombre, juego) {
  const clave = `${nombre}-${juego}`;
  if (!listas.has(clave)) listas.set(clave, datos[nombre].filter((entrada) => entrada.id <= LIMITES[juego][nombre === "pokemon" ? "especies" : nombre]));
  return listas.get(clave);
}

export function objeto(id, juego) {
  return id ? objetosDe(juego).find((o) => o.id === id) || { id, es: `Objeto ${id}`, en: "" } : null;
}

export function habilidad(id) {
  return datos.habilidades.find((h) => h.id === id) || { id, es: `Habilidad ${id}`, en: "" };
}

export function ataque(id) {
  return datos.ataques.find((a) => a.id === id) || { id, es: `Ataque ${id}`, en: "" };
}

// ---------- Origen: dónde se conoció, juego y entrenador ----------

// Los juegos de origen que puede llevar un Pokémon en gen 6 (número en el juego)
export const VERSIONES = [
  [24, "X"], [25, "Y"], [27, "Rubí Omega"], [26, "Zafiro Alfa"],
  [21, "Negro"], [20, "Blanco"], [23, "Negro 2"], [22, "Blanco 2"],
  [10, "Diamante"], [11, "Perla"], [12, "Platino"], [7, "Oro HeartGold"], [8, "Plata SoulSilver"],
  [2, "Rubí"], [1, "Zafiro"], [3, "Esmeralda"], [4, "Rojo Fuego"], [5, "Verde Hoja"], [15, "Colosseum / XD"]
].map(([id, es]) => ({ id, es }));

const LUGAR_INTERCAMBIO = 30001;

// Los lugares de gen 6 (el N, en la posición N / 2), sin repetir nombre
export function lugaresGen6() {
  if (!listas.has("lugares")) {
    const vistos = new Set();
    const lista = [];
    LUGARES_GEN6.forEach((es, i) => {
      if (!es || vistos.has(es)) return;
      vistos.add(es);
      lista.push({ id: i * 2, es, en: "", buscar: quitarAcentos(es) });
    });
    lista.push({ id: LUGAR_INTERCAMBIO, es: "Intercambio", en: "", buscar: "intercambio" });
    listas.set("lugares", lista);
  }
  return listas.get("lugares");
}

export function nombreLugar(numero, creado = false) {
  if (creado && numero === LUGAR_INTERCAMBIO) return "LockeDex";
  if (numero === LUGAR_INTERCAMBIO || numero === 30002) return "Intercambio";
  return (numero % 2 === 0 && LUGARES_GEN6[numero / 2]) || (numero ? `Lugar ${numero}` : "");
}

// ¿Creado de cero en la web? (también los de los cambios sin guardar)
export function creadoEnWeb(idLocke, llave) {
  const b = borrador && borrador.idLocke === idLocke ? borrador : null;
  if (b && b.noCreados.includes(llave)) return false;
  return Boolean((b && b.creados.includes(llave)) || esCreado(idLocke, llave));
}

// ---------- Bolsa ----------

// Bolsillo de PokeAPI -> el de la bolsa de gen 6 (js/partida/mochila3ds.js)
const BOLSILLO_POKEAPI = { 1: "objetos", 2: "medicinas", 3: "objetos", 4: "mt", 5: "bayas", 6: "objetos", 7: "objetos", 8: "clave" };
// Los que en gen 6 van en otro: Repartir Experiencia (clave) y Caramelo Furia (medicinas)
const BOLSILLO_EN_GEN6 = { 216: "clave", 504: "medicinas" };

export function bolsilloDe(objetoId) {
  return BOLSILLO_EN_GEN6[objetoId] || BOLSILLO_POKEAPI[((delEditor && delEditor.bolsillos) || {})[objetoId]] || "objetos";
}

// El nombre, y en las MT y MO el ataque que enseñan: «MT26 Terremoto»
export function nombreObjeto(id, juego) {
  const enseña = (((delEditor && delEditor.maquinas) || {})[juego] || {})[id];
  const o = objeto(id, juego);
  return enseña ? `${o.es} ${ataque(enseña).es}` : o.es;
}

// El icono: el de siempre (js/comun/imagenes.js) y, en las MT y MO, todas con el mismo disco
// de su tipo (los de PokeAPI, pixelados como en los juegos de 3DS)
const URL_DISCOS = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/";

export function urlsIconoDe(id, juego) {
  const o = objeto(id, juego);
  const enseña = (((delEditor && delEditor.maquinas) || {})[juego] || {})[id];
  const tipo = enseña && delEditor.ataques[enseña] && delEditor.ataques[enseña][0];
  if (tipo) return [`${URL_DISCOS}${/^HM/i.test((o && o.en) || "") ? "hm" : "tm"}-${tipo}.png`];
  return o && o.en ? urlsIconoObjeto(o.en) : [];
}

// Lo mismo, como el icono de las sugerencias del buscador (iconoObjeto de autocompletado.js)
export function iconoDe(id, juego) {
  const urls = urlsIconoDe(id, juego);
  return urls.length ? imagenConRespaldo(urls, `alt="" loading="lazy" class="objeto" data-quitar-si-falla`) : "";
}

// Lo que ha cambiado en la bolsa, para la actividad: «bolsa: +Master Ball ×99, Poción 5 → 12»
function resumenMochila(antes, despues, juego) {
  const total = (mochila) => {
    const cuantos = new Map();
    for (const lista of Object.values(mochila)) for (const e of lista) cuantos.set(e.objeto, (cuantos.get(e.objeto) || 0) + e.cantidad);
    return cuantos;
  };
  const [a, d] = [total(antes), total(despues)];
  const partes = [];
  for (const id of new Set([...a.keys(), ...d.keys()])) {
    const [x, y] = [a.get(id) || 0, d.get(id) || 0];
    if (x === y) continue;
    const nombre = nombreObjeto(id, juego);
    partes.push(!x ? `+${nombre} ×${y}` : !y ? `−${nombre}` : `${nombre} ${x} → ${y}`);
  }
  return partes.length ? `bolsa: ${partes.join(", ")}` : "";
}

export function balls() {
  if (!listas.has("balls")) {
    listas.set("balls", BALLS.map((en, i) => ({ id: i + 1, en, es: (buscarPorNombreIngles(datos.objetos, en) || {}).es || en })));
  }
  return listas.get("balls");
}

export async function cargarInfoAtaque(id) {
  if (!id || infoAtaques.has(id)) return;
  const local = delEditor && delEditor.ataques[id];
  if (local) {
    infoAtaques.set(id, { tipo: local[0], pp: local[1] });
    return;
  }
  const m = await pedirJSON(`${URL_API}move/${id}`);
  infoAtaques.set(id, { tipo: m.type.name, pp: m.pp || 1 });
}

function idDeUrl(url) {
  return Number((url.match(/\/(\d+)\/?$/) || [])[1]);
}

// ---------- Especies y formas ----------

function nombreDeForma(fila) {
  const dentro = fila.nombre.match(/\((.*)\)$/);
  return dentro ? dentro[1] : fila.nombre;
}

// [{ forma (número en el juego), texto, idForma?, formaPMD?, imagenForma? }]
export function formasDe(especie) {
  const lista = [{ forma: 0, texto: "Normal" }];
  if (especie === 493) {
    lista[0].texto = "Tipo Normal";
    formasDeTipoDe(493).forEach((f, i) =>
      lista.push({ forma: i + 1, texto: `Tipo ${tiposEs[f.tipo]}`, formaPMD: f.pmd, imagenForma: f.imagenForma })
    );
  }
  for (const [numero, [idForma, showdown]] of Object.entries(FORMAS[especie] || {})) {
    if (idForma > ULTIMA_FORMA_GEN6) continue;
    const fila = filasPokedex.get(idForma);
    lista.push({ forma: Number(numero), texto: fila ? nombreDeForma(fila) : showdown, idForma, formaPMD: fila ? fila.forma : 0 });
  }
  return lista;
}

export function basesDe(especie, forma) {
  const opcion = formasDe(especie).find((f) => f.forma === forma) || {};
  return (!opcion.idForma && BASES_ANTIGUAS[especie]) ||
    ((opcion.idForma && filasPokedex.get(opcion.idForma)) || filaNormal(especie) || {}).bases || [1, 1, 1, 1, 1, 1];
}

// Lo de la especie (y su forma) que hace falta para editarla o crearla: habilidades posibles
// (num: 1, 2 o 4 la oculta), género, amistad de base, ciclos del huevo y ataques por nivel
export async function datosEspecie(especie, forma, juego) {
  const opcion = formasDe(especie).find((f) => f.forma === forma) || {};
  const id = opcion.idForma || especie;
  const numero = { 1: 1, 2: 2, 3: 4 };

  // Lo normal: de datos/partida-3ds.json, al momento
  const local = delEditor && delEditor.especies[especie] && (delEditor.habilidades[id] || delEditor.habilidades[especie]);
  if (local) {
    const [generoRatio, felicidad, ciclos, diferencias] = delEditor.especies[especie];
    const delJuego = delEditor.aprende[juego] || {};
    return {
      opcion,
      bases: basesDe(especie, forma),
      habilidades: (delEditor.habilidades[id] || delEditor.habilidades[especie])
        .map(([hab, hueco]) => ({ num: numero[hueco], ...habilidad(hab) }))
        .filter((h) => h.id <= LIMITES[juego].habilidades)
        .sort((a, b) => a.num - b.num),
      generoRatio,
      difGenero: Boolean(diferencias),
      felicidad,
      ciclos,
      aprende: (delJuego[id] || delJuego[especie] || [])
        .filter(([ataqueId]) => ataqueId <= LIMITES[juego].ataques)
        .map(([ataqueId, nivel]) => ({ id: ataqueId, nivel }))
    };
  }

  // Si no está en el archivo, de PokeAPI
  const [p, sp] = await Promise.all([
    pedirJSON(`${URL_API}pokemon/${id}`),
    pedirJSON(`${URL_API}pokemon-species/${especie}`)
  ]);
  const habilidades = p.abilities
    .map((h) => ({ num: numero[h.slot], ...habilidad(idDeUrl(h.ability.url)) }))
    .filter((h) => h.id <= LIMITES[juego].habilidades)
    .sort((a, b) => a.num - b.num);
  const aprende = p.moves
    .flatMap((m) =>
      m.version_group_details
        .filter((d) => d.version_group.name === GRUPOS[juego] && d.move_learn_method.name === "level-up")
        .map((d) => ({ id: idDeUrl(m.move.url), nivel: d.level_learned_at }))
    )
    .filter((a) => a.id <= LIMITES[juego].ataques)
    .sort((a, b) => a.nivel - b.nivel);
  return {
    opcion,
    bases: basesDe(especie, forma),
    habilidades,
    generoRatio: sp.gender_rate,
    difGenero: Boolean(sp.has_gender_differences),
    felicidad: sp.base_happiness ?? 70,
    ciclos: sp.hatch_counter ?? 20,
    aprende
  };
}

// Los cuatro últimos que aprende hasta ese nivel, como los salvajes
export function ataquesDeNivel(aprende, nivel) {
  const ids = [];
  for (const a of aprende) {
    if (a.nivel > nivel) break;
    if (ids.includes(a.id)) ids.splice(ids.indexOf(a.id), 1);
    ids.push(a.id);
  }
  return ids.slice(-4);
}

export function generoAlAzar(generoRatio) {
  if (generoRatio < 0) return "";
  return Math.random() * 8 < generoRatio ? "F" : "M";
}

// ---------- De un Pokémon de «Mis equipos» a uno de la partida ----------

// p: como los de «Mis equipos» (o de un paste ya leído). Devuelve { editable, base,
// nombreEspecie, problemas } (lo que no existe en el juego se queda fuera).
export async function editableDeEquipo(p, juego) {
  const problemas = [];
  const limites = LIMITES[juego];
  const quien = p.mote || p.es;
  if (p.id > limites.especies) throw new Error(`${p.es} no está en este juego.`);

  const formas = formasDe(p.id);
  const suya = formas.find((f) => (p.imagenForma ? f.imagenForma === p.imagenForma : f.idForma && f.idForma === p.idForma));
  if (!suya && p.idForma && p.idForma !== p.id && !/mega|primal/.test(p.formaSlug || "")) problemas.push(`${quien}: va con la forma normal`);
  const forma = suya ? suya.forma : 0;
  const especie = await datosEspecie(p.id, forma, juego);

  let hab = especie.habilidades[0] || { id: 0, num: 1 };
  if (p.habilidad) {
    const propia = especie.habilidades.find((h) => h.id === p.habilidad.id);
    if (propia) hab = propia;
    else if (p.habilidad.id <= limites.habilidades) hab = { id: p.habilidad.id, num: 1 };
    else problemas.push(`${quien}: ${p.habilidad.es} no está en este juego`);
  }

  let idObjeto = 0;
  if (p.objeto) {
    const nombre = normalizarNombre(p.objeto.en || "");
    const delJuego = objetosDe(juego).find((o) => normalizarNombre(o.en) === nombre || o.es === p.objeto.es);
    if (delJuego) idObjeto = delJuego.id;
    else problemas.push(`${quien}: ${p.objeto.es} no está en este juego`);
  }

  const ataques = [];
  for (const a of (p.ataques || []).filter(Boolean)) {
    if (a.id > limites.ataques) {
      problemas.push(`${quien}: ${a.es} no está en este juego`);
      continue;
    }
    await cargarInfoAtaque(a.id);
    ataques.push({ id: a.id, pp: infoAtaques.get(a.id).pp, masPP: 0 });
  }
  while (ataques.length < 4) ataques.push({ id: 0, pp: 0, masPP: 0 });

  const entreno = entrenoDe(p);
  const conGenero = { ...p, generoRatio: especie.generoRatio };
  const genero = generoDe(conGenero) || generosPosibles(conGenero)[0] || "";
  return {
    editable: {
      especie: p.id,
      forma,
      genero,
      mote: String(p.mote || "").slice(0, 12),
      shiny: Boolean(p.shiny),
      objeto: idObjeto,
      habilidad: hab.id,
      numHabilidad: hab.num,
      naturaleza: Math.max(0, NATURALEZAS.findIndex((n) => n.id === entreno.naturaleza)),
      nivel: entreno.nivel,
      evs: entreno.evs,
      ivs: entreno.ivs,
      amistad: 255,
      ataques
    },
    base: especie.bases,
    problemas
  };
}

// ---------- Cambios sin guardar ----------
//
// Los cambios no se escriben uno a uno: se hacen sobre una copia en memoria de la partida (el
// borrador) y se guardan todos juntos al cerrar la ventana «Partida» (guardarCambios), con
// una sola copia de seguridad y una sola línea en la actividad. Si mientras tanto la partida
// del disco cambia (se ha guardado en el juego), no se escribe.
//
//   borrador: { idLocke, base (la del disco al empezar), bytes (con los cambios), vista (para
//               pintarla, como las de js/partida/partidas.js), metidos: [llaves], detalles: [] }

let borrador = null;
let alCambiar = () => {};

// Lo que se hace cada vez que cambia el borrador (repintar la ventana «Partida»)
export function alCambiarBorrador(funcion) {
  alCambiar = funcion;
}

export function hayCambios(idLocke) {
  return Boolean(borrador && borrador.idLocke === idLocke && borrador.detalles.length);
}

export function cuantosCambios(idLocke) {
  return hayCambios(idLocke) ? borrador.detalles.length : 0;
}

// La partida con los cambios sin guardar, como la guardada en partidas.js (null si no hay)
export function vistaConCambios(idLocke) {
  return hayCambios(idLocke) ? borrador.vista : null;
}

// La partida sobre la que se trabaja: la del borrador o, sin cambios, la del disco
export async function partidaDeTrabajo(idLocke) {
  if (hayCambios(idLocke)) return borrador.bytes;
  const bytes = await leerArchivo(idLocke);
  borrador = { idLocke, base: bytes, bytes, vista: null, metidos: [], creados: [], noCreados: [], detalles: [] };
  return bytes;
}

export function descartarCambios() {
  borrador = null;
  alCambiar();
}

// Que en ese sitio siga el mismo Pokémon (llave 0: que siga vacío)
export function comprobarSitio(h, sitio, llave) {
  if (llaveDe(mirar(h, sitio)) !== llave) throw new Error("La partida ha cambiado. Ciérrala y vuelve a abrirla.");
}

// Mover, borrar, meter...: hacer(h) cambia los huecos (js/partida/huecos3ds.js) y devuelve las
// llaves de los Pokémon que mete (no cuentan como capturas ni como muertos). detalle: lo que
// se apunta en la actividad al guardar (mover no apunta nada).
// hacer(h) puede devolver también { metidos, creados, noCreados }: los creados de cero en la
// web (su juego de origen sale como «LockeDex») y los que dejan de serlo
export function cambiarHuecos(idLocke, hacer, detalle = "") {
  return cambiarPartida(idLocke, (original) => {
    const h = abrirHuecos(original, basesDe);
    const r = hacer(h) || [];
    const { cambios, cuantosEquipo } = cambiosDe(h);
    return { nuevo: editarHuecos(original, cambios, cuantosEquipo), ...(Array.isArray(r) ? { metidos: r } : r) };
  }, detalle);
}

// Cualquier otro cambio: transformar(partida) devuelve { nuevo, metidos?, creados?, noCreados? }
export async function cambiarPartida(idLocke, transformar, detalle = "") {
  await prepararDatos();
  const original = await partidaDeTrabajo(idLocke);
  const { nuevo, metidos = [], creados = [], noCreados = [] } = transformar(original);
  const vista = await convertirPartida(leerPartida3DS(nuevo));
  borrador.bytes = nuevo;
  borrador.vista = vista;
  borrador.metidos.push(...metidos);
  borrador.creados.push(...creados);
  borrador.noCreados.push(...noCreados);
  borrador.detalles.push(detalle || "cambios de sitio");
  alCambiar();
}

// Escribe todos los cambios en el archivo. Tiene que ser con un clic (el permiso).
export async function guardarCambios(idLocke) {
  if (!hayCambios(idLocke)) return;
  const b = borrador;
  await escribirPartida(idLocke, (enDisco) => {
    if (enDisco.length !== b.base.length || enDisco.some((byte, i) => byte !== b.base[i])) {
      throw new Error("La partida del disco ha cambiado desde que empezaste (¿has guardado en el juego?). Descarta los cambios y vuelve a hacerlos con el juego cerrado.");
    }
    if (b.metidos.length) marcarMetidos(idLocke, b.metidos);
    if (b.creados.length) marcarCreados(idLocke, b.creados);
    if (b.noCreados.length) marcarCreados(idLocke, b.noCreados, false);
    return b.bytes;
  });
  if (borrador === b) borrador = null;
  alCambiar();
  // En la actividad, una sola línea (los cambios de sitio no cuentan, salvo si no hay más). Lo
  // de la bolsa, como ha quedado al final.
  const juego = (JUEGOS[b.bytes.length] || {}).id;
  const bolsa = b.detalles.includes("bolsa") ? resumenMochila(leerMochila(b.base), leerMochila(b.bytes), juego) : "";
  const detalles = [...new Set(b.detalles.filter((d) => d !== "cambios de sitio" && d !== "bolsa")), ...(bolsa ? [bolsa] : [])];
  await apuntarSuceso(idLocke, "edicion", { detalle: detalles.length ? detalles.join("; ") : "cambios de sitio" });
}
