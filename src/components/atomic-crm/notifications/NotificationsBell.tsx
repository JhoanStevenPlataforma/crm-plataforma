import { Bell } from "lucide-react";
import { useTranslate } from "ra-core";

import { DateField } from "@/components/admin/date-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useTaskNotifications } from "./useTaskNotifications";

/** Past this, the badge stops being a number and starts being a warning. */
const BADGE_CAP = 9;

/**
 * The in-app notification inbox in the header (proposal §9.4, §15).
 *
 * Adoption is the whole reason this exists: B6 in the proposal is "no
 * reminders, so tasks are only seen if the user opens the tab". A badge the
 * user passes on every screen is what closes that gap.
 *
 * Clicking an entry marks it read and nothing else — no navigation guess. The
 * notification names its task; where the user goes from there is their call.
 */
export const NotificationsBell = () => {
  const translate = useTranslate();
  const { notifications, unreadCount, markAsRead } = useTaskNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={translate("crm.notifications.title")}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center px-1 text-[10px]"
            >
              {unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>
          {translate("crm.notifications.title")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {translate("crm.notifications.empty")}
          </p>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex flex-col items-start gap-0.5"
              onSelect={() => markAsRead(notification)}
            >
              <span className="text-sm font-medium">
                {notification.title ?? translate("crm.notifications.untitled")}
              </span>
              {notification.body && (
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {notification.body}
                </span>
              )}
              <DateField
                source="scheduled_for"
                record={notification}
                showDate
                showTime
                className="text-[10px] text-muted-foreground"
              />
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
