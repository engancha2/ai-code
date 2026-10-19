# NEXO

**Un lenguaje de programación hecho por IA, para IA.**

Los lenguajes actuales están diseñados para que los lean personas. NEXO no.
Un programa NEXO es un grafo de flujo de datos que viaja en binario: sin
sintaxis, sin parseo, sin ambigüedad. Las personas entendemos el *proyecto*;
el *código* es para las máquinas.

> Estado: prototipo v0.1. El primer dominio es visual (generar gráficos
> animados). El cálculo general y el acceso al sistema llegarán después.

## Principios

| Principio | Cómo se consigue |
|---|---|
| **Sin parseo** | El formato canónico es binario. El orden de los nodos ya es el orden de ejecución. |
| **Termina siempre** | Un nodo solo puede referirse a nodos anteriores. Los ciclos no se pueden expresar. |
| **Rápido por diseño** | Todo valor es un vector. Lo que no depende del tiempo se precalcula al cargar. Los nodos de un mismo nivel son paralelizables. |
| **Seguro por construcción** | No hay strings ejecutables ni `eval`. Un programa solo puede usar las capacidades que declara (`draw` por ahora). |
| **Una sola forma** | Cada cálculo tiene una representación. Ideal para que una IA genere, compare y mute programas. |

## Ejemplo

Lo que circula entre máquinas (girasol, 139 bytes):

```
4e 58 01 01 25 01 02 00 00 61 44 00 ...
```

El *andamio humano* (JSON) del mismo programa, solo para depurar:

```json
{"nexo":1,"caps":["draw"],"nodes":[["time",[]],["range",[],900],["const",[],900],["div",[1,2]], ...]}
```

## Uso rápido

```bash
node examples/generate.js   # genera los programas de ejemplo (.json y .nx)
node test/nexo.test.js      # pruebas
node demo/build.js          # empaqueta la demo en demo/index.html
```

Abre `demo/index.html` en el navegador para verlo en marcha.

```js
const Nexo = require('./src/nexo');
const prog = Nexo.decode(bytes);        // binario → grafo
const { plan, frame } = Nexo.compile(prog); // verifica y precalcula
Nexo.render(ctx, frame(t), w, h);       // dibuja un fotograma
```

## Estructura

```
src/nexo.js        núcleo: operaciones, verificador, binario, intérprete
src/builder.js     API para emitir grafos sin escribir texto
examples/          programas de ejemplo
demo/              demo web autocontenida
test/              pruebas
SPEC.md            especificación del formato
```

## Hoja de ruta

1. **v0.1** Núcleo visual: vectores, tiempo, círculos y líneas. ✅
2. **v0.2** Más primitivas visuales (polígonos, gradientes, campos por píxel en GPU).
3. **v0.3** Cálculo general: reducciones, condicionales vectoriales, funciones como subgrafos.
4. **v0.4** Backend WebGPU/WASM: los niveles paralelos se ejecutan de verdad en paralelo.
5. **v0.5** Capacidades de sistema (archivos, red) con permisos explícitos y revisables.
6. Que una IA proponga extensiones del propio lenguaje y el verificador las acepte o rechace.

## Contribuir

Cualquier persona (o IA) es bienvenida. Lee `CONTRIBUTING.md`.

## Licencia

MIT. Ver `LICENSE`.
