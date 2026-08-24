import { supabaseDataProvider } from "ra-supabase-core";
import {
  withLifecycleCallbacks,
  type DataProvider,
  type GetListParams,
  type Identifier,
  type ResourceCallbacks,
} from "ra-core";
import type {
  ContactNote,
  Deal,
  DealNote,
  RAFile,
  Sale,
  SalesFormData,
  SignUpData,
  Task,
  TaskAttachmentUpload,
  TaskEntityType,
  TaskStatusKey,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { ATTACHMENTS_BUCKET } from "../commons/attachments";
import {
  buildTaskAttachmentPath,
  describeUpload,
  TASK_ATTACHMENT_URL_TTL,
  TASK_ATTACHMENTS_BUCKET,
} from "../commons/taskAttachments";
import { getIsInitialized } from "./authProvider";
import { getSupabaseClient } from "./supabase";

const getBaseDataProvider = () =>
  supabaseDataProvider({
    instanceUrl: import.meta.env.VITE_SUPABASE_URL,
    apiKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
    supabaseClient: getSupabaseClient(),
    sortOrder: "asc,desc.nullslast" as any,
  });

/**
 * Columns that reach the team form but do not exist on `public.teams`: the
 * reporting columns computed by `teams_summary`, plus the three write-only
 * budget inputs that become a `team_budgets` row.
 *
 * A denylist rather than an allowlist so a genuinely new column on `teams`
 * saves without anyone remembering to register it here — PostgREST rejects the
 * whole write on an unknown column, so the failure mode of the reverse choice
 * is a form that silently stops saving.
 */
const TEAM_VIRTUAL_FIELDS = [
  "nb_members",
  "nb_deals",
  "budget_id",
  "budget_amount",
  "budget_period_start",
  "budget_period_end",
  "pipeline_amount",
  "won_amount",
  "allocated_amount",
  "budget",
  "budget_start",
  "budget_end",
] as const;

const stripTeamVirtuals = (data: Record<string, any> | undefined) => {
  const clean: Record<string, any> = { ...(data ?? {}) };
  for (const field of TEAM_VIRTUAL_FIELDS) {
    delete clean[field];
  }
  return clean;
};

/**
 * Surfaces the vigente budget under the names the form inputs bind to.
 *
 * Returns `any` so the `getOne` override stays assignable to the generic
 * `DataProvider` contract — narrowing the record type here makes every
 * `useDataProvider<CrmDataProvider>()` call site fail to typecheck.
 */
const withTeamBudgetFormFields = (team: Record<string, any>): any => ({
  ...team,
  budget: team.budget_amount ?? null,
  budget_start: team.budget_period_start ?? null,
  budget_end: team.budget_period_end ?? null,
});

/**
 * Writes the budget the team form submitted.
 *
 * Keyed on `(team_id, period_start)`: re-saving the form with the same period
 * updates the amount in place, while a new period inserts a row and keeps the
 * old one. A period that overlaps an existing one is rejected by the database,
 * which surfaces as a save error rather than a silently ambiguous budget.
 */
const upsertTeamBudget = async (
  baseDataProvider: DataProvider,
  teamId: Identifier,
  data: Record<string, any> | undefined,
) => {
  const amount = data?.budget;
  const periodStart = data?.budget_start;
  const periodEnd = data?.budget_end;

  if (amount == null || amount === "" || !periodStart || !periodEnd) {
    return;
  }

  const { data: existing } = await baseDataProvider.getList("team_budgets", {
    filter: { team_id: teamId, period_start: periodStart },
    sort: { field: "id", order: "ASC" },
    pagination: { page: 1, perPage: 1 },
  });

  if (existing?.length) {
    await baseDataProvider.update("team_budgets", {
      id: existing[0].id,
      data: { amount, period_end: periodEnd },
      previousData: existing[0],
    });
    return;
  }

  await baseDataProvider.create("team_budgets", {
    data: {
      team_id: teamId,
      amount,
      period_start: periodStart,
      period_end: periodEnd,
    },
  });
};

const processCompanyLogo = async (params: any) => {
  const logo = params.data.logo;

  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

const getDataProviderWithCustomMethods = () => {
  const baseDataProvider = getBaseDataProvider();

  return {
    ...baseDataProvider,
    async getList(resource: string, params: GetListParams) {
      if (resource === "companies") {
        return baseDataProvider.getList("companies_summary", params);
      }
      if (resource === "contacts") {
        return baseDataProvider.getList("contacts_summary", params);
      }
      // Tasks read the denormalized projection so a list does not resolve the
      // status / priority / type catalogues row by row (§3.4).
      if (resource === "tasks") {
        return baseDataProvider.getList("tasks_summary", params);
      }
      // Same reasoning for the member count (deliverable 2.4).
      if (resource === "teams") {
        return baseDataProvider.getList("teams_summary", params);
      }
      // The roster carries each member's name and workload, so the dashboard
      // does not resolve a sale and count their deals row by row.
      if (resource === "team_members") {
        return baseDataProvider.getList("team_members_summary", params);
      }
      if (resource === "activity_log") {
        const { data, total } = await baseDataProvider.getList(
          "activity_log",
          params,
        );
        // Rename snake_case view columns to camelCase to match Activity type
        return {
          data: data.map((row: any) => ({
            ...row,
            contactNote: row.contact_note ?? undefined,
            dealNote: row.deal_note ?? undefined,
            contact_note: undefined,
            deal_note: undefined,
          })),
          total,
        };
      }

      return baseDataProvider.getList(resource, params);
    },
    /**
     * Deleting a task is a soft delete (§4.4, §17.1): the row and its whole
     * history are retained, and only a retention job may ever remove them.
     *
     * The database enforces that with a BEFORE DELETE trigger, but a suppressed
     * DELETE returns no rows through PostgREST, which leaves react-admin
     * without the record it expects. Issuing the soft delete explicitly keeps
     * the API contract intact; the trigger stays as the safety net for any
     * other client.
     */
    async delete(resource: string, params: any) {
      if (resource === "tasks") {
        return baseDataProvider.update("tasks", {
          id: params.id,
          data: { deleted_at: new Date().toISOString() },
          previousData: params.previousData ?? { id: params.id },
        });
      }
      return baseDataProvider.delete(resource, params);
    },
    async deleteMany(resource: string, params: any) {
      if (resource === "tasks") {
        return baseDataProvider.updateMany("tasks", {
          ids: params.ids,
          data: { deleted_at: new Date().toISOString() },
        });
      }
      return baseDataProvider.deleteMany(resource, params);
    },
    async getOne(resource: string, params: any) {
      if (resource === "companies") {
        return baseDataProvider.getOne("companies_summary", params);
      }
      if (resource === "contacts") {
        return baseDataProvider.getOne("contacts_summary", params);
      }
      if (resource === "tasks") {
        return baseDataProvider.getOne("tasks_summary", params);
      }
      // The edit form needs the vigente budget to prefill its inputs, and the
      // budget lives in its own table — `teams_summary` is where the two are
      // already joined.
      if (resource === "teams") {
        const { data } = await baseDataProvider.getOne("teams_summary", params);
        return { data: withTeamBudgetFormFields(data) };
      }
      // Same projection the roster reads, so the member drill-down opens with
      // the name, the quota and the workload already resolved. Reading the bare
      // join row here would give a page with an id and nothing else on it.
      if (resource === "team_members") {
        return baseDataProvider.getOne("team_members_summary", params);
      }

      return baseDataProvider.getOne(resource, params);
    },
    /**
     * A team and its budget are two tables, so saving the create form is two
     * writes. Doing it here rather than in the component keeps the form
     * declarative and gives the edit form the same behaviour for free.
     */
    async create(resource: string, params: any) {
      if (resource === "teams") {
        const created = await baseDataProvider.create("teams", {
          ...params,
          data: stripTeamVirtuals(params.data),
        });
        await upsertTeamBudget(baseDataProvider, created.data.id, params.data);
        return created;
      }
      return baseDataProvider.create(resource, params);
    },
    async update(resource: string, params: any) {
      if (resource === "teams") {
        const updated = await baseDataProvider.update("teams", {
          ...params,
          data: stripTeamVirtuals(params.data),
        });
        await upsertTeamBudget(baseDataProvider, params.id, params.data);
        return updated;
      }
      return baseDataProvider.update(resource, params);
    },

    async signUp({ email, password, first_name, last_name }: SignUpData) {
      const response = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name,
            last_name,
          },
        },
      });

      if (!response.data?.user || response.error) {
        console.error("signUp.error", response.error);
        throw new Error(response?.error?.message || "Failed to create account");
      }

      // Update the is initialized cache
      (getIsInitialized as any)._is_initialized_cache = true;

      return {
        id: response.data.user.id,
        email,
        password,
      };
    },
    async salesCreate(body: SalesFormData) {
      const { data, error } = await getSupabaseClient().functions.invoke<{
        data: Sale;
      }>("users", {
        method: "POST",
        body,
      });

      if (!data || error) {
        console.error("salesCreate.error", error);
        const errorDetails = await (async () => {
          try {
            return (await error?.context?.json()) ?? {};
          } catch {
            return {};
          }
        })();
        throw new Error(errorDetails?.message || "Failed to create the user");
      }

      return data.data;
    },
    async salesUpdate(
      id: Identifier,
      data: Partial<Omit<SalesFormData, "password">>,
    ) {
      const { email, first_name, last_name, role, avatar, disabled } = data;

      const { data: updatedData, error } =
        await getSupabaseClient().functions.invoke<{
          data: Sale;
        }>("users", {
          method: "PATCH",
          body: {
            sales_id: id,
            email,
            first_name,
            last_name,
            role,
            disabled,
            avatar,
          },
        });

      if (!updatedData || error) {
        console.error("salesCreate.error", error);
        throw new Error("Failed to update account manager");
      }

      return updatedData.data;
    },
    async updatePassword(id: Identifier) {
      const { data: passwordUpdated, error } =
        await getSupabaseClient().functions.invoke<boolean>("update_password", {
          method: "PATCH",
          body: {
            sales_id: id,
          },
        });

      if (!passwordUpdated || error) {
        console.error("update_password.error", error);
        throw new Error("Failed to update password");
      }

      return passwordUpdated;
    },
    async unarchiveDeal(deal: Deal) {
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
          baseDataProvider.update("deals", {
            id: updatedDeal.id,
            data: updatedDeal,
            previousData: deals.find((d) => d.id === updatedDeal.id),
          }),
        ),
      );
    },
    /**
     * Moves a deal to another stage, with the reason and the files that
     * justify it.
     *
     * The kanban used to `update` the stage and nothing else, which is how a
     * board ends up full of cards nobody can explain. `move_deal_stage()`
     * writes the move and its justification in one transaction: two client
     * writes can half-fail, and the half that survives is always the one that
     * moved the card.
     *
     * Files go to the bucket first, so a history row can never point at bytes
     * that failed to upload. They are stored in `deal_notes.attachments` shape
     * on purpose — the note attachment renderer then works here unchanged.
     */
    async moveDealStage(
      dealId: Identifier,
      toStage: string,
      options: { reason: string; index?: number; attachments?: File[] },
    ): Promise<Deal> {
      // An empty `src` is what tells `uploadToBucket` to send the raw file
      // rather than fetch a URL first — there is no object URL to fetch here,
      // the bytes are already in hand.
      const uploaded = options.attachments?.length
        ? await Promise.all(
            options.attachments.map((file) =>
              uploadToBucket({
                src: "",
                title: file.name,
                type: file.type,
                rawFile: file,
              }),
            ),
          )
        : [];

      // Only the persisted shape reaches the row. `uploadToBucket` hands back
      // the input object, `rawFile` File handle included, and that serializes
      // into the audit trail as an empty object nobody can interpret later.
      const attachments = uploaded.map(({ src, title, type, path }) => ({
        src,
        title,
        type,
        path,
      }));

      const { data, error } = await getSupabaseClient().rpc("move_deal_stage", {
        p_deal_id: dealId,
        p_to_stage: toStage,
        p_reason: options.reason,
        p_index: options.index ?? null,
        p_attachments: attachments,
      });

      if (error) {
        console.error("move_deal_stage.error", error);
        throw new Error(error.message || "Failed to move the deal");
      }

      return data as Deal;
    },
    /**
     * The single write path for a task's status (§4.5).
     *
     * `transition_task()` validates the move against `task_transitions`,
     * enforces the §17.1 capabilities and emits the transition's own audit
     * event. A plain `update` on `status_id` is rejected by a database guard,
     * so this is not an optimization — it is the only way to change a status.
     */
    async transitionTask(
      taskId: Identifier,
      toStatus: TaskStatusKey,
      options: { reason?: string; metadata?: Record<string, unknown> } = {},
    ): Promise<Task> {
      const { data, error } = await getSupabaseClient().rpc("transition_task", {
        p_task_id: taskId,
        p_to_status: toStatus,
        p_reason: options.reason ?? null,
        p_metadata: options.metadata ?? {},
      });

      if (error) {
        console.error("transition_task.error", error);
        throw new Error(error.message || "Failed to update the task status");
      }

      return data as Task;
    },
    /**
     * Attach a task to a contact / lead / company / deal (§14.2).
     *
     * Server-side because the operation is three statements that must agree:
     * demote the previous primary link, insert the new one, emit `link.added`.
     * It also resolves `linked_by` from the session instead of trusting the
     * client, and is idempotent, so a double click cannot duplicate a link.
     */
    async linkTaskToEntity(
      taskId: Identifier,
      entityType: TaskEntityType,
      entityId: Identifier,
      options: { label?: string | null; primary?: boolean } = {},
    ) {
      const { data, error } = await getSupabaseClient().rpc(
        "link_task_to_entity",
        {
          p_task_id: taskId,
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_label: options.label ?? null,
          p_primary: options.primary ?? true,
        },
      );

      if (error) {
        console.error("link_task_to_entity.error", error);
        throw new Error(error.message || "Failed to link the task");
      }

      return data;
    },
    /**
     * Stores the bytes of a task attachment, and returns the metadata the
     * `task_attachments` row is built from (§3.2).
     *
     * Two steps rather than one write: the object goes up first, so a row can
     * never describe a file that failed to upload. The path carries the task
     * id because the storage policy reads it back out to decide who may
     * download the object (§17.3).
     */
    async uploadTaskAttachment(
      taskId: Identifier,
      file: File,
    ): Promise<TaskAttachmentUpload> {
      const path = buildTaskAttachmentPath(taskId, file.name);

      const { error } = await getSupabaseClient()
        .storage.from(TASK_ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

      if (error) {
        console.error("uploadTaskAttachment.error", error);
        throw new Error(error.message || "Failed to upload the attachment");
      }

      return describeUpload(path, file);
    },
    /**
     * A short-lived signed URL for one attachment.
     *
     * The bucket is private, so there is no permanent link to hand out: the
     * URL is minted per download, and the storage policy re-checks task
     * visibility at that moment.
     */
    async getTaskAttachmentUrl(storagePath: string): Promise<string> {
      const { data, error } = await getSupabaseClient()
        .storage.from(TASK_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath, TASK_ATTACHMENT_URL_TTL);

      if (error || !data?.signedUrl) {
        console.error("getTaskAttachmentUrl.error", error);
        throw new Error(error?.message || "Failed to open the attachment");
      }

      return data.signedUrl;
    },
    async isInitialized() {
      return getIsInitialized();
    },
    async mergeContacts(sourceId: Identifier, targetId: Identifier) {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "merge_contacts",
        {
          method: "POST",
          body: { loserId: sourceId, winnerId: targetId },
        },
      );

      if (error) {
        console.error("merge_contacts.error", error);
        throw new Error("Failed to merge contacts");
      }

      return data;
    },
    /**
     * Turns a lead into a company + contact (+ optional deal) in a single
     * database call, and returns the new contact id.
     *
     * Deliberately not three client-side writes: a failure half-way would
     * leave an orphan company, and two people converting the same lead at
     * once would produce two contacts. `convert_lead()` runs under the
     * caller's own permissions, so row level security still applies.
     */
    async convertLead(
      leadId: Identifier,
      options: {
        createDeal?: boolean;
        dealName?: string;
        dealAmount?: number;
      } = {},
    ): Promise<Identifier> {
      const { data, error } = await getSupabaseClient().rpc("convert_lead", {
        lead_id: leadId,
        create_deal: options.createDeal ?? false,
        deal_name: options.dealName ?? null,
        deal_amount: options.dealAmount ?? 0,
      });

      if (error) {
        console.error("convert_lead.error", error);
        throw new Error(error.message || "Failed to convert the lead");
      }

      return data as Identifier;
    },
    async getConfiguration(): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      return (data?.config as ConfigurationContextValue) ?? {};
    },
    async updateConfiguration(
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: { id: 1 },
      });
      return data.config as ConfigurationContextValue;
    },
  } satisfies DataProvider;
};

