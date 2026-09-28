import { useRefresh, useLoading, useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LoaderCircle, RotateCw } from "lucide-react";

/**
 * A button that refreshes the current view's data.
 *
 * When clicked, reloads data from the server. Shows a spinner animation during loading.
 * Included in the default top app bar. Hidden on small screens.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/refreshbutton/ RefreshButton documentation}
 */
export const RefreshButton = () => {
  const refresh = useRefresh();
  const loading = useLoading();
  const translate = useTranslate();
  // An icon alone is announced as "button": the name is for screen readers,
  // the tooltip for everybody else.
  const label = translate("ra.action.refresh", { _: "Refresh" });

  const handleRefresh = () => {
    refresh();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={handleRefresh}
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label={label}
        >
          {loading ? <LoaderCircle className="animate-spin" /> : <RotateCw />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
