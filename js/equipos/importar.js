import {
  MAX_EQUIPO, hayCambiosSinGuardar, reemplazarEquipo, leerGuardados, escribirGuardados, grupoConNombre
} from "./estado.js";
import { mostrarAviso } from "./crear.js";
import { datos, buscarPorNombreIngles } from "../comun/datos.js";
import { pedirJSON, URL_API } from "../comun/api.js";
import { obtenerVariedades } from "../comun/formas.js";
import { pokemonDesdeAPI, pedirVariedad, ataqueDesdeAPI, generosPosibles } from "../comun/pokemon.js";
import { quitarAcentos, normalizarNombre, copiaProfunda } from "../comun/utilidades.js";
import { irA } from "../navegacion.js";
import { sumarContador } from "../comun/contadores.js";
import { entrenoDesdeShowdown } from "./entreno.js";

// ---------- Importar paste de Showdown ----------

// Primera línea del paste: "Apodo (Especie) (F) @ Objeto"
function leerPrimeraLinea(linea) {
  let texto = linea.trim();
  let objeto = null;

  const trozos = texto.split(" @ ");
  texto = trozos[0].trim();
  if (trozos.length > 1) objeto = trozos.slice(1).join(" @ ").trim();

  const conGenero = texto.match(/\s*\((M|F)\)\s*$/);
  texto = texto.replace(/\s*\((M|F)\)\s*$/, "");

  const apodo = texto.match(/^(.*)\s\(([^()]+)\)$/);
  const especie = apodo ? apodo[2] : texto;
  const mote = apodo ? apodo[1].trim() : "";

  return { especie: especie.trim(), mote: mote, objeto: objeto, genero: conGenero ? conGenero[1] : "" };
}

// Algunos pastes lo ponen en su propia línea: "Gender: F"
function generoEnLinea(lineas) {
  const linea = lineas.find((l) => /^Gender:\s*[MF]\b/i.test(l));
  return linea ? linea.replace(/^Gender:\s*/i, "").charAt(0).toUpperCase() : "";
}

// Se leen: especie, género, objeto, habilidad, ataques, Shiny y nivel, naturaleza, EVs e IVs.
// Se ignoran: felicidad, teratipo...
function interpretarPaste(texto) {
  let nombre = "";
  let carpeta = "";

  // Formato de copia de seguridad: === [gen9ou] Carpeta/Nombre ===
  const cabecera = texto.match(/^===\s*(?:\[[^\]]*\]\s*)?(.*?)\s*===\s*$/m);
  if (cabecera) {
    const trozos = cabecera[1].split("/");
    nombre = trozos.pop().trim();
    carpeta = trozos.join("/").trim();
    texto = texto.replace(cabecera[0], "");
  }

  const bloques = texto
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const pokemon = [];

  for (const bloque of bloques) {
    const lineas = bloque.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lineas.length === 0) continue;

    const primera = leerPrimeraLinea(lineas[0]);
    let habilidad = null;
    let shiny = false;
    const ataques = [];

    for (const linea of lineas.slice(1)) {
      if (/^Ability:/i.test(linea)) {
        habilidad = linea.replace(/^Ability:/i, "").trim();
      } else if (/^Shiny:\s*Yes/i.test(linea)) {
        shiny = true;
      } else if (linea.startsWith("-")) {
        ataques.push(linea.replace(/^-\s*/, "").trim());
      }
    }

    pokemon.push({
      especie: primera.especie,
      mote: primera.mote,
      objeto: primera.objeto,
      genero: primera.genero || generoEnLinea(lineas),
      habilidad: habilidad,
      shiny: shiny,
      ataques: ataques.slice(0, 4),
      entreno: entrenoDesdeShowdown(lineas.slice(1))
    });
  }

  return { nombre: nombre, carpeta: carpeta, pokemon: pokemon };
}

