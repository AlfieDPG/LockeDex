// Editar un Pokémon de la partida vinculada a un locke (como en PKHeX), desde la ventana
// «Partida» (js/versus/partida.js): especie y forma, mote, shiny, género, nivel, naturaleza,
// EVs e IVs (la ventana de «Crear equipo», js/equipos/entreno.js), amistad, ball, objeto,
// habilidad, ataques y si es un huevo. En un hueco vacío, se crea uno nuevo.
//
// Además: borrarlo y clonarlo (a la primera caja con sitio). Moverlos es arrastrarlos en las cajas.
//
// «Aceptar» no escribe: el cambio va a la copia en memoria de la partida (./editor-comun.js),
// y todo se guarda junto al cerrar la ventana «Partida», con una línea en la actividad del
// locke. Lo de escribir está en js/partida/ (vinculo, escribir3ds, huecos3ds y pokemon3ds).

import { icono } from "../comun/iconos.js";
import { escaparHTML } from "../comun/utilidades.js";
import { coloresTipo, iconoTipo } from "../comun/tipos.js";
import { activarAutocompletado, iconoPokemon, iconoObjeto } from "../comun/autocompletado.js";
import { imagenConRespaldo, urlsRetrato, urlsIconoObjeto } from "../comun/imagenes.js";
import { generosPosibles, ICONO_GENERO, NOMBRE_GENERO } from "../comun/pokemon.js";
import { campoNumero } from "../comun/numero.js";
import { NATURALEZAS, incrustarEntreno, opcionesNaturaleza } from "../equipos/entreno.js";
import { leerHueco } from "../partida/escribir3ds.js";
import { mirar, poner, huecoLibre, llaveDe } from "../partida/huecos3ds.js";
import { leerEditable, aplicarEditable, crearPokemon, conLlaveNueva, ppMaximos } from "../partida/pokemon3ds.js";
import { partidaDe } from "../partida/partidas.js";
import { JUEGOS, entrenadorDe } from "../partida/tresds.js";
import {
  LIMITES, infoAtaques, prepararDatos, nombreEspecie, nombreHuevo, objetosDe, hastaLimite, objeto, habilidad,
  ataque, balls, cargarInfoAtaque, formasDe, datosEspecie, ataquesDeNivel, generoAlAzar, comprobarSitio, cambiarHuecos, partidaDeTrabajo, urlsIconoDe, iconoDe,
  VERSIONES, lugaresGen6, nombreLugar, creadoEnWeb
} from "./editor-comun.js";

let dialogo = null;
let panel = null; // lo de dentro: va en su ventana o en el lado de la ventana «Partida»
let lado = null;
let cuerpo = null;
let error = null;
let alCambiarEditando = () => {};

// A partir de este ancho, el editor va a la derecha de las cajas: se pasa de un Pokémon a otro
// sin abrir y cerrar ventanas
const ANCHO_PARA_LADO = "(min-width: 1100px)";
// { idLocke, sitio, juego, llave (0 si es nuevo), antes (null si es nuevo), poke, nivelInicial }
let abierto = null;
let editando = null; // el sitio que se abre (ya mientras carga)

// Donde se conocen los creados aquí (el lugar especial de gen 6 de los intercambios)
const LUGAR_LOCKEDEX = 30001;

// Pone la especie (y su forma): estadísticas base, habilidades posibles, géneros posibles...
// cambiando: si viene de elegir otra especie u otra forma (habilidad y género se ajustan)
async function ponerEspecie(poke, especie, forma, cambiando) {
  const d = await datosEspecie(especie, forma, abierto.juego);
  Object.assign(poke, {
    especie, id: especie, es: nombreEspecie(especie), forma,
    idForma: d.opcion.idForma, formaPMD: d.opcion.formaPMD || 0, imagenForma: d.opcion.imagenForma,
    stats: d.bases, habilidades: d.habilidades, generoRatio: d.generoRatio, difGenero: d.difGenero,
    felicidad: d.felicidad, ciclos: d.ciclos, aprende: d.aprende
  });
  if (cambiando && poke.habilidades.length) {
    const misma = poke.habilidades.find((h) => h.num === poke.numHabilidad) || poke.habilidades[0];
    poke.habilidad = misma.id;
    poke.numHabilidad = misma.num;
  }
  const posibles = generosPosibles(poke);
  if (!posibles.includes(poke.genero)) poke.genero = posibles[0] || "";
}

