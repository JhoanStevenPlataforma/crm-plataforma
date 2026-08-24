import { useGetIdentity, useTranslate } from "ra-core";
import { useMemo } from "react";
import { useSearchParams } from "react-router";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AddTask } from "./AddTask";
import { TaskCalendar } from "./TaskCalendar";
import { TaskKanban } from "./TaskKanban";
import { TasksListByDueDate } from "./TasksListByDueDate";
import { parseTaskView, TASK_VIEWS } from "./taskViews";

/**
 * The task page (proposal §15.1, V1/V2/V6/V7 — deliverable 2.9).
 *
 * Until now tasks had no page of their own: they existed as a dashboard widget
 * and as panels on contacts, leads, companies and deals. That is enough to work
 * one record at a time and useless for planning a week, which is what the board
 * and the calendar are for.
 *
 * Both the view and the scope live in the query string, because both are
 * shareable: "here is my board" and "here is the team's calendar for this
 * month" should survive a copied URL and a refresh.
 */
export const TaskList = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const [searchParams, setSearchParams] = useSearchParams();

  const view = parseTaskView(searchParams.get("view"));
  const onlyMine = searchParams.get("scope") !== "all";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  // Scope by OWNER, not by creator: a task somebody delegated to me is mine to
  // do, which is the whole point of the assignment model (§7.3).
  const filter = useMemo(
    () => (onlyMine && identity ? { owner_sales_id: identity.id } : {}),
    [onlyMine, identity],
  );

  // Every view needs the identity before it can scope itself; rendering with an
  // empty filter first would flash everybody's tasks.
  const isReady = !onlyMine || identity != null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={view} onValueChange={(value) => setParam("view", value)}>
          <TabsList>
            {TASK_VIEWS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {translate(`resources.tasks.views.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="tasks-only-mine"
              checked={onlyMine}
              onCheckedChange={(checked) =>
                setParam("scope", checked ? "mine" : "all")
              }
            />
            <Label htmlFor="tasks-only-mine">
              {translate("resources.tasks.filters.only_mine")}
            </Label>
          </div>
          <AddTask selectContact />
        </div>
      </div>

      {isReady && view === "list" && (
        <TasksListByDueDate
          entityFilter={filter}
          showContact
          emptyPlaceholder={
            <p className="text-sm">
              {translate("resources.tasks.empty_list_hint")}
            </p>
          }
        />
      )}
      {isReady && view === "kanban" && <TaskKanban filter={filter} />}
      {isReady && view === "calendar" && <TaskCalendar filter={filter} />}
    </div>
  );
};
