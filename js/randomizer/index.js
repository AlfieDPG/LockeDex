// ---------- Sección «Randomizer» ----------
//
// Arriba, las pestañas (Pokémon, iniciales, entrenadores...); debajo, la ROM y el botón de
// randomizar y las normas de la pestaña. Todo empieza «sin cambios». Desde un locke
// («Randomizar mi ROM») las normas son las del locke y no se tocan: elegir la ROM y randomizar.
//
// La ROM no sale nunca del navegador: se lee, se randomiza aquí y se descarga.
//
//   localStorage «poketeams-randomizer-v1»: { reglas } (las tuyas)
//   localStorage «poketeams-randomizer-semillas-v1»: { idLocke: semilla } (la tuya de cada
//     locke: volver a randomizar da la misma ROM)

import { escaparHTML } from "../comun/utilidades.js";
import { icono } from "../comun/iconos.js";
import { leer, escribir } from "../comun/almacen.js";
import { lockePorId, misLockes } from "../comun/lockes.js";
import { JUEGOS } from "../comun/juegos.js";
import { datos, cargarDatos } from "../comun/datos.js";
import { preguntar, confirmar } from "../comun/ventanas.js";
import {
  completarReglas, hayAlgo, misReglas, REGLAS_VACIAS, CLAVE_MIAS as CLAVE, normasGuardadas, guardarNormas, borrarNormas
} from "./reglas.js";

// La última especie de cada juego (para elegir las iniciales a mano). Sin ROM ni locke, la del
// más nuevo: al randomizar, la que no exista en el juego sale al azar (randomizar.js)
const ULTIMA_ESPECIE = { dp: 493, platino: 493, hgss: 493, bw: 649, b2w2: 649, xy: 721, oras: 721, sm: 802, usum: 807, bdsp: 493, swsh: 898 };
const ULTIMA_DE_TODAS = Math.max(...Object.values(ULTIMA_ESPECIE));

const CLAVE_SEMILLAS = "poketeams-randomizer-semillas-v1";

// Juego de js/comun/juegos.js por las tres primeras letras del código de la ROM
const JUEGO_DE_CODIGO = {
  IRE: "b2w2", IRD: "b2w2", IRB: "bw", IRA: "bw", ADA: "dp", APA: "dp", CPU: "platino", IPK: "hgss", IPG: "hgss"
};
const GEN4 = ["dp", "platino", "hgss"];
// Los de 3DS (se leen del .3ds y salen como archivos sueltos para el emulador o la consola)
const TRES_DS = ["xy", "oras", "sm", "usum"];
// Juego de js/comun/juegos.js por el código de producto de un .3ds («CTR-P-EK2A»)
const JUEGO_DE_CODIGO_3DS = { EK: "xy", EC: "oras", BN: "sm", A2: "usum" };
// La generación de cada juego (las actualizaciones de datos son a las siguientes)
const GENERACION_DE = { dp: 4, platino: 4, hgss: 4, bw: 5, b2w2: 5, xy: 6, oras: 6, sm: 7, usum: 7, bdsp: 8, swsh: 8 };
// Los de Switch (se elige su carpeta «romfs» y sale un .zip, un mod)
const SWITCH = ["swsh", "bdsp"];
// Lo que no tiene cada juego (no sale en su pestaña): no tienen tutores de ataques Negro y Blanco, Diamante y Perla,
// X e Y, y Sol y Luna
const SIN_PESTANAS = {};
// En Diamante Brillante y Perla Reluciente, los intercambios van en los scripts
const SIN_APARTADOS = { bw: ["tutores"], dp: ["tutores"], xy: ["tutores"], oras: [], sm: ["tutores"], usum: [], bdsp: ["tutores", "intercambios"] };

const PARECIDA_ALEATORIO = [["no", "Sin cambios"], ["parecida", "Fuerza parecida"], ["cualquiera", "Aleatorio"]];
// A quién: se marcan sueltos, ninguno es nadie
const QUIEN = [["lideres", "Líderes"], ["rivales", "Rivales"], ["normales", "Entrenadores"]];
const COMPAT = [["no", "Sin cambios"], ["aleatoria", "Aleatorio"], ["total", "Todos"]];
const ALEATORIO = [["no", "Sin cambios"], ["azar", "Aleatorio"]];
const SI_NO = [[false, "Sin cambios"], [true, "Aleatorio"]];
// Solo Sol, Luna, Ultrasol y Ultraluna tienen tótems
const SIN_TOTEMS = ["dp", "platino", "hgss", "bw", "b2w2", "xy", "oras", ...SWITCH];
// Las generaciones a las que se puede actualizar (las de después del juego)
const GENERACIONES = (juego) => [
  [0, "Sin cambios"], ...[5, 6, 7, 8, 9].filter((g) => g > (GENERACION_DE[juego] || 5)).map((g) => [g, `${g}.ª generación`])
];
// Multiplicador de niveles: se guarda lo que suben, en %
const MULTIPLICADOR = { tipo: "barra", min: 0, max: 100, paso: 5, formato: (v) => (v ? `×${(1 + v / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 })}` : "Sin cambios") };