// Uno nuevo, como los salvajes: naturaleza e IVs al azar, sin EVs y con los ataques que
// tendría a ese nivel (mientras no se toquen, cambian con la especie)
async function ponerPorDefecto(poke) {
  const nivel = poke.entreno ? poke.entreno.nivel : abierto.nivelInicial;
  if (!poke.entreno) {
    poke.entreno = {
      nivel,
      naturaleza: NATURALEZAS[Math.floor(Math.random() * NATURALEZAS.length)].id,
      evs: [0, 0, 0, 0, 0, 0],
      ivs: Array.from({ length: 6 }, () => Math.floor(Math.random() * 32))
    };
    poke.genero = generoAlAzar(poke.generoRatio);
    const posibles = generosPosibles(poke);
    if (!posibles.includes(poke.genero)) poke.genero = posibles[0] || "";
  }
  poke.amistad = poke.huevo ? poke.ciclos : poke.felicidad;
  if (poke.ataquesSolos !== false) {
    const ids = ataquesDeNivel(poke.aprende, nivel);
    await Promise.all(ids.map(cargarInfoAtaque));
    poke.ataques = [0, 1, 2, 3].map((i) => (ids[i] ? { id: ids[i], pp: infoAtaques.get(ids[i]).pp, masPP: 0 } : null));
    poke.ataquesSolos = true;
  }
}

// ---------- Pintar ----------

function plantillaGenero(poke) {
  const posibles = generosPosibles(poke);
  if (!posibles.length) return "";
  const genero = poke.genero;
  return `<button class="editor-genero ${genero ? `genero-${genero}` : ""}" ${posibles.length < 2 ? "disabled" : ""}
            title="${genero ? NOMBRE_GENERO[genero] : "Sin género"}">${genero ? icono(ICONO_GENERO[genero]) : "⚥︎"}</button>`;
}

// Objeto y habilidad: desplegables en los que también se escribe (lo que tiene, escrito; al
// entrar, la lista corta y, escribiendo, todos los que encajan)
function plantillaObjeto(poke) {
  const o = objeto(poke.objeto, abierto.juego);
  return `
    <span class="editor-combo">
      ${o ? imagenConRespaldo(urlsIconoDe(o.id, abierto.juego), `class="editor-icono-objeto" alt="" data-quitar-si-falla`) : ""}
      <span class="editor-buscar"><input class="editor-objeto-campo" type="text" placeholder="Sin objeto" autocomplete="off" aria-label="Objeto" value="${escaparHTML(o ? o.es : "")}"></span>
    </span>`;
}

function plantillaBall(poke) {
  const lista = balls();
  const suya = lista.find((b) => b.id === poke.ball);
  return `
    <span class="editor-ball" title="Ball">
      ${suya ? imagenConRespaldo(urlsIconoObjeto(suya.en), `class="editor-icono-objeto" alt="" data-quitar-si-falla`) : ""}
      <select class="editor-ball-campo" aria-label="Ball">
        ${suya ? "" : `<option value="${poke.ball}" selected>Ball ${poke.ball}</option>`}
        ${lista.map((b) => `<option value="${b.id}" ${b.id === poke.ball ? "selected" : ""}>${escaparHTML(b.es)}</option>`).join("")}
      </select>
    </span>`;
}

function plantillaHabilidad(poke) {
  const propia = (poke.habilidades || []).find((h) => h.id === poke.habilidad);
  return `
    <span class="editor-combo">
      <span class="editor-buscar"><input class="editor-habilidad-campo" type="text" placeholder="Habilidad" autocomplete="off" aria-label="Habilidad" value="${escaparHTML(poke.habilidad ? habilidad(poke.habilidad).es : "")}"></span>
      ${propia && propia.num === 4 ? `<span class="editor-oculta">oculta</span>` : ""}
    </span>`;
}

// Al entrar, todo seleccionado (para escribir encima); al salir sin elegir, vuelve lo que había
function comoDesplegable(campo) {
  const habia = campo.value;
  campo.addEventListener("focus", () => campo.select());
  campo.addEventListener("blur", () => (campo.value = habia));
}

function plantillaAtaque(a, i) {
  if (!a) {
    return `<div class="editor-ataque vacio"><span class="editor-buscar"><input class="editor-ataque-campo" data-hueco="${i}" type="search" placeholder="Ataque ${i + 1}" autocomplete="off"></span></div>`;
  }
  const info = infoAtaques.get(a.id) || {};
  const maximos = info.pp ? ppMaximos(info.pp, a.masPP) : "";
  return `
    <div class="editor-ataque" style="--color:${coloresTipo[info.tipo] || "#3a3d52"}">
      ${info.tipo ? iconoTipo(info.tipo) : ""}
      <span class="editor-ataque-nombre">${escaparHTML(ataque(a.id).es)}</span>
      <span class="editor-ataque-pp">${a.pp}/${maximos}</span>
      <button class="editor-ataque-quitar" data-hueco="${i}" title="Cambiar">${icono("aspa")}</button>
    </div>`;
}

