# Arquitectura

## Visión general

```
┌──────────────── Ventana (WebView) ────────────────┐
│ React UI → services (Zod + casos de uso) → Db      │
│                  ▲ domain/ (cálculos puros)         │
└───────────────────────┬────────────────────────────┘
                        │ invoke (IPC local)
┌───────────────────────▼────────────────────────────┐
│ Rust (Tauri): db_select / db_execute / db_batch     │
│ backup_create / verify / restore / auto             │
│ rusqlite (SQLite embebido) · migraciones · WAL      │
└─────────────────────────────────────────────────────┘
        %APPDATA%\com.moneta.personalfinance\moneta.db
```

* **Una sola capa propietaria de SQLite (Rust).** Acepta solo `SELECT/INSERT/UPDATE/DELETE/WITH`, siempre con parámetros enlazados, una sentencia por llamada, y `db_batch` ejecuta varias en **una transacción** (todo o nada). La CSP de la ventana bloquea cargar código externo.
* **El contrato `Db` (TypeScript)** tiene tres implementaciones: Tauri (producción), `node:sqlite` (pruebas) y HTTP-a-`node:sqlite` (solo `vite dev` en navegador, excluido del build). Las tres usan **las mismas migraciones SQL** (`db/migrations`). Así las pruebas ejercitan SQL real, no mocks.
* **Dinero como `INTEGER`** (CHECK `amount > 0 AND amount <= 9e12`, tabla `STRICT`). Tope por movimiento para que cualquier suma quepa en `Number.MAX_SAFE_INTEGER`.
* **Integridad en la base:** claves foráneas `RESTRICT`, CHECK de tipos/fechas, triggers (categoría coherente con el tipo, retiro de meta ≤ saldo de la meta), índices únicos (ocurrencia de pago recurrente, nombres activos).
* **Idempotencia contra doble envío:** cada formulario genera su `id` al abrirse; un segundo envío falla por clave primaria y se informa como duplicado evitado.
* **Estado en memoria:** tras cada operación se recarga el estado completo y todo se deriva con funciones puras (`domain/`). Para uso personal (decenas de miles de movimientos) es instantáneo y elimina la posibilidad de caches desincronizados.

## Migraciones y actualizaciones

`schema_migrations` registra versiones. Al abrir: si hay migraciones pendientes y ya existían datos, **se crea un respaldo `pre-migration-vN-*.db`** antes de migrar; cada migración corre en su transacción. Una base más nueva que la app se rechaza sin tocarla.

## Respaldos y restauración

* **Crear:** `VACUUM INTO` a un temporal → verificación completa → renombrado atómico.
* **Verificar:** `integrity_check`, tablas requeridas, versión de esquema, `foreign_key_check` y reglas de datos (montos enteros positivos, fechas, tipos, saldos de metas).
* **Restaurar:** (1) verifica el archivo; (2) lo copia a un temporal, lo migra y lo vuelve a verificar; (3) crea `pre-restore-*.db` con los datos actuales; (4) aplica con la API de respaldo de SQLite en **un solo paso atómico**; (5) verifica y, si algo fallara, revierte desde el respaldo previo. La base original no se toca hasta el paso 4.
* **Automáticos:** al abrir, si pasaron > 20 h desde el último; conserva los últimos N.

## Motor de recomendaciones (`src/insights`)

Reglas explícitas con umbrales en `config.ts`. Cada `Insight` trae `explanation[]` con los pasos del cálculo y solo se emite si hay datos suficientes (meses completos, bases mínimas). Un mes en que el usuario empezó a mitad de camino no cuenta como mes completo. La salud financiera es un promedio ponderado de componentes con regla visible; sin datos suficientes no hay puntaje.

## Decisiones y límites

* Moneda única COP; sin conversiones (no hay fuente de tipos de cambio válida).
* No hay tarjetas de crédito como tipo de cuenta.
* Archivos de exportación: CSV `;` con BOM UTF-8 (Excel es-CO) y neutralización de fórmulas; PDF generado localmente (jsPDF).
