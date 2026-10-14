// ---------- Ventanas de aviso y pregunta con el estilo de la web ----------
//
// En lugar de confirm(), alert() y prompt() del navegador (que salen con su propio aspecto),
// un <dialog> como los demás de la web. Devuelven una promesa:
//
//   if (!(await confirmar("¿Borrar «X»?"))) return;   -> true / false
//   await avisar("No se ha podido guardar.");          -> cuando se cierra
//   const texto = await preguntar("¿Cuántos?", "5");   -> lo escrito, o null si se cancela
//
// El texto puede llevar saltos de línea: una línea en blanco separa párrafos. Si la pregunta
// empieza por un verbo («¿Borrar…», «¿Quitar…») el botón lo lleva, y si es de los que no
// tienen vuelta atrás, va en rojo.

import { escaparHTML } from "./utilidades.js";

const PELIGROSOS = ["borrar", "quitar", "expulsar", "desvincular", "descartar", "vaciar", "desmarcar", "cerrar"];

function parrafos(texto) {
  return String(texto)
    .split(/\n\s*\n/)
    .map((parrafo) => `<p>${escaparHTML(parrafo).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// El verbo con el que empieza la pregunta («¿Borrar el equipo?» -> «Borrar»)
function verboDe(texto) {
  const encontrado = /^¿\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/.exec(String(texto));
  if (!encontrado) return null;
  const verbo = encontrado[1];
  return /r$/i.test(verbo) ? verbo[0].toUpperCase() + verbo.slice(1).toLowerCase() : null;
}

function abrir({ texto, botones, campo }) {
  return new Promise((resolver) => {
    const dialogo = document.createElement("dialog");
    dialogo.className = "ventana-web";
    dialogo.innerHTML = `
      <div class="ventana-texto">${parrafos(texto)}</div>
      ${campo ? `<input class="ventana-campo" type="text" value="${escaparHTML(campo.valor || "")}" autocomplete="off">` : ""}
      <div class="dialogo-botones">
        ${botones.map((boton, i) => `<button type="button" class="${boton.clase}" data-i="${i}">${escaparHTML(boton.texto)}</button>`).join("")}
      </div>`;
    document.body.appendChild(dialogo);

    let respuesta = botones.find((boton) => boton.cancelar)?.valor ?? null;
    const entrada = dialogo.querySelector(".ventana-campo");

    const cerrar = (valor) => {
      respuesta = valor;
      dialogo.close();
    };

    dialogo.addEventListener("click", (e) => {
      const boton = e.target.closest("button[data-i]");
      if (!boton) return;
      const elegido = botones[Number(boton.dataset.i)];
      cerrar(elegido.campo && entrada ? entrada.value : elegido.valor);
    });
    if (entrada) {
      entrada.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          cerrar(entrada.value);
        }
      });
    }
    // Escape: lo mismo que Cancelar (el <dialog> ya se cierra solo)
    dialogo.addEventListener("close", () => {
      dialogo.remove();
      resolver(respuesta);
    });

    dialogo.showModal();
    if (entrada) {
      entrada.focus();
      entrada.select();
    } else {
      // En las peligrosas, el foco en Cancelar: que un Enter sin mirar no borre nada
      const peligro = dialogo.querySelector(".ventana-peligro");
      (peligro ? dialogo.querySelector(".ventana-cancelar") : dialogo.querySelector(".dialogo-botones button:last-child")).focus();
    }
  });
}

export function confirmar(texto, opciones = {}) {
  const verbo = opciones.aceptar || verboDe(texto) || "Aceptar";
  const peligro = opciones.peligro ?? PELIGROSOS.includes(verbo.toLowerCase());
  return abrir({
    texto,
    botones: [
      { texto: opciones.cancelar || "Cancelar", clase: "ventana-cancelar", valor: false, cancelar: true },
      { texto: verbo, clase: peligro ? "ventana-peligro" : "ventana-aceptar", valor: true }
    ]
  }).then(Boolean);
}

export function avisar(texto) {
  return abrir({
    texto,
    botones: [{ texto: "Vale", clase: "ventana-aceptar", valor: undefined, cancelar: true }]
  }).then(() => undefined);
}

export function preguntar(texto, valor = "") {
  return abrir({
    texto,
    campo: { valor },
    botones: [
      { texto: "Cancelar", clase: "ventana-cancelar", valor: null, cancelar: true },
      { texto: "Aceptar", clase: "ventana-aceptar", campo: true }
    ]
  });
}