// Amistad (o ciclos del huevo) y de dónde viene: dónde se conoció, el juego de origen y el
// entrenador original. Los creados aquí son «de LockeDex» (hasta que se les ponga otro juego).
function plantillaOrigen(poke) {
  const creado = poke.creado && poke.version === "lockedex";
  const versiones = [
    ...(poke.creado ? [{ id: "lockedex", es: "LockeDex" }] : []),
    ...(VERSIONES.some((v) => v.id === poke.version) || poke.version === "lockedex" ? [] : [{ id: poke.version, es: `Juego ${poke.version}` }]),
    ...VERSIONES
  ];
  return `
    <div class="editor-origen">
      <label class="editor-dato" title="${poke.huevo ? "Ciclos que le faltan para eclosionar" : "Amistad"}">
        ${icono(poke.huevo ? "huevo" : "corazon")}
        ${campoNumero(`<input class="editor-amistad-campo" type="number" min="0" max="255" value="${poke.amistad}" aria-label="${poke.huevo ? "Ciclos" : "Amistad"}">`)}
      </label>
      <label class="editor-dato" title="Entrenador original">
        ${icono("persona")}
        <input class="editor-entrenador-campo" type="text" maxlength="12" autocomplete="off" placeholder="Entrenador" aria-label="Entrenador original" value="${escaparHTML(poke.entrenador || "")}">
      </label>
      <span class="editor-dato" title="${poke.huevo ? "Los huevos aún no tienen dónde se conocieron" : "Dónde se conoció"}">
        ${icono("mapa")}
        <span class="editor-buscar"><input class="editor-lugar-campo" type="text" autocomplete="off" placeholder="Lugar" aria-label="Dónde se conoció"
          value="${escaparHTML(poke.huevo ? "" : nombreLugar(poke.lugar, creado))}" ${poke.huevo ? "disabled" : ""}></span>
      </span>
      <label class="editor-dato" title="Juego de origen">
        ${icono("mando")}
        <select class="editor-version-campo" aria-label="Juego de origen">
          ${versiones.map((v) => `<option value="${v.id}" ${v.id === poke.version ? "selected" : ""}>${escaparHTML(v.es)}</option>`).join("")}
        </select>
      </label>
    </div>`;
}

function campoEspecie(poke) {
  return `<span class="editor-buscar"><input class="editor-especie" type="search" autocomplete="off" placeholder="Especie" aria-label="Especie" title="Especie" value="${escaparHTML(poke.es || "")}"></span>`;
}