export type CrmDataProvider = ReturnType<
  typeof getDataProviderWithCustomMethods
>;

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
    return logo.src;
  }
  return logo?.src ?? "";
};

const lifeCycleCallbacks: ResourceCallbacks[] = [
  {
    resource: "configuration",
    beforeUpdate: async (params) => {
      const config = params.data.config;
      if (config) {
        config.lightModeLogo = await processConfigLogo(config.lightModeLogo);
        config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
      }
      return params;
    },
  },
  {
    resource: "contact_notes",
    beforeSave: async (data: ContactNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "deal_notes",
    beforeSave: async (data: DealNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "sales",
    beforeSave: async (data: Sale, _, __) => {
      if (data.avatar) {
        await uploadToBucket(data.avatar);
      }
      return data;
    },
  },
  {
    resource: "contacts",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "first_name",
        "last_name",
        "company_name",
        "title",
        "email",
        "phone",
        "background",
      ])(params);
    },
  },
  {
    resource: "companies",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "name",
        "phone_number",
        "website",
        "zipcode",
        "city",
        "state_abbr",
      ])(params);
    },
    beforeCreate: async (params) => {
      const createParams = await processCompanyLogo(params);

      return {
        ...createParams,
        data: {
          created_at: new Date().toISOString(),
          ...createParams.data,
        },
      };
    },
    beforeUpdate: async (params) => {
      return await processCompanyLogo(params);
    },
  },
  {
    resource: "contacts_summary",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["first_name", "last_name"])(params);
    },
  },
  {
    resource: "deals",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["name", "category", "description"])(params);
    },
  },
  {
    resource: "tasks_summary",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["title", "description"])(params);
    },
  },
  {
    resource: "teams_summary",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["name", "description"])(params);
    },
  },
  {
    resource: "leads",
    beforeGetList: async (params) => {
      return applyFullTextSearch(
        ["first_name", "last_name", "email", "company_name", "title", "notes"],
        {},
      )(params);
    },
  },
];

