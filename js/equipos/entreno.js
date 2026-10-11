// Nivel, naturaleza, EVs e IVs de un Pokémon del equipo («Crear equipo»).
//
// Las tarjetas siguen siendo para ver el equipo de un vistazo: esto va aparte, en una
// ventana que se abre con el botón de cada tarjeta. La usa también la calculadora
// (js/calculadora), con sus propios Pokémon.
//
// Es opcional: un Pokémon sin tocar no lleva nada (y al exportarlo sale como siempre). Al
// tocar algo se le apunta:
//
//   poke.entreno: { nivel, naturaleza: "adamant", evs: [6], ivs: [6] }
//   (las seis en el orden de siempre: PS, Ataque, Defensa, At. Esp., Def. Esp., Velocidad)

import { escaparHTML } from "../comun/tooltip.js";
import { icono } from "../comun/iconos.js";
import { imagenConRespaldo, urlsPMD } from "../comun/imagenes.js";
import { obtenerStats } from "../comun/pokemon.js";
import { campoNumero } from "../comun/numero.js";

export const MAX_EV = 252;
export const MAX_EVS = 510;
export const MAX_IV = 31;

export const STATS = ["PS", "Ataque", "Defensa", "At. Esp.", "Def. Esp.", "Velocidad"];
const STATS_SHOWDOWN = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

// [nombre en inglés (el de Showdown), en español, stat que sube, stat que baja] (índices de
// STATS; sin subir ni bajar, las neutras)
export const NATURALEZAS = [
  ["hardy", "Fuerte"], ["lonely", "Huraña", 1, 2], ["brave", "Audaz", 1, 5], ["adamant", "Firme", 1, 3],
  ["naughty", "Pícara", 1, 4], ["bold", "Osada", 2, 1], ["docile", "Dócil"], ["relaxed", "Plácida", 2, 5],
  ["impish", "Agitada", 2, 3], ["lax", "Floja", 2, 4], ["timid", "Miedosa", 5, 1], ["hasty", "Activa", 5, 2],
  ["serious", "Seria"], ["jolly", "Alegre", 5, 3], ["naive", "Ingenua", 5, 4], ["modest", "Modesta", 3, 1],
  ["mild", "Afable", 3, 2], ["quiet", "Mansa", 3, 5], ["bashful", "Tímida"], ["rash", "Alocada", 3, 4],
  ["calm", "Serena", 4, 1], ["gentle", "Amable", 4, 2], ["sassy", "Grosera", 4, 5], ["careful", "Cauta", 4, 3],
  ["quirky", "Rara"]
].map(([id, es, sube, baja]) => ({ id, es, sube, baja }));

const NEUTRA = "serious";

export function naturaleza(id) {
  return NATURALEZAS.find((cada) => cada.id === id) || NATURALEZAS.find((cada) => cada.id === NEUTRA);
}

// Lo de un Pokémon que no se ha tocado: nivel 100, neutra, sin EVs y con los IVs al máximo
export function entrenoPorDefecto() {
  return { nivel: 100, naturaleza: NEUTRA, evs: [0, 0, 0, 0, 0, 0], ivs: [31, 31, 31, 31, 31, 31] };
}

export function entrenoDe(poke) {
  const guardado = poke.entreno || {};
  const base = entrenoPorDefecto();
  return {
    nivel: guardado.nivel || base.nivel,
    naturaleza: naturaleza(guardado.naturaleza).id,
    evs: base.evs.map((v, i) => (guardado.evs && Number.isFinite(guardado.evs[i]) ? guardado.evs[i] : v)),
    ivs: base.ivs.map((v, i) => (guardado.ivs && Number.isFinite(guardado.ivs[i]) ? guardado.ivs[i] : v))
  };
}

// Las estadísticas de verdad, con la fórmula de los juegos (de la 3ª generación en adelante).
// Shedinja (292) siempre tiene 1 PS.
export function statsFinales(poke, base = poke.stats) {
  if (!base) return null;
  const { nivel, naturaleza: id, evs, ivs } = entrenoDe(poke);
  const nat = naturaleza(id);
  return base.map((b, i) => {
    const dentro = Math.floor(((2 * b + ivs[i] + Math.floor(evs[i] / 4)) * nivel) / 100);
    if (i === 0) return poke.id === 292 ? 1 : dentro + nivel + 10;
    const factor = nat.sube === i ? 1.1 : nat.baja === i ? 0.9 : 1;
    return Math.floor((dentro + 5) * factor);
  });
}

// Lo que sale en el botón de la tarjeta: «Nv. 50 · Firme», o nada si no se ha tocado
export function textoEntreno(poke) {
  if (!poke.entreno) return "";
  const { nivel, naturaleza: id } = entrenoDe(poke);
  return `Nv. ${nivel} · ${naturaleza(id).es}`;
}