function pintar() {
  const poke = abierto.poke;
  const nuevo = !abierto.antes;
  panel.classList.toggle("nuevo", nuevo);

  // Nuevo y sin especie todavía: solo el buscador
  if (!poke.especie) {
    cuerpo.innerHTML = `<div class="editor-solo-especie">${campoEspecie(poke)}</div>`;
    activarCampos();
    cuerpo.querySelector(".editor-especie").focus();
    return;
  }

  const formas = formasDe(poke.especie);
  if (!formas.some((f) => f.forma === poke.forma)) formas.push({ forma: poke.forma, texto: `Forma ${poke.forma}` });

  cuerpo.innerHTML = `
    <div class="editor-cabecera">
      <div class="editor-retrato">
        ${imagenConRespaldo(urlsRetrato(poke), `class="editor-cara" alt=""`)}
        <button class="editor-shiny ${poke.shiny ? "activo" : ""}" title="Shiny">${poke.shiny ? "★" : "☆"}</button>
        ${plantillaGenero(poke)}
      </div>
      <div class="editor-datos">
        <div class="editor-linea">
          ${campoEspecie(poke)}
          ${formas.length > 1
            ? `<select class="editor-forma" aria-label="Forma" title="Forma">${formas
                .map((f) => `<option value="${f.forma}" ${f.forma === poke.forma ? "selected" : ""}>${escaparHTML(f.texto)}</option>`)
                .join("")}</select>`
            : ""}
          ${poke.huevo
            ? ""
            : `<input class="editor-mote" type="text" maxlength="12" autocomplete="off" placeholder="Mote" aria-label="Mote" title="Mote" value="${escaparHTML(poke.mote)}">`}
        </div>
        <div class="editor-linea">
          <label class="editor-nivel" title="Nivel">
            <span>Nv.</span>
            ${campoNumero(`<input class="editor-nivel-campo" type="number" min="1" max="100" value="${poke.entreno.nivel}" aria-label="Nivel">`)}
          </label>
          <select class="editor-naturaleza" aria-label="Naturaleza" title="Naturaleza">${opcionesNaturaleza(poke.entreno.naturaleza, true)}</select>
          ${plantillaBall(poke)}
          <button class="editor-huevo ${poke.huevo ? "activo" : ""}" title="${poke.huevo ? "Es un huevo (pulsa para que no lo sea)" : "Convertir en huevo"}" aria-pressed="${poke.huevo}">${icono("huevo")}</button>
        </div>
      </div>
    </div>

    <div class="editor-par">
      <div class="editor-apartado"><span class="editor-titulo">Objeto</span>${plantillaObjeto(poke)}</div>
      <div class="editor-apartado"><span class="editor-titulo">Habilidad</span>${plantillaHabilidad(poke)}</div>
    </div>
    <div class="editor-apartado">
      <span class="editor-titulo">Ataques</span>
      <div class="editor-ataques">${poke.ataques.map(plantillaAtaque).join("")}</div>
    </div>
    <div class="editor-apartado">
      <span class="editor-titulo">Estadísticas</span>
      <div class="editor-estadisticas"></div>
    </div>
    ${plantillaOrigen(poke)}`;
  // EVs e IVs: la ventana de «Crear equipo», aquí dentro (el nivel y la naturaleza, arriba)
  incrustarEntreno(cuerpo.querySelector(".editor-estadisticas"), poke);

  activarCampos();
}

// Los buscadores de lo que se acaba de pintar
function activarCampos() {
  const poke = abierto.poke;
  const juego = abierto.juego;

  activarAutocompletado(cuerpo.querySelector(".editor-especie"), hastaLimite("pokemon", juego), (entrada) => {
    trabajar(async () => {
      const primera = !poke.especie;
      await ponerEspecie(poke, entrada.id, 0, true);
      if (!abierto.antes) await ponerPorDefecto(poke);
      if (primera) panel.querySelector(".editor-guardar").disabled = false;
      pintar();
    });
  }, { icono: iconoPokemon });
  if (!poke.especie) return;

  // Objeto: al entrar, «Sin objeto» (para quitarlo); escribiendo, todos los del juego
  const campoObjeto = cuerpo.querySelector(".editor-objeto-campo");
  const sinObjeto = { id: 0, es: "Sin objeto", en: "", buscar: "" };
  comoDesplegable(campoObjeto);
  activarAutocompletado(campoObjeto, objetosDe(juego), (entrada) => {
    poke.objeto = entrada.id;
    pintar();
  }, { icono: (e) => (e.id ? iconoDe(e.id, juego) : ""), actual: campoObjeto.value, sinTexto: () => (poke.objeto ? [sinObjeto] : []) });

  // Habilidad: al entrar, las suyas (la oculta, marcada); escribiendo, cualquiera, las suyas
  // primero. Si es una de las suyas, va en su hueco (la oculta, el 4).
  const campoHabilidad = cuerpo.querySelector(".editor-habilidad-campo");
  const propias = poke.habilidades || [];
  const todas = hastaLimite("habilidades", juego);
  const lista = [
    ...propias.map((h) => todas.find((entrada) => entrada.id === h.id)).filter(Boolean),
    ...todas.filter((entrada) => !propias.some((h) => h.id === entrada.id))
  ];
  comoDesplegable(campoHabilidad);
  activarAutocompletado(campoHabilidad, lista, (entrada) => {
    const propia = propias.find((h) => h.id === entrada.id);
    poke.habilidad = entrada.id;
    if (propia) poke.numHabilidad = propia.num;
    pintar();
  }, {
    actual: campoHabilidad.value,
    sinTexto: () => propias.map((h) => ({ ...h, es: h.num === 4 ? `${h.es} (oculta)` : h.es, buscar: "" }))
  });

  // Dónde se conoció: los lugares de gen 6
  const campoLugar = cuerpo.querySelector(".editor-lugar-campo");
  if (!campoLugar.disabled) {
    comoDesplegable(campoLugar);
    activarAutocompletado(campoLugar, lugaresGen6(), (entrada) => {
      poke.lugar = entrada.id;
      pintar();
    }, { actual: campoLugar.value });
  }

  for (const campo of cuerpo.querySelectorAll(".editor-ataque-campo")) {
    const i = Number(campo.dataset.hueco);
    activarAutocompletado(campo, hastaLimite("ataques", juego), (entrada) => {
      trabajar(async () => {
        await cargarInfoAtaque(entrada.id);
        poke.ataques[i] = { id: entrada.id, pp: infoAtaques.get(entrada.id).pp, masPP: 0 };
        poke.ataquesSolos = false;
        pintar();
      });
    });
  }
}

