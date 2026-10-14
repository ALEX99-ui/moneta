# Estado del proyecto

Fecha de esta revisión: 2026-10-14 · versión 0.1.0

## Pruebas ejecutadas (resultado real)

| Suite | Comando | Resultado |
|---|---|---|
| Lógica financiera, servicios, insights, CSV, importación, reportes (SQLite real en memoria con las migraciones reales) | `npm test` | **131 pruebas pasan** (9 archivos) |
| Base de datos Rust: migraciones, transacciones atómicas, restricciones, respaldo, verificación, restauración, datos inválidos, versión futura, respaldo automático, respaldo previo a migrar | `cargo test --manifest-path src-tauri/Cargo.toml` | **11 pruebas pasan** |
| Extremo a extremo en navegador (UI real + SQLite real vía puente de desarrollo): crear cuentas, ingreso, gasto rápido, transferencia (editar/eliminar/deshacer), edición, eliminación con confirmación y deshacer, presupuesto, meta, suscripción previsto→confirmado, búsqueda, exportación CSV y PDF, persistencia al recargar, todas las pantallas sin errores y sin desborde horizontal a 1440 y 960 px, filtros del panel, pestañas, tema | `npm run e2e` | **19 pruebas pasan** |
| Compilación de la app de escritorio (Linux, perfil release) | `npx tauri build --no-bundle` | OK |
| **Aplicación Tauri real ejecutada** (Linux, WebKitGTK, display virtual): arranque, creación de la BD en la carpeta de datos, migraciones, carga por IPC, registro de un gasto con `Ctrl+N`, fila escrita en SQLite, cierre y reapertura conservando el dato, respaldo automático creado | manual con Xvfb | OK |

## Cobertura de las reglas financieras obligatorias

| # | Regla | Prueba |
|---|---|---|
| 1-2 | Ingreso suma / gasto resta al saldo de la cuenta | `ledger.test.ts` |
| 3 | Transferencia sin alterar patrimonio ni ingresos/gastos | `ledger.test.ts`, e2e 4 |
| 4-5 | Editar / eliminar mantienen saldos coherentes (+ deshacer) | `ledger.test.ts`, `services.test.ts`, e2e 4b-6 |
| 6 | Aporte a meta no es gasto | `ledger.test.ts`, `planning.test.ts`, e2e 8 |
| 7-8 | Futuro = previsto; solo cuenta lo registrado, una vez por ocurrencia | `planning.test.ts`, e2e 9 |
| 9 | Presupuesto por período y categoría (incl. mes financiero desde el día N) | `planning.test.ts` |
| 10 | Ahorro neto sin duplicar transferencias ni aportes | `ledger.test.ts` |
| 11 | Panel y reportes concilian | `reports.test.ts`, diagnóstico en *Acerca de* |
| 12 | Tarjetas de crédito | **No aplica**: no se implementaron |

Casos límite cubiertos: sin movimientos, montos muy altos (tope 9·10¹² por movimiento), saldos negativos, meses sin ingresos, gastos > ingresos, cambio de fechas, categorías archivadas, restauración con datos inválidos/basura/versión futura, importaciones con repetidos (contra lo existente, dentro del archivo y reimportando el mismo archivo).

## Lo que NO se pudo comprobar en este entorno

1. **El instalador de Windows (.exe) no se generó aquí** (el entorno es Linux). La configuración está lista (`bundle.targets: ["nsis"]`, instalación por usuario, idioma español) y hay un workflow `release-windows.yml`; falta ejecutarlo en Windows (`npm run tauri:build`) o en GitHub Actions. **Hasta que lo ejecutes en Windows, esa parte del criterio de aceptación sigue pendiente.**
2. La app **no se ejecutó en Windows/WebView2**; sí en Linux/WebKitGTK con el mismo código. Diferencias esperables son visuales mínimas (p. ej. el selector de fecha nativo).
3. Los **diálogos nativos de archivos** (guardar/abrir) y la ruta completa «Crear respaldo → Restaurar» desde la interfaz no se accionaron con clics reales (no se pueden automatizar en el display virtual). La lógica de respaldo/restauración sí está probada en Rust y los comandos se compilaron y registraron.
4. No se probó una actualización real de versión de la app (sí la migración con respaldo previo a nivel de base de datos).
5. WebView2: el instalador usa `downloadBootstrapper`. Windows 10/11 normalmente ya lo trae; si no, necesitaría Internet **solo al instalar**. Para un instalador 100 % offline cambia `webviewInstallMode` a `offlineInstaller` (instalador más pesado).

## Pendientes y mejoras posibles

* Tarjetas de crédito (cuentas con corte/pago) — fuera del alcance inicial; hoy solo existe como método de pago.
* Múltiples monedas con tasas de cambio (requiere una fuente válida).
* Filtros guardados también para otras pantallas (hoy: gastos e ingresos).
* Gráficos en el PDF (hoy contiene tablas y KPIs).
* Firma de código del instalador de Windows (evita la advertencia de SmartScreen).
* Pruebas visuales automáticas (capturas de referencia).
