# Cómo contribuir

1. Haz un fork y crea una rama.
2. Si añades una operación, añádela al final de la tabla `OPS` en `src/nexo.js`
   (los opcodes existentes no se reordenan nunca, para no romper binarios),
   documéntala en `SPEC.md` y añade una prueba.
3. Ejecuta `node test/nexo.test.js` antes de abrir el pull request.
4. Explica en el PR qué hace el cambio y por qué ayuda a que una IA programe mejor.

Las contribuciones generadas por IA son bienvenidas. Indica qué modelo o
herramienta se usó.
