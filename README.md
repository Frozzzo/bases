# 🕵️‍♀️ Cazadores de cuellos de botella

Juego web por equipos para una clase de ~90 minutos sobre **profiling, latencias, colas y back pressure**.
Pensado para un público mixto: cada reto tiene un modo **🌱 Fácil** (sin programar) y un modo **🧑‍💻 Dev** (con código).

- **Diapositivas de teoría** (15 min): `/teoria`
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

Sin configurar nada, las salas viven **en la memoria del servidor**. Es suficiente para jugar en local o en la red de la sala de clases (los equipos entran a `http://<tu-ip>:3000`). Si reinicias el servidor, las salas se pierden.

## Desplegar en Vercel

1. Importa el repositorio en [vercel.com/new](https://vercel.com/new). Framework: Next.js (se detecta solo). No hay que cambiar comandos.
2. **Conecta Redis para el estado compartido** (necesario en Vercel: las funciones serverless no comparten memoria entre instancias):
   - En el proyecto de Vercel: **Storage → Create Database → Upstash for Redis** (Marketplace) y conéctala al proyecto. Vercel crea las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` automáticamente.
   - O bien crea una base gratis en [upstash.com](https://upstash.com) y agrega a mano `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en **Settings → Environment Variables**.
3. Vuelve a desplegar (Deployments → Redeploy) para que tome las variables.
4. Abre la app: abajo en la portada dice **"Almacenamiento: Redis (compartido)"**. Si dice "memoria del servidor" en Vercel, aparece un aviso amarillo: revisa las variables.

### Variables de entorno

| Variable | Para qué |
|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Credenciales REST de Upstash/Vercel KV (las crea la integración de Vercel) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Alternativa equivalente si creas la base en upstash.com |

Ver [`.env.example`](.env.example). Sin variables → modo memoria. No se necesitan otras dependencias: se habla con Upstash por su API REST con `fetch`.

### Cómo funciona el estado compartido

- Cada sala son 3 claves en Redis (`sala:<código>:meta`, `:equipos`, `:puntajes`) que expiran a las 48 h.
- El mejor puntaje se guarda de forma atómica con un pequeño script Lua (no se pierden puntajes con envíos simultáneos).
- Los clientes consultan `GET /api/salas/<código>` cada 2–3 s (**polling**), que funciona en cualquier hosting serverless sin WebSockets. Con 15 equipos son ~6 peticiones/s, muy por debajo del plan gratuito de Upstash para una clase.

## Estructura

```
app/                  Páginas (Next.js App Router) y API (/api/salas…)
app/teoria/           Diapositivas de teoría
components/challenges Un componente por reto
lib/store.ts          Estado de salas (Redis REST o memoria)
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
