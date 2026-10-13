import { quitarAcentos } from "./utilidades.js";
import { imagenConRespaldo, urlsRetrato, urlsIconoObjeto } from "./imagenes.js";

// ---------- Desplegable de sugerencias ----------
//
// Al escribir salen las que encajan (las que empiezan por lo escrito, primero). Con las
// flechas de arriba y abajo se mueve la marcada, Enter elige la marcada (o la primera) y
// Escape cierra la lista.
//
//   opciones.icono(entrada) -> HTML de un icono delante del nombre (ver iconoPokemon e
//                              iconoObjeto, abajo); sin él, solo el nombre
//   opciones.libre          -> se puede escribir algo que no esté en la lista: ninguna sale
//                              marcada y Enter solo elige si se ha bajado con las flechas
//   opciones.sinTexto()     -> como un desplegable: lo que sale al entrar en la casilla, si no
//                              hay nada escrito o lo escrito es opciones.actual (lo elegido)

const MAXIMO = 8;

export function activarAutocompletado(campo, lista, alElegir, opciones = {}) {
  const caja = document.createElement("div");
  caja.className = "sugerencias";
  caja.setAttribute("role", "listbox");
  campo.parentElement.appendChild(caja);
  campo.setAttribute("aria-autocomplete", "list");
  let actuales = [];
  let marcada = 0;

  function limpiar() {
    caja.innerHTML = "";
    actuales = [];
    marcada = 0;
  }

  function elegir(entrada) {
    limpiar();
    alElegir(entrada);
  }

  function marcar(indice) {
    if (!actuales.length) return;
    marcada = (indice + actuales.length) % actuales.length;
    caja.querySelectorAll(".opcion").forEach((opcion, i) => {
      opcion.classList.toggle("marcada", i === marcada);
      opcion.setAttribute("aria-selected", String(i === marcada));
      if (i === marcada) opcion.scrollIntoView({ block: "nearest" });
    });
  }

  function mostrar() {
    limpiar();
    const texto = quitarAcentos(campo.value.trim());
    const sinEscribir = !texto || (opciones.actual && texto === quitarAcentos(opciones.actual));
    if (sinEscribir && !opciones.sinTexto) return;

    // Primero lo que es justo lo escrito, luego lo que empieza por ello
    const puntos = (e) => (quitarAcentos(e.es) === texto ? 2 : e.buscar.startsWith(texto) ? 1 : 0);
    actuales = sinEscribir
      ? opciones.sinTexto().slice(0, MAXIMO)
      : lista
          .filter((e) => e.buscar.includes(texto))
          .sort((a, b) => puntos(b) - puntos(a))
          .slice(0, MAXIMO);

    actuales.forEach((entrada, i) => {
      const opcion = document.createElement("div");
      opcion.className = "opcion";
      opcion.setAttribute("role", "option");
      const icono = opciones.icono ? opciones.icono(entrada) : "";
      const nombre = document.createElement("span");
      nombre.className = "opcion-nombre";
      nombre.textContent = entrada.es;
      opcion.innerHTML = icono ? `<span class="opcion-icono">${icono}</span>` : "";
      opcion.appendChild(nombre);
      if (entrada.en && entrada.en !== entrada.es) {
        const ingles = document.createElement("small");
        ingles.textContent = entrada.en;
        opcion.appendChild(ingles);
      }
      opcion.addEventListener("mousedown", (e) => {
        e.preventDefault();
        elegir(entrada);
      });
      opcion.addEventListener("mousemove", () => {
        if (marcada !== i) marcar(i);
      });
      caja.appendChild(opcion);
    });
    if (opciones.libre) marcada = -1;
    else marcar(0);
  }

  campo.addEventListener("input", mostrar);
  if (opciones.sinTexto) campo.addEventListener("focus", mostrar);
  campo.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!actuales.length) {
        mostrar();
        return;
      }
      e.preventDefault(); // que no mueva el cursor dentro de la casilla
      // (en las libres, sin ninguna marcada: ↓ va a la primera y ↑ a la última)
      if (marcada < 0) marcar(e.key === "ArrowDown" ? 0 : -1);
      else marcar(marcada + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" && actuales.length && (marcada >= 0 || !opciones.libre)) {
      e.preventDefault();
      elegir(actuales[marcada] || actuales[0]);
    } else if (e.key === "Escape" && actuales.length) {
      e.preventDefault(); // dentro de una ventana: que cierre la lista, no la ventana
      e.stopPropagation();
      limpiar();
    }
  });
  campo.addEventListener("blur", limpiar);

  return {
    elegirPrimera: () => {
      mostrar();
      if (actuales.length) elegir(actuales[0]);
    }
  };
}

// ---------- Iconos para las sugerencias ----------

// Retrato de Mundo Misterioso; si no lo hay, su sprite. Vale para los nombres de especie
// ({ id }) y para las filas de la Pokédex ({ fila }, con su forma).
export function iconoPokemon(entrada) {
  const fila = entrada.fila;
  const p = fila
    ? { id: fila.numero, idForma: fila.clave !== fila.numero ? fila.clave : undefined, formaPMD: fila.forma || 0 }
    : { id: entrada.id };
  return imagenConRespaldo(urlsRetrato(p), `alt="" loading="lazy" data-quitar-si-falla`);
}

export function iconoObjeto(entrada) {
  return imagenConRespaldo(urlsIconoObjeto(entrada.en), `alt="" loading="lazy" class="objeto" data-quitar-si-falla`);
}
