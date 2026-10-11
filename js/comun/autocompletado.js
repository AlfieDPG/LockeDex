import { quitarAcentos } from "./utilidades.js";
import { imagenConRespaldo, urlsPMD, urlSpritePixel, urlsIconoObjeto } from "./imagenes.js";

// ---------- Desplegable de sugerencias ----------
//
// Al escribir salen las que encajan (las que empiezan por lo escrito, primero). Con las
// flechas de arriba y abajo se mueve la marcada, Enter elige la marcada (o la primera) y
// Escape cierra la lista.
//
//   opciones.icono(entrada) -> HTML de un icono delante del nombre (ver iconoPokemon e
//                              iconoObjeto, abajo); sin él, solo el nombre

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
    if (!texto) return;

    actuales = lista
      .filter((e) => e.buscar.includes(texto))
      .sort((a, b) => Number(b.buscar.startsWith(texto)) - Number(a.buscar.startsWith(texto)))
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
    marcar(0);
  }

  campo.addEventListener("input", mostrar);
  campo.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!actuales.length) {
        mostrar();
        return;
      }
      e.preventDefault(); // que no mueva el cursor dentro de la casilla
      marcar(marcada + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" && actuales.length) {
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
  return imagenConRespaldo([...urlsPMD(p), urlSpritePixel(p.idForma || p.id)], `alt="" loading="lazy" data-quitar-si-falla`);
}

export function iconoObjeto(entrada) {
  return imagenConRespaldo(urlsIconoObjeto(entrada.en), `alt="" loading="lazy" class="objeto" data-quitar-si-falla`);
}