// Una tarea que espera a PokeAPI: si falla, se dice abajo
function trabajar(tarea) {
  error.textContent = "";
  tarea().catch((fallo) => {
    console.error(fallo);
    error.textContent = "No se ha podido cargar. Revisa tu conexión.";
  });
}

// ---------- Ventana o panel de al lado ----------

function ventanaPartida() {
  return lado.closest("dialog");
}

// true si está abierto a la derecha de las cajas
export function editorEnLado() {
  return panel.parentElement === lado && ventanaPartida().classList.contains("con-editor");
}

// El sitio del que se está editando a la derecha (para marcarlo en las cajas), o null
export function sitioEditando() {
  return editando && editorEnLado() ? editando : null;
}

function mostrarPanel() {
  if (ventanaPartida().open && matchMedia(ANCHO_PARA_LADO).matches) {
    lado.appendChild(panel);
    ventanaPartida().classList.add("con-editor");
  } else {
    dialogo.appendChild(panel);
    if (!dialogo.open) dialogo.showModal();
  }
}

export function cerrarEditor() {
  if (panel.parentElement === lado) ventanaPartida().classList.remove("con-editor");
  if (dialogo.open) dialogo.close();
  abierto = null;
  editando = null;
  alCambiarEditando();
}

// Tras aceptar: en su ventana, se cierra; a la derecha, se queda con ese hueco tal y como ha
// quedado (para seguir tocándolo o pulsar otro)
function despuesDeAceptar(sitio) {
  if (editorEnLado()) abrirEditor(abierto.idLocke, sitio, true);
  else cerrarEditor();
}

// Lo cambiado y sin aceptar (al pasar a otro Pokémon a la derecha, se pregunta)
function sinAceptar() {
  return Boolean(abierto && abierto.poke.especie && resumenCambios(abierto.antes, editableDe(abierto.poke)));
}

// ---------- Abrir ----------

// El nivel con el que salen los nuevos: el del más alto del equipo
function nivelInicial(idLocke) {
  const equipo = (partidaDe(idLocke) || {}).equipo || [];
  return Math.max(5, ...equipo.filter((p) => !p.huevo).map((p) => p.nivel || 0));
}

// sitio: { equipo } o { caja, hueco }. Si está vacío, es para crear uno. recargar: el mismo
// que ya estaba abierto, tras aceptar (sin el «Cargando...» de en medio).
export async function abrirEditor(idLocke, sitio, recargar = false) {
  if (!recargar && editorEnLado() && sinAceptar() && !confirm("Lo que has cambiado sin pulsar «Aceptar» se pierde. ¿Seguir?")) return;
  abierto = null;
  editando = sitio;
  error.textContent = "";
  if (!recargar) cuerpo.innerHTML = `<p class="editor-cargando">Cargando...</p>`;
  panel.querySelector(".editor-guardar").disabled = true;
  if (!recargar) panel.classList.remove("nuevo");
  mostrarPanel();
  alCambiarEditando();

  try {
    const [bytes] = await Promise.all([partidaDeTrabajo(idLocke), prepararDatos()]);
    const juego = JUEGOS[bytes.length];
    if (!juego || !LIMITES[juego.id]) throw new Error("Todavía no se puede editar la partida de este juego.");
    const crudo = leerHueco(bytes, sitio);
    const base = { idLocke, sitio, juego: juego.id, nivelInicial: nivelInicial(idLocke), versionEntrenador: entrenadorDe(bytes).version };

    if (!crudo) {
      // Los creados aquí: conocidos «en LockeDex», del entrenador de la partida
      const poke = { especie: 0, mote: "", shiny: false, objeto: 0, huevo: false, ball: 4, ataques: [null, null, null, null] };
      Object.assign(poke, { lugar: LUGAR_LOCKEDEX, version: "lockedex", entrenador: (partidaDe(idLocke) || {}).entrenador || "", creado: true });
      abierto = { ...base, llave: 0, antes: null, poke };
      pintar();
      return;
    }

    const antes = leerEditable(crudo);
    const poke = {
      ...antes,
      evs: undefined,
      ivs: undefined,
      entreno: { nivel: antes.nivel, naturaleza: NATURALEZAS[antes.naturaleza].id, evs: [...antes.evs], ivs: [...antes.ivs] },
      ataques: antes.ataques.map((a) => (a.id ? { ...a } : null))
    };
    abierto = { ...base, llave: llaveDe(crudo), antes, poke };
    poke.creado = creadoEnWeb(idLocke, abierto.llave);
    if (poke.creado && antes.version === base.versionEntrenador) poke.version = "lockedex";
    await Promise.all([ponerEspecie(poke, antes.especie, antes.forma, false), ...antes.ataques.map((a) => cargarInfoAtaque(a.id))]);
    pintar();
    panel.querySelector(".editor-guardar").disabled = false;
  } catch (fallo) {
    console.error(fallo);
    cuerpo.innerHTML = "";
    error.textContent = fallo.message || "No se ha podido abrir.";
  }
}

