# Protocolo de trabajo (pedido por el dueño del repositorio)

Aplicar en todos los proyectos de este repositorio.

## 1. Entrega para el usuario
- Al terminar de desarrollar o modificar una aplicación, dar SIEMPRE un enlace funcional para abrirla y probarla, al principio de la respuesta final.
- App web: URL que el usuario pueda abrir en su navegador. App local: dirección exacta (ej. http://localhost:3000) con el servidor funcionando; si es posible, también una dirección accesible desde la red local para el celular.
- Publicar en Internet solo con autorización previa del usuario.
- No confundir una ruta de archivo con una URL pública. No inventar enlaces ni decir que funcionan sin comprobarlos.
- Si no se puede generar un enlace funcional: explicar el impedimento, ofrecer una forma comprobada de ejecutarla y NO declarar el proyecto terminado.

## 2. Entrega para revisión externa (ChatGPT)
Generar `ENTREGA_CHATGPT/` y comprimirla en `ENTREGA_CHATGPT.zip`. **Entregar SIEMPRE el ZIP directamente al usuario como archivo adjunto en la conversación. NO subir el ZIP a GitHub** (está en `.gitignore`).
- `CODIGO_FUENTE/` (todos los archivos completos), `INFORME_TECNICO.md`, `ERRORES.md`, `PRUEBAS.md`, `CAMBIOS.md`, `INSTRUCCIONES.md`.
(En DUAL_PROJECTOR_LAB: documentos en `entrega_docs/`, generar con `python tools/crear_entrega.py`.)

## 3. Verificación obligatoria antes de entregar
Ejecutar la app, probar las funciones principales, revisar la consola, comprobar botones y controles, verificar que el enlace abre la versión más reciente,
no reemplazar funciones que ya andan por versiones incompletas, e informar qué pruebas no se pudieron ejecutar.

## 4. Formato de la respuesta final (empezar exactamente así)
🌐 ENLACE PARA PROBAR · 📦 ZIP PARA CHATGPT (adjunto, no en GitHub) · 🧪 PRUEBAS · 🔧 CORRECCIONES · ⚠️ PENDIENTES
