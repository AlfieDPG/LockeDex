// Sección «Level caps»: combates importantes de cada juego con el nivel máximo permitido.
// Los combates de cada juego están en ./datos.js y sus retratos en ./retratos.js.
//
// En «Personalizado» cada uno se hace los suyos (js/comun/personalizados.js). Con «Editar»
// la misma lista pasa a tener casillas: título, nombre, lugar, nivel e imagen (un personaje
// de la web o una subida), y botones para moverlos, quitarlos y añadir más.

import { COMBATES } from "./datos.js";
import { retratoDeLaWeb } from "./retratos.js";
import { abrirElegirImagen } from "./elegir-imagen.js";
import { crearSelectorJuego, CLAVE_MULTIPLICADOR_CAPS } from "../comun/selector-juego.js";
import { leer, escribir } from "../comun/almacen.js";
import { imagenConRespaldo } from "../comun/imagenes.js";
import { escaparHTML } from "../comun/utilidades.js";
import { icono } from "../comun/iconos.js";
import { campoNumero } from "../comun/numero.js";
import { capsPropios, tipoDeCombate, MAX_COMBATES } from "../comun/personalizados.js";
import { apuntarEnLockesDelJuego } from "../comun/lockes.js";
import { confirmar, avisar } from "../comun/ventanas.js";

function retrato(c) {
  const url = juego.propio ? c.imagen : retratoDeLaWeb(juego.id, c.nombre);
  if (!url) return "";
  return imagenConRespaldo([url], `class="cap-retrato" alt="" loading="lazy" data-quitar-si-falla`);
}

// NO cambiar estas claves: si se cambian, se pierden los combates marcados como superados
const CLAVE_SUPERADOS = "poketeams-levelcaps-v2"; // { idJuego: [claveCombate, ...] }
const CLAVE_JUEGO = "poketeams-levelcaps-juego-v1";
const CLAVE_MULTIPLICADOR = CLAVE_MULTIPLICADOR_CAPS; // { idJuego: 1.5, ... }

// Multiplicador de nivel (randomizers que suben el nivel de los entrenadores)
const MULTIPLICADOR_MIN = 0.5;
const MULTIPLICADOR_MAX = 3;
const MULTIPLICADOR_PASO = 0.1;

const vista = document.getElementById("vista-levelcaps");
const selector = vista.querySelector(".selector-juego");
const barra = vista.querySelector(".barra-nuzlocke");
const resumen = vista.querySelector(".caps-actual");
const lista = vista.querySelector(".caps-lista");
const valorMultiplicador = vista.querySelector(".multiplicador-valor");
const editar = vista.querySelector(".juego-editar");

let juego = null;
let combates = [];
let superados = new Set();
let multiplicador = 1;
const guardados = leer(CLAVE_SUPERADOS, {});
const multiplicadores = leer(CLAVE_MULTIPLICADOR, {});

let editando = false;       // la lista propia abierta, con casillas para cambiarla
let abrirEditando = false;  // la próxima lista que se abra, ya en modo editar (al crearla)
let callado = false;        // guardando desde el editor: no se vuelve a pintar (se perdería el foco)

// Identifica el combate aunque se añadan otros a la lista más adelante.
// Incluye el lugar porque hay rivales que se repiten (Azul en la Ruta 22, en Ciudad Celeste...).
// Los personalizados llevan su propio id: así se pueden cambiar sin perder la marca.
function claveCombate(c) {
  return c.id || `${c.etiqueta}|${c.nombre}|${c.lugar || ""}`;
}

// Nivel con el multiplicador aplicado (redondeado y como mucho 100)
function nivel(c) {
  return Math.min(100, Math.round(c.nivel * multiplicador));
}

function textoNivel(c) {
  return c.aprox ? `≈${nivel(c)}` : String(nivel(c));
}

function tituloNivel(c) {
  const partes = [];
  if (multiplicador !== 1) partes.push(`Nivel original: ${c.nivel}`);
  if (c.aprox) partes.push("Nivel aproximado, sin verificar del todo");
  return partes.length ? `title="${partes.join(". ")}"` : "";
}

function pintarMultiplicador() {
  // Con un decimal, salvo los de un randomizer (×1,05)
  const decimales = Math.abs(multiplicador * 10 - Math.round(multiplicador * 10)) < 1e-9 ? 1 : 2;
  valorMultiplicador.textContent = `×${multiplicador.toFixed(decimales)}`;
}

