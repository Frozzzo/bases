# Guía del facilitador · Cazadores de cuellos de botella (~90 min)

**Público:** mayoría de developers senior + algunas personas no técnicas.
**Objetivo:** que todos salgan con 3 ideas: (1) la latencia tiene órdenes de magnitud muy distintos, (2) se mide antes de optimizar, (3) una cola sin límite no arregla la sobrecarga: back pressure.

## Antes de la clase (15 min, el día anterior)

- [ ] Desplegar en Vercel con Upstash Redis (ver README) **o** correr `npm run build && npm start` en tu laptop con todos en la misma red.
- [ ] Abrir la portada y comprobar que abajo dice "Almacenamiento: Redis … ✅" (en Vercel). Si aparece un aviso rojo, falta conectar Redis o volver a desplegar.
- [ ] Crear una sala de prueba, unirse desde el celular y enviar un puntaje. Ver que aparece en el ranking.
- [ ] Abrir las diapositivas (.pptx) en el proyector y revisar las notas del orador.
- [ ] Tener dos pestañas: diapositivas y panel del facilitador.

## Equipos

Equipos de 3–4 personas, **mezclando** devs y no devs. Un equipo con alguien no técnico puede jugar en modo Fácil y cambiar a Dev en los retos de código: se guarda el mejor puntaje de cada reto, sin importar el modo.

## Agenda

| Min | Bloque | Qué hacer |
|---|---|---|
| 0–5 | Bienvenida | Formar equipos. Crear la sala y proyectar el código. Que todos se unan mientras hablas. En el panel, deja abierto solo 🍔 Restaurante. |
| 5–20 | Teoría (diapositivas .pptx, 15 slides) | ~1 min por slide. Detente en "A escala humana" y en "Colas". No reveles la mejor configuración del restaurante. |
| 20–35 | 🍔 Restaurante caótico | 12 min de juego + 3 min de debrief. |
| 35–45 | ⚡ Carrera de latencias | 6 min + 4 min de debrief (solo cuenta el primer intento). |
| 45–70 | ⏱️ Optimiza y mide | 20 min + 5 min de debrief. Es el reto central para devs. |
| 70–82 | 🔥 Detective / 🧠 Fuga (extras) | Abre ambos; cada equipo elige. Si van atrasados, sáltalos o déjalos de tarea. |
| 82–90 | Cierre | Podio, 3 aprendizajes, preguntas. |

## Debriefs sugeridos

### 🍔 Restaurante (back pressure)
- Pregunta: *¿quién dejó pasar a todos? ¿qué pasó con los fantasmas 👻?* Con 3 cocineros y "dejar pasar a todos" se cocinan más de 100 platos para nadie.
- Idea clave: **una cola infinita convierte sobrecarga en latencia**; cuando la espera supera el timeout del cliente, casi todo el trabajo se desperdicia.
- Contratar 8 cocineros funciona (~650 pts) pero cuesta. La mejor configuración (1000 pts) usa **6 cocineros con una fila acotada (~25–30) y descartando al que más lleva esperando**; rechazar en la puerta con 7 cocineros y fila ~25 queda muy cerca.
- Para devs: LIFO + revisar deadline (descartar vencidos) rescata mucho cuando no hay límite. Relaciona con HTTP 429/503, timeouts y deadlines propagados (gRPC), reintentos con backoff + jitter.

### ⚡ Latencias
- Muestra la columna "a escala humana". La ida y vuelta a otro continente (150 ms) son **~5 años** si L1 fuera 1 segundo.
- Pregunta: *¿cuántas llamadas de red hace la página de inicio de su producto?*

### ⏱️ Optimiza y mide
- Correos duplicados: O(n²) → Set. Ordenar también sirve (O(n log n)).
- N+1: paralelizar con `Promise.all` o cachear solo da ~×5 (el pool admite 5 consultas). La consulta en lote da ×100+. **Mira el contador de consultas.**
- Copias escondidas: `{...acc}` dentro de reduce es O(n²) disfrazado.
- Las opciones "trampa" del modo fácil (comparar solo 100 vecinos, mostrar "Cliente", redondear) son rápidas pero incorrectas → 0 puntos. Úsalas para decir: **optimizar sin tests de correctitud es peligroso**.
- Si alguien pregunta por qué sus milisegundos difieren de los de otro equipo: el puntaje usa la **aceleración relativa** medida en su propio navegador, no ms absolutos.

### 🔥 Detective
- Hot spot (JSON.parse, mayor self time) ≠ punto de arreglo (getDiscountRules, que lo llama una vez por producto).
- Tras el arreglo, el siguiente cuello es db.query: el profiling es un ciclo.

### 🧠 Fuga
- Fuga = retener memoria que ya no se necesita, no "usar mucha memoria".
- Cachés sin límite, listeners/timers sin limpiar, emisores singleton.

## Cierre (3 ideas para llevarse)
1. Conoce los órdenes de magnitud: red ≫ disco ≫ RAM ≫ caché.
2. Mide, arregla el cuello más grande, vuelve a medir (y verifica que el resultado sigue siendo correcto).
3. Bajo sobrecarga, rechazar pronto (back pressure) es mejor que aceptar todo y fallar tarde.

## Problemas comunes
- **"Sala no encontrada" o "no se pudo enviar el puntaje"** en Vercel: falta Redis o no se volvió a desplegar tras agregarlo (aviso rojo en la portada y en el panel). Los puntajes que fallan quedan guardados en el navegador del equipo y se reenvían solos cuando el servidor responde.
- **Un equipo cerró el navegador**: al volver a la sala desde el mismo navegador sigue siendo el mismo equipo. Desde otro dispositivo tendrán que unirse de nuevo (se crea otro equipo; puedes quitar el viejo con ✕ en el panel).
- **El panel no deja abrir/cerrar retos**: solo funciona en el navegador que creó la sala.
- **Optimiza tarda**: la versión original es lenta a propósito (hasta ~3 s en laptops lentas). Hay un límite de 20 s por medición.
