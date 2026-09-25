import {
  CheckCircle2,
  Copy,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslate } from "ra-core";
import { useState, type FormEvent } from "react";

import { Confirm } from "@/components/admin/confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { PortalTemplate } from "../quotes/portal/portalSlides";

const MAX_NAME = 80;

type NameRequest = {
  title: string;
  initial: string;
  onSubmit: (name: string) => Promise<boolean>;
};

/**
 * Which template is open, whether customers see it, and what can be done with
 * it. "Usar en cotizaciones" makes it the one every quotation issued from now
 * on shows; "Guardar como" copies it (the only way to change the default one).
 */
export const TemplateBar = ({
  templates,
  open,
  onSelect,
  onActivate,
  onSaveAs,
  onCreate,
  onRename,
  onDelete,
}: {
  templates: PortalTemplate[];
  open: PortalTemplate;
  onSelect: (id: number) => void;
  onActivate: (id: number) => Promise<boolean>;
  onSaveAs: (id: number, name: string) => Promise<boolean>;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: number, name: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}) => {
  const translate = useTranslate();
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card">
      <Label htmlFor="portal-template" className="text-sm font-medium">
        {translate("crm.portal_slides.templates.label")}
      </Label>
      <Select
        value={String(open.id)}
        onValueChange={(value) => onSelect(Number(value))}
      >
        <SelectTrigger id="portal-template" className="h-9 w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={String(template.id)}>
              {template.name}
              {template.is_active
                ? ` · ${translate("crm.portal_slides.templates.active_short")}`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {open.is_active ? (
        <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15">
          <CheckCircle2 className="size-3.5" />
          {translate("crm.portal_slides.templates.active")}
        </Badge>
      ) : (
        <Button size="sm" onClick={() => void onActivate(open.id)}>
          <CheckCircle2 className="size-4" />
          {translate("crm.portal_slides.templates.activate")}
        </Button>
      )}
      {open.is_system ? (
        <Badge variant="outline" className="gap-1">
          <Lock className="size-3" />
          {translate("crm.portal_slides.templates.locked")}
        </Badge>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setNameRequest({
              title: translate("crm.portal_slides.templates.save_as_title"),
              initial: translate("crm.portal_slides.templates.copy_name", {
                name: open.name,
              }).slice(0, MAX_NAME),
              onSubmit: (name) => onSaveAs(open.id, name),
            })
          }
        >
          <Copy className="size-4" />
          {translate("crm.portal_slides.templates.save_as")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setNameRequest({
              title: translate("crm.portal_slides.templates.new_title"),
              initial: "",
              onSubmit: onCreate,
            })
          }
        >
          <Plus className="size-4" />
          {translate("crm.portal_slides.templates.new")}
        </Button>
        {open.is_system ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={translate("crm.portal_slides.templates.more")}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  setNameRequest({
                    title: translate("crm.portal_slides.templates.rename"),
                    initial: open.name,
                    onSubmit: (name) => onRename(open.id, name),
                  })
                }
              >
                <Pencil className="size-4" />
                {translate("crm.portal_slides.templates.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                // The active template is what customers see: another one is
                // made active first, so a quotation never loses its slides by
                // accident.
                disabled={open.is_active}
                className="text-destructive focus:text-destructive"
                onSelect={() => setIsDeleting(true)}
              >
                <Trash2 className="size-4" />
                {open.is_active
                  ? translate("crm.portal_slides.templates.delete_active")
                  : translate("crm.portal_slides.templates.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <NameDialog request={nameRequest} onClose={() => setNameRequest(null)} />
      <Confirm
        isOpen={isDeleting}
        title="crm.portal_slides.templates.delete_title"
        content="crm.portal_slides.templates.delete_content"
        translateOptions={{ name: open.name }}
        onClose={() => setIsDeleting(false)}
        onConfirm={() => {
          setIsDeleting(false);
          void onDelete(open.id);
        }}
      />
    </div>
  );
};

/** Asks for a template name: 1 to 80 characters, like the column. */
const NameDialog = ({
  request,
  onClose,
}: {
  request: NameRequest | null;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastRequest, setLastRequest] = useState<NameRequest | null>(null);
  // A new request starts from its own initial value.
  if (request !== lastRequest) {
    setLastRequest(request);
    setName(request?.initial ?? "");
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!request || !name.trim()) return;
    setIsSaving(true);
    const isDone = await request.onSubmit(name.trim());
    setIsSaving(false);
    if (isDone) onClose();
  };

  return (
    <Dialog open={request != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{request?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="portal-template-name">
              {translate("crm.portal_slides.templates.name")}
            </Label>
            <Input
              id="portal-template-name"
              autoFocus
              maxLength={MAX_NAME}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {translate("ra.action.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || isSaving}>
              {translate("ra.action.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
