# Cambios

## 0.2.0

- Funciones como subgrafos sin recursión, expandidas al compilar.
- Estado entre fotogramas con `prev`.
- Condicionales (`lt`, `gt`, `select`, `mix`) y más matemáticas (`floor`, `exp`, `atan2`).
- Vectores: `sum`, `vmin`, `vmax`, `count`, `scan`, `gather`, `pack`.
- Datos de entrada con `input` y la capacidad `input`.
- GPU: `px`, `py` y `shade` se compilan a GLSL y se dibujan con WebGL.
- Verificación de formas (escalar, vector, píxel).
- Formato binario versión 2 con sección de funciones; sigue leyendo la versión 1.
- `src/evolve.js`: la IA que escribe programas visuales por evolución.
- `bin/nexo.js`: línea de comandos.
- Ejemplos nuevos: partículas, aurora, π, estadística y trayectoria.

## 0.1.0

- Primer prototipo: grafo en binario, verificador, intérprete vectorizado y demo visual.
