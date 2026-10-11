import { MAX_EQUIPO, hayCambiosSinGuardar, reemplazarEquipo } from "./estado.js";
import { mostrarAviso } from "./crear.js";
import { datos, buscarPorNombreIngles } from "../comun/datos.js";
import { pedirJSON, URL_API } from "../comun/api.js";
import { obtenerVariedades } from "../comun/formas.js";
import { pokemonDesdeAPI, pedirVariedad, ataqueDesdeAPI } from "../comun/pokemon.js";
import { quitarAcentos } from "../comun/utilidades.js";
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

  texto = texto.replace(/\s*\((M|F)\)\s*$/, "");

  const apodo = texto.match(/^(.*)\s\(([^()]+)\)$/);
  const especie = apodo ? apodo[2] : texto;
  const mote = apodo ? apodo[1].trim() : "";

  return { especie: especie.trim(), mote: mote, objeto: objeto };
}

// Se leen: especie, objeto, habilidad, ataques, Shiny y nivel, naturaleza, EVs e IVs.
// Se ignoran: felicidad, género, teratipo...
function interpretarPaste(texto) {
  let nombre = "";

  // Formato de copia de seguridad: === [gen9ou] Carpeta/Nombre ===
  const cabecera = texto.match(/^===\s*(?:\[[^\]]*\]\s*)?(.*?)\s*===\s*$/m);
  if (cabecera) {
    nombre = cabecera[1].split("/").pop().trim();
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
      habilidad: habilidad,
      shiny: shiny,
      ataques: ataques.slice(0, 4),
      entreno: entrenoDesdeShowdown(lineas.slice(1))
    });
  }

  return { nombre: nombre, pokemon: pokemon };
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
  } catch (error) {
    return null;
  }

  // 4) Quitamos la última parte tras el guion y reintentamos (usa la especie base)
  const partes = nombre.split("-");
  if (partes.length > 1) {
    return resolverPokemon(partes.slice(0, -1).join("-"));
  }
  return null;
}

async function resolverAtaque(nombre) {
  let entrada = buscarPorNombreIngles(datos.ataques, nombre);

  // "Hidden Power Fire" -> "Hidden Power"
  if (!entrada && nombre.includes(" ")) {
    entrada = buscarPorNombreIngles(datos.ataques, nombre.split(" ").slice(0, -1).join(" "));
  }
  if (!entrada) return null;

  return ataqueDesdeAPI(entrada);
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
      if (p.entreno) resuelto.entreno = p.entreno;

      if (p.habilidad) {
        const h = buscarPorNombreIngles(datos.habilidades, p.habilidad);
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

  const validos = nuevos.filter(Boolean);
  if (validos.length === 0) {
    alert("No he podido reconocer ningún Pokémon de ese texto:\n\n• " + problemas.join("\n• "));
    return false;
  }

  if (interpretado.pokemon.length > MAX_EQUIPO) {
    problemas.push(
      `El paste tenía más de ${MAX_EQUIPO} Pokémon: solo se han importado los primeros ${MAX_EQUIPO}.`
    );
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

export function iniciarImportar() {
  const dialogo = document.getElementById("dialogo-importar");
  const texto = document.getElementById("texto-paste");
  const aceptar = document.getElementById("importar-aceptar");

  document.getElementById("boton-importar").addEventListener("click", () => {
    texto.value = "";
    dialogo.showModal();
    texto.focus();
  });

  document.getElementById("importar-cancelar").addEventListener("click", () => {
    dialogo.close();
  });

  aceptar.addEventListener("click", async () => {
    if (!texto.value.trim()) return;

    aceptar.disabled = true;
    aceptar.textContent = "Importando...";
    const terminado = await importarPaste(texto.value);
    aceptar.disabled = false;
    aceptar.textContent = "Importar";

    if (terminado) dialogo.close();
  });
}
