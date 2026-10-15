# LockeDex

Web de fans para jugar Nuzlockes con amigos: equipos, rutas, level caps, Pokédex y marcador de lockes.

Enlace: https://alfiedpg.github.io/LockeDex/

Créditos, aviso legal y privacidad: [legal.html](legal.html). Web sin ánimo de lucro, no afiliada
a Nintendo, Creatures Inc., GAME FREAK inc. ni The Pokémon Company.

## Carga rápida

- `datos/nombres.json`, `datos/pokedex.json` y `img/pokedex/retratos-N.webp` van ya preparados
  para no tener que bajar y procesar los CSV de PokeAPI. Se rehacen abriendo
  `herramientas/generar-datos.html` desde la web (solo hace falta si salen Pokémon nuevos).
  Los retratos son de [SpriteCollab](https://github.com/PMDCollab/SpriteCollab) (CC BY-NC 4.0).
- `sw.js` guarda en el navegador las imágenes y datos de GitHub y PokeAPI, que si no
  caducan a los 5 minutos.
- Firestore guarda en el navegador perfiles, amistades y lockes, que salen al momento al entrar.
