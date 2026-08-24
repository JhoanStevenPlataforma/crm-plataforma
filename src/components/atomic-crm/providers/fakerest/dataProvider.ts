import {
  withLifecycleCallbacks,
  type CreateParams,
  type DataProvider,
  type Identifier,
  type ResourceCallbacks,
  type UpdateParams,
} from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";

import type {
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  Sale,
  SalesFormData,
  SignUpData,
  Task,
  TaskEntityType,
  TaskStatusKey,
  Team,
  TeamBudget,
  TeamMember,
  TeamMemberBudget,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { getActivityLog } from "../commons/activity";
import { getCompanyAvatar } from "../commons/getCompanyAvatar";
import { getContactAvatar } from "../commons/getContactAvatar";
import { convertLead, type ConvertLeadOptions } from "../commons/convertLead";
import { mergeContacts } from "../commons/mergeContacts";
import type { CrmDataProvider } from "../types";
import {
  authProvider as defaultAuthProvider,
  USER_STORAGE_KEY,
} from "./authProvider";
import generateData from "./dataGenerator";
import { TASK_STATUSES } from "./dataGenerator/taskCatalogues";
import type { Db } from "./dataGenerator/types";
import { withSupabaseFilterAdapter } from "./internal/supabaseAdapter";
import { taskAssignmentCallbacks } from "./taskAssignmentCallbacks";
import {
  taskAttachmentCallbacks,
  taskCommentReactionCallbacks,
} from "./taskAttachmentCallbacks";
import {
  getTaskAttachmentUrl,
  uploadTaskAttachment,
} from "./taskAttachmentStorage";
import { taskChecklistCallbacks } from "./taskChecklistCallbacks";
import { taskCommentCallbacks } from "./taskCommentCallbacks";
import {
  releaseDependentsOf,
  taskDependencyCallbacks,
} from "./taskDependencyCallbacks";
import { taskReminderCallbacks } from "./taskReminderCallbacks";
import { getTimelineEvents } from "./timelineEvents";

const TASK_MARKED_AS_DONE = "TASK_MARKED_AS_DONE";
const TASK_MARKED_AS_UNDONE = "TASK_MARKED_AS_UNDONE";
const TASK_DONE_NOT_CHANGED = "TASK_DONE_NOT_CHANGED";

/**
 * Projects the team form's write-only budget inputs onto the column names
 * `teams_summary` would have produced, so the list and the dashboard read the
 * same fields in demo mode as against the real backend.
 */
const budgetFieldsFor = (data: Partial<Team> | undefined) => {
  if (data?.budget == null || !data.budget_start || !data.budget_end) {
    return {};
  }
  return {
    budget_amount: Number(data.budget),
    budget_period_start: data.budget_start,
    budget_period_end: data.budget_end,
  };
};

/**
 * Keeps a `team_budgets` row alongside, so the budget history panel has
 * something to list. Keyed on `(team_id, period_start)` like the real provider:
 * same period updates in place, a new period appends.
 */
const recordTeamBudget = async (
  dataProvider: DataProvider,
  teamId: Identifier,
  data: Partial<Team>,
) => {
  if (data.budget == null || !data.budget_start || !data.budget_end) {
    return;
  }
  const { data: existing } = await dataProvider.getList<TeamBudget>(
    "team_budgets",
    {
      filter: { team_id: teamId, period_start: data.budget_start },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 1 },
    },
  );

  if (existing?.length) {
    await dataProvider.update("team_budgets", {
      id: existing[0].id,
      data: { amount: Number(data.budget), period_end: data.budget_end },
      previousData: existing[0],
    });
    return;
  }

  await dataProvider.create("team_budgets", {
    data: {
      team_id: teamId,
      amount: Number(data.budget),
      period_start: data.budget_start,
      period_end: data.budget_end,
    },
  });
};

/**
 * Recomputes what the real backend derives from `team_member_budgets`: the
 * team's allocated total and the member's own quota.
 *
 * The total is re-summed from the stored rows rather than adjusted by the
 * delta, so a create, an update and a delete all take the same path and a
 * missed case cannot leave the figure drifting.
 */