// ---------- Guardar ----------

// Lo que se escribe (los nombres de js/partida/pokemon3ds.js)
function editableDe(poke) {
  const posibles = generosPosibles(poke);
  return {
    especie: poke.especie,
    forma: poke.forma,
    genero: posibles.includes(poke.genero) ? poke.genero : posibles[0] || "",
    mote: String(poke.mote || "").trim(),
    shiny: poke.shiny,
    huevo: poke.huevo,
    ball: poke.ball,
    objeto: poke.objeto || 0,
    habilidad: poke.habilidad,
    numHabilidad: poke.numHabilidad,
    naturaleza: NATURALEZAS.findIndex((n) => n.id === poke.entreno.naturaleza),
    nivel: poke.entreno.nivel,
    evs: poke.entreno.evs,
    ivs: poke.entreno.ivs,
    amistad: poke.amistad,
    lugar: poke.huevo ? undefined : poke.lugar,
    version: poke.version === "lockedex" ? abierto.versionEntrenador : poke.version,
    entrenador: String(poke.entrenador || "").trim(),
    ataques: poke.ataques.map((a) => (a ? { id: a.id, pp: a.pp, masPP: a.masPP } : { id: 0, pp: 0, masPP: 0 }))
  };
}

function opcionesDe(poke, idioma) {
  return { base: poke.stats, nombreEspecie: nombreEspecie(poke.especie, idioma), nombreHuevo: nombreHuevo(idioma) };
}

// Cómo se llama en la actividad: «Misty» o «Charizard»
function nombreDe(e) {
  return e.huevo ? `huevo de ${nombreEspecie(e.especie)}` : e.mote || nombreEspecie(e.especie);
}

// Lo que ha cambiado, para la actividad del locke: «Charizard: nivel 36 → 50 · objeto Restos»
function resumenCambios(antes, despues) {
  if (!antes) return `nuevo ${nombreDe(despues)}${despues.huevo ? "" : ` (Nv. ${despues.nivel})`}`;
  const partes = [];
  const igual = (uno, otro) => JSON.stringify(uno) === JSON.stringify(otro);
  if (despues.especie !== antes.especie) partes.push(`${nombreEspecie(antes.especie)} → ${nombreEspecie(despues.especie)}`);
  else if (despues.forma !== antes.forma) partes.push("forma");
  if (despues.huevo !== antes.huevo) partes.push(despues.huevo ? "ahora es un huevo" : "ya no es un huevo");
  if (despues.mote !== antes.mote && !despues.huevo) partes.push(despues.mote ? `mote «${despues.mote}»` : "sin mote");
  if (despues.nivel !== antes.nivel && despues.huevo === antes.huevo) partes.push(`nivel ${antes.nivel} → ${despues.nivel}`);
  if (despues.naturaleza !== antes.naturaleza) partes.push(`naturaleza ${NATURALEZAS[despues.naturaleza].es}`);
  if (despues.objeto !== antes.objeto) partes.push(despues.objeto ? `objeto ${objeto(despues.objeto, abierto.juego).es}` : "sin objeto");
  if (despues.habilidad !== antes.habilidad || despues.numHabilidad !== antes.numHabilidad) partes.push(`habilidad ${habilidad(despues.habilidad).es}`);
  if (despues.shiny !== antes.shiny) partes.push(despues.shiny ? "shiny" : "ya no es shiny");
  if (despues.genero !== antes.genero && despues.genero) partes.push(NOMBRE_GENERO[despues.genero].toLowerCase());
  if (despues.amistad !== antes.amistad && despues.huevo === antes.huevo) {
    partes.push(`${despues.huevo ? "ciclos" : "amistad"} ${antes.amistad} → ${despues.amistad}`);
  }
  if (despues.ball !== antes.ball) partes.push((balls().find((b) => b.id === despues.ball) || { es: "ball" }).es);
  if (despues.lugar !== undefined && despues.lugar !== antes.lugar) partes.push(`conocido en ${nombreLugar(despues.lugar)}`);
  if (despues.version !== antes.version) partes.push(`origen ${(VERSIONES.find((v) => v.id === despues.version) || { es: "otro juego" }).es}`);
  if (despues.entrenador && despues.entrenador !== antes.entrenador) partes.push(`entrenador «${despues.entrenador}»`);
  const nuevos = despues.ataques.filter((a) => a.id && !antes.ataques.some((b) => b.id === a.id));
  if (nuevos.length) partes.push(`ataques ${nuevos.map((a) => ataque(a.id).es).join(", ")}`);
  else if (!igual(despues.ataques.map((a) => a.id), antes.ataques.map((a) => a.id))) partes.push("ataques");
  if (!igual(despues.ivs, antes.ivs)) partes.push("IVs");
  if (!igual(despues.evs, antes.evs)) partes.push("EVs");
  if (!partes.length) return "";
  return despues.especie !== antes.especie ? partes.join(" · ") : `${nombreDe(antes)}: ${partes.join(" · ")}`;
}

