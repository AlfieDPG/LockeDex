// ---------- Cambiar cosas de sitio arrastrándolas ----------
//
// Mientras se arrastra, lo arrastrado se queda en su sitio (en tenue) y una línea amarilla
// marca dónde va a caer: entre dos tarjetas, en el hueco que las separa (vertical si van en
// fila, horizontal si van en columna). Al soltar, se mueve ahí. Así se ve antes de soltar dónde
// queda, en vez de ver las tarjetas saltando de un lado a otro.
//
//   activarArrastre(raiz, {
//     elementos: ".tarjeta",             // lo que se arrastra (y entre lo que se suelta)
//     zona: (destino, arrastrado) => el, // la caja donde se soltaría (por defecto, la raíz);
//                                        // null si ahí no se puede
//     alternativa: (zona) => el,          // si la zona está escondida, lo que se enmarca
//     puedeEmpezar: (e) => bool,         // para no arrastrar desde un campo o un botón...
//     alTerminar: (arrastrado, movido) => {} // ya está en su sitio nuevo (si movido)
//   })
//
// Las zonas pueden estar vacías (un grupo sin equipos): entonces la línea sale arriba del todo.

let marca = null;

function laMarca() {
  if (!marca) {
    marca = document.createElement("div");
    marca.className = "marca-soltar";
    marca.hidden = true;
    document.body.appendChild(marca);
  }
  return marca;
}

function esconderMarca() {
  if (marca) marca.hidden = true;
}

function ponerMarca(izquierda, arriba, ancho, alto, enmarcar = false) {
  const m = laMarca();
  m.hidden = false;
  m.classList.toggle("marco", enmarcar);
  m.style.left = `${Math.round(izquierda)}px`;
  m.style.top = `${Math.round(arriba)}px`;
  m.style.width = `${Math.round(ancho)}px`;
  m.style.height = `${Math.round(alto)}px`;
}

// ¿Van en fila (uno al lado del otro) o en columna? Si dos comparten altura, en fila; con uno
// solo, lo que diga la rejilla de la zona.
function enFila(zona, elementos) {
  for (let i = 1; i < elementos.length; i++) {
    if (Math.abs(elementos[i].getBoundingClientRect().top - elementos[i - 1].getBoundingClientRect().top) < 4) return true;
  }
  if (elementos.length > 1) return false;
  const estilo = getComputedStyle(zona);
  if (estilo.display.includes("grid")) return estilo.gridTemplateColumns.split(" ").length > 1;
  return estilo.display.includes("flex") && !estilo.flexDirection.startsWith("column");
}

function separacion(zona, enFilaSi) {
  const estilo = getComputedStyle(zona);
  return parseFloat(enFilaSi ? estilo.columnGap : estilo.rowGap) || 0;
}

export function activarArrastre(raiz, {
  elementos, zona = () => raiz, alternativa = null, puedeEmpezar = () => true, alTerminar = () => {}
}) {
  let arrastrado = null;
  let destino = null; // { zona, antesDe } (antesDe null: al final)
  let soltado = false; // soltado dentro (fuera, o con Escape, no se mueve nada)

  const deLaZona = (caja) => [...caja.children].filter((el) => el.matches(elementos));

  raiz.addEventListener("dragstart", (e) => {
    const elemento = e.target.closest && e.target.closest(elementos);
    if (!elemento || !raiz.contains(elemento)) return;
    if (!puedeEmpezar(e, elemento)) {
      e.preventDefault();
      return;
    }
    arrastrado = elemento;
    destino = null;
    soltado = false;
    // Un instante después, para que la imagen que lleva el ratón no salga ya en tenue
    requestAnimationFrame(() => arrastrado && arrastrado.classList.add("arrastrando"));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ""); // Firefox no arranca el arrastre sin esto
  });

  raiz.addEventListener("dragover", (e) => {
    if (!arrastrado) return;
    const caja = zona(e.target, arrastrado);
    if (!caja) {
      destino = null;
      esconderMarca();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const lista = deLaZona(caja);
    const otros = lista.filter((el) => el !== arrastrado);

    // Zona escondida (un grupo plegado): se enmarca lo que diga «alternativa» (su cabecera) y
    // cae al final
    if (!caja.getClientRects().length) {
      const marco = alternativa && alternativa(caja);
      if (!marco || lista.includes(arrastrado)) {
        destino = null;
        esconderMarca();
        return;
      }
      destino = { zona: caja, antesDe: null };
      const r = marco.getBoundingClientRect();
      ponerMarca(r.left - 3, r.top - 3, r.width + 6, r.height + 6, true);
      return;
    }

    // Zona vacía: arriba del todo
    if (!otros.length) {
      destino = { zona: caja, antesDe: null };
      if (lista.includes(arrastrado)) {
        destino = null;
        esconderMarca();
        return;
      }
      const r = caja.getBoundingClientRect();
      ponerMarca(r.left + 8, r.top + 4, Math.max(20, r.width - 16), 4);
      return;
    }

    // El más cercano al ratón, y a qué lado de su centro
    let cercano = null;
    let menor = Infinity;
    for (const el of otros) {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const distancia = dx * dx + dy * dy;
      if (distancia < menor) {
        menor = distancia;
        cercano = el;
      }
    }
    const fila = enFila(caja, lista);
    const r = cercano.getBoundingClientRect();
    const antes = fila ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    const siguiente = antes ? cercano : otros[otros.indexOf(cercano) + 1] || null;

    // Si cae justo donde ya está, nada que marcar
    const posicionActual = lista.indexOf(arrastrado);
    if (posicionActual >= 0) {
      const sinEl = lista.filter((el) => el !== arrastrado);
      const nueva = siguiente ? sinEl.indexOf(siguiente) : sinEl.length;
      if (nueva === posicionActual) {
        destino = null;
        esconderMarca();
        return;
      }
    }
    destino = { zona: caja, antesDe: siguiente };

    // La línea, en mitad del hueco entre los dos
    const hueco = separacion(caja, fila) / 2;
    const grosor = 4;
    if (fila) {
      const x = antes ? r.left - hueco : r.right + hueco;
      ponerMarca(x - grosor / 2, r.top, grosor, r.height);
    } else {
      const y = antes ? r.top - hueco : r.bottom + hueco;
      ponerMarca(r.left, y - grosor / 2, r.width, grosor);
    }
  });

  raiz.addEventListener("drop", (e) => {
    if (!arrastrado) return;
    e.preventDefault();
    soltado = true;
  });

  raiz.addEventListener("dragend", () => {
    if (!arrastrado) return;
    const el = arrastrado;
    arrastrado = null;
    el.classList.remove("arrastrando");
    esconderMarca();

    let movido = false;
    if (destino && soltado) {
      const { zona: caja, antesDe } = destino;
      if (antesDe) caja.insertBefore(el, antesDe);
      else {
        // Al final de los elementos (detrás puede haber otras cosas: los huecos vacíos...)
        const ultimos = deLaZona(caja).filter((cada) => cada !== el);
        const ultimo = ultimos[ultimos.length - 1];
        if (ultimo) ultimo.after(el);
        else caja.prepend(el);
      }
      movido = true;
    }
    destino = null;
    alTerminar(el, movido);
  });
}

// Fuera de la zona, la línea se va (el dragover de la raíz ya no llega)
document.addEventListener("dragover", (e) => {
  if (marca && !marca.hidden && !e.defaultPrevented) esconderMarca();
});
