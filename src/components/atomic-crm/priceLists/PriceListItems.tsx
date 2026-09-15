import { X } from "lucide-react";
import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatMoneyExact } from "../misc/reporting";
import { isUniqueViolation } from "../misc/useConflictNotifier";
import type { PriceList, PriceListItem, Product, TaxRate } from "../types";

/** Radix `Select` reserves the empty string, so "no override" needs a value. */
const NO_OVERRIDE = "none";

/**
 * Catalogue scale, not CRM scale: hundreds of products (quotes §11). The whole
 * catalogue is read, inactive products included, so a price set on a product
 * that has since been deactivated still shows its name.
 */
const CATALOGUE_PAGE = { page: 1, perPage: 1000 };

const productName = (product: Product) => `${product.name} (${product.sku})`;

/**
 * The prices a list sets (quotes §2.2).
 *
 * A product with no row here is still quoted from this list at its own list
 * price when the currencies match (`price_book`), which is what the empty state
 * says: "no prices" would suggest the list offers nothing.
 */
export const PriceListItems = () => {
  const priceList = useRecordContext<PriceList>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [minQuantity, setMinQuantity] = useState("1");
  const [taxRateId, setTaxRateId] = useState(NO_OVERRIDE);

  const { data: items, error: itemsError } = useGetList<PriceListItem>(
    "price_list_items",
    {
      filter: { price_list_id: priceList?.id },
      sort: { field: "id", order: "ASC" },
      pagination: CATALOGUE_PAGE,
    },
    { enabled: priceList?.id != null },
  );
  const { data: products } = useGetList<Product>("products", {
    sort: { field: "name", order: "ASC" },
    pagination: CATALOGUE_PAGE,
  });
  const { data: taxRates } = useGetList<TaxRate>("tax_rates", {
    sort: { field: "rank", order: "ASC" },
    pagination: CATALOGUE_PAGE,
  });

  const [create, { isPending: isCreating }] = useCreate();
  const [remove, { isPending: isRemoving }] = useDelete();
  const isMutating = isCreating || isRemoving;

  if (!priceList) return null;

  // A failed load is NOT an empty list, for the reason `TeamMembers` gives:
  // offering to add while the rows are unknown invites a duplicate that the
  // unique key then reports as a broken write.
  const isUnknown = itemsError != null;
  const price = Number(unitPrice);
  const quantity = Number(minQuantity);
  const canAdd =
    productId !== "" &&
    unitPrice !== "" &&
    Number.isFinite(price) &&
    price >= 0 &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    !isMutating &&
    !isUnknown;

  const onError = (error: unknown) =>
    notify(
      isUniqueViolation(error)
        ? "resources.price_lists.items.duplicate"
        : "resources.price_lists.items.error",
      { type: "error" },
    );

  const nameOf = (id: Identifier) => {
    const product = products?.find((p) => String(p.id) === String(id));
    return product ? productName(product) : `#${id}`;
  };
  const taxLabelOf = (id: Identifier | null | undefined) =>
    id == null
      ? translate("resources.price_lists.items.no_override")
      : (taxRates?.find((rate) => String(rate.id) === String(id))?.label ??
        `#${id}`);

  const addItem = () => {
    if (!canAdd) return;
    create(
      "price_list_items",
      {
        data: {
          price_list_id: priceList.id,
          product_id: Number(productId),
          unit_price: price,
          min_quantity: quantity,
          tax_rate_id: taxRateId === NO_OVERRIDE ? null : Number(taxRateId),
        },
      },
      {
        // Cleared only once the row exists, so a refused price can be fixed
        // rather than retyped.
        onSuccess: () => {
          setProductId("");
          setUnitPrice("");
          setMinQuantity("1");
          setTaxRateId(NO_OVERRIDE);
          refresh();
        },
        onError,
      },
    );
  };

  const removeItem = (item: PriceListItem) =>
    remove(
      "price_list_items",
      { id: item.id, previousData: item },
      { onSuccess: () => refresh(), onError },
    );

  const candidates = (products ?? []).filter((product) => product.is_active);

  return (
    <div className="flex flex-col gap-3 w-full max-w-3xl">
      <h3 className="text-sm font-medium">
        {translate("resources.price_lists.items.title")}
      </h3>

      {isUnknown ? (
        <p className="text-sm text-destructive">
          {translate("resources.price_lists.items.load_error")}
        </p>
      ) : (items ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.price_lists.items.empty")}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">
                {translate("resources.price_lists.items.product")}
              </th>
              <th className="py-1 text-right font-normal">
                {translate("resources.price_lists.items.min_quantity")}
              </th>
              <th className="py-1 text-right font-normal">
                {translate("resources.price_lists.items.unit_price")}
              </th>
              <th className="py-1 pl-4 text-left font-normal">
                {translate("resources.price_lists.items.tax_rate_id")}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id} className="border-t">
                <td className="py-1">{nameOf(item.product_id)}</td>
                <td className="py-1 text-right tabular-nums">
                  {item.min_quantity}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatMoneyExact(item.unit_price, priceList.currency)}
                </td>
                <td className="py-1 pl-4">{taxLabelOf(item.tax_rate_id)}</td>
                <td className="py-1 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    aria-label={translate(
                      "resources.price_lists.items.remove",
                      { name: nameOf(item.product_id) },
                    )}
                    onClick={() => removeItem(item)}
                    disabled={isMutating}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={productId}
          onValueChange={setProductId}
          disabled={isUnknown}
        >
          <SelectTrigger
            className="sm:flex-1"
            aria-label={translate("resources.price_lists.items.product")}
          >
            <SelectValue
              placeholder={translate("resources.price_lists.items.product")}
            />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((product) => (
              <SelectItem key={product.id} value={String(product.id)}>
                {productName(product)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
          placeholder={translate("resources.price_lists.items.unit_price")}
          aria-label={translate("resources.price_lists.items.unit_price")}
          className="sm:w-36"
          disabled={isUnknown}
        />
        <Input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={minQuantity}
          onChange={(event) => setMinQuantity(event.target.value)}
          aria-label={translate("resources.price_lists.items.min_quantity")}
          className="sm:w-28"
          disabled={isUnknown}
        />
        <Select
          value={taxRateId}
          onValueChange={setTaxRateId}
          disabled={isUnknown}
        >
          <SelectTrigger
            className="sm:w-48"
            aria-label={translate("resources.price_lists.items.tax_rate_id")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OVERRIDE}>
              {translate("resources.price_lists.items.no_override")}
            </SelectItem>
            {(taxRates ?? []).map((rate) => (
              <SelectItem key={rate.id} value={String(rate.id)}>
                {rate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={addItem} disabled={!canAdd}>
          {translate("resources.price_lists.items.add")}
        </Button>
      </div>
    </div>
  );
};