async function guardar() {
  const { idLocke, sitio, llave, antes, poke } = abierto;
  const despues = editableDe(poke);
  const resumen = resumenCambios(antes, despues);
  if (!resumen) {
    cerrarEditor();
    return;
  }

  await cambiarHuecos(idLocke, (h) => {
    comprobarSitio(h, sitio, llave);
    const idioma = antes ? antes.idioma : entrenadorDe(h.bytes).idioma;
    const opciones = opcionesDe(poke, idioma);
    if (antes) {
      poner(h, sitio, aplicarEditable(mirar(h, sitio), despues, opciones));
      // Creado aquí, pero con otro juego de origen: ya no sale como «LockeDex»
      return poke.creado && poke.version !== "lockedex" ? { noCreados: [llave] } : [];
    }
    const crudo = crearPokemon(entrenadorDe(h.bytes), despues, opciones);
    poner(h, sitio, crudo);
    return poke.version === "lockedex" ? { metidos: [llaveDe(crudo)], creados: [llaveDe(crudo)] } : [llaveDe(crudo)];
  }, resumen);
  despuesDeAceptar(sitio);
}

// ---------- Borrar y clonar ----------

async function borrar() {
  const { idLocke, sitio, llave, antes } = abierto;
  if (!confirm(`¿Borrar a ${nombreDe(antes)} de la partida?`)) return;
  await cambiarHuecos(idLocke, (h) => {
    comprobarSitio(h, sitio, llave);
    poner(h, sitio, null);
  }, `borrado ${nombreDe(antes)}`);
  cerrarEditor();
}

// La copia va a la primera caja con sitio (desde la suya), con lo que se haya cambiado
async function clonar() {
  const { idLocke, sitio, llave, antes, poke } = abierto;
  const despues = editableDe(poke);
  const cambiado = Boolean(resumenCambios(antes, despues));
  await cambiarHuecos(idLocke, (h) => {
    comprobarSitio(h, sitio, llave);
    const destino = huecoLibre(h, sitio.caja || 0);
    if (!destino) throw new Error("Las cajas están llenas.");
    const crudo = mirar(h, sitio);
    const copia = conLlaveNueva(cambiado ? aplicarEditable(crudo, despues, opcionesDe(poke, antes.idioma)) : crudo);
    poner(h, destino, copia);
    return [llaveDe(copia)];
  }, `clon de ${nombreDe(despues)}`);
  despuesDeAceptar(sitio);
}

// Los botones de abajo: mientras trabajan, quietos; si fallan, se dice
function accion(boton, tarea) {
  boton.disabled = true;
  error.textContent = "";
  Promise.resolve()
    .then(tarea)
    .catch((fallo) => {
      console.error(fallo);
      error.textContent = fallo && fallo.name === "AbortError" ? "" : fallo.message || "No se ha podido guardar.";
    })
    .finally(() => (boton.disabled = false));
}

// ---------- Arranque ----------

