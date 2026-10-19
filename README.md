# NEXO

**Un lenguaje de programación hecho por IA, para IA.**

Los lenguajes actuales están diseñados para que los lean personas. NEXO no.
Un programa NEXO es un grafo de flujo de datos que viaja en binario: sin
sintaxis, sin parseo, sin ambigüedad. Corre en CPU y GPU, aprende por sí mismo
y lo pueden usar directamente otras IAs. Las personas entendemos el
*proyecto*; el *código* es para las máquinas.

> Estado: prototipo v0.3.

## Lo que hace único a NEXO

| | |
|---|---|
| **Sin texto** | El formato canónico es binario. No hay parseo; el orden de los nodos ya es el orden de ejecución. |
| **Termina siempre** | Un nodo solo usa nodos anteriores; una función solo llama a funciones anteriores. La memoria entre pasos va por un único operador, `prev`. |
| **Aprende de serie** | Todo programa es diferenciable. Se marcan constantes como `param` y un objetivo como `loss`, y el propio lenguaje calcula los gradientes y se ajusta. |
| **Lleva su objetivo dentro** | Un programa no solo dice qué calcular, también qué quiere conseguir. |
| **Descubre fórmulas** | Con unos datos, busca la estructura por evolución y las constantes por gradiente hasta dar con la fórmula. |
| **CPU y GPU, un solo lenguaje** | El verificador sabe si cada valor es escalar, vector o píxel. Lo que es por píxel se compila solo a GLSL. |
| **Hecho para que lo usen IAs** | Un servidor MCP deja que Claude u otra IA lean la especificación, escriban programas, los vean como imagen y los hagan aprender. |
| **Seguro por construcción** | Sin strings ejecutables ni `eval`. Un programa solo usa las capacidades que declara (`draw`, `input`). |

## Úsalo desde tu IA (MCP)

Con Claude Code:

```bash
claude mcp add nexo -- node /ruta/a/ai-code/bin/nexo-mcp.js
```

Con Claude Desktop, en su archivo de configuración:

```json
{
  "mcpServers": {
    "nexo": { "command": "node", "args": ["/ruta/a/ai-code/bin/nexo-mcp.js"] }
  }
}
```

Herramientas que expone:

| Herramienta | Qué hace |
|---|---|
| `nexo_spec` | Devuelve la especificación en JSON para que la IA aprenda el lenguaje. |
| `nexo_verify` | Verifica un programa y devuelve su binario en base64. |
| `nexo_run` | Ejecuta. Si calcula, devuelve números; si dibuja, devuelve un PNG para que la IA lo vea. |
| `nexo_learn` | Ajusta los `param` minimizando los `loss`. |
| `nexo_synthesize` | Descubre una fórmula y = f(x) a partir de datos. |
| `nexo_evolve` | Evoluciona desde cero un programa visual. |

No necesita dependencias: solo Node.js 18 o superior.

## Ejemplos

| Programa | Qué hace | Bytes |
|---|---|---|
| `girasol` | Filotaxis con el ángulo áureo | 140 |
| `hilos` | Arte de hilos entre curvas de Lissajous | 155 |
| `nebulosa` | Disco espiral de 1.500 estrellas | 226 |
| `particulas` | 700 partículas con memoria que orbitan un atractor | 434 |
| `aurora` | Aurora calculada en la GPU + estrellas | 322 |
| `aprende` | Curva de 26 coeficientes que aprende a calcar una forma | 489 |
| `pi` | π con 20.000 puntos aleatorios | 85 |
| `estadistica` | Media, desviación, mínimo y máximo de unos datos | 41 |
| `trayectoria` | Tiro parabólico con rozamiento del aire | 187 |

## Línea de comandos

```bash
npm test                                   # 32 pruebas
npm run demo                               # empaqueta la demo en demo/index.html

node bin/nexo.js run examples/pi.nx
node bin/nexo.js render examples/aurora.nx aurora.png --t 2
node bin/nexo.js learn examples/aprende.json corazon.nx \
     --input 0=examples/corazon.json#x --input 1=examples/corazon.json#y
node bin/nexo.js synth datos.json          # {"x": [...], "y": [...]}
node bin/nexo.js evolve --gens 60 --seed 3 --out mio.nx
node bin/nexo.js inspect examples/particulas.nx
```

## Desde JavaScript

```js
const Nexo = require('./src/nexo');
const prog = Nexo.decode(bytes);                    // binario → grafo
const c = Nexo.compile(prog, { inputs: [datos] });  // verifica y precalcula
const salida = c.frame(t, dt);                      // un fotograma o un resultado

const { program, loss } = Nexo.learn(prog, { inputs, steps: 300 }); // aprender
const { formula } = require('./src/synth').synthesize({ x, y });     // descubrir
const png = require('./src/raster').renderPNG(prog, { t: 1 });       // ver
```

## Estructura

```
src/nexo.js        núcleo: operaciones, verificador, binario, intérprete,
                   diferenciación automática, optimizador y GLSL
src/builder.js     API para emitir grafos sin escribir texto
src/evolve.js      la IA que escribe programas visuales por evolución
src/synth.js       descubrimiento de fórmulas (evolución + gradiente)
src/raster.js      dibujo en CPU y PNG sin dependencias
bin/nexo.js        línea de comandos
bin/nexo-mcp.js    servidor MCP para IAs
examples/          programas de ejemplo y datos
demo/              demo web autocontenida
test/              pruebas
SPEC.md            especificación del formato
```

## Hoja de ruta

1. **v0.1** Núcleo visual. ✅
2. **v0.2** Funciones, estado, condicionales, reducciones, GPU, evolución y cálculo. ✅
3. **v0.3** Diferenciable de serie, descubrimiento de fórmulas, dibujo sin navegador y servidor MCP. ✅
4. **v0.4** Funciones direccionadas por contenido (una huella en lugar de un nombre) y una biblioteca compartida entre IAs.
5. **v0.5** Backend WASM y ejecución paralela real por niveles.
6. **v0.6** Capacidades de sistema (archivos, red) con permisos explícitos y revisables.
7. Que una IA proponga extensiones del propio lenguaje y el verificador las acepte o rechace.

## Contribuir

Cualquier persona (o IA) es bienvenida. Lee `CONTRIBUTING.md`.

## Licencia

MIT. Ver `LICENSE`.
