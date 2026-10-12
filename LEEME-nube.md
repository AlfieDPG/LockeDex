# Guardar los datos en la nube

Mientras no hagas esto, la web funciona exactamente igual que antes: todo se guarda en el
navegador y el cajón de sesión del panel lateral ni siquiera aparece. No hay prisa y no se
rompe nada.

Son unos diez minutos. Todo es gratis y sin tarjeta.

## 1. Crear el proyecto

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto**. Ponle el nombre que quieras (por ejemplo `pokelocke`).
3. Cuando pregunte por Google Analytics, dile que no. No hace falta.

## 2. Encender el inicio de sesión con Google

1. En el menú de la izquierda: **Compilación → Authentication → Comenzar**.
2. Pestaña **Sign-in method** → **Google** → activar → elige un correo de contacto → **Guardar**.
3. Pestaña **Settings → Authorized domains → Add domain**: añade `alfiedpg.github.io`.
   `localhost` ya viene puesto, así que para probar en tu ordenador no hay que tocar nada.
4. Para las cuentas con usuario y contraseña (sin Google): **Sign-in method → Agregar
   proveedor nuevo → Correo electrónico/contraseña** → activar solo la primera opción →
   **Guardar**. Por dentro, el usuario «Pepe» es el correo inventado `pepe@pokely.invalid`
   (ver `js/comun/nube.js`); por eso esas cuentas no pueden recuperar la contraseña. Se
   queda `pokely` (el nombre antiguo) aunque la web se llame LockeDex: si cambiase, las
   cuentas que ya existen no podrían entrar.
5. Si la web cambia de dirección (otro nombre de repositorio o un dominio propio), hay que
   añadir la nueva en **Authorized domains**. Si no, no deja iniciar sesión.

## 3. Crear la base de datos

1. **Compilación → Firestore Database → Crear base de datos**.
2. Elige **modo de producción** (el de prueba deja entrar a cualquiera).
3. Región: `eur3 (europe-west)`.

## 4. Pegar las reglas

1. Dentro de Firestore Database, pestaña **Reglas**.
2. Borra lo que haya y pega **todo** el contenido del archivo `firestore.rules` de este repositorio.
3. **Publicar**.

> Este paso no es opcional. Sin él, cualquiera que abra la web puede leer y borrar los
> datos de todos.

> **Y hay que repetirlo cada vez que cambie `firestore.rules`.** La consola no se entera
> de que el archivo del repositorio ha cambiado: eso se pega a mano. Si «Amigos» o
> «Lockes» dan error de permisos, es que falta este paso.

## 5. Copiar la configuración

1. Vete a la pantalla de inicio del proyecto (**Descripción general del proyecto**, arriba
   del todo a la izquierda).
2. En el centro hay una fila de iconos de plataforma bajo *«Comienza agregando Firebase a
   tu app»*. Pulsa el de web, **`</>`**. Si ya tienes alguna app creada, ahí pondrá
   **Agregar app**.
3. Apodo: `pokelocke-web`. **No** marques Firebase Hosting. **Registrar app**.
4. Te enseña un bloque `firebaseConfig`. Copia esos cuatro valores a
   `js/comun/firebase-config.js`:

```js
export const CONFIG_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "pokelocke-xxxx.firebaseapp.com",
  projectId: "pokelocke-xxxx",
  appId: "1:123...:web:abc..."
};
```

Sube el cambio a GitHub y ya está: aparece el botón **Iniciar sesión** abajo del panel lateral.

Para volver a consultar esos valores más adelante: rueda dentada → **Configuración del
proyecto** → pestaña **General** → abajo, **Tus apps**. Esa sección solo tiene algo una vez
has registrado la app en este paso.

Estos datos **no son secretos**. Van en el JavaScript, a la vista de cualquiera, y así tiene
que ser. Lo que protege tus datos son las reglas del paso 4.

## Dos cosas distintas que no se mezclan

### 1. Lo tuyo: copia de lo que hay en el navegador

Equipos guardados, equipo en edición, rutas marcadas, combates superados, multiplicador,
los juegos elegidos y «Mis normas». La lista está en `CLAVES_SINCRONIZADAS` (`js/comun/almacen.js`), va a
`usuarios/{uid}/datos/{clave}` y **nadie más que tú puede leerlo**.

El navegador sigue mandando: `leer()` y `escribir()` son inmediatos y la nube solo guarda
una copia. Por eso la web funciona igual sin conexión y sin haber iniciado sesión.

- Al iniciar sesión se compara fecha a fecha. Para cada cosa gana la más reciente, venga del
  navegador o de la nube. Si la nube traía algo más nuevo, la página se recarga sola.
- A partir de ahí, cada cambio se sube un segundo después.
- Al **cerrar sesión** se borra todo eso de este navegador (antes se sube lo pendiente): queda
  solo en tu cuenta y vuelve al entrar.
