import type { DataProvider, Identifier } from "ra-core";

import type { Deal, DealStageChange, DealStageGate, Task } from "../../types";

/**
 * Demo-mode `public.deal_stage_gate()`.
 *
 * A demo that lets a card cross every column with nothing behind it teaches the
 * opposite of what the product does, so the rule is emulated rather than
 * skipped. What cannot be emulated is the configuration table: FakeRest has no
 * `deal_stage_requirements`, so demo mode applies the shipped default — one
 * completed task for every stage — to all of them.
 *
 * `enforced_from` is the moment the demo provider was built, which reproduces
 * the production rollout exactly: every generated deal was already sitting in
 * its stage before the rule existed, so its first move is free and the one
 * after it is governed. Without that the generated board would open frozen.
 */
const DEMO_ENFORCED_FROM = new Date().toISOString();

const DEMO_MIN_COMPLETED_TASKS = 1;

/** The demo counterpart of "the deal entered its current stage at". */
const enteredCurrentStageAt = async (
  dataProvider: DataProvider,
  deal: Deal,
): Promise<string> => {
  const { data: changes } = await dataProvider.getList<DealStageChange>(
    "deal_stage_changes",
    {
      filter: { deal_id: deal.id, to_stage: deal.stage },
      sort: { field: "changed_at", order: "DESC" },
      pagination: { page: 1, perPage: 1 },
    },
  );

  return changes[0]?.changed_at ?? deal.created_at;
};

export const computeDealStageGate = async (
  dataProvider: DataProvider,
  dealId: Identifier,
  toStage: string,
): Promise<DealStageGate> => {
  const { data: deal } = await dataProvider.getOne<Deal>("deals", {
    id: dealId,
  });
  const since = await enteredCurrentStageAt(dataProvider, deal);

  const free: DealStageGate = {
    deal_id: dealId,
    to_stage: toStage,
    required: 0,
    completed: 0,
    ok: true,
    since,
    qualifying_task_ids: [],
  };

  if (since < DEMO_ENFORCED_FROM) return free;

  // The demo serves the task row as if it were `tasks_summary`, so the link to
  // the deal is the `primary_entity_*` pair rather than a `task_links` row.
  const { data: tasks } = await dataProvider.getList<Task>("tasks", {
    filter: { primary_entity_type: "deal", primary_entity_id: dealId },
    sort: { field: "id", order: "ASC" },
    pagination: { page: 1, perPage: 1000 },
  });

  const qualifying = tasks.filter(
    (task) =>
      task.completed_at != null &&
      task.completed_at >= since &&
      task.canceled_at == null &&
      task.deleted_at == null,
  );

  return {
    ...free,
    required: DEMO_MIN_COMPLETED_TASKS,
    completed: qualifying.length,
    ok: qualifying.length >= DEMO_MIN_COMPLETED_TASKS,
    qualifying_task_ids: qualifying.map((task) => task.id),
  };
};