export const getDataProvider = () => {
  if (import.meta.env.VITE_SUPABASE_URL === undefined) {
    throw new Error("Please set the VITE_SUPABASE_URL environment variable");
  }
  if (import.meta.env.VITE_SB_PUBLISHABLE_KEY === undefined) {
    throw new Error(
      "Please set the VITE_SB_PUBLISHABLE_KEY environment variable",
    );
  }
  return withLifecycleCallbacks(
    getDataProviderWithCustomMethods(),
    lifeCycleCallbacks,
  ) as CrmDataProvider;
};

/**
 * Contacts keep their emails and phones in jsonb, so `contacts_summary`
 * flattens them into `email_fts` / `phone_fts` for searching. Resources that
 * store those as plain columns (leads) pass an empty alias map and are
 * searched on the real column.
 */
const CONTACT_FTS_ALIASES: Record<string, string> = {
  email: "email_fts",
  phone: "phone_fts",
};

const applyFullTextSearch =
  (columns: string[], aliases: Record<string, string> = CONTACT_FTS_ALIASES) =>
  (params: GetListParams) => {
    if (!params.filter?.q) {
      return params;
    }
    const { q, ...filter } = params.filter;
    return {
      ...params,
      filter: {
        ...filter,
        "@or": columns.reduce(
          (acc, column) => ({
            ...acc,
            [`${aliases[column] ?? column}@ilike`]: q,
          }),
          {},
        ),
      },
    };
  };