function cambiarMultiplicador(paso) {
  // Se redondea a un decimal para que no se acumulen errores (1.1 + 0.1 = 1.2000000000000002)
  const nuevo = Math.round((multiplicador + paso) * 10) / 10;
  multiplicador = Math.min(MULTIPLICADOR_MAX, Math.max(MULTIPLICADOR_MIN, nuevo));
  multiplicadores[juego.id] = multiplicador;
  escribir(CLAVE_MULTIPLICADOR, multiplicadores);
  pintarMultiplicador();
  pintarLista();
}

function pintarResumen() {
  // Los combates de secciones aparte (p. ej. líderes de otras regiones) no cuentan
  const siguiente = combates.find((c) => !c.seccion && !superados.has(claveCombate(c)));

  if (!combates.length) {
    resumen.innerHTML = "";
    return;
  }
  if (!siguiente) {
    resumen.innerHTML = "¡Has superado todos los combates de este juego!";
    return;
  }
  resumen.innerHTML = `
    <span>Tu level cap ahora:</span>
    <strong class="caps-nivel-grande">${textoNivel(siguiente)}</strong>
    <span>antes de ${escaparHTML([siguiente.etiqueta.toLowerCase(), siguiente.nombre].filter(Boolean).join(" · "))}</span>
  `;
}

// Todo escapado: los personalizados los escribe la gente
function filaCombate(c) {
  const clave = claveCombate(c);
  const hecho = superados.has(clave);
  return `
    <li class="cap ${escaparHTML(c.tipo)} ${hecho ? "superado" : ""}">
      <label>
        <input type="checkbox" data-clave="${escaparHTML(clave)}" ${hecho ? "checked" : ""}>
        ${retrato(c)}
        <span class="cap-etiqueta">${escaparHTML(c.etiqueta)}</span>
        <span class="cap-nombre">${escaparHTML(c.nombre)}</span>
        ${c.lugar ? `<span class="cap-lugar">${escaparHTML(c.lugar)}</span>` : ""}
      </label>
      <span class="cap-nivel" ${tituloNivel(c)}>Nv. ${textoNivel(c)}</span>
    </li>`;
}

// Tramos que llevan su propio título dentro de la lista, al llegar el primer combate de ese tipo
const TRAMOS = { "alto-mando": "Alto Mando", campeon: "Campeón" };

function pintarLista() {
  if (juego.propio && editando) {
    pintarEditor();
    pintarResumen();
    return;
  }

  if (!combates.length) {
    lista.innerHTML = `<li class="caps-vacio">Sin combates.</li>`;
    pintarResumen();
    return;
  }

  // Primero los combates normales y después, con su título, los de cada sección aparte
  let html = "";
  let tipoAnterior = null;

  for (const c of combates.filter((c) => !c.seccion)) {
    if (TRAMOS[c.tipo] && c.tipo !== tipoAnterior) {
      html += `<li class="caps-tramo ${c.tipo}"><h3>${TRAMOS[c.tipo]}</h3></li>`;
    }
    tipoAnterior = c.tipo;
    html += filaCombate(c);
  }

  const secciones = [...new Set(combates.filter((c) => c.seccion).map((c) => c.seccion))];
  for (const seccion of secciones) {
    html += `<li class="caps-seccion"><h3>${escaparHTML(seccion)}</h3></li>`;
    html += combates.filter((c) => c.seccion === seccion).map(filaCombate).join("");
  }

  lista.innerHTML = html;
  pintarResumen();
}

// ---------- Editor de los personalizados ----------
//
// Cada cambio se guarda al momento. Al escribir no se vuelve a pintar (callado), para no
// perder el foco; al mover, quitar o añadir, sí.

function filaEditor(c, indice, total) {
  const valor = (texto) => escaparHTML(texto || "");
  const imagen = c.imagen ? `<img src="${valor(c.imagen)}" alt="">` : icono("imagen");
  return `
    <li class="cap cap-editable ${valor(c.tipo)}" data-indice="${indice}">
      <button class="cap-ed-imagen ${c.imagen ? "con-imagen" : ""}" title="Imagen">${imagen}</button>
      <div class="cap-ed-campos">
        <input class="cap-ed-etiqueta" data-campo="etiqueta" maxlength="40" placeholder="Gimnasio 1" value="${valor(c.etiqueta)}">
        <input class="cap-ed-nombre" data-campo="nombre" maxlength="40" placeholder="Nombre" value="${valor(c.nombre)}">
        <input class="cap-ed-lugar" data-campo="lugar" maxlength="40" placeholder="Ciudad" value="${valor(c.lugar)}">
      </div>
      <label class="cap-ed-nivel">
        <span>Nv.</span>
        ${campoNumero(`<input data-campo="nivel" type="number" min="1" max="100" value="${c.nivel}">`)}
      </label>
      <div class="cap-ed-acciones">
        <button class="cap-ed-subir" title="Subir" ${indice === 0 ? "disabled" : ""}>${icono("arriba")}</button>
        <button class="cap-ed-bajar" title="Bajar" ${indice === total - 1 ? "disabled" : ""}>${icono("abajo")}</button>
        <button class="cap-ed-quitar" title="Quitar">${icono("aspa")}</button>
      </div>
    </li>`;
}

