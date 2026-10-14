# MONETA — Personal Finance

Aplicación de escritorio para administrar **tus finanzas personales de forma privada y sin conexión**: ingresos, gastos, cuentas, presupuestos, metas de ahorro, suscripciones, calendario, reportes y recomendaciones calculadas localmente. Un solo usuario, sin inicio de sesión, sin nube, sin analíticas.

- **Stack:** Tauri 2 · React 19 + TypeScript · Vite · Tailwind CSS 4 · componentes estilo shadcn/ui (Radix) + Lucide · Recharts · SQLite (rusqlite, Rust) · React Hook Form + Zod · date-fns · jsPDF.
- **Moneda:** COP, en pesos enteros (nunca `float`). Formato colombiano `$ 1.500.000`.
- **Datos:** SQLite en la carpeta de datos de la aplicación (en Windows `%APPDATA%\com.moneta.personalfinance\moneta.db`), nunca junto al ejecutable ni al código.

## Cómo se usa

| Quiero… | Dónde |
|---|---|
| Ver cuánto tengo, gané, gasté y ahorré | **Panel** (filtros por mes, año, rango o todo) |
| Anotar un gasto en segundos | `Ctrl+N` (registro rápido) · `Ctrl+Shift+I` ingreso · `Ctrl+Shift+T` transferencia |
| Buscar cualquier movimiento | `Ctrl+K` |
| Controlar saldos y mover dinero entre cuentas | **Cuentas** |
| Límites por categoría | **Presupuestos** (por defecto o solo para un mes) |
| Ahorrar para algo | **Metas de ahorro** |
| Ver qué pago se viene | **Suscripciones** y **Calendario** |
| Entender mis hábitos | **Insights** (recomendaciones con el cálculo explicado, salud financiera, simulador) |
| Exportar | **Reportes** (CSV/PDF) y **Configuración → Datos y respaldos** (CSV de transacciones) |
| Respaldar / restaurar | **Configuración → Datos y respaldos** (manual y automático) |
| Importar de un extracto | **Configuración → Datos y respaldos → Importar CSV** (mapeo de columnas, vista previa, detección de repetidos) |

## Reglas financieras (y dónde se prueban)

1. **Los saldos nunca se guardan: se calculan** (`saldo inicial + ingresos − gastos ± transferencias`). Por eso editar/eliminar un movimiento nunca deja saldos inconsistentes. → `src/domain/ledger.ts`
2. **Las transferencias** entre cuentas propias no son ingresos ni gastos y no cambian el total.
3. **Los aportes a metas** son una *asignación virtual*: no tocan saldos, ni ingresos, ni gastos. El **ahorro neto** (ingresos − gastos) se muestra siempre separado del **dinero asignado a metas**.
4. **Solo existen movimientos confirmados.** No se aceptan fechas futuras en movimientos; lo futuro vive como **pago previsto** (suscripciones/recurrentes) y no afecta saldos, presupuestos ni reportes hasta pulsar *Registrar pago*. Un índice único `(regla, ocurrencia)` impide registrar dos veces el mismo pago.
5. **Presupuestos** por categoría y por *mes financiero* (configurable: primer día del mes 1–28). Estados: normal (< 80 %), cerca del límite (80–100 %), excedido (> 100 %).
6. **Dashboard, reportes y presupuestos usan las mismas funciones**, así que concilian. El diagnóstico de *Configuración → Acerca de* verifica la conciliación.
7. Eliminar es **lógico** (papelera de 30 días) → *Deshacer*. Archivar categorías/cuentas conserva el historial; una cuenta solo se archiva con saldo cero.
8. **Tarjetas de crédito:** no están implementadas (la regla 12 del encargo aplica solo si se implementan). «Tarjeta de crédito» existe únicamente como *método de pago* de un gasto.

## Desarrollo

Requisitos: **Node 22+**, **Rust estable**, y en Windows las *Build Tools de Visual Studio* (C++) y WebView2 (viene con Windows 10/11). En Linux: `libwebkit2gtk-4.1-dev` y compañía ([guía de Tauri](https://tauri.app/start/prerequisites/)).

```bash
npm install
npm run dev            # UI en el navegador con un puente de SQLite SOLO de desarrollo (node:sqlite)
npm run tauri:dev      # la app de escritorio real (Rust + SQLite)
npm test               # pruebas unitarias/integración (vitest, SQLite real en memoria con las migraciones reales)
npm run e2e            # pruebas de extremo a extremo (Playwright + Chromium) contra la UI real
cargo test --manifest-path src-tauri/Cargo.toml   # base de datos, migraciones, respaldos y restauración
npx vite-node scripts/seed-dev.ts                 # (solo desarrollo) datos de ejemplo en .dev-data/dev.db
```

### Instalador de Windows

```bash
npm install
npm run tauri:build    # genera el instalador NSIS (.exe, instalación por usuario, sin permisos de administrador) en src-tauri/target/release/bundle/nsis/ (para MSI agrega "msi" a bundle.targets)
```
También hay un workflow de GitHub Actions (`.github/workflows/release-windows.yml`) que construye y prueba en `windows-latest` y publica el instalador como artefacto.

## Estructura

```
db/migrations/        Esquema SQL versionado (compartido por Rust y por las pruebas)
src-tauri/src/        db.rs (SQLite, transacciones, respaldo/restauración), migrations.rs, lib.rs (comandos)
src/domain/           Lógica financiera pura: ledger, budgets, goals, recurring, reports, csv, csvImport, filters, search
src/insights/         Motor de recomendaciones (reglas, salud financiera, proyección, simulador)
src/services/         Casos de uso: validan (Zod) y escriben en transacciones atómicas
src/db/               Contrato `Db`, adaptador Tauri, adaptador de desarrollo/pruebas, repositorios (lectura)
src/validation/       Esquemas Zod compartidos con los formularios
src/screens, components, app/   Interfaz
e2e/                  Pruebas Playwright
```
Más detalle de decisiones en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Qué está verificado

Ver [`docs/ESTADO.md`](docs/ESTADO.md): resultados de pruebas ejecutadas, y lo que **no** se pudo comprobar en el entorno de desarrollo (instalador de Windows).
