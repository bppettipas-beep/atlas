import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { Users } from '@/components/icons';
import { Avatar } from '@/components/ui';
import { AVAILABILITY_META, ROLE_META, cn } from '@/lib/utils';
import type { PersonSummary, TeamDto } from '@shared/types';

export type PersonNodeData = {
  person: PersonSummary;
  /** Two-digit index printed on the node, like a part number on a drawing. */
  ref: string;
  selected: boolean;
  dimmed: boolean;
  overdue: number;
  activeTasks: number;
};

export type TeamNodeData = {
  team: TeamDto;
  ref: string;
  selected: boolean;
  dimmed: boolean;
};

export type AtlasNode = Node<PersonNodeData, 'person'> | Node<TeamNodeData, 'team'>;

/** Invisible connection points — edges attach, nothing is drawn. */
function Anchors() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
      <Handle type="target" position={Position.Left} id="l" isConnectable={false} />
      <Handle type="source" position={Position.Right} id="r" isConnectable={false} />
    </>
  );
}

/**
 * Four corner registration ticks. Drawn just outside the node's border so the
 * node reads as a framed detail on a drawing rather than as a card.
 */
function Ticks({ selected }: { selected: boolean }) {
  const tone = selected ? 'border-mark' : 'border-edgeStrong';
  const corners = [
    'left-[-2px] top-[-2px] border-l-[1.5px] border-t-[1.5px]',
    'right-[-2px] top-[-2px] border-r-[1.5px] border-t-[1.5px]',
    'left-[-2px] bottom-[-2px] border-b-[1.5px] border-l-[1.5px]',
    'right-[-2px] bottom-[-2px] border-b-[1.5px] border-r-[1.5px]',
  ];
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {corners.map((position) => (
        <span key={position} className={cn('absolute h-[6px] w-[6px]', tone, position)} />
      ))}
    </span>
  );
}

export const PersonNode = memo(function PersonNode({ data }: NodeProps<Node<PersonNodeData>>) {
  const { person, ref, selected, dimmed, overdue, activeTasks } = data;
  const availability = AVAILABILITY_META[person.availability];
  const role = ROLE_META[person.role];

  return (
    <div
      className={cn(
        'group relative w-[204px] cursor-pointer bg-sheet transition-[border-color,opacity] duration-200 ease-draft',
        'border',
        selected ? 'border-mark' : 'border-edge hover:border-ink-3',
        dimmed && 'opacity-25',
      )}
    >
      <Anchors />
      <Ticks selected={selected} />

      {/* head: reference number + availability, the two things scanned first */}
      <div className="flex items-center justify-between border-b border-rule px-2.5 py-1">
        <span className="font-mono text-[9px] leading-none text-ink-4">{ref}</span>
        <span className="flex items-center gap-1.5">
          {overdue > 0 && (
            <span className="font-mono text-[9px] leading-none text-alert">{overdue} LATE</span>
          )}
          <span className="relative flex h-[6px] w-[6px]" title={availability.label}>
            {overdue > 0 && (
              <span className="absolute inset-0 animate-ring-out bg-alert" aria-hidden />
            )}
            <span className={cn('relative h-[6px] w-[6px]', availability.dot)} />
          </span>
        </span>
      </div>

      <div className="flex items-start gap-2.5 px-2.5 py-2.5">
        <Avatar name={person.fullName} src={person.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="title truncate text-[13px] leading-tight">{person.fullName}</p>
          <p className="mt-1 truncate text-[11px] leading-tight text-ink-3">
            {person.jobTitle ?? '—'}
          </p>
        </div>
      </div>

      {(person.role !== 'WORKER' || activeTasks > 0 || person.headline) && (
        <div className="border-t border-rule px-2.5 py-1.5">
          {person.headline && (
            <p className="truncate text-[10.5px] leading-tight text-ink-4" title={person.headline}>
              {person.headline}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {person.role !== 'WORKER' && (
              <span className={cn('edge-sm border px-1 py-px leading-none', role.chip)}>
                {role.label}
              </span>
            )}
            {activeTasks > 0 && (
              <span className="ml-auto font-mono text-[9px] leading-none text-ink-4">
                {String(activeTasks).padStart(2, '0')} OPEN
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export const TeamNode = memo(function TeamNode({ data }: NodeProps<Node<TeamNodeData>>) {
  const { team, ref, selected, dimmed } = data;
  return (
    <div
      className={cn(
        'relative w-[176px] cursor-pointer bg-paper-deep transition-[border-color,opacity] duration-200 ease-draft',
        'border border-dashed',
        selected ? 'border-mark' : 'border-edgeStrong hover:border-ink-3',
        dimmed && 'opacity-25',
      )}
    >
      <Anchors />
      <div className="flex items-center justify-between border-b border-dashed border-edge px-2.5 py-1">
        <span className="font-mono text-[9px] leading-none text-ink-4">{ref}</span>
        <Users className="text-[11px] text-ink-4" />
      </div>
      <div className="px-2.5 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0"
            style={{ backgroundColor: team.color ?? '#121211' }}
          />
          <p className="title truncate text-[13px] leading-tight">{team.name}</p>
        </div>
        <p className="edge-sm mt-2">
          {String(team.memberCount).padStart(2, '0')} {team.memberCount === 1 ? 'person' : 'people'}
        </p>
      </div>
    </div>
  );
});

export const nodeTypes = { person: PersonNode, team: TeamNode };
