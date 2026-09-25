import { RecordContextProvider, useListContext, useTranslate } from "ra-core";

import { Skeleton } from "@/components/ui/skeleton";

import type { Company } from "../types";

import { CompanyCard } from "./CompanyCard";

const times = (nbChildren: number, fn: (key: number) => any) =>
  Array.from({ length: nbChildren }, (_, key) => fn(key));

const GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
};

const LoadingGridList = () => (
  <div className="grid w-full gap-4" style={GRID_STYLE}>
    {times(8, (key) => (
      <Skeleton className="h-[188px] rounded-xl" key={key} />
    ))}
  </div>
);

const LoadedGridList = () => {
  const { data, error, isPending } = useListContext<Company>();
  const translate = useTranslate();

  if (isPending || error) return null;

  return (
    <div className="grid w-full gap-4" style={GRID_STYLE}>
      {data.map((record) => (
        <RecordContextProvider key={record.id} value={record}>
          <CompanyCard />
        </RecordContextProvider>
      ))}

      {data.length === 0 && (
        <div className="col-span-full rounded-xl border border-dashed bg-card px-6 py-14 text-center text-sm text-muted-foreground">
          {translate("resources.companies.empty.title", {
            _: "No companies found",
          })}
        </div>
      )}
    </div>
  );
};

export const ImageList = () => {
  const { isPending } = useListContext();
  return isPending ? <LoadingGridList /> : <LoadedGridList />;
};
