/* eslint-disable react-refresh/only-export-components */
import { memoryStore, type AuthProvider } from "ra-core";
import { useEffect, useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import cloneDeep from "lodash/cloneDeep";
import { Notification } from "@/components/admin/notification";
import { createDataProvider } from "@/components/atomic-crm/providers/fakerest";
import { DEFAULT_USER } from "@/components/atomic-crm/providers/fakerest/authProvider";
import type { Db } from "@/components/atomic-crm/providers/fakerest/dataGenerator/types";
import type { Contact, Lead, Sale, Task } from "@/components/atomic-crm/types";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/components/atomic-crm/providers/fakerest/dataGenerator/taskCatalogues";
import { defaultTaskTypes } from "@/components/atomic-crm/root/defaultConfiguration";
import { CRM } from "@/components/atomic-crm/root/CRM";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";

export const createTestAuthProvider = (): AuthProvider => ({
  canAccess: async () => true,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getIdentity: async () => ({
    avatar: DEFAULT_USER.avatar.src,
    fullName: `${DEFAULT_USER.first_name} ${DEFAULT_USER.last_name}`,
    id: DEFAULT_USER.id,
    role: DEFAULT_USER.role,
  }),
  login: async () => undefined,
  logout: async () => undefined,
});

const baseSale: Sale = {
  role: "admin",
  avatar: DEFAULT_USER.avatar as Sale["avatar"],
  disabled: false,
  email: DEFAULT_USER.email,
  first_name: DEFAULT_USER.first_name,
  id: DEFAULT_USER.id,
  last_name: DEFAULT_USER.last_name,
  password: DEFAULT_USER.password,
  user_id: DEFAULT_USER.id.toString(),
};

// Provide a minimal FakeRest database shape so tests can override only the records
// that matter for each scenario.
export const createCrmDb = (overrides: Partial<Db> = {}): Db =>
  ({
    companies: [],
    configuration: [{ config: {}, id: 1 }],
    contact_notes: [],
    contacts: [],
    deal_notes: [],
    deal_stage_changes: [],
    deals: [],
    leads: [],
    sales: [baseSale],
    tags: [],
    teams: [],
    team_members: [],
    tasks: [],
    task_assignments: [],
    // The seeded catalogues, so the task form's ReferenceInputs and the status
    // badges resolve without every test having to declare them.
    task_events: [],
    task_comments: [],
    task_comment_revisions: [],
    task_comment_reactions: [],
    task_attachments: [],
    task_checklist_items: [],
    task_dependencies: [],
    notification_preferences: [],
    task_statuses: TASK_STATUSES,
    task_priorities: TASK_PRIORITIES,
    task_types: defaultTaskTypes.map((taskType, index) => ({
      id: index + 1,
      key: taskType.value,
      label: taskType.label,
    })),
    ...overrides,
  }) as Db;

// Build a valid contact record with sensible defaults to keep tests and stories terse.
export const buildContact = (overrides: Partial<Contact> = {}): Contact => ({
  background: "",
  company_id: null,
  company_name: undefined,
  email_jsonb: [{ email: "ada@example.com", type: "Work" }],
  first_name: "Ada",
  first_seen: "2025-01-01T09:00:00.000Z",
  gender: "female",
  has_newsletter: false,
  id: 1,
  last_name: "Lovelace",
  last_seen: "2025-01-02T10:00:00.000Z",
  linkedin_url: null,
  nb_tasks: 0,
  phone_jsonb: [],
  sales_id: 0,
  status: "warm",
  tags: [],
  title: "CTO",
  ...overrides,
});

// Build a task in the shape `tasks_summary` returns, so component tests see the
// same record the real backend serves.
export const buildTask = (overrides: Partial<Task> = {}): Task => ({
  id: 1,
  title: "Call Ada about the renewal",
  description: null,
  due_date: "2025-01-03T12:00:00.000Z",
  completed_at: null,
  canceled_at: null,
  deleted_at: null,
  status_key: "pending",
  status_label: "Pending",
  status_is_open: true,
  status_is_terminal: false,
  counts_as_done: false,
  priority_key: "normal",
  priority_label: "Normal",
  priority_id: 2,
  status_id: 1,
  type_key: "call",
  type_label: "Call",
  type: "call",
  text: "Call Ada about the renewal",
  done_date: null,
  contact_id: 1,
  sales_id: 0,
  owner_sales_id: 0,
  created_by: 0,
  created_at: "2025-01-01T09:00:00.000Z",
  updated_at: "2025-01-01T09:00:00.000Z",
  reschedule_count: 0,
  reassign_count: 0,
  comment_count: 0,
  attachment_count: 0,
  checklist_total: 0,
  checklist_done: 0,
  blocked_seconds: 0,
  source: "manual",
  primary_entity_type: "contact",
  primary_entity_id: 1,
  primary_entity_label: "Ada Lovelace",
  is_overdue: false,
  ...overrides,
});

// Build a valid lead record with sensible defaults to keep tests and stories terse.
export const buildLead = (overrides: Partial<Lead> = {}): Lead => ({
  company_id: null,
  company_name: "Prospect Industries",
  converted_at: null,
  converted_company_id: null,
  converted_contact_id: null,
  converted_deal_id: null,
  created_at: "2025-01-01T09:00:00.000Z",
  email: "lucia@prospect.example",
  first_name: "Lucia",
  id: 1,
  last_name: "Prospect",
  notes: "",
  phone: "+34600111222",
  sales_id: 0,
  score: 50,
  source: "web",
  status: "new",
  tags: [],
  title: "CTO",
  updated_at: "2025-01-01T09:00:00.000Z",
  ...overrides,
});

export const StoryWrapper = ({
  children,
  data,
  dataProvider: dataProviderOverrides,
  authProvider: authProviderOverrides,
  initialEntries,
  silent = import.meta.env.MODE === "test",
}: {
  children: ReactNode;
  data?: Partial<Db>;
  dataProvider?: Partial<ReturnType<typeof createDataProvider>>;
  /** Override `canAccess` / `getIdentity` to render a story as a given role. */
  authProvider?: Partial<AuthProvider>;
  initialEntries?: string[];
  silent?: boolean;
}) => {
  const authProvider = useMemo(
    () => ({ ...createTestAuthProvider(), ...authProviderOverrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const dataProvider = useMemo(
    () => ({
      ...createDataProvider({ db: createCrmDb(cloneDeep(data)), silent }),
      ...dataProviderOverrides,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const store = useMemo(() => memoryStore(), []);

  useEffect(() => {
    // Clear localStorage on mount to prevent data pollution from previous story / test, since we persist react-query cache in localStorage.
    localStorage.clear();
  }, []);

  return (
    <MemoryRouter initialEntries={initialEntries}>
      <CRM
        authProvider={authProvider}
        dataProvider={dataProvider}
        i18nProvider={testI18nProvider}
        dashboard={() => <>{children}</>}
        store={store}
        disableTelemetry
        layout={({ children }) => (
          <>
            {children}
            <Notification />
          </>
        )}
      />
    </MemoryRouter>
  );
};
