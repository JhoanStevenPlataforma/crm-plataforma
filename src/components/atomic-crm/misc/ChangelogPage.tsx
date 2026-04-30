import { useTranslate } from "ra-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { Markdown } from "./Markdown";
import changelogContent from "../../../../CHANGELOG.md?raw";

export const ChangelogPage = () => {
  const translate = useTranslate();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <MobileHeader>
          <h1 className="text-xl font-semibold">
            {translate("crm.changelog.title")}
          </h1>
        </MobileHeader>
        <MobileContent>
          <Markdown>{changelogContent}</Markdown>
        </MobileContent>
      </>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-8">
      <Card>
        <CardHeader>
          <CardTitle>{translate("crm.changelog.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Markdown>{changelogContent}</Markdown>
        </CardContent>
      </Card>
    </div>
  );
};

ChangelogPage.path = "/changelog";
