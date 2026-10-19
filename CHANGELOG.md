# Cambios

## 0.3.0

- Diferenciable de serie: operaciones `param` y `loss`, diferenciación automática en modo inverso y optimizador Adam (`Nexo.learn`, `Nexo.createLearner`).
- `src/synth.js`: descubre fórmulas a partir de datos combinando evolución de la estructura (en islas) y gradiente de las constantes, con escalado lineal y simplificación algebraica.
- `src/raster.js`: dibujo en CPU y PNG sin dependencias; los campos de GPU también se evalúan en CPU.
- `bin/nexo-mcp.js`: servidor MCP con `nexo_spec`, `nexo_verify`, `nexo_run`, `nexo_learn`, `nexo_synthesize` y `nexo_evolve`.
- Nuevos comandos: `render`, `learn` y `synth`. Las entradas aceptan `archivo.json#clave`.
- Ejemplo `aprende` y formas objetivo `corazon`, `estrella` e `infinito`.
- Demo: secciones «Programas que aprenden», «Descubre la fórmula» y «Úsalo desde tu IA».

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