const syncTeamAllocation = async (
  dataProvider: DataProvider,
  allocation: TeamMemberBudget,
  amount: number | null,
) => {
  const { data: rows } = await dataProvider.getList<TeamMemberBudget>(
    "team_member_budgets",
    {
      filter: { budget_id: allocation.budget_id },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
  );

  const { data: team } = await dataProvider.getOne<Team>("teams", {
    id: allocation.team_id,
  });
  await dataProvider.update("teams", {
    id: team.id,
    data: {
      allocated_amount: rows.reduce((total, row) => total + row.amount, 0),
    },
    previousData: team,
  });

  const { data: member } = await dataProvider.getOne<TeamMember>(
    "team_members",
    { id: allocation.team_member_id },
  );
  await dataProvider.update("team_members", {
    id: member.id,
    data: { budget_amount: amount },
    previousData: member,
  });
};

const processCompanyLogo = async (params: any) => {
  let logo = params.data.logo;

  if (typeof logo !== "object" || logo === null || !logo.src) {
    logo = await getCompanyAvatar(params.data);
  } else if (logo.rawFile instanceof File) {
    const base64Logo = await convertFileToBase64(logo);
    logo = { src: base64Logo, title: logo.title };
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

async function processContactAvatar(
  params: UpdateParams<Contact>,
): Promise<UpdateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact>,
): Promise<CreateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact> | UpdateParams<Contact>,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  if (data.avatar?.src || !data.email_jsonb || !data.email_jsonb.length) {
    return params;
  }
  const avatarUrl = await getContactAvatar(data);

  // Clone the data and modify the clone
  const newData = { ...data, avatar: { src: avatarUrl || undefined } };

  return { ...params, data: newData };
}

async function fetchAndUpdateCompanyData(
  params: UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<UpdateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact> | UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  const newData = { ...data };

  if (!newData.company_id) {
    return params;
  }

  const { data: company } = await dataProvider.getOne("companies", {
    id: newData.company_id,
  });

  if (!company) {
    return params;
  }

  newData.company_name = company.name;
  return { ...params, data: newData };
}

export interface CreateFakeRestDataProviderOptions {
  db?: Db;
  latency?: number;
  authProvider?: Pick<typeof defaultAuthProvider, "getIdentity">;
  silent?: boolean;
}

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    return (await convertFileToBase64(logo)) as string;
  }
  return logo?.src ?? "";
};

const preserveAttachmentMimeType = <
  NoteType extends { attachments?: Array<{ rawFile?: File; type?: string }> },
>(
  note: NoteType,
): NoteType => ({
  ...note,
  attachments: (note.attachments ?? []).map((attachment) => ({
    ...attachment,
    type: attachment.type ?? attachment.rawFile?.type,
  })),
});

