-- ============================================================
-- FINANZAS · DESPUÉS DE IMPUESTOS — 5 nov 2026
-- «Lo que tienes − lo que le toca al SAT = lo que te queda», y cómo cambia con el tiempo.
--   finance_tax_periods:   una fila por mes declarado (YYYY-MM). Se actualiza cuando la contadora calcula,
--                          se presenta o se paga (upsert por periodo).
--   finance_tax_estimates: cada estimado del total pendiente. SOLO se agregan filas: esa es la historia.
-- Sin datos: la carga vive fuera del repo. Sin filas, el bloque no aparece.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_tax_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text UNIQUE NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ingreso numeric CHECK (ingreso >= 0),
  deducciones numeric CHECK (deducciones >= 0),
  isr numeric CHECK (isr >= 0),
  recargos_actualizacion numeric CHECK (recargos_actualizacion >= 0),
  iva numeric CHECK (iva >= 0),
  total numeric CHECK (total >= 0),
  -- estimado: sale del modelo · calculada: la contadora ya la calculó · presentada: declarada · pagada: con fecha de pago
  estado text NOT NULL DEFAULT 'estimado' CHECK (estado IN ('estimado', 'calculada', 'presentada', 'pagada')),
  pagado_en date,
  fuente text,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_tax_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  -- Total pendiente con el SAT a esa fecha (ISR + recargos + IVA + lo que falte), en MXN.
  bajo numeric NOT NULL CHECK (bajo >= 0),
  centro numeric NOT NULL CHECK (centro >= 0),
  alto numeric NOT NULL CHECK (alto >= 0),
  -- Lo ya pagado al SAT hasta esa fecha (contexto; no se resta del pendiente).
  pagado numeric CHECK (pagado >= 0),
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bajo <= centro AND centro <= alto)
);

CREATE INDEX IF NOT EXISTS idx_finance_tax_estimates_fecha ON finance_tax_estimates(fecha DESC, created_at DESC);

-- ── RLS: igual que finance_*: solo owner/admin leen; la escritura va por service role (API). ──
ALTER TABLE finance_tax_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_tax_estimates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_tax_periods' AND policyname = 'finance_tax_periods_select') THEN
    CREATE POLICY finance_tax_periods_select ON finance_tax_periods FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner', 'admin')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_tax_estimates' AND policyname = 'finance_tax_estimates_select') THEN
    CREATE POLICY finance_tax_estimates_select ON finance_tax_estimates FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner', 'admin')));
  END IF;
END $$;
