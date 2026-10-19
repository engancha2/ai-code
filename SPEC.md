# Especificación NEXO v0.2

## Modelo

Un programa tiene funciones opcionales y un cuerpo principal. Cada cuerpo es
una lista ordenada de nodos:

```
[operación, [entradas], constante?]
```

```json
{ "nexo": 2, "caps": ["draw"], "funcs": [{ "nodes": [...] }], "nodes": [...] }
```

- `entradas` son índices de nodos **anteriores** del mismo cuerpo.
- La salida de un cuerpo es su **último nodo**.
- La salida del programa puede ser `draw` (un fotograma) o `num` (un resultado).
- `caps` lista las capacidades que se usan: `draw` y/o `input`.

## Funciones

- Dentro de una función, `arg` (constante = índice) lee un argumento.
- `call` (entradas = argumentos, constante = índice de función) la invoca.
- Una función **solo puede llamar a funciones con índice menor**, así que no hay recursión.
- Al compilar, las llamadas se expanden en línea. La expansión está limitada a 65.536 nodos.
- `prev` no se permite dentro de funciones.

## Estado

`prev` (constante = índice de un nodo del cuerpo principal) devuelve el valor
que ese nodo tuvo en el fotograma anterior, o 0 en el primero. Es la única
referencia que puede apuntar hacia delante. No crea ciclos dentro de un
fotograma, así que cada paso sigue terminando.

## Formas

| Forma | Significado |
|---|---|
| `s` | escalar |
| `v` | vector (operaciones elemento a elemento, hasta la longitud menor) |
| `p` | píxel: se evalúa en la GPU, una vez por píxel |
| `d` | dibujo |

Reglas: no se mezclan `v` y `p`; las reducciones, `scan`, `gather` y `pack` no
aceptan `p`; `circle` y `line` no aceptan `p`; `shade` no acepta `v`.

## Operaciones

| Op | Entradas | Constante | Notas |
|---|---|---|---|
| `const` | 0 | número | |
| `time` · `frame` · `dt` | 0 | | segundos, nº de fotograma, paso de tiempo |
| `range` | 0 | n (1..20000) | vector `[0 … n-1]` |
| `input` | 0 | ranura (0..15) | datos del anfitrión; capacidad `input` |
| `add sub mul div mod min max pow atan2 lt gt` | 2 | | `div`/`mod` por 0 → 0; `lt`/`gt` → 0 o 1 |
| `sin cos abs sqrt fract hash floor exp` | 1 | | `hash` → pseudoaleatorio en [0,1) |
| `select` | 3: cond, a, b | | `cond > 0 ? a : b` |
| `mix` | 3: a, b, t | | `a + (b − a)·t` |
| `sum vmin vmax count` | 1 | | reducen un vector a escalar |
| `scan` | 1 | | suma acumulada |
| `gather` | 2: v, índices | | `v[índice]` con índice circular |
| `pack` | n escalares | | crea un vector |
| `prev` | 0 | nodo | valor del fotograma anterior |
| `call` / `arg` | n / 0 | función / índice | funciones |
| `px` · `py` | 0 | | coordenadas del píxel |
| `circle` | 5: x, y, radio, tono, alfa | | capacidad `draw` |
| `line` | 6: x1, y1, x2, y2, tono, alfa | | capacidad `draw` |
| `shade` | 3: tono, luz, alfa | | campo de color en la GPU; capacidad `draw` |
| `layer` | n dibujos | | apila dibujos en orden |

Espacio de dibujo: de −1 a 1, origen en el centro, y hacia abajo. Tono en [0,1).

## Garantías del verificador

1. Toda referencia apunta hacia atrás salvo `prev`, y no hay recursión: cada paso termina.
2. Aridad, tipos (`num`/`draw`) y formas correctos.
3. Ninguna operación usa una capacidad no declarada.
4. Límites: 4.096 nodos por cuerpo, 256 funciones, 65.536 nodos expandidos, vectores de 20.000 y 64 valores enviados a cada shader.

También calcula el **nivel** de cada nodo (los del mismo nivel son
independientes) y qué nodos son **dinámicos**; el resto se evalúa una sola vez.

## Codificación binaria (versión 2)

```
4E 58            firma "NX"
02               versión
CC               capacidades (bit 0 = draw, bit 1 = input)
varint           número de funciones
[cuerpo] × funciones
cuerpo           programa principal

cuerpo:
  varint         número de nodos
  por nodo:
    u8           opcode (índice en la tabla de operaciones)
    varint       nº de entradas (solo si la aridad es variable)
    varint × k   entradas como distancia hacia atrás (índice − ref)
    f32 LE       constante (solo las operaciones que la usan)
```

Los varint son LEB128 sin signo. Los opcodes nunca se reordenan: los
programas de la versión 1 se siguen leyendo (no tienen sección de funciones).
