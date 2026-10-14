/** Umbrales del motor de recomendaciones. Son reglas fijas y visibles; nada se "aprende" ni se envía fuera. */
export const INSIGHT_CONFIG = {
  /** Días transcurridos mínimos del mes actual para comparar con el mes anterior al mismo punto. */
  minElapsedDays: 7,
  /** Aumento relativo mínimo para avisar (20 %) y absoluto mínimo (COP). */
  increaseRatio: 0.2,
  increaseMinDiff: 30_000,
  increaseStrongRatio: 0.4,
  /** Gasto mínimo del período base para considerar una comparación (evita % enormes sobre montos pequeños). */
  baseMinSpend: 40_000,
  /** Participación en los ingresos que dispara el aviso para categorías no esenciales. */
  shareOfIncomeWarn: 0.1,
  shareOfIncomeAlert: 0.2,
  /** Reducción sugerida en el cálculo de potencial de ahorro. */
  reductionPercent: 15,
  reductionMinAvg: 50_000,
  /** Meses completos usados para promedios. */
  averageMonths: 3,
  /** Tasa de ahorro objetivo (regla general: 20 %). */
  savingsTarget: 0.2,
  /** Detección de pagos recurrentes no registrados. */
  recurringMinMonths: 3,
  recurringAmountTolerance: 0.1,
  /** Meses de gastos que debería cubrir un fondo de emergencia. */
  emergencyMin: 3,
  emergencyIdeal: 6,
  /** Gasto inusual: veces la desviación estándar por encima de la media y múltiplo de la mediana. */
  anomalySigma: 3,
  anomalyMedianMultiple: 2,
  anomalyMinSamples: 6,
} as const

/** Subcategorías típicamente discrecionales dentro de categorías esenciales (comparación sin acentos). */
export const DISCRETIONARY_SUBCATEGORIES = ['restaurantes', 'domicilios', 'cafeteria', 'salidas', 'cine y eventos']