function pintarEditor() {
  const todos = juego.combates || [];
  lista.innerHTML = `
    <li class="caps-editor-cabecera">
      <input class="caps-ed-nombre" maxlength="40" placeholder="Nombre" value="${escaparHTML(juego.nombre)}">
      <button class="caps-ed-borrar">${icono("papelera")} Borrar</button>
    </li>
    ${todos.map((c, indice) => filaEditor(c, indice, todos.length)).join("")}
    ${todos.length < MAX_COMBATES ? `<li><button class="caps-ed-anadir">${icono("mas")} Añadir combate</button></li>` : ""}`;
}

// Devuelve false si no se ha podido (no cabe)
function guardarLista() {
  callado = true;
  const ok = capsPropios.guardar({ id: juego.id, nombre: juego.nombre, combates: juego.combates });
  callado = false;
  return ok;
}

function cambiarCombates(cambio) {
  const todos = [...juego.combates];
  cambio(todos);
  juego.combates = todos;
  guardarLista();
  pintarLista();
}

function anadirCombate() {
  const ultimo = juego.combates[juego.combates.length - 1];
  cambiarCombates((todos) => todos.push({ etiqueta: "", nombre: "", lugar: "", nivel: ultimo ? ultimo.nivel : 10, imagen: "" }));
  const filas = lista.querySelectorAll(".cap-editable");
  if (filas.length) filas[filas.length - 1].querySelector(".cap-ed-etiqueta").focus();
}

function elegirImagen(indice) {
  abrirElegirImagen(Boolean(juego.combates[indice].imagen), (imagen, nombre) => {
    const combate = juego.combates[indice];
    const antes = { ...combate };
    combate.imagen = imagen;
    if (nombre && !combate.nombre) combate.nombre = nombre;
    if (!guardarLista()) {
      Object.assign(combate, antes);
      return false;
    }
    pintarLista();
    return true;
  });
}

function activarEditor() {
  lista.addEventListener("input", (e) => {
    if (!juego || !juego.propio || !editando) return;

    if (e.target.classList.contains("caps-ed-nombre")) {
      if (!e.target.value.trim()) return; // sin nombre no se guarda (al salir vuelve el de antes)
      juego.nombre = e.target.value;
      guardarLista();
      return;
    }

    const campo = e.target.dataset.campo;
    const fila = e.target.closest(".cap-editable");
    if (!campo || !fila) return;
    const combate = juego.combates[Number(fila.dataset.indice)];
    combate[campo] = campo === "nivel" ? Number(e.target.value) || 1 : e.target.value;
    if (campo === "etiqueta") {
      fila.classList.remove(combate.tipo);
      combate.tipo = tipoDeCombate(combate.etiqueta);
      fila.classList.add(combate.tipo);
    }
    guardarLista();
    combates = visibles();
    pintarResumen();
  });

  // Al salir de la casilla: el nivel dentro de 1-100 y el nombre de la lista, nunca vacío
  lista.addEventListener("change", (e) => {
    if (!juego || !juego.propio || !editando) return;
    if (e.target.dataset.campo === "nivel") {
      e.target.value = Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1)));
    }
    if (e.target.classList.contains("caps-ed-nombre") && !e.target.value.trim()) {
      e.target.value = juego.nombre;
    }
  });

  lista.addEventListener("click", async (e) => {
    if (!juego || !juego.propio || !editando) return;
    const boton = e.target.closest("button");
    if (!boton) return;

    if (boton.classList.contains("caps-ed-anadir")) {
      anadirCombate();
      return;
    }
    if (boton.classList.contains("caps-ed-borrar")) {
      if (!(await confirmar(`¿Borrar «${juego.nombre}»?`))) return;
      delete guardados[juego.id];
      delete multiplicadores[juego.id];
      escribir(CLAVE_SUPERADOS, guardados);
      escribir(CLAVE_MULTIPLICADOR, multiplicadores);
      capsPropios.borrar(juego.id);
      return;
    }

    const fila = boton.closest(".cap-editable");
    if (!fila) return;
    const indice = Number(fila.dataset.indice);

    if (boton.classList.contains("cap-ed-imagen")) elegirImagen(indice);
    else if (boton.classList.contains("cap-ed-quitar")) cambiarCombates((todos) => todos.splice(indice, 1));
    else if (boton.classList.contains("cap-ed-subir") || boton.classList.contains("cap-ed-bajar")) {
      const otro = indice + (boton.classList.contains("cap-ed-subir") ? -1 : 1);
      cambiarCombates((todos) => ([todos[indice], todos[otro]] = [todos[otro], todos[indice]]));
      lista.querySelector(`.cap-editable[data-indice="${otro}"] .${boton.classList[0]}`)?.focus();
    }
  });
}

