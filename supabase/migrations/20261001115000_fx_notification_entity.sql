--
-- Currencies & exchange rates (docs/proposals/multi-currency-fx.md), part 0.
--
-- A failing rate provider notifies the admins through the existing outbox,
-- whose non-task subject is (`entity_type`, `entity_id`). The enum is that
-- table's extension point. `alter type ... add value` cannot be used in the
-- transaction that adds it, so it gets a migration of its own, applied before
-- `20261001120000_currencies_fx.sql`, which writes rows carrying it.
--
alter type public.task_entity add value if not exists 'exchange_rate_provider';