// ---------- Showdown ----------

// Las líneas del paste (Level, EVs, Nature, IVs). Sin entreno, null: exportar.js pone las de siempre.
export function lineasShowdown(poke) {
  if (!poke.entreno) return null;
  const { nivel, naturaleza: id, evs, ivs } = entrenoDe(poke);
  const lista = (valores, salvo) =>
    valores.map((v, i) => (v !== salvo ? `${v} ${STATS_SHOWDOWN[i]}` : "")).filter(Boolean).join(" / ");
  const nombre = naturaleza(id).id;
  return {
    nivel: `Level: ${nivel}`,
    evs: lista(evs, 0) ? `EVs: ${lista(evs, 0)}` : "",
    naturaleza: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} Nature`,
    ivs: lista(ivs, MAX_IV) ? `IVs: ${lista(ivs, MAX_IV)}` : ""
  };
}

// Las líneas de un bloque del paste que tocan esto; null si no hay ninguna
export function entrenoDesdeShowdown(lineas) {
  const entreno = entrenoPorDefecto();
  let hay = false;
  const leerLista = (texto, destino) => {
    for (const trozo of texto.split("/")) {
      const [, valor, stat] = trozo.trim().match(/^(\d+)\s+(\w+)$/) || [];
      const i = STATS_SHOWDOWN.findIndex((s) => s.toLowerCase() === String(stat).toLowerCase());
      if (i >= 0) destino[i] = Number(valor);
    }
  };
  for (const linea of lineas) {
    let m;
    if ((m = linea.match(/^Level:\s*(\d+)/i))) {
      entreno.nivel = Math.max(1, Math.min(100, Number(m[1])));
      hay = true;
    } else if ((m = linea.match(/^EVs:\s*(.+)$/i))) {
      leerLista(m[1], entreno.evs);
      hay = true;
    } else if ((m = linea.match(/^IVs:\s*(.+)$/i))) {
      leerLista(m[1], entreno.ivs);
      hay = true;
    } else if ((m = linea.match(/^(\w+)\s+Nature$/i))) {
      const nat = NATURALEZAS.find((cada) => cada.id === m[1].toLowerCase());
      if (nat) entreno.naturaleza = nat.id;
      hay = true;
    }
  }
  entreno.evs = entreno.evs.map((v) => Math.max(0, Math.min(MAX_EV, v)));
  entreno.ivs = entreno.ivs.map((v) => Math.max(0, Math.min(MAX_IV, v)));
  return hay ? entreno : null;
}

// ---------- La ventana ----------

let dialogo = null;
let cuerpo = null;
let abierto = null;              // el Pokémon cuya ventana está abierta
let original = "null";           // su entreno al abrir la ventana (JSON), para «Deshacer»
let alCambiar = () => {};        // (poke) lo que hay que hacer al cambiar algo (guardar...)
let alCambiarPorDefecto = () => {};

// Barra de una estadística final: se llena hasta 400 (las de nivel 100 rondan ahí)
function anchoBarra(valor) {
  return Math.min(100, (valor / 400) * 100);
}

function colorBarra(valor) {
  const proporcion = Math.min(1, Math.max(0, (valor - 80) / 260));
  return `hsl(${Math.round(proporcion * 120)}, 70%, 45%)`;
}

// Las seis iguales: ese valor; si no, nada (para la fila «Todas»)
function iguales(valores) {
  return valores.every((v) => v === valores[0]) ? String(valores[0]) : "";
}

function pintar() {
  const poke = abierto;
  const entreno = entrenoDe(poke);
  const nat = naturaleza(entreno.naturaleza);
  const usados = entreno.evs.reduce((suma, v) => suma + v, 0);
  const finales = statsFinales(poke) || [];

  const opciones = NATURALEZAS.map((cada) => {
    const efecto = cada.sube ? ` (+${STATS[cada.sube]}, −${STATS[cada.baja]})` : "";
    return `<option value="${cada.id}" ${cada.id === nat.id ? "selected" : ""}>${cada.es}${efecto}</option>`;
  }).join("");

  const filas = STATS.map((nombre, i) => {
    const marca = nat.sube === i ? "sube" : nat.baja === i ? "baja" : "";
    return `
      <div class="entreno-fila ${marca}" data-stat="${i}">
        <span class="entreno-stat">${nombre}${marca === "sube" ? " ▲" : marca === "baja" ? " ▼" : ""}</span>
        <span class="entreno-base">${poke.stats ? poke.stats[i] : "…"}</span>
        <input class="entreno-ev-barra" type="range" min="0" max="${MAX_EV}" step="4" value="${entreno.evs[i]}" aria-label="EVs de ${nombre}">
        ${campoNumero(`<input class="entreno-ev" type="number" min="0" max="${MAX_EV}" value="${entreno.evs[i]}" aria-label="EVs de ${nombre}">`)}
        ${campoNumero(`<input class="entreno-iv" type="number" min="0" max="${MAX_IV}" value="${entreno.ivs[i]}" aria-label="IVs de ${nombre}">`)}
        <span class="entreno-barra"><i></i></span>
        <strong class="entreno-total">${finales[i] ?? "…"}</strong>
      </div>`;
  }).join("");

  cuerpo.innerHTML = `
    <div class="entreno-cabecera">
      ${imagenConRespaldo(urlsPMD(poke), `class="entreno-cara" alt=""`)}
      <strong class="entreno-nombre">${escaparHTML(poke.mote || poke.es)}</strong>
      <label class="entreno-campo">Nivel ${campoNumero(`<input class="entreno-nivel" type="number" min="1" max="100" value="${entreno.nivel}">`)}</label>
      <label class="entreno-campo">Naturaleza <select class="entreno-naturaleza">${opciones}</select></label>
      <span class="entreno-restantes">EVs: <strong>${usados}</strong> / ${MAX_EVS}</span>
      <div class="entreno-botones">
        <button class="entreno-deshacer" title="Deshacer: dejarlo como estaba al abrir la ventana" aria-label="Deshacer">${icono("deshacer")}</button>
        <button class="entreno-cerrar" title="Cerrar" aria-label="Cerrar">${icono("aspa")}</button>
      </div>
    </div>
    <div class="entreno-filas">
      <div class="entreno-fila entreno-titulos">
        <span></span><span>Base</span><span class="entreno-titulo-evs">EVs</span><span>IVs</span><span></span><span>Total</span>
      </div>
      ${filas}
      <div class="entreno-fila entreno-todas">
        <span class="entreno-stat">Todas</span><span></span><span></span>
        ${campoNumero(`<input class="entreno-todos-ev" type="number" min="0" max="${Math.floor(MAX_EVS / 6)}" placeholder="—" aria-label="EVs de todas" title="Las seis a este valor">`)}
        ${campoNumero(`<input class="entreno-todos-iv" type="number" min="0" max="${MAX_IV}" placeholder="—" aria-label="IVs de todas" title="Las seis a este valor">`)}
        <span></span><span></span>
      </div>
    </div>`;
  pintarBarras();
}

// Solo los números y las barras (al arrastrar no se vuelve a pintar todo: se perdería el foco)
function pintarBarras() {
  const entreno = entrenoDe(abierto);
  const finales = statsFinales(abierto) || [];
  cuerpo.querySelectorAll(".entreno-fila[data-stat]").forEach((fila) => {
    const i = Number(fila.dataset.stat);
    const total = finales[i];
    fila.querySelector(".entreno-total").textContent = total ?? "…";
    const barra = fila.querySelector(".entreno-barra i");
    barra.style.width = `${total ? anchoBarra(total) : 0}%`;
    barra.style.background = total ? colorBarra(total) : "transparent";
  });
  const usados = entreno.evs.reduce((suma, v) => suma + v, 0);
  const restantes = cuerpo.querySelector(".entreno-restantes");
  restantes.querySelector("strong").textContent = usados;
  restantes.classList.toggle("lleno", usados >= MAX_EVS);

  // «Todas»: con el valor si las seis son iguales (la que se está escribiendo no se toca)
  for (const [clase, valores] of [[".entreno-todos-ev", entreno.evs], [".entreno-todos-iv", entreno.ivs]]) {
    const campo = cuerpo.querySelector(clase);
    if (campo !== document.activeElement) campo.value = iguales(valores);
  }
  cuerpo.querySelector(".entreno-deshacer").disabled = JSON.stringify(abierto.entreno ?? null) === original;
}

// Las casillas de las seis filas, con lo que hay ahora (tras cambiar «Todas»)
function ponerValoresEnFilas() {
  const entreno = entrenoDe(abierto);
  cuerpo.querySelectorAll(".entreno-fila[data-stat]").forEach((fila) => {
    const i = Number(fila.dataset.stat);
    fila.querySelector(".entreno-ev-barra").value = entreno.evs[i];
    fila.querySelector(".entreno-ev").value = entreno.evs[i];
    fila.querySelector(".entreno-iv").value = entreno.ivs[i];
  });
}

function cambiar(cambio) {
  const entreno = entrenoDe(abierto);
  cambio(entreno);
  abierto.entreno = entreno;
  alCambiar(abierto);
}

// poke: { id, es, mote?, stats (las base), entreno?, idForma?, formaPMD? }. alCambiarEste: lo
// que se hace al cambiar algo; sin él, el de iniciarEntreno (el de «Crear equipo»).
export function abrirEntreno(poke, alCambiarEste = null) {
  abierto = poke;
  original = JSON.stringify(poke.entreno ?? null);
  alCambiar = alCambiarEste || alCambiarPorDefecto;
  pintar();
  if (!dialogo.open) dialogo.showModal();

  // Las stats base de un Pokémon añadido antes de que se guardaran
  if (!poke.stats) {
    obtenerStats(poke)
      .then((stats) => {
        poke.stats = stats;
        alCambiar(poke);
        if (abierto === poke && dialogo.open) pintar();
      })
      .catch((error) => console.error(error));
  }
}

// alCambiarPorDefecto(poke): lo que hace «Crear equipo» al cambiar algo (guardar y poner al
// día el botón de la tarjeta)
// (La calculadora también la inicia, sin eso: lo inicia el primero que llegue)
export function iniciarEntreno(alCambiarDelEquipo = null) {
  if (alCambiarDelEquipo) alCambiarPorDefecto = alCambiarDelEquipo;
  if (dialogo) return;
  dialogo = document.getElementById("dialogo-entreno");
  cuerpo = dialogo.querySelector(".entreno-cuerpo");
  dialogo.addEventListener("close", () => (abierto = null));

  cuerpo.addEventListener("input", (e) => {
    if (!abierto) return;
    const fila = e.target.closest(".entreno-fila[data-stat]");
    const i = fila ? Number(fila.dataset.stat) : -1;

    if (e.target.matches(".entreno-ev-barra, .entreno-ev")) {
      cambiar((entreno) => {
        const otros = entreno.evs.reduce((suma, v, j) => (j === i ? suma : suma + v), 0);
        const pedido = Math.max(0, Math.floor(Number(e.target.value) || 0));
        entreno.evs[i] = Math.min(pedido, MAX_EV, MAX_EVS - otros);
      });
      const valor = abierto.entreno.evs[i];
      // La otra casilla de la misma fila, al día (y esta, si se ha pasado del máximo)
      fila.querySelector(".entreno-ev-barra").value = valor;
      if (e.target.matches(".entreno-ev-barra") || Number(e.target.value) !== valor) fila.querySelector(".entreno-ev").value = valor;
    } else if (e.target.matches(".entreno-iv")) {
      if (e.target.value === "") return; // escribiendo: se espera al número
      cambiar((entreno) => {
        entreno.ivs[i] = Math.max(0, Math.min(MAX_IV, Math.floor(Number(e.target.value) || 0)));
      });
    } else if (e.target.matches(".entreno-nivel")) {
      if (e.target.value === "") return;
      cambiar((entreno) => {
        entreno.nivel = Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1)));
      });
    } else if (e.target.matches(".entreno-todos-ev, .entreno-todos-iv")) {
      // «Todas»: las seis al mismo valor (los EVs, sin pasarse de los 510 entre todas)
      if (e.target.value === "") return;
      const valor = Math.max(0, Math.floor(Number(e.target.value) || 0));
      cambiar((entreno) => {
        if (e.target.matches(".entreno-todos-ev")) entreno.evs = entreno.evs.map(() => Math.min(valor, MAX_EV, Math.floor(MAX_EVS / 6)));
        else entreno.ivs = entreno.ivs.map(() => Math.min(valor, MAX_IV));
      });
      ponerValoresEnFilas();
    } else return;
    pintarBarras();
  });

  // Al salir de una casilla, lo que se haya quedado fuera de rango vuelve a su valor
  cuerpo.addEventListener("change", (e) => {
    if (!abierto) return;
    if (e.target.matches(".entreno-naturaleza")) {
      cambiar((entreno) => (entreno.naturaleza = e.target.value));
      pintar();
    } else if (e.target.matches(".entreno-iv, .entreno-nivel, .entreno-ev, .entreno-todos-ev, .entreno-todos-iv")) {
      pintar();
    }
  });

  cuerpo.addEventListener("click", (e) => {
    if (!abierto) return;
    if (e.target.closest(".entreno-cerrar")) dialogo.close();
    else if (e.target.closest(".entreno-deshacer")) {
      const antes = JSON.parse(original);
      if (antes) abierto.entreno = antes;
      else delete abierto.entreno;
      alCambiar(abierto);
      pintar();
    }
  });

  // Pulsando fuera de la ventana, se cierra
  dialogo.addEventListener("click", (e) => {
    if (e.target !== dialogo) return;
    const r = dialogo.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialogo.close();
  });
}