// ---------- Arranque ----------

export function iniciar() {
  // Un solo oyente para todas las casillas
  lista.addEventListener("change", (e) => {
    const casilla = e.target.closest("input[data-clave]");
    if (!casilla) return;
    if (casilla.checked) superados.add(casilla.dataset.clave);
    else superados.delete(casilla.dataset.clave);
    casilla.closest(".cap").classList.toggle("superado", casilla.checked);

    guardados[juego.id] = [...superados];
    escribir(CLAVE_SUPERADOS, guardados);
    pintarResumen();

    // A la actividad de tus lockes de este juego («ha vencido a Brock»)
    const combate = combates.find((c) => claveCombate(c) === casilla.dataset.clave);
    const quien = combate ? combate.nombre || combate.etiqueta : "";
    if (quien) {
      apuntarEnLockesDelJuego("capsPropios", juego.id, "cap", quien, casilla.checked).catch((error) => console.error(error));
    }
  });

  activarEditor();

  vista.querySelector(".caps-reiniciar").addEventListener("click", async () => {
    if (superados.size === 0) return;
    if (!(await confirmar(`¿Desmarcar todos los combates de ${juego.nombre}?`))) return;
    superados.clear();
    guardados[juego.id] = [];
    escribir(CLAVE_SUPERADOS, guardados);
    pintarLista();
  });

  vista.querySelector(".multiplicador-menos").addEventListener("click", () => cambiarMultiplicador(-MULTIPLICADOR_PASO));
  vista.querySelector(".multiplicador-mas").addEventListener("click", () => cambiarMultiplicador(MULTIPLICADOR_PASO));

  editar.addEventListener("click", () => {
    editando = !editando;
    pintarBotonEditar();
    pintarLista();
  });

  selectorJuego = crearSelectorJuego(selector, CLAVE_JUEGO, elegirJuego, {
    almacen: capsPropios,
    alNuevo() {
      const nueva = capsPropios.crear("Nuevo juego");
      if (!nueva) {
        avisar("Has llegado al máximo de listas personalizadas.");
        return;
      }
      abrirEditando = true;
      selectorJuego.elegirPorId(nueva.id);
      const nombre = lista.querySelector(".caps-ed-nombre");
      if (nombre) nombre.select();
    }
  });
}

let selectorJuego = null;

// Los personalizados sin título ni nombre (recién añadidos) no salen fuera del editor
function visibles() {
  if (!juego) return [];
  if (!juego.propio) return COMBATES[juego.id] || [];
  return (juego.combates || []).filter((c) => c.etiqueta || c.nombre);
}

function pintarBotonEditar() {
  editar.hidden = !juego || !juego.propio;
  editar.textContent = editando ? "Listo" : "Editar";
  editar.classList.toggle("activo", editando);
}

function elegirJuego(nuevo) {
  const mismo = Boolean(juego && nuevo && juego.id === nuevo.id);
  juego = nuevo;
  if (callado) {
    combates = visibles();
    return;
  }

  if (!mismo) editando = abrirEditando;
  abrirEditando = false;

  barra.hidden = !juego;
  pintarBotonEditar();
  if (!juego) {
    lista.innerHTML = "";
    resumen.innerHTML = "";
    return;
  }

  combates = visibles();
  superados = new Set(guardados[juego.id] || []);
  multiplicador = multiplicadores[juego.id] || 1;
  pintarMultiplicador();
  pintarLista();
}

export function mostrar() {
  // Si se ha llegado desde un locke de «Lockes», el juego viene apuntado en CLAVE_JUEGO.
  // Si es el mismo que ya había, no hace nada.
  selectorJuego.elegirPorId(leer(CLAVE_JUEGO, null));
  // Un locke con randomizer puede haber cambiado el multiplicador desde fuera
  for (const clave of Object.keys(multiplicadores)) delete multiplicadores[clave];
  Object.assign(multiplicadores, leer(CLAVE_MULTIPLICADOR, {}));
  const impuesto = juego && (multiplicadores[juego.id] || 1);
  if (juego && impuesto !== multiplicador) {
    multiplicador = impuesto;
    pintarMultiplicador();
    pintarLista();
  }
}
