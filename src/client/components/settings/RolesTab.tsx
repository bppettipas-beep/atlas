import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState, type FormEvent } from 'react';
import { CaretDown, Check, Pencil, Plus, TreeStructure, Trash, Users } from '@/components/icons';
import {
  Button,
  DRAFT_EASE,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  Modal,
  Notice,
  RuledHead,
  Select,
  Sheet,
  SkeletonRows,
  Textarea,
  Toggle,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { cn } from '@/lib/utils';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type { RoleDto } from '@shared/types';

/**
 * A small, deliberately limited palette.
 *
 * Roles are read at a glance on the map and in lists, so they need to stay
 * distinguishable from one another — which a free colour picker does not
 * guarantee. Any hex is still accepted by the API for anyone who insists.
 */
const SWATCHES = [
  '#121211',
  '#1f6feb',
  '#0f7b6c',
  '#a4560f',
  '#8b2c26',
  '#5b3fa8',
  '#0e6b8a',
  '#6b6a63',
];

/** A role plus its computed depth, ready to render as an indented row. */
interface FlatRole {
  role: RoleDto;
  depth: number;
  /** Position among its siblings, for the reorder controls. */
  siblingIndex: number;
  siblingCount: number;
}

/**
 * Flattens the hierarchy into render order.
 *
 * Roles whose parent no longer resolves are treated as roots rather than
 * dropped — a role you cannot see is a role you cannot fix.
 */
function flatten(roles: RoleDto[]): FlatRole[] {
  const byParent = new Map<string | null, RoleDto[]>();
  const ids = new Set(roles.map((role) => role.id));

  for (const role of roles) {
    const key = role.parentId && ids.has(role.parentId) ? role.parentId : null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(role);
    byParent.set(key, bucket);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  const out: FlatRole[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const bucket = byParent.get(parentId) ?? [];
    bucket.forEach((role, index) => {
      out.push({ role, depth, siblingIndex: index, siblingCount: bucket.length });
      walk(role.id, depth + 1);
    });
  };
  walk(null, 0);
  return out;
}

/** Ids that may not be chosen as a parent: the role itself and its descendants. */
function descendantsOf(roleId: string, roles: RoleDto[]): Set<string> {
  const out = new Set<string>([roleId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const role of roles) {
      if (role.parentId && out.has(role.parentId) && !out.has(role.id)) {
        out.add(role.id);
        grew = true;
      }
    }
  }
  return out;
}

interface Draft {
  id: string | null;
  name: string;
  color: string;
  description: string;
  parentId: string;
  isDefault: boolean;
}

const EMPTY: Draft = {
  id: null,
  name: '',
  color: SWATCHES[1],
  description: '',
  parentId: '',
  isDefault: false,
};

export function RolesTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const rolesQuery = useQuery<{ items: RoleDto[] }>(
    (signal) => api.get('/roles', undefined, signal),
    [],
  );
  useRealtimeEvent(['roles:updated'], () => rolesQuery.refetch());

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoleDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roles = useMemo(() => rolesQuery.data?.items ?? [], [rolesQuery.data]);
  const rows = useMemo(() => flatten(roles), [roles]);
  // Read out of the draft first: an optional chain in a dependency array
  // defeats the compiler's memoisation.
  const draftId = draft?.id ?? null;
  const blocked = useMemo(
    () => (draftId ? descendantsOf(draftId, roles) : new Set<string>()),
    [draftId, roles],
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError(null);

    const body = {
      name: draft.name.trim(),
      color: draft.color,
      description: draft.description.trim() || null,
      parentId: draft.parentId || null,
      isDefault: draft.isDefault,
    };

    try {
      if (draft.id) await api.patch(`/roles/${draft.id}`, body);
      else await api.post('/roles', body);
      setDraft(null);
      rolesQuery.refetch();
      toast.success(draft.id ? 'Role updated.' : 'Role created.');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/roles/${confirmDelete.id}`);
      setConfirmDelete(null);
      rolesQuery.refetch();
      toast.success('Role deleted.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  /** Swaps a role with the sibling above or below it. */
  const move = async (row: FlatRole, direction: -1 | 1) => {
    const siblings = rows
      .filter(
        (candidate) =>
          (candidate.role.parentId ?? null) === (row.role.parentId ?? null) &&
          candidate.depth === row.depth,
      )
      .map((candidate) => candidate.role.id);

    const from = siblings.indexOf(row.role.id);
    const to = from + direction;
    if (to < 0 || to >= siblings.length) return;
    [siblings[from], siblings[to]] = [siblings[to], siblings[from]];

    try {
      await api.patch('/roles/reorder/siblings', { ids: siblings });
      rolesQuery.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (rolesQuery.loading && !rolesQuery.data) {
    return (
      <Sheet className="p-5">
        <SkeletonRows rows={4} />
      </Sheet>
    );
  }
  if (rolesQuery.error && !rolesQuery.data) {
    return <ErrorState message={rolesQuery.error} onRetry={rolesQuery.refetch} />;
  }

  const defaultRole = roles.find((role) => role.isDefault) ?? null;

  return (
    <div className="space-y-5">
      <Sheet>
        <RuledHead
          index="R"
          title="Roles"
          description="What people are called in your business, and who reports into whom. Roles are labels — they do not grant access."
          className="px-5 pt-5"
          action={
            canEdit ? (
              <Button
                variant="primary"
                icon={<Plus />}
                onClick={() => {
                  setFormError(null);
                  setDraft({ ...EMPTY });
                }}
              >
                New role
              </Button>
            ) : undefined
          }
        />

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<TreeStructure />}
              title="No roles yet"
              description="Create one for each position in your business — Operations Manager, Dispatcher, Technician — then nest them to match your chart."
              action={
                canEdit ? (
                  <Button
                    variant="primary"
                    icon={<Plus />}
                    onClick={() => setDraft({ ...EMPTY })}
                  >
                    Create the first role
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="mt-4 border-t border-rule">
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <motion.li
                  key={row.role.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: DRAFT_EASE }}
                  className="group border-b border-rule"
                >
                  <div
                    className="flex items-center gap-3 py-2.5 pr-5 transition-colors hover:bg-paper"
                    style={{ paddingLeft: `${20 + row.depth * 22}px` }}
                  >
                    {/* The elbow makes depth legible without a guessing game. */}
                    {row.depth > 0 && (
                      <span aria-hidden className="-ml-3 text-ink-4">
                        <CaretDown className="text-[11px] -rotate-90" />
                      </span>
                    )}

                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: row.role.color }}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="title truncate text-[13.5px] leading-tight">
                        {row.role.name}
                        {row.role.isDefault && (
                          <span className="edge-sm ml-2 border border-edge px-1 py-px text-ink-3">
                            Default
                          </span>
                        )}
                      </p>
                      {row.role.description && (
                        <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-4">
                          {row.role.description}
                        </p>
                      )}
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-ink-4">
                      <Users className="text-[12px]" />
                      {String(row.role.memberCount).padStart(2, '0')}
                    </span>

                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${row.role.name} up`}
                          disabled={row.siblingIndex === 0}
                          onClick={() => void move(row, -1)}
                        >
                          <CaretDown className="rotate-180 text-[12px]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${row.role.name} down`}
                          disabled={row.siblingIndex === row.siblingCount - 1}
                          onClick={() => void move(row, 1)}
                        >
                          <CaretDown className="text-[12px]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${row.role.name}`}
                          onClick={() => {
                            setFormError(null);
                            setDraft({
                              id: row.role.id,
                              name: row.role.name,
                              color: row.role.color,
                              description: row.role.description ?? '',
                              parentId: row.role.parentId ?? '',
                              isDefault: row.role.isDefault,
                            });
                          }}
                        >
                          <Pencil className="text-[12px]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${row.role.name}`}
                          className="text-alert hover:bg-alert-wash"
                          onClick={() => setConfirmDelete(row.role)}
                        >
                          <Trash className="text-[12px]" />
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {rows.length > 0 && (
          <p className="px-5 py-3.5 text-[12px] leading-relaxed text-ink-4">
            {defaultRole ? (
              <>
                New people who join with an invitation code are given{' '}
                <span className="text-ink-2">{defaultRole.name}</span>.
              </>
            ) : (
              'No default role is set, so new people join without one. Edit a role and turn on “Give this to new joiners” to change that.'
            )}
          </p>
        )}
      </Sheet>

      {/* ------------------------------ editor ------------------------------ */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        size="sm"
        title={draft?.id ? 'Edit role' : 'New role'}
        description="Roles describe position. Access is still decided by owner, manager and worker."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="role-form"
              variant="primary"
              loading={saving}
              disabled={!draft?.name.trim()}
            >
              {draft?.id ? 'Save role' : 'Create role'}
            </Button>
          </div>
        }
      >
        {draft && (
          <form id="role-form" onSubmit={(event) => void save(event)} className="space-y-4">
            {formError && <InlineError message={formError} />}

            <Field label="Name" htmlFor="role-name" required>
              <Input
                id="role-name"
                autoFocus
                value={draft.name}
                maxLength={60}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Operations Manager"
              />
            </Field>

            <Field label="Colour" htmlFor="role-color">
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Use ${swatch}`}
                    aria-pressed={draft.color.toLowerCase() === swatch.toLowerCase()}
                    onClick={() => setDraft({ ...draft, color: swatch })}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-[2px] transition-transform',
                      draft.color.toLowerCase() === swatch.toLowerCase()
                        ? 'ring-2 ring-ink ring-offset-2 ring-offset-sheet'
                        : 'hover:scale-105',
                    )}
                    style={{ backgroundColor: swatch }}
                  >
                    {draft.color.toLowerCase() === swatch.toLowerCase() && (
                      <Check className="text-[12px] text-white" />
                    )}
                  </button>
                ))}
                <input
                  id="role-color"
                  type="color"
                  aria-label="Custom colour"
                  value={draft.color}
                  onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                  className="h-7 w-10 cursor-pointer rounded-[2px] border border-edge bg-sheet p-0.5"
                />
              </div>
            </Field>

            <Field label="Description" htmlFor="role-description" hint="Optional.">
              <Textarea
                id="role-description"
                rows={2}
                maxLength={400}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="Runs the day-to-day schedule and the crew."
              />
            </Field>

            <Field
              label="Reports into"
              htmlFor="role-parent"
              hint="Leave blank to put it at the top of the chart."
            >
              <Select
                id="role-parent"
                value={draft.parentId}
                onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
              >
                <option value="">— Top level —</option>
                {flatten(roles)
                  // A role cannot report into itself or into anything beneath it.
                  .filter((row) => !blocked.has(row.role.id))
                  .map((row) => (
                    <option key={row.role.id} value={row.role.id}>
                      {'  '.repeat(row.depth)}
                      {row.depth > 0 ? '└ ' : ''}
                      {row.role.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Toggle
              checked={draft.isDefault}
              onChange={(next) => setDraft({ ...draft, isDefault: next })}
              label="Give this to new joiners"
              description="Anyone joining with an invitation code gets this role. Only one role can be the default."
            />
          </form>
        )}
      </Modal>

      {/* ------------------------------ delete ------------------------------ */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        title={`Delete ${confirmDelete?.name ?? 'role'}?`}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Delete role
            </Button>
          </div>
        }
      >
        <Notice tone="info">
          {confirmDelete && confirmDelete.memberCount > 0
            ? `${confirmDelete.memberCount} ${confirmDelete.memberCount === 1 ? 'person' : 'people'} will simply have no role. Nobody is removed and no work is touched.`
            : 'Nobody holds this role. Any roles nested under it move up to take its place.'}
        </Notice>
      </Modal>
    </div>
  );
}
