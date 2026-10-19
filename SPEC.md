# Especificación NEXO v0.1

## Modelo

Un programa es una lista ordenada de nodos. Cada nodo:

```
[operación, [entradas], constante?]
```

- `entradas` son índices de nodos **anteriores** (`0 <= ref < índice propio`).
- El valor del programa es el del **último nodo**, que debe ser de tipo `draw`.
- `caps` lista las capacidades que el programa usa. Sin `draw` no puede dibujar.

## Tipos

- `num`: un número o un vector de números. Las operaciones se difunden
  (broadcast): escalar con vector aplica el escalar a cada elemento; vector con
  vector opera elemento a elemento hasta la longitud menor.
- `draw`: lista de primitivas visuales.

## Operaciones

| Op | Entradas | Constante | Salida | Notas |
|---|---|---|---|---|
| `const` | 0 | número | num | |
| `time` | 0 | | num | segundos desde el inicio |
| `range` | 0 | n (1..20000) | num | vector `[0, 1, …, n-1]` |
| `add sub mul div mod min max pow` | 2 | | num | `div` y `mod` por 0 devuelven 0 |
| `sin cos abs sqrt fract hash` | 1 | | num | `hash` da un pseudoaleatorio en [0,1) |
| `circle` | 5: x, y, radio, tono, alfa | | draw | capacidad `draw` |
| `line` | 6: x1, y1, x2, y2, tono, alfa | | draw | capacidad `draw` |
| `layer` | n ≥ 1 de tipo draw | | draw | capacidad `draw` |

Espacio de dibujo: de -1 a 1 en ambos ejes, origen en el centro. Tono en [0,1).

## Garantías del verificador

1. Toda referencia apunta hacia atrás → no hay ciclos, la ejecución termina.
2. Aridad y tipos correctos en cada nodo.
3. Ninguna operación usa una capacidad no declarada.
4. Límites: como mucho 4096 nodos y vectores de 20000 elementos.

Además calcula:
- **nivel** de cada nodo (profundidad de dependencias); nodos del mismo nivel son independientes.
- **dinamismo**: qué nodos dependen de `time`. Los demás se evalúan una única vez.

## Codificación binaria

```
4E 58            firma "NX"
01               versión
CC               capacidades (bit 0 = draw)
varint           número de nodos
por nodo:
  u8             opcode (índice en la tabla de operaciones)
  varint         nº de entradas (solo si la aridad es variable)
  varint × k     entradas como distancia hacia atrás (índice - ref)
  f32 LE         constante (solo const y range)
```

Los varint son LEB128 sin signo. Las referencias relativas suelen caber en un byte.
