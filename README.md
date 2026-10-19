# NEXO

**Un lenguaje de programación hecho por IA, para IA.**

Los lenguajes actuales están diseñados para que los lean personas. NEXO no.
Un programa NEXO es un grafo de flujo de datos que viaja en binario: sin
sintaxis, sin parseo, sin ambigüedad. Las personas entendemos el *proyecto*;
el *código* es para las máquinas.

> Estado: prototipo v0.2. Gráficos en CPU y GPU, cálculo numérico, simulación
> con estado y una IA que escribe programas NEXO por evolución.

## Principios

| Principio | Cómo se consigue |
|---|---|
| **Sin parseo** | El formato canónico es binario. El orden de los nodos ya es el orden de ejecución. |
| **Termina siempre** | Un nodo solo usa nodos anteriores; una función solo llama a funciones anteriores (sin recursión). La memoria entre pasos va por un único operador, `prev`. |
| **Rápido por diseño** | Todo valor es un vector. Lo que no depende del tiempo se precalcula al cargar. Los nodos de un mismo nivel son paralelizables. |
| **CPU y GPU, un solo lenguaje** | El verificador sabe si cada valor es escalar, vector o píxel. Lo que es por píxel se compila solo a un shader GLSL. |
| **Seguro por construcción** | No hay strings ejecutables ni `eval`. Un programa solo usa las capacidades que declara (`draw`, `input`). |
| **Una sola forma** | Cada cálculo tiene una representación. Ideal para que una IA genere, compare y mute programas. |

## Qué hay en la v0.2

- **Lenguaje más potente**: condicionales (`lt`, `gt`, `select`), funciones como subgrafos (`call`/`arg`), reducciones (`sum`, `vmin`, `vmax`, `count`), `scan`, `gather`, `pack` y estado entre fotogramas (`prev`).
- **GPU**: `px`, `py` y `shade` describen un campo de color píxel a píxel que se traduce a WebGL.
- **IA que programa sola**: `src/evolve.js` genera programas visuales al azar, los puntúa con criterios estéticos medibles y los evoluciona. En 60 generaciones la nota pasa de unos 0,35 a más de 0,7.
- **Cálculo general**: π por Montecarlo, estadística sobre datos de entrada y simulación física paso a paso.
- **Línea de comandos**: `bin/nexo.js` para ejecutar, inspeccionar, convertir y evolucionar programas.

## Ejemplos

| Programa | Qué hace | Bytes |
|---|---|---|
| `girasol` | Filotaxis con el ángulo áureo | 140 |
| `hilos` | Arte de hilos entre curvas de Lissajous | 155 |
| `nebulosa` | Disco espiral de 1.500 estrellas | 226 |
| `particulas` | 700 partículas con memoria que orbitan un atractor | 434 |
| `aurora` | Aurora calculada en la GPU + estrellas | 322 |
| `pi` | π con 20.000 puntos aleatorios | 85 |
| `estadistica` | Media, desviación, mínimo y máximo de unos datos | 41 |
| `trayectoria` | Tiro parabólico con rozamiento del aire | 187 |

## Uso rápido

```bash
npm test                     # 24 pruebas
npm run examples             # regenera los ejemplos (.json y .nx)
npm run demo                 # empaqueta la demo en demo/index.html

node bin/nexo.js run examples/pi.nx
node bin/nexo.js run examples/estadistica.nx --input 0=examples/datos.json
node bin/nexo.js run examples/trayectoria.nx --steps 1200 --dt 0.005
node bin/nexo.js inspect examples/particulas.nx
node bin/nexo.js evolve --gens 60 --seed 3 --out mio.nx
```

Abre `demo/index.html` en el navegador para verlo todo en marcha.

```js
const Nexo = require('./src/nexo');
const prog = Nexo.decode(bytes);                 // binario → grafo
const c = Nexo.compile(prog, { inputs: [datos] }); // verifica y precalcula
const salida = c.frame(t, dt);                   // un fotograma o un resultado
Nexo.render(ctx, salida, w, h, Nexo.createFieldRenderer()); // dibuja (navegador)
```

## Estructura

```
src/nexo.js        núcleo: operaciones, verificador, binario, intérprete, GLSL
src/builder.js     API para emitir grafos sin escribir texto
src/evolve.js      la IA que escribe programas NEXO
bin/nexo.js        línea de comandos
examples/          programas de ejemplo y datos
demo/              demo web autocontenida
test/              pruebas
SPEC.md            especificación del formato
```

## Hoja de ruta

1. **v0.1** Núcleo visual: vectores, tiempo, círculos y líneas. ✅
2. **v0.2** Funciones, estado, condicionales, reducciones, GPU, evolución y cálculo. ✅
3. **v0.3** Backend WASM y ejecución paralela real por niveles.
4. **v0.4** Un modelo de lenguaje que emite NEXO directamente (sin pasar por texto) y aprende de la nota del verificador.
5. **v0.5** Capacidades de sistema (archivos, red) con permisos explícitos y revisables.
6. Que una IA proponga extensiones del propio lenguaje y el verificador las acepte o rechace.

## Contribuir

Cualquier persona (o IA) es bienvenida. Lee `CONTRIBUTING.md`.

## Licencia

MIT. Ver `LICENSE`.