- **Si tocas lo mismo en dos sitios a la vez, gana el último que guarde.** No hay mezcla fina:
  si cambias un equipo en el móvil y otro en el PC sin recargar, uno pisa al otro. Esto solo
  pasa con **tu misma cuenta** abierta en dos aparatos; entre cuentas distintas no hay
  manera de que una toque a la otra.

**No** se sincronizan las cachés de Pokémon y objetos descargados de PokeAPI: cada navegador
las rehace solo y solo servirían para gastar cuota.

### 2. Lo compartido: perfiles, amigos y lockes

`perfiles/{uid}`, `amistades/{par}` y `lockes/{id}` (`js/comun/perfiles.js` y
`js/comun/lockes.js`). Esto **no** pasa por el navegador: se lee y se escribe directo en
Firestore. Un amigo o un marcador compartido es un dato de dos personas, así que guardar una
copia local volvería a plantear quién pisa a quién.

| Colección | Quién la ve | Quién la escribe |
| --- | --- | --- |
| `perfiles/{uid}` | cualquiera con sesión, de uno en uno (sin lista) | solo su dueño; sin correo |
| `motes/{mote}` | cualquiera (para ver si está libre) | solo su dueño; uno por persona |
| `correos/{correo}` | cualquiera con sesión que sepa el correo entero | solo su dueño (el correo de su Google) |
| `presencia/{uid}` | cualquiera con sesión | solo su dueño (la hora la pone el servidor) |
| `amistades/{par}` | los dos implicados | los dos implicados |
| `lockes/{id}` | los que juegan ese locke | cada uno sus vidas, victorias, muertos y respuesta; el creador el resto |
| `lockes/{id}/actividad` | los que juegan ese locke | cada uno lo suyo; el creador lo borra al borrar el locke |

Las tres están escuchadas en vivo (`onSnapshot`): si tu rival quita una vida desde su móvil,
a ti te cambia en pantalla al momento, y en cuanto alguien te acepta como amigo te sale su
ficha sin recargar.

### Invitaciones

Nadie entra en tu lista ni en un locke tuyo sin querer:

- **Amigos.** Metes su mote o su correo de Google → le llega una solicitud → cuando la acepta, os
  salís el uno en la lista del otro. Hasta entonces en «Amigos» solo estás tú.
- **Lockes.** Quien lo crea elige a los invitados, y puede no invitar a nadie: un locke
  para ti solo vale igual. Los invitados salen como «Sin contestar» hasta que entran, y el
  locke no aparece en su «Lockes» hasta que lo aceptan. Rechazar es salirse: se quita el
  uid de `jugadores` y deja de poder verlo.

Las dos cosas llegan al **buzón** del panel lateral, con un número encima cuando hay algo
pendiente. Está ahí y no dentro de «Amigos» a propósito: una invitación puede llegarte
mientras montas un equipo.

Los invitados van también dentro de `jugadores` desde el principio, aunque no hayan
contestado. Si no, las reglas no les dejarían ni leer la invitación. Quién ha aceptado está
en `estados`.

Al elegir ganador, el +1 del palmarés **no lo escribe quien cierra el locke**: las reglas
solo dejan que cada uno escriba su propio perfil. Lo apunta el navegador del ganador en
cuanto abre la web, y el locke se queda marcado en `contado` para no sumarlo dos veces.
Se hace así a propósito, porque las Cloud Functions piden plan de pago.

### Tipos de locke

Cada persona tiene los suyos en su perfil (`tipos`), con nombre y color. Los tres de
siempre —Locke, Megalocke, Bebelocke— son solo el punto de partida: se pueden renombrar,
recolorear, quitar o añadir otros desde el botón de la etiqueta en tu propia ficha.

Cada locke ganado se queda con una **copia** del tipo, no con una referencia. Así renombrar
un tipo no reescribe la historia.

## Límites del plan gratuito

50.000 lecturas y 20.000 escrituras al día, 1 GiB de datos, y sesión gratis hasta 50.000
usuarios al mes. Si se pasa, no cobra: deja de responder hasta el día siguiente.

Lo que más gasta es el punto de «conectado» (`js/comun/presencia.js`): una escritura cada
3 minutos por persona con la web a la vista (escondida no cuenta). Da para unas 1.000 horas
de gente conectada al día.

## Borrar una cuenta

Desde la web: tu nombre → **Borrar mi cuenta**. Pide otra vez la contraseña (o Google),
porque Firebase solo deja borrar una cuenta recién entrada, y borra perfil, mote, correo,
presencia, datos, amistades y la cuenta; de los lockes compartidos se sale (los que creó y
nadie más había aceptado se borran).

El plan gratis de Firebase (Spark) **no pausa el proyecto** por no usarlo, que es justo por
lo que no elegimos Supabase.
