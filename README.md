# 🕵️‍♀️ Cazadores de cuellos de botella

Juego web por equipos para una clase de ~90 minutos sobre **profiling, latencias, colas y back pressure**.
Pensado para un público mixto: cada reto tiene un modo **🌱 Fácil** (sin programar) y un modo **🧑‍💻 Dev** (con código).

- **Diapositivas de teoría** (15 min): se entregan aparte como archivo .pptx (no están en el repo)
- **Guía del facilitador** con tiempos: [`docs/guia-facilitador.md`](docs/guia-facilitador.md)

## Retos

| Reto | Fácil | Dev |
|---|---|---|
| 🍔 **Restaurante caótico** | Cocineros, tamaño de la fila y qué hacer cuando se llena | + orden FIFO/LIFO, revisión de deadline, p50/p95/p99 y ley de Little |
| ⚡ **Carrera de latencias** | Ordenar 6 operaciones (caché → otro continente) | Ordenar 10 y estimar su orden de magnitud |
| ⏱️ **Optimiza y mide** | Elegir entre arreglos y medirlos de verdad | Editor de JS: arreglar O(n²), N+1 y copias escondidas |
| 🔥 **Detective del flame graph** (extra) | Encontrar la barra más ancha | Total vs self time, punto de arreglo, Amdahl |
| 🧠 **Caza de la fuga de memoria** (extra) | Leer gráficas de memoria | Revisar 8 fragmentos de código + heap snapshot |

Cada reto vale hasta 1000 puntos. "Optimiza y mide" tiene 3 ejercicios y su puntaje es el promedio.
El código de "Optimiza y mide" corre **en el navegador**, dentro de un Web Worker con timeout; se mide la mediana de 3 corridas con datos distintos y se compara el resultado con el de la versión original (rápido pero incorrecto = 0).

## Cómo se juega

1. El facilitador entra a la app y pulsa **Crear sala**. Se abre el panel con el código (p. ej. `K7QM`) y el ranking en vivo para proyectar.
2. Cada equipo entra a la URL, escribe el código y el nombre del equipo, y elige modo Fácil o Dev (se puede cambiar dentro de cada reto).
3. El facilitador abre/cierra retos desde el panel. Se guarda el **mejor** puntaje de cada equipo en cada reto.
4. Los retos tipo cuestionario (latencias, detective, fuga) solo cuentan el **primer intento** dentro de una sala.
5. `/practica` permite jugar cualquier reto sin sala (no guarda puntajes).

El panel del facilitador es solo de quien creó la sala (se guarda una clave en ese navegador). Desde otro navegador se ve el ranking, pero no se puede abrir/cerrar retos.

## Correr en local

Requiere Node 18.18+ (recomendado 20 o 22).

```bash
npm install
npm run dev        # http://localhost:3000
# o en modo producción
npm run build && npm start
```

No necesita base de datos, servicios externos ni variables de entorno.

## Desplegar en Vercel

Importa el repositorio en [vercel.com/new](https://vercel.com/new) y despliega. Framework: Next.js (se detecta solo). No hay que configurar nada más.

### Cómo funciona el estado compartido (sin Redis)

En Vercel las funciones serverless **no comparten memoria**: cada petición puede caer en una instancia distinta, y una instancia nueva empieza vacía. Por eso la "verdad" no vive en el servidor sino en los navegadores:

- Cada equipo guarda en su navegador (`localStorage`) su equipo y sus mejores puntajes, y los reenvía en cada sincronización.
- El panel del facilitador guarda la configuración de la sala (retos abiertos, equipos quitados) y una **copia de respaldo de todo el ranking**, y también la reenvía.
- Todos sincronizan con `POST /api/salas/<código>` cada 2–2,5 s. El servidor fusiona lo recibido (unión de equipos, máximo por puntaje; un equipo quitado no vuelve) y devuelve el estado. Si una instancia es nueva o se reinició, en uno o dos ciclos vuelve a tener el ranking completo.
- Solo el navegador que creó la sala puede abrir/cerrar retos o quitar equipos (tiene una clave que nunca se muestra).

**Lo que hay que saber (el precio de no tener base de datos):**

- **Deja abierto el panel del facilitador** durante la clase: es la copia de respaldo. Si se cierra, los equipos con la pestaña abierta siguen reenviando sus puntajes, pero los de equipos que ya cerraron su pestaña pueden desaparecer del ranking en una instancia nueva hasta que vuelvan a entrar.
- El ranking puede tardar **unos segundos** en mostrar un puntaje nuevo.
- Si el facilitador borra los datos del navegador o cambia de computador, pierde el control de la sala (crea una nueva).

Es más que suficiente para una clase de ~20 equipos. Con 20 equipos son ~8 peticiones/s, cada una de pocos KB.

### Si los equipos ven "Sin conexión con el servidor"

Sus puntajes están guardados en su navegador y se reenvían solos al reconectar; no hay que hacer nada. Al unirse, si el panel del facilitador no está abierto, la portada avisa ("No encontramos al facilitador…") y permite entrar igual.

## Estructura

```
app/                  Páginas (Next.js App Router) y API (/api/salas…)
components/challenges Un componente por reto
lib/store.ts          Fusión del estado de salas en memoria del servidor
lib/client.ts         Estado local en el navegador y sincronización
lib/sim/restaurante.ts Simulación determinista de colas
lib/optimiza.ts       Ejercicios de "Optimiza y mide" y arreglos del modo fácil
lib/runner.ts         Ejecuta código en un Web Worker con timeout
scripts/              Calibración del restaurante y verificación de ejercicios
docs/                 Guía del facilitador
```

Scripts de verificación (Node 22+):

```bash
node --experimental-strip-types scripts/tune-restaurante.ts   # busca la mejor configuración del restaurante
node --experimental-strip-types scripts/check-optimiza.ts     # comprueba que los arreglos fáciles sean correctos/incorrectos como se espera
```
