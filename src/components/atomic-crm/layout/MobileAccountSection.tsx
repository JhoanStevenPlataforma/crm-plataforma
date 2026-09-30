import { LogOut, Moon, Smartphone, Sun } from "lucide-react";
import { Translate, useGetIdentity, useLogout, useTranslate } from "ra-core";
import { Link } from "react-router";

import { useTheme } from "@/components/admin/use-theme";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const THEMES = [
  { value: "system", Icon: Smartphone },
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon },
] as const;

/**
 * What the desktop top bar carries — who am I (and a way to my profile), how
 * does this look, sign out — at the foot of the phone's "More" sheet. The
 * phone has no top bar, and `/settings` is the admin configuration on both
 * devices, so without this a phone user could not sign out.
 */
export const MobileAccountSection = ({
  onNavigate,
}: {
  onNavigate: () => void;
}) => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  const name = identity?.fullName ?? "";

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {identity ? (
        <Link
          to="/profile"
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-accent"
        >
          <Avatar className="size-8">
            <AvatarImage src={identity.avatar} role="presentation" />
            <AvatarFallback>{name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {translate("crm.profile.title")}
            </span>
          </span>
        </Link>
      ) : null}

      <ToggleGroup
        type="single"
        value={theme}
        onValueChange={(value) =>
          value ? setTheme(value as (typeof THEMES)[number]["value"]) : null
        }
        variant="outline"
        className="w-full"
        aria-label={translate("crm.theme.label")}
      >
        {THEMES.map(({ value, Icon }) => (
          <ToggleGroupItem key={value} value={value} className="flex-1 gap-2">
            <Icon className="size-4" aria-hidden />
            {translate(`crm.theme.${value}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Button variant="outline" onClick={() => logout()}>
        <LogOut className="size-4" aria-hidden />
        <Translate i18nKey="ra.auth.logout">Log out</Translate>
      </Button>
    </div>
  );
};