export const createDataProvider = ({
  db = generateData(),
  latency = 300,
  authProvider,
  silent = false,
}: CreateFakeRestDataProviderOptions = {}): CrmDataProvider => {
  const baseDataProvider = fakeRestDataProvider(db, !silent, latency);
  let taskUpdateType = TASK_DONE_NOT_CHANGED;
  const getIdentity = async () =>
    authProvider?.getIdentity?.() ?? defaultAuthProvider.getIdentity?.();

  const updateCompany = async (
    companyId: Identifier,
    updateFn: (company: Company) => Partial<Company>,
  ) => {
    const { data: company } = await dataProvider.getOne<Company>("companies", {
      id: companyId,
    });

    return await dataProvider.update("companies", {
      id: companyId,
      data: {
        ...updateFn(company),
      },
      previousData: company,
    });
  };

  const dataProviderWithCustomMethod: CrmDataProvider = {
    ...baseDataProvider,
    async getList(resource: string, params: any) {
      if (resource === "activity_log") {
        const { filter = {}, pagination } = params;
        const all = await getActivityLog(
          withSupabaseFilterAdapter(baseDataProvider),
          filter.company_id,
          filter.sales_id,
        );
        const { page, perPage } = pagination;
        const start = (page - 1) * perPage;
        return { data: all.slice(start, start + perPage), total: all.length };
      }
      // The unified timeline is a view in the real backend (§6.2); FakeRest has
      // no views, so the union is assembled the same way `activity_log` is.
      if (resource === "timeline_events") {
        const { filter = {}, pagination } = params;
        const all = await getTimelineEvents(
          baseDataProvider,
          filter.entity_type,
          filter.entity_id,
        );
        const { page, perPage } = pagination;
        const start = (page - 1) * perPage;
        return { data: all.slice(start, start + perPage), total: all.length };
      }
      return baseDataProvider.getList(resource, params);
    },
    /**
     * Demo-mode `move_deal_stage()`.
     *
     * The real backend does this in one transaction and records the history
     * from a trigger, so the reason can never go missing. FakeRest has neither,
     * so the two writes are done here in the same order — the deal only moves
     * once its stage change has been recorded.
     *
     * Files keep the blob URL the browser gave them: demo mode has no bucket,
     * and the link stays openable for the life of the tab, which is exactly as
     * long as the rest of the demo data lives.
     */
    moveDealStage: async (
      dealId: Identifier,
      toStage: string,
      options: { reason: string; index?: number; attachments?: File[] },
    ): Promise<Deal> => {
      const { data: deal } = await dataProvider.getOne<Deal>("deals", {
        id: dealId,
      });
      const currentUser = await getIdentity();

      await dataProvider.create("deal_stage_changes", {
        data: {
          deal_id: dealId,
          from_stage: deal.stage,
          to_stage: toStage,
          reason: options.reason,
          sales_id: currentUser?.id ?? null,
          changed_at: new Date().toISOString(),
          attachments: (options.attachments ?? []).map((file) => ({
            src: URL.createObjectURL(file),
            title: file.name,
            type: file.type,
          })),
        },
      });

      const { data } = await dataProvider.update<Deal>("deals", {
        id: dealId,
        data: {
          stage: toStage,
          index: options.index ?? deal.index,
          updated_at: new Date().toISOString(),
        },
        previousData: deal,
      });

      return data;
    },
    unarchiveDeal: async (deal: Deal) => {
      // get all deals where stage is the same as the deal to unarchive
      const { data: deals } = await baseDataProvider.getList<Deal>("deals", {
        filter: { stage: deal.stage },
        pagination: { page: 1, perPage: 1000 },
        sort: { field: "index", order: "ASC" },
      });

      // set index for each deal starting from 1, if the deal to unarchive is found, set its index to the last one
      const updatedDeals = deals.map((d, index) => ({
        ...d,
        index: d.id === deal.id ? 0 : index + 1,
        archived_at: d.id === deal.id ? null : d.archived_at,
      }));

      return await Promise.all(
        updatedDeals.map((updatedDeal) =>
          dataProvider.update("deals", {
            id: updatedDeal.id,
            data: updatedDeal,
            previousData: deals.find((d) => d.id === updatedDeal.id),
          }),
        ),
      );
    },
    signUp: async ({
      email,
      password,
      first_name,
      last_name,
    }: SignUpData): Promise<{
      id: string;
      email: string;
      password: string;
    }> => {
      const user = await baseDataProvider.create("sales", {
        data: {
          email,
          first_name,
          last_name,
        },
      });

      return {
        ...user.data,
        password,
      };
    },
    salesCreate: async ({ ...data }: SalesFormData): Promise<Sale> => {
      const response = await dataProvider.create("sales", {
        data: {
          ...data,
          password: "new_password",
        },
      });

      return response.data;
    },
    salesUpdate: async (
      id: Identifier,
      data: Partial<Omit<SalesFormData, "password">>,
    ): Promise<Sale> => {
      const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
        id,
      });

      if (!previousData) {
        throw new Error("User not found");
      }

      const { data: sale } = await dataProvider.update<Sale>("sales", {
        id,
        data,
        previousData,
      });
      return { ...sale, user_id: sale.id.toString() };
    },
    isInitialized: async (): Promise<boolean> => {
      const sales = await dataProvider.getList<Sale>("sales", {
        filter: {},
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
      });
      if (sales.data.length === 0) {
        return false;
      }
      return true;
    },
    updatePassword: async (id: Identifier): Promise<true> => {
      const currentUser = await getIdentity();
      if (!currentUser) {
        throw new Error("User not found");
      }
      const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
        id: currentUser.id,
      });

      if (!previousData) {
        throw new Error("User not found");
      }

      await dataProvider.update("sales", {
        id,
        data: {
          password: "demo_newPassword",
        },
        previousData,
      });

      return true;
    },
    /**
     * Demo-mode counterpart of `public.transition_task()` (proposal §4.5).
     *
     * The real implementation lives in the database, where it also validates
     * the transition and emits the audit event. Here it only has to keep the
     * task row coherent — including the legacy `done_date` shim, which is what
     * the `nb_tasks` lifecycle callbacks below key off.
     */
    transitionTask: async (
      taskId: Identifier,
      toStatus: TaskStatusKey,
      options: { reason?: string; metadata?: Record<string, unknown> } = {},
    ): Promise<Task> => {
      const status = TASK_STATUSES.find((entry) => entry.key === toStatus);
      if (!status) {
        throw new Error(`Unknown task status: ${toStatus}`);
      }

      const { data: task } = await dataProvider.getOne<Task>("tasks", {
        id: taskId,
      });
      const currentUser = await getIdentity();
      const now = new Date().toISOString();
      const isCompleted = toStatus === "completed";
      const isCanceled = toStatus === "canceled";

      const { data } = await dataProvider.update<Task>("tasks", {
        id: taskId,
        data: {
          status_id: status.id,
          status_key: toStatus,
          status_label: status.label,
          status_is_open: status.is_open,
          status_is_terminal: status.is_terminal,
          counts_as_done: status.counts_as_done,
          completed_at: isCompleted ? now : null,
          completed_by: isCompleted ? currentUser?.id : null,
          canceled_at: isCanceled ? now : null,
          cancel_reason: isCanceled ? (options.reason ?? null) : null,
          start_at:
            toStatus === "in_progress" && task.start_at == null
              ? now
              : task.start_at,
          // Legacy shim, mirrored exactly as the database trigger does.
          done_date: isCompleted ? now : null,
          updated_at: now,
        },
        previousData: task,
      });

      // Closing a task releases whatever it was blocking (§10.4). In the real
      // backend this is the `tasks_unblock_dependents` trigger.
      if (!status.is_open) {
        await releaseDependentsOf(dataProvider, taskId);
      }

      return data;
    },
    /**
     * Demo-mode counterpart of `public.link_task_to_entity()` (§14.2). There is
     * no `task_links` table here — the fake provider serves the task row as if
     * it were the `tasks_summary` view — so the primary link is written onto
     * the task itself.
     */
    linkTaskToEntity: async (
      taskId: Identifier,
      entityType: TaskEntityType,
      entityId: Identifier,
      options: { label?: string | null; primary?: boolean } = {},
    ) => {
      const { data: task } = await dataProvider.getOne<Task>("tasks", {
        id: taskId,
      });

      const { data } = await dataProvider.update<Task>("tasks", {
        id: taskId,
        data: {
          primary_entity_type: entityType,
          primary_entity_id: entityId,
          primary_entity_label: options.label ?? null,
        },
        previousData: task,
      });

      return data;
    },
    /**
     * Demo-mode counterpart of the private `task-attachments` bucket (§3.2).
     * The bytes stay in the browser; the row that references them is created
     * by the caller exactly as it is against the real backend.
     */
    uploadTaskAttachment,
    getTaskAttachmentUrl,
    mergeContacts: async (sourceId: Identifier, targetId: Identifier) => {
      return mergeContacts(sourceId, targetId, baseDataProvider);
    },
    convertLead: async (
      leadId: Identifier,
      options: ConvertLeadOptions = {},
    ) => {
      return convertLead(leadId, options, baseDataProvider);
    },
    getConfiguration: async (): Promise<ConfigurationContextValue> => {
      const { data } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      return (data?.config as ConfigurationContextValue) ?? {};
    },
    updateConfiguration: async (
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> => {
      const { data: prev } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      await baseDataProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: prev,
      });
      return config;
    },
  };

  const dataProvider = withLifecycleCallbacks(
    withSupabaseFilterAdapter(dataProviderWithCustomMethod),
    [
      {
        resource: "configuration",
        beforeUpdate: async (params) => {
          const config = params.data.config;
          if (config) {
            config.lightModeLogo = await processConfigLogo(
              config.lightModeLogo,
            );
            config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
          }
          return params;
        },
      },
      {
        resource: "sales",
        beforeCreate: async (params) => {
          const { data } = params;
          // Default new users to the least privileged role
          if (data.role == null) {
            data.role = "rep";
          }
          return params;
        },
        afterSave: async (data) => {
          // Since the current user is stored in localStorage in fakerest authProvider
          // we need to update it to keep information up to date in the UI
          const currentUser = await getIdentity();
          if (currentUser?.id === data.id) {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
          }
          return data;
        },
        beforeDelete: async (params) => {
          if (params.meta?.identity?.id == null) {
            throw new Error("Identity MUST be set in meta");
          }

          const newSaleId = params.meta.identity.id as Identifier;

          const [companies, contacts, contactNotes, deals] = await Promise.all([
            dataProvider.getList("companies", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
            dataProvider.getList("contacts", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
            dataProvider.getList("contact_notes", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
            dataProvider.getList("deals", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
          ]);

          await Promise.all([
            dataProvider.updateMany("companies", {
              ids: companies.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
            dataProvider.updateMany("contacts", {
              ids: contacts.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
            dataProvider.updateMany("contact_notes", {
              ids: contactNotes.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
            dataProvider.updateMany("deals", {
              ids: deals.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
          ]);

          return params;
        },
      } satisfies ResourceCallbacks<Sale>,
      {
        resource: "contacts",
        beforeCreate: async (createParams, dataProvider) => {
          const params = {
            ...createParams,
            data: {
              ...createParams.data,
              first_seen:
                createParams.data.first_seen ?? new Date().toISOString(),
              last_seen:
                createParams.data.last_seen ?? new Date().toISOString(),
            },
          };
          const newParams = await processContactAvatar(params);
          return fetchAndUpdateCompanyData(newParams, dataProvider);
        },
        afterCreate: async (result) => {
          if (result.data.company_id != null) {
            await updateCompany(result.data.company_id, (company) => ({
              nb_contacts: (company.nb_contacts ?? 0) + 1,
            }));
          }

          return result;
        },
        beforeUpdate: async (params) => {
          const newParams = await processContactAvatar(params);
          return fetchAndUpdateCompanyData(newParams, dataProvider);
        },
        afterDelete: async (result) => {
          if (result.data.company_id != null) {
            await updateCompany(result.data.company_id, (company) => ({
              nb_contacts: (company.nb_contacts ?? 1) - 1,
            }));
          }

          return result;
        },
      } satisfies ResourceCallbacks<Contact>,
      {
        resource: "tasks",
        afterCreate: async (result, dataProvider) => {
          // update the task count in the related contact.
          // A task no longer has to belong to a contact — it may hang off a
          // deal, a company or a lead (§14) — so there is nothing to count
          // when the contact link is absent.
          const { contact_id } = result.data;
          if (contact_id == null) return result;
          const { data: contact } = await dataProvider.getOne("contacts", {
            id: contact_id,
          });
          await dataProvider.update("contacts", {
            id: contact_id,
            data: {
              nb_tasks: (contact.nb_tasks ?? 0) + 1,
            },
            previousData: contact,
          });
          return result;
        },
        beforeUpdate: async (params) => {
          const { data, previousData } = params;
          if (previousData.done_date !== data.done_date) {
            taskUpdateType = data.done_date
              ? TASK_MARKED_AS_DONE
              : TASK_MARKED_AS_UNDONE;
          } else {
            taskUpdateType = TASK_DONE_NOT_CHANGED;
          }
          return params;
        },
        afterUpdate: async (result, dataProvider) => {
          // update the contact: if the task is done, decrement the nb tasks, otherwise increment it
          const { contact_id } = result.data;
          if (contact_id == null) return result;
          const { data: contact } = await dataProvider.getOne("contacts", {
            id: contact_id,
          });
          if (taskUpdateType !== TASK_DONE_NOT_CHANGED) {
            await dataProvider.update("contacts", {
              id: contact_id,
              data: {
                nb_tasks:
                  taskUpdateType === TASK_MARKED_AS_DONE
                    ? (contact.nb_tasks ?? 0) - 1
                    : (contact.nb_tasks ?? 0) + 1,
              },
              previousData: contact,
            });
          }
          return result;
        },
        afterDelete: async (result, dataProvider) => {
          // update the task count in the related contact
          const { contact_id } = result.data;
          if (contact_id == null) return result;
          const { data: contact } = await dataProvider.getOne("contacts", {
            id: contact_id,
          });
          await dataProvider.update("contacts", {
            id: contact_id,
            data: {
              nb_tasks: (contact.nb_tasks ?? 0) - 1,
            },
            previousData: contact,
          });
          return result;
        },
      } satisfies ResourceCallbacks<Task>,
      // Demo-mode stand-in for the `task_comments` triggers (§8).
      taskCommentCallbacks(getIdentity),
      // Demo-mode stand-in for the `task_attachments` triggers (§3.2).
      taskAttachmentCallbacks(getIdentity),
      // Demo-mode stand-in for the `task_comment_reactions` triggers (§8.2).
      taskCommentReactionCallbacks(getIdentity),
      // Demo-mode stand-in for the `task_checklist_items` triggers (§11).
      taskChecklistCallbacks(getIdentity),
      // Demo-mode stand-in for the `task_dependencies` triggers (§10).
      taskDependencyCallbacks(getIdentity),
      // Demo-mode stand-in for the `task_reminders` triggers (§9).
      taskReminderCallbacks(getIdentity),
      // Demo-mode stand-in for the `task_assignments` triggers (§7).
      taskAssignmentCallbacks(getIdentity),
      {
        // `teams_summary.nb_members` has no view here, so the counter is kept
        // on the team row — the same approach as `nb_tasks` / `nb_contacts`.
        resource: "team_members",
        // `team_members_summary` joins `sales` for the roster's name and role.
        // Demo mode has no join, so the identity is stamped onto the row at
        // insert — otherwise a member added during the session shows up in the
        // roster as a bare id.
        beforeCreate: async (params, dataProvider) => {
          // No sale to resolve means the caller is inserting something the
          // roster cannot describe anyway; let it through and let the write
          // fail on its own terms rather than here.
          if (params.data.sales_id == null) {
            return params;
          }
          const { data: sale } = await dataProvider.getOne<Sale>("sales", {
            id: params.data.sales_id,
          });
          return {
            ...params,
            data: {
              ...params.data,
              first_name: sale.first_name,
              last_name: sale.last_name,
              email: sale.email,
              role: sale.role,
              disabled: sale.disabled ?? false,
            },
          };
        },
        afterCreate: async (result, dataProvider) => {
          const { data: team } = await dataProvider.getOne<Team>("teams", {
            id: result.data.team_id,
          });
          await dataProvider.update("teams", {
            id: team.id,
            data: { nb_members: (team.nb_members ?? 0) + 1 },
            previousData: team,
          });
          return result;
        },
        afterDelete: async (result, dataProvider) => {
          const { data: team } = await dataProvider.getOne<Team>("teams", {
            id: result.data.team_id,
          });
          await dataProvider.update("teams", {
            id: team.id,
            data: { nb_members: Math.max(0, (team.nb_members ?? 1) - 1) },
            previousData: team,
          });
          return result;
        },
      } satisfies ResourceCallbacks<TeamMember>,
      {
        /**
         * Demo-mode stand-in for the two view columns the real backend derives
         * from this table: `teams_summary.allocated_amount` and
         * `team_members_summary.budget_amount`.
         *
         * Kept live rather than snapshotted like the deal aggregates, because
         * this one the visitor edits: the allocation panel writes here and the
         * dashboard reads the result in the same session, so a snapshot would
         * show the split reverting on every navigation.
         */
        resource: "team_member_budgets",
        afterCreate: async (result, dataProvider) => {
          await syncTeamAllocation(
            dataProvider,
            result.data,
            result.data.amount,
          );
          return result;
        },
        afterUpdate: async (result, dataProvider) => {
          await syncTeamAllocation(
            dataProvider,
            result.data,
            result.data.amount,
          );
          return result;
        },
        // The row is gone by now, so the recomputed total already excludes it
        // and the member goes back to having no quota — not a quota of zero.
        afterDelete: async (result, dataProvider) => {
          await syncTeamAllocation(dataProvider, result.data, null);
          return result;
        },
      } satisfies ResourceCallbacks<TeamMemberBudget>,
      {
        // Demo-mode stand-in for the two writes the real data provider makes
        // when the team form is saved: the team, then its budget row. Without
        // this the form's `budget` field would be stored verbatim on the team
        // and the dashboard — which reads `budget_amount` — would show nothing.
        resource: "teams",
        beforeCreate: async (params) => ({
          ...params,
          data: { ...params.data, ...budgetFieldsFor(params.data) },
        }),
        beforeUpdate: async (params) => ({
          ...params,
          data: { ...params.data, ...budgetFieldsFor(params.data) },
        }),
        afterCreate: async (result, dataProvider) => {
          await recordTeamBudget(dataProvider, result.data.id, result.data);
          return result;
        },
        afterUpdate: async (result, dataProvider) => {
          await recordTeamBudget(dataProvider, result.data.id, result.data);
          return result;
        },
      } satisfies ResourceCallbacks<Team>,
      {
        resource: "companies",
        beforeCreate: async (params) => {
          const createParams = await processCompanyLogo(params);

          return {
            ...createParams,
            data: {
              ...createParams.data,
              created_at: new Date().toISOString(),
            },
          };
        },
        beforeUpdate: async (params) => {
          return await processCompanyLogo(params);
        },
        afterUpdate: async (result, dataProvider) => {
          // get all contacts of the company and for each contact, update the company_name
          const { id, name } = result.data;
          const { data: contacts } = await dataProvider.getList("contacts", {
            filter: { company_id: id },
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "id", order: "ASC" },
          });

          const contactIds = contacts.map((contact) => contact.id);
          await dataProvider.updateMany("contacts", {
            ids: contactIds,
            data: { company_name: name },
          });
          return result;
        },
      } satisfies ResourceCallbacks<Company>,
      {
        resource: "deals",
        beforeCreate: async (params) => {
          return {
            ...params,
            data: {
              ...params.data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          };
        },
        afterCreate: async (result) => {
          await updateCompany(result.data.company_id, (company) => ({
            nb_deals: (company.nb_deals ?? 0) + 1,
          }));

          return result;
        },
        beforeUpdate: async (params) => {
          return {
            ...params,
            data: {
              ...params.data,
              updated_at: new Date().toISOString(),
            },
          };
        },
        afterDelete: async (result) => {
          await updateCompany(result.data.company_id, (company) => ({
            nb_deals: (company.nb_deals ?? 1) - 1,
          }));

          return result;
        },
      } satisfies ResourceCallbacks<Deal>,
      {
        resource: "contact_notes",
        beforeSave: async (params) => preserveAttachmentMimeType(params),
      } satisfies ResourceCallbacks<ContactNote>,
      {
        resource: "deal_notes",
        beforeSave: async (params) => preserveAttachmentMimeType(params),
      } satisfies ResourceCallbacks<DealNote>,
    ],
  ) as CrmDataProvider;

  return dataProvider;
};

export const dataProvider = createDataProvider();

/**
 * Convert a `File` object returned by the upload input into a base 64 string.
 * That's not the most optimized way to store images in production, but it's
 * enough to illustrate the idea of dataprovider decoration.
 */
const convertFileToBase64 = (file: { rawFile: Blob }): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    // We know result is a string as we used readAsDataURL
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file.rawFile);
  });
