import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** A chart's data as rows: the first column names the category. */
export interface ChartTable {
  columns: string[];
  rows: { key: string; cells: string[] }[];
}

/**
 * The same figures as the chart, as a table: every value readable without a
 * pointer, and by a screen reader. Numbers are right-aligned in tabular
 * figures so a column of amounts compares at a glance.
 */
export const ChartDataTable = ({ table }: { table: ChartTable }) => (
  <Table>
    <TableHeader>
      <TableRow>
        {table.columns.map((column, index) => (
          <TableHead key={column} className={index > 0 ? "text-right" : ""}>
            {column}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
    <TableBody>
      {table.rows.map((row) => (
        <TableRow key={row.key}>
          {row.cells.map((cell, index) => (
            <TableCell
              key={`${row.key}-${table.columns[index]}`}
              className={index > 0 ? "text-right tabular-nums" : "font-medium"}
            >
              {cell}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
