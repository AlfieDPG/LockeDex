// Ajustes de la web (el botón de la rueda, abajo del panel): el tema y el idioma.
//
// Se guardan como lo demás (almacen.js), así que con sesión iniciada se copian a la cuenta.
//   · Tema: se pone en <html data-tema="claro">. Lo pone ya el <script> del <head> de
//     index.html antes de pintar nada (para que no parpadee), y aquí se cambia al elegirlo.
//     Sin nada elegido, el del sistema.
//   · Idioma: lo lee js/comun/idioma.js al cargar; cambiarlo recarga la página.

import { leer, escribir } from "./almacen.js";
import { cuandoEsteSincronizado } from "./nube.js";
import { CLAVE_AJUSTES } from "./claves-ajustes.js";
import { idioma } from "./idioma.js";

const sistemaClaro = matchMedia("(prefers-color-scheme: light)");

function ajustes() {
  return leer(CLAVE_AJUSTES, {}) || {};
}

function guardar(cambios) {
  escribir(CLAVE_AJUSTES, { ...ajustes(), ...cambios });
}

// ---------- Tema ----------

export function temaActual() {
  const { tema } = ajustes();
  if (tema === "claro" || tema === "oscuro") return tema;
  return sistemaClaro.matches ? "claro" : "oscuro";
}

function aplicarTema() {
  const tema = temaActual();
  if (tema === "claro") document.documentElement.dataset.tema = "claro";
  else delete document.documentElement.dataset.tema;
  marcar("tema", tema);
}

export function cambiarTema(tema) {
  guardar({ tema });
  aplicarTema();
}

// ---------- Idioma ----------

export function cambiarIdioma(nuevo) {
  if (nuevo === idioma) return;
  guardar({ idioma: nuevo });
  location.reload();
}

// Si en la cuenta hay otro idioma (elegido en otro sitio), se recarga para ponerlo
function revisarIdioma() {
  const { idioma: guardado } = ajustes();
  if (guardado && guardado !== idioma) location.reload();
}

// ---------- Ventana ----------

// La opción elegida de cada fila, iluminada
function marcar(ajuste, valor) {
  for (const boton of document.querySelectorAll(`#dialogo-ajustes [data-${ajuste}]`)) {
    const elegido = boton.dataset[ajuste] === valor;
    boton.classList.toggle("elegido", elegido);
    boton.setAttribute("aria-checked", elegido);
  }
}

export function iniciarAjustes() {
  const dialogo = document.querySelector("#dialogo-ajustes");
  document.querySelector(".boton-ajustes").addEventListener("click", () => dialogo.showModal());
  dialogo.querySelector(".ajustes-cerrar").addEventListener("click", () => dialogo.close());
  for (const boton of dialogo.querySelectorAll("[data-tema]")) {
    boton.addEventListener("click", () => cambiarTema(boton.dataset.tema));
  }
  for (const boton of dialogo.querySelectorAll("[data-idioma]")) {
    boton.addEventListener("click", () => cambiarIdioma(boton.dataset.idioma));
  }

  aplicarTema();
  marcar("idioma", idioma);
  // Si sigue al del sistema y este cambia; si llega otro de la cuenta; o si se cambia en otra pestaña
  sistemaClaro.addEventListener("change", aplicarTema);
  cuandoEsteSincronizado().then(() => {
    aplicarTema();
    revisarIdioma();
  });
  addEventListener("storage", (e) => {
    if (e.key !== CLAVE_AJUSTES) return;
    aplicarTema();
    revisarIdioma();
  });
}
