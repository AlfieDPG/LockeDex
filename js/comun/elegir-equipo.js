// ---------- Elegir uno de tus equipos ----------
//
// Un desplegable propio pegado a un botón: tus equipos guardados, por grupos (como en «Mis
// equipos»), cada uno con sus Pokémon en pequeño. Lo usan los combates de «Versus» y los
// lockes del palmarés de «Amigos».
//
//   const equipo = await elegirEquipo(boton, { conQuitar: true });
//   // { nombre, pokemon } (una copia, lo justo para pintarlo), null si se ha quitado o
//   // undefined si se ha cerrado sin elegir

import { escaparHTML } from "./utilidades.js";
import { icono } from "./iconos.js";
import { imagenConRespaldo, urlsPMD, urlsHome } from "./imagenes.js";
import { pokemonParaCopia } from "./pokemon.js";
import { leerGuardados, leerGrupos } from "../equipos/estado.js";

// Retrato de un Pokémon de un equipo (su forma, su género) y, si no lo hay, su render
export function caraDePokemon(p, clase = "") {
  return imagenConRespaldo(
    [...urlsPMD(p), ...urlsHome(p), p.sprite].filter(Boolean),
    `class="${clase}" alt="${escaparHTML(p.es || "")}" title="${escaparHTML(p.mote ? `${p.mote} (${p.es})` : p.es || "")}" loading="lazy" draggable="false"`
  );
}

// Los Pokémon de un equipo en fila; con mvp (posición), ese marcado
export function carasDeEquipo(equipo, { mvp = -1, clase = "caras-equipo" } = {}) {
  if (!equipo || !(equipo.pokemon || []).length) return "";
  return `
    <span class="${clase}" title="${escaparHTML(equipo.nombre || "")}">
      ${equipo.pokemon.map((p, i) => `<span class="cara-equipo ${i === mvp ? "mvp" : ""}">${caraDePokemon(p)}</span>`).join("")}
    </span>`;
}

// Copia de un equipo guardado para llevarla a otra parte (Firestore no acepta «undefined»)
export function copiaDeEquipo(equipo) {
  return JSON.parse(JSON.stringify({ nombre: equipo.nombre || "Equipo", pokemon: (equipo.pokemon || []).map(pokemonParaCopia) }));
}

let abierto = null; // { menu, terminar }

function cerrar(valor) {
  if (!abierto) return;
  const { menu, terminar } = abierto;
  abierto = null;
  menu.remove();
  terminar(valor);
}

function filaEquipo(equipo) {
  return `
    <button type="button" class="elegir-equipo-opcion" data-id="${escaparHTML(equipo.id)}">
      <strong>${escaparHTML(equipo.nombre || "Equipo")}</strong>
      ${carasDeEquipo(equipo)}
    </button>`;
}

export function elegirEquipo(ancla, { conQuitar = false } = {}) {
  cerrar(undefined);
  const guardados = leerGuardados().filter((equipo) => (equipo.pokemon || []).length);
  const grupos = leerGrupos();
  const ids = new Set(grupos.map((g) => g.id));

  const bloques = grupos
    .map((grupo) => {
      const suyos = guardados.filter((equipo) => equipo.grupo === grupo.id);
      if (!suyos.length) return "";
      return `
        <details class="elegir-equipo-grupo">
          <summary>${icono("carpeta")} ${escaparHTML(grupo.nombre)} <small>${suyos.length}</small></summary>
          ${suyos.map(filaEquipo).join("")}
        </details>`;
    })
    .join("");
  const sueltos = guardados.filter((equipo) => !ids.has(equipo.grupo)).map(filaEquipo).join("");

  const menu = document.createElement("div");
  menu.className = "elegir-equipo";
  menu.innerHTML = `
    ${guardados.length ? bloques + sueltos : `<p class="elegir-equipo-vacio">No tienes equipos guardados.</p>`}
    ${conQuitar ? `<button type="button" class="elegir-equipo-quitar">${icono("aspa")} Sin equipo</button>` : ""}`;
  // Dentro de la ventana si la hay: con una ventana abierta, lo de fuera no se puede pulsar
  (ancla.closest("dialog") || document.body).appendChild(menu);

  // Debajo del botón si cabe; si no, encima
  const r = ancla.getBoundingClientRect();
  const ancho = Math.min(menu.offsetWidth, window.innerWidth - 16);
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8))}px`;
  const alto = menu.offsetHeight;
  const abajo = r.bottom + 6 + alto <= window.innerHeight - 8 || r.top < alto + 14;
  menu.style.top = `${abajo ? r.bottom + 6 : r.top - alto - 6}px`;

  menu.addEventListener("click", (e) => {
    const opcion = e.target.closest(".elegir-equipo-opcion");
    if (opcion) {
      const equipo = guardados.find((cada) => cada.id === opcion.dataset.id);
      cerrar(equipo ? copiaDeEquipo(equipo) : undefined);
    } else if (e.target.closest(".elegir-equipo-quitar")) cerrar(null);
  });

  return new Promise((terminar) => {
    abierto = { menu, terminar, ancla };
  });
}

// Se cierra pulsando fuera, con Escape o al moverse la página (no al cambiar de tamaño: en el
// móvil pasa solo, al esconderse la barra del navegador)
document.addEventListener("pointerdown", (e) => {
  if (abierto && !abierto.menu.contains(e.target) && !abierto.ancla.contains(e.target)) cerrar(undefined);
}, true);
document.addEventListener("keydown", (e) => {
  if (abierto && e.key === "Escape") {
    e.stopPropagation(); // que no cierre también la ventana de debajo
    e.preventDefault();
    cerrar(undefined);
  }
}, true);
window.addEventListener("scroll", (e) => {
  if (abierto && !abierto.menu.contains(e.target)) cerrar(undefined);
}, true);
