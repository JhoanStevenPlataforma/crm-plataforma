import type { TaxRate } from "../../../types";

/**
 * The four rates `20260913120000_quotes_module.sql` seeds, so demo mode offers
 * the same tax picker as the real backend. `exento` and `excluido` are both 0%
 * and legally distinct, which is why they are two rows.
 */
export const DEMO_TAX_RATES: TaxRate[] = [
  {
    id: 1,
    code: "iva_19",
    label: "IVA 19%",
    rate: 19,
    is_default: true,
    active: true,
    rank: 10,
    is_system: true,
  },
  {
    id: 2,
    code: "iva_5",
    label: "IVA 5%",
    rate: 5,
    is_default: false,
    active: true,
    rank: 20,
    is_system: true,
  },
  {
    id: 3,
    code: "exento",
    label: "Exento",
    rate: 0,
    is_default: false,
    active: true,
    rank: 30,
    is_system: true,
  },
  {
    id: 4,
    code: "excluido",
    label: "Excluido",
    rate: 0,
    is_default: false,
    active: true,
    rank: 40,
    is_system: true,
  },
];