// Busca el Pokémon por su nombre de Showdown (con formas: Landorus-Therian, Persian-Alola...)
async function resolverPokemon(nombre) {
  try {
    // 1) Especie o forma de la lista: Pikachu, Ho-Oh, Mr. Mime, Persian-Alola...
    const entrada = buscarPorNombreIngles(datos.pokemon, nombre);
    if (entrada) {
      const p = await pedirJSON(`${URL_API}pokemon/${entrada.variedad || entrada.id}`);
      const especie = { id: entrada.id, es: entrada.esBase || entrada.es, en: entrada.enBase || entrada.en };
      return await pokemonDesdeAPI(p, especie);
    }

    // 2) Forma especial: Landorus-Therian, Charizard-Mega-X...
    const slug = quitarAcentos(nombre)
      .replace(/[.'’:%]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    try {
      const p = await pedirJSON(`${URL_API}pokemon/${slug}`);
      const idEspecie = Number(p.species.url.split("/").filter(Boolean).pop());
      const entrada = datos.pokemon.find((e) => e.id === idEspecie);
      if (entrada) return await pokemonDesdeAPI(p, entrada);
    } catch (error) {
      // no es un nombre exacto de PokeAPI: probamos con las formas de la especie
    }

    // 3) Nombre distinto en PokeAPI: Darmanitan-Galar -> darmanitan-galar-standard
    const partes = nombre.split("-");
    for (let k = partes.length - 1; k >= 1; k--) {
      const base = buscarPorNombreIngles(datos.pokemon, partes.slice(0, k).join("-"));
      if (!base) continue;

      const info = await obtenerVariedades(base.id);
      // Showdown abrevia o se salta partes que PokeAPI sí pone:
      // "Meowstic-F-Mega" es "meowstic-female-mega" y "Meowstic-Mega" es "meowstic-male-mega".
      // Si no empieza igual, vale la variedad que contenga todos los trozos del nombre.
      const GENEROS = { f: "female", m: "male" };
      const trozos = slug.split("-").map((t) => GENEROS[t] || t);
      const candidato =
        info.lista.find((v) => v.startsWith(slug)) ||
        info.lista.find((v) => trozos.every((t) => v.split("-").includes(t)));
      if (candidato) {
        // pedirVariedad y no pedirJSON: "arceus-fire" no existe como Pokémon en PokeAPI
        const p = await pedirVariedad(candidato);
        return await pokemonDesdeAPI(p, base);
      }
    }

    // 4) Todo junto, como en las copias de seguridad: "LandorusTherian", "meowsticfmega"...
    if (!nombre.includes("-")) {
      const resuelto = await resolverPorId(nombre);
      if (resuelto) return resuelto;
    }
  } catch (error) {
    return null;
  }

  // 5) Quitamos la última parte tras el guion y reintentamos (usa la especie base)
  const partes = nombre.split("-");
  if (partes.length > 1) {
    return resolverPokemon(partes.slice(0, -1).join("-"));
  }
  return null;
}

// Sin guiones: la especie es el nombre más largo por el que empieza ("landorus" +
// "therian") y la forma, la variedad que escrita junta queda igual. Si no hay ninguna
// ("gastrodoneast": en PokeAPI no es otra variedad), la especie base.
async function resolverPorId(nombre) {
  const id = normalizarNombre(nombre);
  let base = null;
  for (const entrada of datos.pokemon) {
    const suyo = normalizarNombre(entrada.en);
    if (id.startsWith(suyo) && (!base || suyo.length > normalizarNombre(base.en).length)) base = entrada;
  }
  if (!base) return null;

  const info = await obtenerVariedades(base.id);
  const GENEROS = { female: "f", male: "m" };
  const formas = [
    (v) => v.replace(/-/g, ""),
    (v) => v.split("-").map((t) => GENEROS[t] || t).join(""),
    (v) => v.split("-").filter((t) => t !== "male").join("") // "meowsticmega" es el macho
  ];
  for (const forma of formas) {
    const candidato = info.lista.find((v) => forma(v) === id);
    if (candidato) return pokemonDesdeAPI(await pedirVariedad(candidato), base);
  }

  const p = await pedirJSON(`${URL_API}pokemon/${base.id}`);
  return pokemonDesdeAPI(p, base);
}

async function resolverAtaque(nombre) {
  let entrada = buscarPorNombreIngles(datos.ataques, nombre);

  // "Hidden Power Fire" o "hiddenpowerfire" -> "Hidden Power"
  if (!entrada && nombre.includes(" ")) {
    entrada = buscarPorNombreIngles(datos.ataques, nombre.split(" ").slice(0, -1).join(" "));
  }
  if (!entrada && normalizarNombre(nombre).startsWith("hiddenpower")) {
    entrada = buscarPorNombreIngles(datos.ataques, "Hidden Power");
  }
  if (!entrada) return null;

  return ataqueDesdeAPI(entrada);
}

// "As One (Glastrier)" y "As One (Spectrier)" se llaman igual en inglés (datos.js)
const HABILIDADES_REPETIDAS = { asoneglastrier: 266, asonespectrier: 267 };

function resolverHabilidad(nombre) {
  const repetida = HABILIDADES_REPETIDAS[normalizarNombre(nombre)];
  if (repetida) return datos.habilidades.find((h) => h.id === repetida) || null;
  return buscarPorNombreIngles(datos.habilidades, nombre);
}

// Los Pokémon del paste ya interpretado, con lo que no se haya reconocido
async function resolverEquipo(interpretado) {
  const problemas = [];
  const lista = interpretado.pokemon.slice(0, MAX_EQUIPO);

  const nuevos = await Promise.all(
    lista.map(async (p) => {
      const resuelto = await resolverPokemon(p.especie);
      if (!resuelto) {
        problemas.push(`Pokémon no reconocido: ${p.especie}`);
        return null;
      }

      resuelto.shiny = p.shiny;
      resuelto.mote = p.mote || null;
      if (generosPosibles(resuelto).includes(p.genero)) resuelto.genero = p.genero;
      if (p.entreno) resuelto.entreno = p.entreno;

      if (p.habilidad) {
        const h = resolverHabilidad(p.habilidad);
        if (h) {
          resuelto.habilidad = { id: h.id, es: h.es, en: h.en };
        } else {
          problemas.push(`Habilidad no encontrada: ${p.habilidad} (${resuelto.es})`);
        }
      }

      if (p.objeto) {
        const o = buscarPorNombreIngles(datos.objetos, p.objeto);
        if (o) {
          resuelto.objeto = { id: o.id, es: o.es, en: o.en };
        } else {
          problemas.push(`Objeto no encontrado: ${p.objeto} (${resuelto.es})`);
        }
      }

      const ataques = await Promise.all(
        p.ataques.map(async (nombreAtaque) => {
          try {
            return await resolverAtaque(nombreAtaque);
          } catch (error) {
            return null;
          }
        })
      );

      ataques.forEach((ataque, i) => {
        if (ataque) {
          resuelto.ataques[i] = ataque;
        } else {
          problemas.push(`Ataque no encontrado: ${p.ataques[i]} (${resuelto.es})`);
        }
      });

      return resuelto;
    })
  );

  if (interpretado.pokemon.length > MAX_EQUIPO) {
    problemas.push(
      `El paste tenía más de ${MAX_EQUIPO} Pokémon: solo se han importado los primeros ${MAX_EQUIPO}.`
    );
  }

  return { validos: nuevos.filter(Boolean), problemas };
}

// Devuelve true si se ha importado, false si no
async function importarPaste(texto) {
  const interpretado = interpretarPaste(texto);

  if (interpretado.pokemon.length === 0) {
    alert("No he encontrado ningún Pokémon en ese texto. Revisa que sea un paste de Showdown.");
    return false;
  }

  if (hayCambiosSinGuardar()) {
    const seguro = confirm(
      "Tienes cambios sin guardar en el equipo actual. ¿Reemplazarlo con el equipo importado?"
    );
    if (!seguro) return false;
  }

  const { validos, problemas } = await resolverEquipo(interpretado);
  if (validos.length === 0) {
    alert("No he podido reconocer ningún Pokémon de ese texto:\n\n• " + problemas.join("\n• "));
    return false;
  }

  reemplazarEquipo(validos, interpretado.nombre, null);
  sumarContador("importar");
  irA("crear");

  if (problemas.length > 0) {
    alert("Equipo importado, pero algunas cosas no se han podido reconocer:\n\n• " + problemas.join("\n• "));
  } else {
    mostrarAviso("Equipo importado ✔");
  }

  return true;
}

// ---------- Varios equipos a la vez ----------
//
// La copia de seguridad de Showdown («Backup/Restore all teams»): cada equipo empieza con
// «=== [gen9] Nombre ===». Con más de uno, se añaden todos a «Mis equipos» sin tocar el
// equipo que se está editando. Los que ya estén (mismo nombre y mismos Pokémon) se saltan.

const CABECERA = /^===.*===\s*$/gm;

function separarEquipos(texto) {
  const limpio = texto.replace(/\r/g, "");
  const inicios = [...limpio.matchAll(CABECERA)].map((m) => m.index);
  return inicios.map((inicio, i) => limpio.slice(inicio, inicios[i + 1]));
}

function firma(nombre, pokemon) {
  return `${nombre}|${pokemon.map((p) => `${p.id}-${p.formaSlug || ""}`).join(",")}`;
}

// Devuelve true si se ha importado alguno
async function importarVarios(trozos, alAvanzar) {
  const yaEstan = new Set(leerGuardados().map((g) => firma(g.nombre, g.pokemon)));
  const nuevos = [];
  const problemas = [];
  let repetidos = 0;

  for (const [i, trozo] of trozos.entries()) {
    alAvanzar(i + 1, trozos.length);
    const interpretado = interpretarPaste(trozo);
    const nombre = interpretado.nombre || "Equipo sin nombre";
    if (interpretado.pokemon.length === 0) continue;

    const { validos, problemas: suyos } = await resolverEquipo(interpretado);
    if (validos.length === 0) {
      problemas.push(`${nombre}: no se ha reconocido ningún Pokémon`);
      continue;
    }
    if (yaEstan.has(firma(nombre, validos))) {
      repetidos++;
      continue;
    }
    yaEstan.add(firma(nombre, validos));
    problemas.push(...suyos.map((problema) => `${nombre}: ${problema}`));
    // La carpeta de Showdown es su grupo (si no lo hay, se crea)
    const grupo = interpretado.carpeta ? grupoConNombre(interpretado.carpeta.replace(/\//g, "-")).id : "";
    nuevos.push({
      id: String(Date.now() + i), nombre, pokemon: copiaProfunda(validos), actualizado: Date.now(),
      ...(grupo ? { grupo } : {})
    });
  }

  if (nuevos.length === 0) {
    alert(
      repetidos
        ? "Esos equipos ya estaban en «Mis equipos»."
        : "No he podido reconocer ningún equipo de ese texto." + (problemas.length ? "\n\n• " + problemas.join("\n• ") : "")
    );
    return false;
  }

  // Los nuevos, los primeros y en el orden del paste
  escribirGuardados([...nuevos, ...leerGuardados()]);
  sumarContador("importar");
  sumarContador("importar-varios");
  irA("equipos");

  const resumen =
    `${nuevos.length} ${nuevos.length === 1 ? "equipo importado" : "equipos importados"}` +
    (repetidos ? ` (${repetidos} ya ${repetidos === 1 ? "estaba" : "estaban"})` : "");
  if (problemas.length > 0) {
    const MAX = 20;
    const lista = problemas.slice(0, MAX).join("\n• ") +
      (problemas.length > MAX ? `\n…y ${problemas.length - MAX} más` : "");
    alert(`${resumen}, pero algunas cosas no se han podido reconocer:\n\n• ${lista}`);
  } else {
    alert(`${resumen} ✔`);
  }
  return true;
}

// Un equipo nuevo en «Mis equipos» a partir de un paste, sin tocar el que se está editando
// (lo usa «Copiar a Mis equipos» de la partida de un locke). Devuelve { problemas }.
export async function anadirEquipoDesdePaste(texto, nombre) {
  const { validos, problemas } = await resolverEquipo(interpretarPaste(texto));
  if (!validos.length) throw new Error("Ningún Pokémon reconocido");
  escribirGuardados([
    { id: String(Date.now()), nombre, pokemon: copiaProfunda(validos), actualizado: Date.now() },
    ...leerGuardados()
  ]);
  sumarContador("importar");
  return { problemas };
}

export function iniciarImportar() {
  const dialogo = document.getElementById("dialogo-importar");
  const texto = document.getElementById("texto-paste");
  const aceptar = document.getElementById("importar-aceptar");

  const abrir = () => {
    texto.value = "";
    dialogo.showModal();
    texto.focus();
  };
  document.getElementById("boton-importar").addEventListener("click", abrir);
  document.getElementById("importar-varios").addEventListener("click", abrir);

  document.getElementById("importar-cancelar").addEventListener("click", () => {
    dialogo.close();
  });

  aceptar.addEventListener("click", async () => {
    if (!texto.value.trim()) return;

    aceptar.disabled = true;
    aceptar.textContent = "Importando...";
    const trozos = separarEquipos(texto.value);
    const terminado = trozos.length > 1
      ? await importarVarios(trozos, (hecho, total) => (aceptar.textContent = `Importando ${hecho}/${total}...`))
      : await importarPaste(texto.value);
    aceptar.disabled = false;
    aceptar.textContent = "Importar";

    if (terminado) dialogo.close();
  });
}