// alCambiarEditandoPokemon(): el que se edita en el panel de al lado ha cambiado (para marcarlo).
export function iniciarEditor(alCambiarEditandoPokemon = () => {}) {
  dialogo = document.querySelector("#dialogo-editor");
  panel = dialogo.querySelector(".editor-panel");
  lado = document.querySelector("#dialogo-partida .partida-lado");
  cuerpo = panel.querySelector(".editor-cuerpo");
  error = panel.querySelector(".editor-error");
  alCambiarEditando = alCambiarEditandoPokemon;
  const botones = { borrar: ["papelera", "Borrar"], clonar: ["copiar", "Clonar"] };
  for (const [nombre, [dibujo, texto]] of Object.entries(botones)) {
    panel.querySelector(`.editor-${nombre}`).innerHTML = `${icono(dibujo)} <span>${texto}</span>`;
  }

  panel.querySelector(".editor-cancelar").addEventListener("click", cerrarEditor);
  panel.querySelector(".editor-guardar").addEventListener("click", (e) => abierto && abierto.poke.especie && accion(e.currentTarget, guardar));
  panel.querySelector(".editor-borrar").addEventListener("click", (e) => abierto && abierto.antes && accion(e.currentTarget, borrar));
  panel.querySelector(".editor-clonar").addEventListener("click", (e) => abierto && abierto.antes && accion(e.currentTarget, clonar));

  cuerpo.addEventListener("click", (e) => {
    if (!abierto) return;
    const poke = abierto.poke;
    const boton = e.target.closest("button");
    if (!boton) return;

    if (boton.classList.contains("editor-shiny")) poke.shiny = !poke.shiny;
    else if (boton.classList.contains("editor-genero")) {
      const posibles = generosPosibles(poke);
      poke.genero = posibles[(posibles.indexOf(poke.genero) + 1) % posibles.length];
    } else if (boton.classList.contains("editor-huevo")) {
      // Al volverse huevo: nivel 1 y, en lugar de la amistad, los ciclos que le faltan
      poke.huevo = !poke.huevo;
      if (poke.huevo) {
        poke.amistadAntes = poke.amistad;
        poke.amistad = poke.ciclos;
        poke.entreno.nivel = 1;
      } else poke.amistad = poke.amistadAntes ?? poke.felicidad;
    } else if (boton.classList.contains("editor-ataque-quitar")) {
      poke.ataques[Number(boton.dataset.hueco)] = null;
      poke.ataquesSolos = false;
    } else return;
    pintar();
    if (boton.classList.contains("editor-ataque-quitar")) cuerpo.querySelector(`.editor-ataque-campo[data-hueco="${boton.dataset.hueco}"]`).focus();
  });

  cuerpo.addEventListener("input", (e) => {
    if (!abierto) return;
    if (e.target.matches(".editor-mote")) abierto.poke.mote = e.target.value;
    else if (e.target.matches(".editor-entrenador-campo")) abierto.poke.entrenador = e.target.value;
    else if (e.target.matches(".editor-amistad-campo") && e.target.value !== "") {
      abierto.poke.amistad = Math.max(0, Math.min(255, Math.floor(Number(e.target.value) || 0)));
    }
  });

  cuerpo.addEventListener("change", (e) => {
    if (!abierto) return;
    const poke = abierto.poke;
    if (e.target.matches(".editor-forma")) {
      trabajar(async () => {
        await ponerEspecie(poke, poke.especie, Number(e.target.value), true);
        if (!abierto.antes) await ponerPorDefecto(poke);
        pintar();
      });
    } else if (e.target.matches(".editor-ball-campo")) {
      poke.ball = Number(e.target.value);
      pintar();
    } else if (e.target.matches(".editor-nivel-campo")) {
      poke.entreno = { ...poke.entreno, nivel: Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || poke.entreno.nivel))) };
      // Uno nuevo con los ataques sin tocar: los de su nivel
      if (!abierto.antes && poke.ataquesSolos) trabajar(async () => {
        await ponerPorDefecto(poke);
        pintar();
      });
      else pintar();
    } else if (e.target.matches(".editor-version-campo")) {
      poke.version = e.target.value === "lockedex" ? "lockedex" : Number(e.target.value);
      pintar();
    } else if (e.target.matches(".editor-naturaleza")) {
      poke.entreno = { ...poke.entreno, naturaleza: e.target.value };
      pintar();
    } else if (e.target.matches(".editor-amistad-campo")) e.target.value = poke.amistad;
  });
}