const uploadToBucket = async (fi: RAFile) => {
  if (!fi.src.startsWith("blob:") && !fi.src.startsWith("data:")) {
    // Sign URL check if path exists in the bucket
    if (fi.path) {
      const { error } = await getSupabaseClient()
        .storage.from(ATTACHMENTS_BUCKET)
        .createSignedUrl(fi.path, 60);

      if (!error) {
        return fi;
      }
    }
  }

  const dataContent = fi.src
    ? await fetch(fi.src)
        .then((res) => {
          if (res.status !== 200) {
            return null;
          }
          return res.blob();
        })
        .catch(() => null)
    : fi.rawFile;

  if (dataContent == null) {
    // We weren't able to download the file from its src (e.g. user must be signed in on another website to access it)
    // or the file has no content (not probable)
    // In that case, just return it as is: when trying to download it, users should be redirected to the other website
    // and see they need to be signed in. It will then be their responsibility to upload the file back to the note.
    return fi;
  }

  const file = fi.rawFile;
  const fileParts = file.name.split(".");
  const fileExt = fileParts.length > 1 ? `.${file.name.split(".").pop()}` : "";
  const fileName = `${Math.random()}${fileExt}`;
  const filePath = `${fileName}`;
  const { error: uploadError } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .upload(filePath, dataContent);

  if (uploadError) {
    console.error("uploadError", uploadError);
    throw new Error("Failed to upload attachment");
  }

  const { data } = getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .getPublicUrl(filePath);

  fi.path = filePath;
  fi.src = data.publicUrl;

  // save MIME type
  const mimeType = file.type;
  fi.type = mimeType;

  return fi;
};
