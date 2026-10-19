// Ventana para poner imagen a un combate de unos level caps personalizados: uno de los
// personajes que ya salen en la web (buscándolo por nombre) o una imagen subida.
//
// listo(imagen, nombre) devuelve false si no se ha podido guardar (no cabe): entonces la
// ventana se queda abierta con el aviso.

import { escaparHTML, quitarAcentos } from "../comun/utilidades.js";
import { icono } from "../comun/iconos.js";
import { imagenReducida } from "../comun/personalizados.js";
import { personajesDeLaWeb } from "./retratos.js";
import { t } from "../comun/idioma.js";

const dialogo = document.querySelector("#dialogo-imagen-combate");
const personajes = dialogo.querySelector(".imagen-personajes");
const buscador = dialogo.querySelector(".imagen-buscar");
const archivo = dialogo.querySelector(".imagen-archivo");
const error = dialogo.querySelector(".imagen-error");
const quitar = dialogo.querySelector(".imagen-quitar");

let alElegir = null;

function pintar() {
  const texto = quitarAcentos(buscador.value.trim());
  const encontrados = personajesDeLaWeb().filter((personaje) => !texto || personaje.buscar.includes(texto));
  personajes.innerHTML = encontrados.length
    ? encontrados
        .map(
          (personaje) => `
            <button type="button" class="imagen-personaje" data-imagen="${escaparHTML(personaje.imagen)}"
                    data-nombre="${escaparHTML(personaje.nombre)}" title="${escaparHTML(personaje.nombre)}">
              <img src="${escaparHTML(personaje.imagen)}" alt="" loading="lazy">
              <span>${escaparHTML(personaje.nombre)}</span>
            </button>`
        )
        .join("")
    : `<p class="imagen-ninguno">${t("Ninguno.")}</p>`;
}

export function abrirElegirImagen(conImagen, listo) {
  alElegir = listo;
  buscador.value = "";
  error.textContent = "";
  quitar.hidden = !conImagen;
  pintar();
  personajes.scrollTop = 0;
  dialogo.showModal();
  buscador.focus();
}

function elegir(imagen, nombre = "") {
  if (alElegir && alElegir(imagen, nombre) === false) {
    error.textContent = t("No cabe: hay demasiadas imágenes subidas en estos level caps.");
    return;
  }
  dialogo.close();
}

// ---------- Arranque (al cargar el módulo) ----------

dialogo.querySelector(".imagen-subir").insertAdjacentHTML("afterbegin", icono("subir"));
buscador.addEventListener("input", pintar);

personajes.addEventListener("click", (e) => {
  const boton = e.target.closest(".imagen-personaje");
  if (boton) elegir(boton.dataset.imagen, boton.dataset.nombre);
});

dialogo.querySelector(".imagen-subir").addEventListener("click", () => archivo.click());
archivo.addEventListener("change", async () => {
  const elegido = archivo.files[0];
  archivo.value = ""; // para poder volver a elegir el mismo
  if (!elegido) return;
  error.textContent = "";
  try {
    elegir(await imagenReducida(elegido));
  } catch (fallo) {
    console.error(fallo);
    error.textContent = t("No se ha podido leer esa imagen.");
  }
});

quitar.addEventListener("click", () => elegir(""));
dialogo.querySelector(".imagen-cancelar").addEventListener("click", () => dialogo.close());
