// Genera los archivos que la web lleva ya preparados (ver generar-datos.html):
//   datos/nombres.json          -> nombres de Pokémon, ataques, habilidades y objetos
//   datos/pokedex.json          -> la tabla de la Pokédex, con la casilla de cada retrato
//   datos/ataques.json          -> potencia, tipo, categoría y prioridad de los ataques (calculadora)
//   datos/partida-3ds.json      -> PP, habilidades, especies y ataques por nivel (editor de partidas)
//   datos/randomizer.json       -> categoría y precio de cada objeto de gen 5 (randomizer)
//   img/pokedex/retratos-N.webp -> las hojas con los retratos de la Pokédex
//
// Usa el mismo código que la web, así que sale exactamente lo que la web montaría sola.

import { descargarNombresDePokeAPI } from "../js/comun/datos.js";
import { montarPokedexDePokeAPI, RETRATOS, archivoHoja } from "../js/pokedex/datos.js";
import { urlsPMD } from "../js/comun/imagenes.js";
import { montarAtaquesDePokeAPI } from "../js/calculadora/ataques.js";
import { montarDatosEditor } from "../js/partida/datos-editor.js";
import { montarDatosRandomizer } from "../js/randomizer/datos.js";

const estado = document.querySelector(".estado");
const enlaces = document.querySelector(".enlaces");

// Con «?enviar» en la dirección, además de los enlaces se mandan los archivos por POST a
// /subir/<ruta> (lo usa un servidor de pruebas para guardarlos solo)
const ENVIAR = new URLSearchParams(location.search).has("enviar");

// Las mismas direcciones, por orden, que probaba la Pokédex antes de tener la hoja
function direcciones(p) {
  return [
    ...urlsPMD({ id: p.numero, formaPMD: p.forma }),
    ...(p.forma ? urlsPMD({ id: p.numero, formaPMD: 0 }) : [])
  ];
}

function cargarImagen(url) {
  return new Promise((resolver) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // si no, el lienzo no deja sacar la imagen después
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = url;
  });
}

// url -> imagen (o null), para no bajar dos veces el retrato de una especie
const descargadas = new Map();

function imagenDe(url) {
  if (!descargadas.has(url)) descargadas.set(url, cargarImagen(url));
  return descargadas.get(url);
}

async function primeraQueCargue(urls) {
  for (const url of urls) {
    const img = await imagenDe(url);
    if (img) return { url, img };
  }
  return null;
}

// De 30 en 30 para no abrir 1.200 descargas a la vez
async function enTandas(lista, tarea, tamaño = 30) {
  const resultados = [];
  for (let i = 0; i < lista.length; i += tamaño) {
    resultados.push(...(await Promise.all(lista.slice(i, i + tamaño).map(tarea))));
    estado.textContent = `Retratos: ${Math.min(i + tamaño, lista.length)} de ${lista.length}...`;
  }
  return resultados;
}

async function montarHojas(tabla) {
  const encontrados = await enTandas(tabla, (p) => primeraQueCargue(direcciones(p)));

  // Una casilla por imagen distinta: las formas sin retrato propio comparten la de su especie
  const casillas = new Map(); // url -> casilla
  const imagenes = [];
  tabla.forEach((p, i) => {
    const encontrado = encontrados[i];
    if (!encontrado) {
      p.retrato = -1;
      return;
    }
    if (!casillas.has(encontrado.url)) {
      casillas.set(encontrado.url, imagenes.length);
      imagenes.push(encontrado.img);
    }
    p.retrato = casillas.get(encontrado.url);
  });

  // Todas las hojas miden lo mismo (la última se queda con hueco vacío, que no pesa): así
  // el CSS hace la misma cuenta para cualquier casilla
  const { columnas, filasPorHoja, lado } = RETRATOS;
  const porHoja = columnas * filasPorHoja;
  const hojas = [];

  for (let inicio = 0; inicio < imagenes.length; inicio += porHoja) {
    const lienzo = document.createElement("canvas");
    lienzo.width = columnas * lado;
    lienzo.height = filasPorHoja * lado;
    const ctx = lienzo.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    imagenes.slice(inicio, inicio + porHoja).forEach((img, i) => {
      ctx.drawImage(img, (i % columnas) * lado, Math.floor(i / columnas) * lado, lado, lado);
    });

    // Calidad 1 = sin pérdida. toDataURL y no toBlob: toBlob se queda colgado en Edge
    // sin ventana (el que se usa para generarlo solo)
    hojas.push(await (await fetch(lienzo.toDataURL("image/webp", 1))).blob());
  }

  return hojas;
}

async function entregar(ruta, blob) {
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = ruta.split("/").pop();
  enlace.textContent = `${ruta} (${Math.round(blob.size / 1024)} KB)`;
  const item = document.createElement("li");
  item.append(enlace);
  enlaces.append(item);

  if (ENVIAR) await fetch(`/subir/${ruta}`, { method: "POST", body: blob });
}

function json(valor) {
  return new Blob([JSON.stringify(valor)], { type: "application/json" });
}

async function generar() {
  estado.textContent = "Bajando nombres de PokeAPI...";
  const nombres = await descargarNombresDePokeAPI();

  estado.textContent = "Montando la Pokédex...";
  const tabla = await montarPokedexDePokeAPI(nombres.pokemon);

  const hojas = await montarHojas(tabla);

  await entregar("datos/nombres.json", json(nombres));
  await entregar("datos/pokedex.json", json(tabla));
  await entregar("datos/ataques.json", json(await montarAtaquesDePokeAPI()));
  await entregar("datos/partida-3ds.json", json(await montarDatosEditor()));
  await entregar("datos/randomizer.json", json(await montarDatosRandomizer()));
  for (const [numero, hoja] of hojas.entries()) await entregar(archivoHoja(numero), hoja);

  const sinRetrato = tabla.filter((p) => p.retrato < 0).map((p) => p.nombre);
  estado.textContent =
    `Listo: ${tabla.length} Pokémon en la tabla.` +
    (sinRetrato.length ? ` Sin retrato: ${sinRetrato.join(", ")}.` : "");

  if (ENVIAR) await fetch("/fin", { method: "POST", body: estado.textContent });
}

generar().catch((error) => {
  console.error(error);
  estado.textContent = `Ha fallado: ${error.message}`;
  if (ENVIAR) fetch("/fin", { method: "POST", body: `ERROR ${error.message}` });
});