// Las pestañas, y en cada una sus apartados. Cada apartado, sus campos, siempre a la vista: el
// primer valor de cada uno es «sin cambios». tipo: «opciones» (botones), «casilla» (sí o no),
// «lista» (desplegable), «barra» (deslizable) o «iniciales» (las tres, a mano). «hijos»: los que
// dependen de este, colgando debajo; se ven cuando «abre» lo dice. «si»: solo se muestra con
// eso. «ayuda»: al pasar el ratón.
const PESTANAS = [
  {
    id: "pokemon", titulo: "Pokémon",
    apartados: [
      {
        id: "stats", titulo: "Estadísticas", icono: "actividad",
        campos: [
          { k: "modo", tipo: "opciones", opciones: ALEATORIO, ayuda: "Aleatorio: cada uno reparte su total de otra forma" },
          { k: "generacion", tipo: "lista", texto: "Actualizar a la generación", opciones: GENERACIONES, ayuda: "Las estadísticas base que tenían en esa generación (algunos las cambiaron en juegos posteriores)" }
        ]
      },
      {
        id: "tipos", titulo: "Tipos", icono: "etiqueta",
        campos: [
          {
            k: "modo", tipo: "opciones", opciones: ALEATORIO, abre: (r) => r.tipos.modo !== "no",
            hijos: [{ k: "familia", tipo: "casilla", texto: "Se mantienen al evolucionar" }]
          }
        ]
      },
      {
        id: "habilidades", titulo: "Habilidades", icono: "estrella",
        campos: [
          {
            k: "modo", tipo: "opciones", opciones: ALEATORIO, abre: (r) => r.habilidades.modo !== "no",
            hijos: [
              { k: "familia", tipo: "casilla", texto: "Se mantienen al evolucionar" },
              { k: "dos", tipo: "casilla", texto: "Todos los Pokémon tienen dos habilidades" },
              { k: "sinMalas", tipo: "casilla", texto: "Banear habilidades inútiles", ayuda: "Nada de Ausente, Inicio Lento, Flaqueza, Fuga..." }
            ]
          }
        ]
      },
      {
        id: "evoluciones", titulo: "Evoluciones", icono: "mega",
        campos: [
          { k: "modo", tipo: "opciones", opciones: ALEATORIO, ayuda: "Aleatorio: cada uno evoluciona en otro de fuerza parecida, con tres fases como mucho" },
          { k: "dificiles", tipo: "casilla", texto: "Facilitar evoluciones complejas", ayuda: "Intercambio, amistad, saber un ataque, un lugar...: además por nivel. Intercambio con objeto: además subiendo de nivel con él. Lista de cambios en el README de GitHub" },
          { k: "objetos", tipo: "casilla", texto: "Facilitar evoluciones por objeto", ayuda: "Piedras y objetos: además por nivel, sin el objeto" },
          { k: "niveles", tipo: "casilla", texto: "Bajar niveles de evolución", ayuda: "Como mucho 24 la primera de tres fases, 30 las de dos (36 si es fuerte) y 36 la segunda de tres (45 las pseudolegendarias)" }
        ]
      }
    ]
  },
  {
    id: "ataques", titulo: "Ataques",
    apartados: [
      {
        id: "movimientos", titulo: "Datos de los ataques", icono: "rayo",
        campos: [{ k: "generacion", tipo: "lista", texto: "Actualizar a la generación", opciones: GENERACIONES, ayuda: "Potencia, precisión, PP y tipo que tenían en esa generación" }]
      },
      {
        id: "ataques", titulo: "Ataques que aprenden", icono: "libro",
        campos: [
          {
            k: "modo", tipo: "opciones", opciones: ALEATORIO, abre: (r) => r.ataques.modo !== "no",
            hijos: [
              { k: "deSuTipo", tipo: "casilla", texto: "Preferiblemente de su tipo" },
              { k: "tipo", tipo: "barra", texto: "Ataques de su tipo", min: 0, max: 100, paso: 5, formato: (v) => `${v} %`, si: (r) => r.ataques.deSuTipo, ayuda: "Probabilidad de que cada ataque sea de uno de sus tipos" },
              { k: "inicio", tipo: "lista", texto: "Número de ataques asegurados", opciones: [[0, "Sin cambios"], [1, "1"], [2, "2"], [3, "3"], [4, "4"]], ayuda: "Los que sabe como mínimo desde el nivel 1 (los que falten se añaden; los demás siguen en su nivel)" },
              { k: "orden", tipo: "casilla", texto: "Ataques más fuertes en niveles más altos" }
            ]
          }
        ]
      },
      {
        id: "mt", titulo: "MT", icono: "disco",
        campos: [
          // En Espada y Escudo, qué enseña cada MT va en el programa del juego (no se puede cambiar)
          { k: "ataques", tipo: "opciones", opciones: SI_NO, ayuda: "Qué ataque enseña cada MT (las MO no se tocan)", no: ["swsh"] },
          {
            k: "compat", tipo: "opciones", texto: "Quién las aprende", opciones: COMPAT, abre: (r) => r.mt.compat === "aleatoria",
            ayuda: "Aleatorio: cada Pokémon, cada MT, cara o cruz (en Espada y Escudo, también los DT)",
            hijos: [
              { k: "deSuTipo", tipo: "casilla", texto: "Más fácil si son de su tipo" },
              { k: "tipo", tipo: "barra", texto: "Las de su tipo", min: 50, max: 100, paso: 5, formato: (v) => `${v} %`, si: (r) => r.mt.deSuTipo, ayuda: "Probabilidad de aprender las de sus tipos (las demás, 50 %)" }
            ]
          },
          { k: "mo", tipo: "casilla", texto: "Todos aprenden las MO", si: (r) => r.mt.compat !== "total", no: SWITCH }
        ]
      },
      {
        id: "tutores", titulo: "Tutores de ataques", icono: "persona",
        campos: [
          { k: "ataques", tipo: "opciones", opciones: SI_NO, ayuda: "Qué ataque enseña cada tutor", no: ["swsh"] },
          {
            k: "compat", tipo: "opciones", texto: "Quién los aprende", opciones: COMPAT, abre: (r) => r.tutores.compat === "aleatoria",
            ayuda: "Aleatorio: cada Pokémon, cada tutor, cara o cruz",
            hijos: [
              { k: "deSuTipo", tipo: "casilla", texto: "Más fácil si son de su tipo" },
              { k: "tipo", tipo: "barra", texto: "Los de su tipo", min: 50, max: 100, paso: 5, formato: (v) => `${v} %`, si: (r) => r.tutores.deSuTipo, ayuda: "Probabilidad de aprender los de sus tipos (los demás, 50 %)" }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "especiales", titulo: "Iniciales y especiales",
    apartados: [
      {
        id: "iniciales", titulo: "Iniciales", icono: "pokeball",
        campos: [
          {
            k: "modo", tipo: "opciones", opciones: [["no", "Sin cambios"], ["cualquiera", "Aleatorio"], ["dos-evoluciones", "Con dos evoluciones"], ["elegidas", "Elegir"]],
            abre: (r) => r.iniciales.modo !== "no",
            hijos: [
              { k: "elegidas", tipo: "iniciales", texto: "Iniciales", si: (r) => r.iniciales.modo === "elegidas" },
              { k: "rivalInicial", tipo: "casilla", texto: "El rival lleva su inicial", ayuda: "Lleva la inicial nueva que tiene ventaja sobre la tuya, y la evoluciona como en el juego" }
            ]
          }
        ]
      },
      {
        id: "estaticos", titulo: "Estáticos", icono: "corona", ayuda: "Legendarios y demás Pokémon que se encuentran sueltos",
        campos: [
          { k: "modo", tipo: "opciones", opciones: PARECIDA_ALEATORIO },
          { k: "totems", tipo: "opciones", texto: "Tótems", opciones: PARECIDA_ALEATORIO, no: SIN_TOTEMS },
          { k: "aliados", tipo: "opciones", texto: "Aliados de los tótems", opciones: PARECIDA_ALEATORIO, no: SIN_TOTEMS },
          { k: "aura", tipo: "opciones", texto: "Aura de los tótems", opciones: ALEATORIO, no: SIN_TOTEMS }
        ]
      },
      {
        id: "intercambios", titulo: "Intercambios", icono: "intercambiar", ayuda: "Los Pokémon que te piden y te dan los NPC",
        campos: [
          { k: "modo", tipo: "opciones", opciones: PARECIDA_ALEATORIO },
          { k: "objetos", tipo: "casilla", texto: "Objetos de los intercambios aleatorios" },
          { k: "ivs", tipo: "casilla", texto: "IVs de los intercambios aleatorios" }
        ]
      }
    ]
  },
  {
    id: "entrenadores", titulo: "Entrenadores",
    apartados: [
      {
        id: "entrenadores", titulo: "Pokémon de entrenadores", icono: "espadas",
        campos: [
          {
            k: "modo", tipo: "opciones", opciones: PARECIDA_ALEATORIO, abre: (r) => r.entrenadores.modo !== "no",
            hijos: [
              { k: "sinLegendarios", tipo: "casilla", texto: "Sin legendarios" },
              { k: "lideresTipo", tipo: "casilla", texto: "Líderes y Alto Mando de un tipo", ayuda: "Cada gimnasio (líder y entrenadores de dentro), cada miembro del Alto Mando y el campeón, con Pokémon de un tipo aleatorio" }
            ]
          },
          { k: "nivel", texto: "Multiplicador de niveles", ...MULTIPLICADOR }
        ]
      },
      {
        id: "entrenadores", titulo: "Más Pokémon y objetos", icono: "mas",
        campos: [
          {
            k: "extras", tipo: "opciones", varias: true, texto: "Pokémon extra para", opciones: QUIEN, abre: (r) => r.entrenadores.extras.length > 0,
            ayuda: "El primer combate contra el rival se queda como está",
            hijos: [{ k: "cuantos", tipo: "opciones", texto: "Cuántos se añaden", opciones: [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]], ayuda: "Hasta seis en total" }]
          },
          { k: "objetos", tipo: "opciones", varias: true, texto: "Añadir objetos a", opciones: QUIEN },
          {
            k: "evolucionados", tipo: "casilla", texto: "Evolucionados del todo", ayuda: "A partir de cierto nivel, solo llevan Pokémon en su última evolución",
            abre: (r) => r.entrenadores.evolucionados,
            hijos: [{ k: "nivelEvolucionados", tipo: "barra", texto: "Desde el nivel", min: 10, max: 70, paso: 1, formato: (v) => `Nivel ${v}` }]
          }
        ]
      },
      {
        id: "entrenadores", titulo: "Combates", icono: "amigos",
        campos: [
          { k: "dobles", tipo: "casilla", texto: "Todos los combates dobles", ayuda: "Los de un solo Pokémon llevan uno más" },
          { k: "nombres", tipo: "casilla", texto: "Nombres de los entrenadores aleatorios", ayuda: "Los de los entrenadores normales y sus clases, barajados" }
        ]
      }
    ]
  },
  {
    id: "salvajes", titulo: "Salvajes",
    apartados: [
      {
        id: "salvajes", titulo: "Pokémon salvajes", icono: "mapa", ayuda: "Todos: hierba (también la oscura y la que se mueve), agua, pesca, cuevas y claros ocultos",
        campos: [
          {
            k: "modo", tipo: "opciones", opciones: PARECIDA_ALEATORIO, abre: (r) => r.salvajes.modo !== "no",
            hijos: [{ k: "sinLegendarios", tipo: "casilla", texto: "Sin legendarios" }]
          },
          { k: "nivel", texto: "Multiplicador de niveles", ...MULTIPLICADOR },
          {
            k: "unico", tipo: "casilla", texto: "Un solo Pokémon por zona en el campo", no: ["dp", "platino", "hgss", "bw", "b2w2", "xy", "oras", "sm", "usum", "bdsp"],
            ayuda: "Espada y Escudo: todos los Pokémon que se ven por el campo en cada zona son la misma especie, al azar. Así no se puede elegir cuál capturar (los de la hierba con «!» siguen saliendo al azar)"
          },
          { k: "objetos", tipo: "casilla", texto: "Objetos de los Pokémon salvajes aleatorios" },
          {
            k: "pueblos", tipo: "casilla", texto: "Hierba en los pueblos", no: ["sm", "usum", ...SWITCH],
            ayuda: "Un trozo de hierba alta en cada pueblo y ciudad que no tiene, con los Pokémon de la ruta por la que se llega. No se ve: solo al pisarla"
          }
        ]
      }
    ]
  },
  {
    id: "objetos", titulo: "Objetos",
    apartados: [
      {
        id: "objetos", titulo: "Objetos del suelo", icono: "objeto", ayuda: "Los que recoges por el camino y los escondidos. Donde había una MT sale otra MT; los objetos de la historia no se tocan",
        campos: [
          { k: "suelo", tipo: "opciones", opciones: SI_NO },
          { k: "sinMalos", tipo: "casilla", texto: "Banear objetos inútiles", ayuda: "Ni en el suelo, ni en las tiendas, ni equipados: nada de cartas, pañuelos ni cosas que no sirvan en la aventura" }
        ]
      },
      {
        id: "objetos", titulo: "Tiendas", icono: "caja",
        campos: [
          {
            k: "tiendas", tipo: "casilla", texto: "Tiendas especiales aleatorias", ayuda: "Lo que venden las tiendas que no son las normales. En las de MT, otras MT",
            abre: (r) => r.objetos.tiendas,
            hijos: [{ k: "sinNormales", tipo: "casilla", texto: "Sin lo de las tiendas normales", ayuda: "Las especiales no venden nada de lo que ya hay en las normales (Pociones, Poké Balls...)" }]
          },
          { k: "piedras", tipo: "casilla", texto: "Siempre hay piedras evolutivas", ayuda: "Todas se venden en alguna tienda de las de la historia" },
          { k: "caramelos", tipo: "casilla", texto: "Caramelos Raros baratos", ayuda: "A 100 en la tienda del primer pueblo" },
          { k: "precios", tipo: "casilla", texto: "Precios equilibrados" }
        ]
      }
    ]
  },
  {
    id: "varios", titulo: "Varios",
    apartados: [
      {
        id: "varios", titulo: "Varios", icono: "pokedex",
        campos: [
          { k: "pokedex", tipo: "casilla", texto: "Pokédex Nacional desde el principio", ayuda: "Al darte la Pokédex, también la nacional", no: [...GEN4, "sm", "usum", ...SWITCH] },
          { k: "texto", tipo: "casilla", texto: "Texto instantáneo", no: [...GEN4, ...SWITCH] }
        ]
      }
    ]
  }
];
let vista = null;
let mias = null; // reglas que se están editando (tuyas)
let guardada = null; // id de las normas guardadas que se están editando (null: las sueltas)
let idLocke = null; // con normas de un locke
let rom = null; // { archivo (File), juego, nombre }
let trabajando = false;
let pestana = PESTANAS[0].id;

// ---------- Normas ----------

function reglasActuales() {
  if (idLocke) {
    const locke = lockePorId(idLocke);
    if (locke && locke.randomizer) return completarReglas(locke.randomizer.reglas);
  }
  return mias;
}

// Lo que se cambia se guarda solo: en las normas guardadas que estén elegidas o, si no, en las sueltas
function guardarMias() {
  if (guardada) guardarNormas(null, mias, guardada);
  else escribir(CLAVE, { reglas: mias });
}

// La barra de normas: de dónde vienen las que se ven (las sueltas, unas guardadas o las de un
// locke) y qué se puede hacer con ellas
function plantillaNormas() {
  const guardadas = normasGuardadas();
  const lockes = misLockes().filter((l) => l.randomizer);
  const elegida = idLocke ? `l:${idLocke}` : guardada ? `g:${guardada}` : "";
  const opcion = (valor, texto) => `<option value="${escaparHTML(valor)}" ${valor === elegida ? "selected" : ""}>${escaparHTML(texto)}</option>`;
  return `
    <div class="random-normas">
      <span>Normas</span>
      <select class="random-normas-elegir">
        ${opcion("", "Sin guardar")}
        ${guardadas.length ? `<optgroup label="Guardadas">${guardadas.map((n) => opcion(`g:${n.id}`, n.nombre)).join("")}</optgroup>` : ""}
        ${lockes.length ? `<optgroup label="De un locke">${lockes.map((l) => opcion(`l:${l.id}`, l.nombre)).join("")}</optgroup>` : ""}
      </select>
      ${idLocke
        ? `<button class="random-boton-normas" data-normas="copiar">Copiar a las mías</button>`
        : `<button class="random-boton-normas" data-normas="guardar">${guardada ? "Guardar copia" : "Guardar"}</button>
           ${guardada ? `<button class="random-boton-normas" data-normas="borrar">Borrar</button>` : ""}`}
    </div>`;
}

// Elegir de dónde vienen las normas
function elegirNormas(valor) {
  idLocke = null;
  guardada = null;
  if (valor.startsWith("l:")) idLocke = valor.slice(2);
  else if (valor.startsWith("g:")) {
    const n = normasGuardadas().find((x) => x.id === valor.slice(2));
    if (n) {
      guardada = n.id;
      mias = completarReglas(n.reglas);
    }
  } else mias = misReglas() || completarReglas();
  if (rom) revisarRom();
  else pintar();
}

// Todo sin cambios, para empezar de nuevo (también en las normas guardadas que estén elegidas)
async function vaciarNormas() {
  if (idLocke || !(await confirmar("¿Borrar todo lo elegido para randomizar?", { aceptar: "Borrar todo" }))) return;
  mias = completarReglas();
  guardarMias();
  pintar();
}

async function accionNormas(que) {
  if (que === "guardar") {
    const nombre = await preguntar("Nombre para estas normas:", "");
    if (!nombre || !nombre.trim()) return;
    guardada = guardarNormas(nombre.trim().slice(0, 40), mias);
    pintar();
  } else if (que === "borrar") {
    const n = normasGuardadas().find((x) => x.id === guardada);
    if (!n || !(await confirmar(`¿Borrar las normas «${n.nombre}»?`))) return;
    borrarNormas(guardada);
    guardada = null;
    mias = misReglas() || completarReglas();
    pintar();
  } else if (que === "copiar") {
    const locke = lockePorId(idLocke);
    if (!locke || !locke.randomizer) return;
    mias = completarReglas(locke.randomizer.reglas);
    idLocke = null;
    guardada = null;
    escribir(CLAVE, { reglas: mias });
    if (rom) revisarRom();
    else pintar();
  }
}

// ---------- Pintar ----------

// Las tres iniciales a mano: un desplegable por cada una, con todas las especies
function plantillaIniciales(a, c, valor, dis) {
  const lista = (datos && datos.pokemon) || [];
  const locke = idLocke ? lockePorId(idLocke) : null;
  const juego = (rom && !rom.error && rom.juego) || (locke && locke.juego);
  const ultima = ULTIMA_ESPECIE[juego] || ULTIMA_DE_TODAS;
  const especies = lista.filter((p) => p.id <= ultima).sort((x, y) => x.id - y.id);
  return `<div class="random-iniciales">${[0, 1, 2]
    .map((i) => `
      <select data-apartado="${a.id}" data-campo="${c.k}" data-indice="${i}" ${dis}>
        <option value="0">Aleatoria</option>
        ${especies.map((p) => `<option value="${p.id}" ${Number(valor[i]) === p.id ? "selected" : ""}>${escaparHTML(p.es)}</option>`).join("")}
      </select>`)
    .join("")}</div>`;
}

// Los que cuelgan de un campo (si los tiene y están abiertos), sangrados y con su línea
function plantillaHijos(a, c, reglas, bloqueado) {
  if (!c.hijos || !c.abre(reglas)) return "";
  const filas = c.hijos.map((h) => plantillaFila(a, h, reglas, bloqueado)).join("");
  return filas ? `<div class="random-hijos">${filas}</div>` : "";
}

// Una fila: el nombre a la izquierda y el control a la derecha; debajo, lo que cuelga de ella
function plantillaFila(a, c, reglas, bloqueado) {
  if (c.si && !c.si(reglas)) return "";
  // «no»: los juegos que no lo tienen
  if (c.no && rom && c.no.includes(rom.juego)) return "";
  return `
    <div class="random-fila">
      <span class="random-nombre" title="${escaparHTML(c.ayuda || "")}">${escaparHTML(c.texto || "")}</span>
      ${plantillaControl(a, c, reglas, bloqueado)}
    </div>
    ${plantillaHijos(a, c, reglas, bloqueado)}`;
}

function plantillaControl(a, c, reglas, bloqueado) {
  const valor = reglas[a.id][c.k];
  const dis = bloqueado ? "disabled" : "";
  const dato = `data-apartado="${a.id}" data-campo="${c.k}"`;
  if (c.tipo === "iniciales") return plantillaIniciales(a, c, valor, dis);
  // Un número: barra deslizable, con lo que vale al lado
  if (c.tipo === "barra") {
    return `
      <label class="random-barra-valor">
        <output>${escaparHTML(c.formato(valor))}</output>
        <input type="range" min="${c.min}" max="${c.max}" step="${c.paso}" value="${valor}" ${dato} ${dis}>
      </label>`;
  }
  // Sí o no: un interruptor
  if (c.tipo === "casilla") {
    return `<button class="random-interruptor ${valor ? "activa" : ""}" role="switch" aria-checked="${Boolean(valor)}" aria-label="${escaparHTML(c.texto)}" ${dato} data-valor="${!valor}" ${dis}><i></i></button>`;
  }
  // Varias opciones que se marcan sueltas (varias: el valor es la lista de las marcadas): cada
  // botón lleva la lista que queda al pulsarlo
  if (c.tipo === "opciones" && c.varias) {
    const marcadas = valor || [];
    const alPulsar = (v) => c.opciones.map(([x]) => x).filter((x) => (x === v) !== marcadas.includes(x));
    return `<div class="random-segmentado" title="${escaparHTML(c.ayuda || "")}">${c.opciones
      .map(([v, t]) => `<button class="${marcadas.includes(v) ? "activa" : ""}" aria-pressed="${marcadas.includes(v)}" ${dato} data-valor="${escaparHTML(JSON.stringify(alPulsar(v)))}" ${dis}>${escaparHTML(t)}</button>`)
      .join("")}</div>`;
  }
  // Varias opciones: botones pegados, siempre en una fila (en pantallas estrechas, en columna)
  if (c.tipo === "opciones") {
    return `<div class="random-segmentado" title="${escaparHTML(c.ayuda || "")}">${c.opciones
      .map(([v, t]) => `<button class="${v === valor ? "activa" : ""}" ${dato} data-valor="${escaparHTML(JSON.stringify(v))}" ${dis}>${escaparHTML(t)}</button>`)
      .join("")}</div>`;
  }
  const opciones = typeof c.opciones === "function" ? c.opciones(rom && rom.juego) : c.opciones;
  return `<select class="random-desplegable" ${dato} ${dis}>${opciones.map(([v, t]) => `<option value="${escaparHTML(JSON.stringify(v))}" ${v === valor ? "selected" : ""}>${escaparHTML(t)}</option>`).join("")}</select>`;
}

// ¿Algo de esta tarjeta (o de lo que cuelga) no está sin cambios?
function tarjetaCambiada(a, reglas) {
  const claves = [];
  const juntar = (campos) => campos.forEach((c) => (claves.push(c.k), c.hijos && juntar(c.hijos)));
  juntar(a.campos);
  return claves.some((k) => JSON.stringify(reglas[a.id][k]) !== JSON.stringify(REGLAS_VACIAS[a.id][k]));
}

// Una tarjeta por apartado. Si el primer campo son opciones sin nombre, es la principal: va en la
// cabecera, al lado del título, y lo que cuelga de ella, justo debajo. Los demás, una fila cada uno.
function plantillaApartado(a, reglas, bloqueado) {
  const [primero, ...resto] = a.campos;
  // (si el juego no la tiene, no hay principal: sale como fila, y la fila no se pinta)
  const principal = primero.tipo === "opciones" && !primero.texto && !(primero.no && rom && primero.no.includes(rom.juego)) ? primero : null;
  const filas = (principal ? resto : a.campos).map((c) => plantillaFila(a, c, reglas, bloqueado)).join("");
  return `
    <section class="random-tarjeta ${tarjetaCambiada(a, reglas) ? "encendida" : ""}">
      <header>
        <h3 title="${escaparHTML(a.ayuda || "")}">${icono(a.icono)} ${escaparHTML(a.titulo)}</h3>
        ${principal ? plantillaControl(a, principal, reglas, bloqueado) : ""}
      </header>
      ${principal ? plantillaHijos(a, principal, reglas, bloqueado) : ""}
      ${filas}
    </section>`;
}

function pintar() {
  const locke = idLocke ? lockePorId(idLocke) : null;
  if (idLocke && !(locke && locke.randomizer)) idLocke = null;
  const reglas = reglasActuales();
  const bloqueado = Boolean(idLocke);
  const actual = PESTANAS.find((p) => p.id === pestana) || PESTANAS[0];

  // Una pestaña con algo cambiado lleva un punto
  const cambiada = (p) => p.apartados.some((a) => tarjetaCambiada(a, reglas));
  vista.innerHTML = `
    <div class="selector-regiones random-pestanas">
      ${PESTANAS.filter((p) => !((rom && SIN_PESTANAS[rom.juego]) || []).includes(p.id)).map((p) => `<button data-pestana="${p.id}" class="${p.id === actual.id ? "activa" : ""}">${escaparHTML(p.titulo)}${cambiada(p) ? `<i class="random-punto"></i>` : ""}</button>`).join("")}
    </div>
    ${plantillaNormas()}
    <div class="random-barra">
      <button class="random-elegir">${icono("subir")} ${rom ? "Otra ROM" : "Elegir ROM"}</button>
      <button class="random-elegir-carpeta" title="Los de Switch: la carpeta «romfs» sacada desde el emulador">${icono("carpeta")} Elegir carpeta</button>
      <button class="random-ayuda" title="Qué elegir en cada consola y qué hacer con lo que sale" aria-label="Ayuda">?</button>
      <span class="random-rom ${rom && rom.error ? "con-error" : ""}">${rom ? escaparHTML(rom.error || `${rom.nombre} · ${rom.archivo.name}`) : ""}</span>
      <button class="random-vaciar" ${!idLocke && hayAlgo(reglas) ? "" : "disabled"}>${icono("deshacer")} Borrar todo</button>
      <button class="random-ir" ${rom && !rom.error && !trabajando && hayAlgo(reglas) ? "" : "disabled"} title="${hayAlgo(reglas) ? "" : "Cambia algo primero"}">${icono("mezclar")} ${trabajando ? "Randomizando..." : "Randomizar"}</button>
    </div>
    <span class="random-estado"></span>
    <div class="random-tarjetas">${actual.apartados.filter((a) => !((rom && SIN_APARTADOS[rom.juego]) || []).includes(a.id)).map((a) => plantillaApartado(a, reglas, bloqueado)).join("")}</div>
    <input class="random-archivo" type="file" accept=".nds,.3ds" hidden>
    <input class="random-carpeta" type="file" webkitdirectory hidden>`;
}
// ---------- ROM ----------

async function elegirRom(archivo) {
  rom = { archivo, nombre: "", juego: "", error: "" };
  if (/\.(nsp|xci|nsz|xcz)$/i.test(archivo.name)) {
    rom.error = "Los juegos de Switch van cifrados: hay que sacar su carpeta «romfs» desde el emulador y elegirla con «Elegir carpeta» (mira el «?»).";
    pintar();
    return;
  }
  try {
    // La cabecera basta para saber qué juego es
    const cabecera = new Uint8Array(await archivo.slice(0, 0x200).arrayBuffer());
    let juego;
    if (new TextDecoder("latin1").decode(cabecera.subarray(0x100, 0x104)) === "NCSD") {
      // Un .3ds: el código del juego está en la cabecera de su primera partición
      const inicio = new DataView(cabecera.buffer).getUint32(0x120, true) * 0x200;
      const particion = new Uint8Array(await archivo.slice(inicio, inicio + 0x200).arrayBuffer());
      const producto = new TextDecoder("latin1").decode(particion.subarray(0x150, 0x160));
      juego = JUEGO_DE_CODIGO_3DS[producto.slice(6, 8)];
      rom.es3DS = true;
      if (juego && !(particion[0x188 + 7] & 4)) {
        rom.error = "Ese .3ds está cifrado: hace falta uno descifrado.";
      }
    } else {
      const codigo = new TextDecoder("latin1").decode(cabecera.subarray(0x0c, 0x10));
      juego = JUEGO_DE_CODIGO[codigo.slice(0, 3)];
    }
    if (!juego) {
      rom.error = "Este juego todavía no se puede randomizar (de momento, los de DS, los de 3DS y los de Switch).";
    } else {
      rom.juego = juego;
      rom.nombre = (JUEGOS.find((j) => j.id === juego) || {}).nombre || juego;
      const locke = idLocke ? lockePorId(idLocke) : null;
      if (locke && locke.juego && locke.juego !== juego) {
        const delLocke = (JUEGOS.find((j) => j.id === locke.juego) || {}).nombre || locke.juego;
        rom.error = `Esa ROM es de ${rom.nombre} y el locke, de ${delLocke}.`;
      }
    }
  } catch (error) {
    console.error(error);
    rom.error = "No se ha podido leer el archivo.";
  }
  pintar();
}

// La ROM ya elegida, otra vez (han cambiado las normas o el locke: puede no valer para este)
function revisarRom() {
  if (rom && rom.carpeta) elegirCarpeta(rom.archivos);
  else if (rom) elegirRom(rom.archivo);
}

// Los de Switch: la carpeta «romfs» sacada desde el emulador (ver el «?»). archivos: los File del
// <input webkitdirectory>, con su ruta dentro de la carpeta elegida (webkitRelativePath)
const ROMFS = {
  swsh: "bin/pml/personal/personal_total.bin",
  bdsp: "Data/StreamingAssets/AssetAssistant/Pml/personal_masterdatas"
};
// Los que ya se saben randomizar
const ROMFS_LISTOS = ["swsh", "bdsp"];

function elegirCarpeta(archivos) {
  const nombreCarpeta = (archivos[0].webkitRelativePath || "").split("/")[0] || "romfs";
  rom = { archivos, archivo: { name: nombreCarpeta }, carpeta: true, nombre: "", juego: "", error: "" };
  // La ruta de cada uno dentro del romfs (se haya elegido la carpeta «romfs» o la de encima)
  const rutas = new Map();
  for (const a of archivos) {
    const partes = a.webkitRelativePath.split("/").slice(1);
    const romfs = partes.indexOf("romfs");
    rutas.set((romfs >= 0 ? partes.slice(romfs + 1) : partes).join("/"), a);
  }
  rom.rutas = rutas;
  const juego = Object.keys(ROMFS).find((id) => rutas.has(ROMFS[id]));
  if (!juego) {
    rom.error = "Esa carpeta no es el «romfs» de un juego que se sepa randomizar (mira el «?»).";
  } else {
    rom.juego = juego;
    rom.nombre = (JUEGOS.find((j) => j.id === juego) || {}).nombre || juego;
    if (!ROMFS_LISTOS.includes(juego)) rom.error = "Todavía no se puede randomizar este juego.";
    const locke = idLocke ? lockePorId(idLocke) : null;
    if (locke && locke.juego && locke.juego !== juego) {
      const delLocke = (JUEGOS.find((j) => j.id === locke.juego) || {}).nombre || locke.juego;
      rom.error = `Esa carpeta es de ${rom.nombre} y el locke, de ${delLocke}.`;
    }
  }
  pintar();
}

const modulos = {};

function semillaPara() {
  const { nuevaSemilla } = modulos.azar;
  if (!idLocke) return nuevaSemilla();
  const semillas = leer(CLAVE_SEMILLAS, {}) || {};
  if (!semillas[idLocke]) {
    semillas[idLocke] = nuevaSemilla();
    escribir(CLAVE_SEMILLAS, semillas);
  }
  return semillas[idLocke];
}

async function randomizar() {
  if (!rom || rom.error || trabajando) return;
  trabajando = true;
  pintar();
  const estado = () => vista.querySelector(".random-estado");
  try {
    if (!modulos.azar) {
      [modulos.azar, modulos.randomizar] = await Promise.all([import("./azar.js"), import("./randomizar.js")]);
    }
    let bytes;
    let nombre;
    // Que se vea «Randomizando...» antes de que el navegador se ponga a trabajar
    await new Promise((resolver) => setTimeout(resolver, 30));
    if (rom.es3DS) {
      // Un .3ds no se carga entero: se leen los archivos que hacen falta y el .3ds nuevo se monta con trozos del original
      const { Rom3DS, lectorDeArchivo, Sesion3DS } = await import("./rom-3ds.js");
      const juego3DS = await import("./juego-3ds.js");
      const sesion = new Sesion3DS(await new Rom3DS(lectorDeArchivo(rom.archivo)).abrir());
      await juego3DS.prepararRom(sesion);
      await modulos.randomizar.randomizarROM(sesion, reglasActuales(), semillaPara());
      const nuevo = await sesion.construirRom();
      nombre = rom.archivo.name.replace(/(\.3ds)?$/i, " (random).3ds");
      const piezas = nuevo.partes.map((x) => (x.rango ? rom.archivo.slice(x.rango.desde, x.rango.desde + x.rango.tam) : x));
      bytes = new Blob(piezas, { type: "application/octet-stream" });
    } else if (rom.carpeta) {
      // Switch: de la carpeta «romfs» se leen solo los archivos que hacen falta; sale un .zip con los cambiados (un mod)
      const { SesionSwitch } = await import("./rom-switch.js");
      const motor = await import(rom.juego === "bdsp" ? "./juego-bdsp.js" : "./juego-swsh.js");
      const sesion = new SesionSwitch(rom.rutas, rom.juego, rom.nombre);
      await motor.prepararRom(sesion);
      await modulos.randomizar.randomizarROM(sesion, reglasActuales(), semillaPara());
      bytes = sesion.zip();
      nombre = `${rom.nombre.replace(/\s*\/\s*/g, " y ")} (random).zip`;
    } else {
      bytes = new Uint8Array(await rom.archivo.arrayBuffer());
      await modulos.randomizar.randomizarROM(bytes, reglasActuales(), semillaPara());
      nombre = rom.archivo.name.replace(/(\.nds)?$/i, " (random).nds");
    }
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 60000);
    trabajando = false;
    pintar();
    estado().textContent = `Lista: ${nombre}`;
  } catch (error) {
    console.error(error);
    trabajando = false;
    pintar();
    estado().textContent = error.message || "No se ha podido randomizar.";
    estado().classList.add("con-error");
  }
}

// ---------- Arranque ----------

// El campo de la pestaña que se ve, por su apartado y su clave (también los que cuelgan)
function buscarCampo(apartado, clave) {
  const actual = PESTANAS.find((p) => p.id === pestana) || PESTANAS[0];
  const buscar = (campos) => {
    for (const c of campos) {
      if (c.k === clave) return c;
      const hijo = c.hijos && buscar(c.hijos);
      if (hijo) return hijo;
    }
    return null;
  };
  for (const a of actual.apartados) {
    const c = a.id === apartado && buscar(a.campos);
    if (c) return c;
  }
  return null;
}

function cambiar(apartado, campo, valor) {
  mias[apartado][campo] = valor;
  guardarMias();
  pintar();
}

export function iniciar() {
  vista = document.querySelector("#vista-randomizer");
  mias = misReglas() || completarReglas();

  vista.addEventListener("click", (e) => {
    const boton = e.target.closest("button");
    if (!boton || boton.disabled) return;
    if (boton.dataset.pestana) {
      pestana = boton.dataset.pestana;
      pintar();
    } else if (boton.dataset.campo) cambiar(boton.dataset.apartado, boton.dataset.campo, JSON.parse(boton.dataset.valor));
    else if (boton.classList.contains("random-elegir")) vista.querySelector(".random-archivo").click();
    else if (boton.classList.contains("random-elegir-carpeta")) vista.querySelector(".random-carpeta").click();
    else if (boton.classList.contains("random-ayuda")) document.querySelector("#dialogo-ayuda-rom").showModal();
    else if (boton.classList.contains("random-ir")) randomizar();
    else if (boton.dataset.normas) accionNormas(boton.dataset.normas);
    else if (boton.classList.contains("random-vaciar")) vaciarNormas();
  });

  vista.addEventListener("change", (e) => {
    if (e.target.matches(".random-archivo") && e.target.files[0]) elegirRom(e.target.files[0]);
    else if (e.target.matches(".random-carpeta") && e.target.files.length) elegirCarpeta([...e.target.files]);
    else if (e.target.matches(".random-normas-elegir")) elegirNormas(e.target.value);
    else if (e.target.matches("select[data-indice]")) {
      const { apartado, campo, indice } = e.target.dataset;
      const lista = mias[apartado][campo].slice();
      lista[Number(indice)] = Number(e.target.value);
      cambiar(apartado, campo, lista);
    } else if (e.target.matches("select[data-campo], input[type=range][data-campo]")) {
      cambiar(e.target.dataset.apartado, e.target.dataset.campo, JSON.parse(e.target.value));
    }
  });

  // Mientras se arrastra una barra, su valor al lado (se guarda al soltar)
  vista.addEventListener("input", (e) => {
    if (!e.target.matches("input[type=range][data-campo]")) return;
    const campo = buscarCampo(e.target.dataset.apartado, e.target.dataset.campo);
    const salida = e.target.parentElement.querySelector("output");
    if (campo && salida) salida.textContent = campo.formato(Number(e.target.value));
  });

  const ayuda = document.querySelector("#dialogo-ayuda-rom");
  ayuda.querySelector(".ayuda-rom-cerrar").addEventListener("click", () => ayuda.close());

  // Los nombres de los Pokémon, para elegir las iniciales a mano
  cargarDatos().then(() => vista.isConnected && pintar()).catch(() => {});
}

export function mostrar() {
  pintar();
}

// Desde el botón «Randomizar mi ROM» de un locke: sus normas
export function usarLocke(id) {
  idLocke = id;
  guardada = null;
  revisarRom();
}

