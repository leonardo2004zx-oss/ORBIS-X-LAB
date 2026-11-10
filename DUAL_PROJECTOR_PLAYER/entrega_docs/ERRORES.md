# ERRORES Y LIMITACIONES — v7

## Abiertos / no verificados
- Salida real a proyectores por HDMI y a un segundo monitor: **no probada** (no hay hardware en el entorno).
- Pantalla completa: el navegador acepta el pedido, pero no se vio el cambio de tamaño (la pantalla virtual no tiene gestor de ventanas).
- Versión web en claude.ai: el navegador bloquea abrir ventanas nuevas dentro de un marco aislado. La división se ve en la vista previa, pero las dos salidas reales necesitan la versión local.
- Memoria: ≈ 1 GB con las dos ventanas (casi todo es memoria base de Chromium). En PCs de 4 GB, cerrar otras pestañas.
- Con aceleración gráfica por software (sin GPU real) el rendimiento baja mucho. En Windows con GPU se espera mejor, pero no se midió.

## Corregidos (ver CAMBIOS.md)
- Bloqueador de ventanas emergentes con «Abrir A y B».
- Desfase de 1–2 fotogramas bajo carga.
- Redibujos innecesarios y vistas previas costosas.
- Posición inicial de las ventanas ignorada.

## Errores de la medición (no de la app), corregidos en las herramientas
- La etiqueta de cada ventana tapaba el código de barras en la grabación: ahora se mide después de que se oculta.
- La ventana del panel tapaba las salidas en la grabación: ahora el panel va arriba y las salidas abajo.
- El primer criterio de sincronía comparaba dibujos hechos en el mismo refresco como si fueran de refrescos distintos: ahora se compara dentro de un refresco (16 ms).
