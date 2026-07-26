import {
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nodeTypes, type AtlasNode } from './nodes';
import { RELATIONSHIP_META, drawingIndex } from '@/lib/utils';
import type { OrgGraphDto, RelationshipType, TaskSummary } from '@shared/types';

interface OrganizationMapProps {
  graph: OrgGraphDto;
  tasks: TaskSummary[];
  selectedNodeId: string | null;
  visibleTypes: Set<RelationshipType>;
  editable: boolean;
  onSelect: (nodeId: string | null) => void;
  onPositionsChange: (positions: { id: string; x: number; y: number }[]) => void;
}

/** Live zoom readout, printed like a drawing scale. */
function ScaleReadout() {
  const zoom = useStore((state) => state.transform[2]);
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10 border border-rule bg-sheet/90 px-2 py-1 backdrop-blur-[2px]">
      <span className="font-mono text-[10px] leading-none text-ink-3">
        SCALE 1:{(1 / zoom).toFixed(2)}
      </span>
    </div>
  );
}

function MapCanvas({
  graph,
  tasks,
  selectedNodeId,
  visibleTypes,
  editable,
  onSelect,
  onPositionsChange,
}: OrganizationMapProps) {
  const { fitView } = useReactFlow();
  const [dragged, setDragged] = useState<Record<string, { x: number; y: number }>>({});
  const saveTimer = useRef<number | null>(null);
  const pending = useRef(new Map<string, { x: number; y: number }>());

  /** Per-person workload badges, derived from the task list the page already has. */
  const workload = useMemo(() => {
    const map = new Map<string, { active: number; overdue: number }>();
    for (const task of tasks) {
      if (!task.assignee || task.status === 'DONE') continue;
      const entry = map.get(task.assignee.id) ?? { active: 0, overdue: 0 };
      entry.active += 1;
      if (task.isOverdue) entry.overdue += 1;
      map.set(task.assignee.id, entry);
    }
    return map;
  }, [tasks]);

  const nodes: AtlasNode[] = useMemo(
    () =>
      graph.nodes.map((node, index) => {
        const position = dragged[node.id] ?? { x: node.x, y: node.y };
        const ref = drawingIndex(index + 1);

        if (node.kind === 'TEAM' && node.team) {
          return {
            id: node.id,
            type: 'team' as const,
            position,
            draggable: editable,
            data: {
              team: node.team,
              ref: `T${ref}`,
              selected: selectedNodeId === node.id,
              dimmed: false,
            },
          };
        }

        const person = node.person!;
        const stats = workload.get(person.id) ?? { active: 0, overdue: 0 };
        return {
          id: node.id,
          type: 'person' as const,
          position,
          draggable: editable,
          data: {
            person,
            ref: `P${ref}`,
            selected: selectedNodeId === node.id,
            dimmed: false,
            overdue: stats.overdue,
            activeTasks: stats.active,
          },
        };
      }),
    [graph.nodes, dragged, selectedNodeId, editable, workload],
  );

  const edges: Edge[] = useMemo(
    () =>
      graph.edges
        .filter((edge) => visibleTypes.has(edge.type))
        .map((edge) => {
          const meta = RELATIONSHIP_META[edge.type] ?? RELATIONSHIP_META.COLLABORATES_WITH;
          const onPath =
            selectedNodeId !== null &&
            (edge.source === selectedNodeId || edge.target === selectedNodeId);

          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            // Orthogonal routing: a schematic runs its lines at right angles.
            type: 'smoothstep',
            // Only the selected person's connections animate. A map where every
            // line crawls is decoration; one lit path is information.
            animated: onPath,
            label: onPath ? (edge.label ?? undefined) : undefined,
            labelStyle: {
              fontSize: 9,
              fill: '#54524d',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            },
            labelBgStyle: { fill: '#ffffff', stroke: '#e6e4e0' },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 0,
            style: {
              stroke: onPath ? '#1b4dff' : meta.stroke,
              strokeWidth: onPath ? 1.6 : edge.type === 'REPORTS_TO' ? 1.2 : 1,
              strokeDasharray: meta.dashed ? '3 3' : undefined,
              opacity: selectedNodeId && !onPath ? 0.12 : 0.9,
            },
            markerEnd:
              edge.type === 'REPORTS_TO'
                ? {
                    type: MarkerType.Arrow,
                    width: 16,
                    height: 16,
                    color: onPath ? '#1b4dff' : meta.stroke,
                  }
                : undefined,
          } satisfies Edge;
        }),
    [graph.edges, visibleTypes, selectedNodeId],
  );

  /** Batches drag results so the layout saves once, when the hand stops. */
  const queueSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const payload = Array.from(pending.current.entries()).map(([id, position]) => ({
        id,
        ...position,
      }));
      pending.current.clear();
      if (payload.length > 0) onPositionsChange(payload);
    }, 650);
  }, [onPositionsChange]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<AtlasNode>[]) => {
      if (!editable) return;
      const moves = changes.filter(
        (change): change is NodePositionChange =>
          change.type === 'position' && change.position !== undefined,
      );
      if (moves.length === 0) return;

      setDragged((current) => {
        const next = { ...current };
        for (const move of moves) {
          if (!move.position) continue;
          next[move.id] = { x: move.position.x, y: move.position.y };
          if (move.dragging === false) pending.current.set(move.id, next[move.id]);
        }
        return next;
      });

      if (moves.some((move) => move.dragging === false)) queueSave();
    },
    [editable, queueSave],
  );

  // Drop local drag state whenever the server sends a different set of nodes.
  useEffect(() => setDragged({}), [graph.nodes.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.24, duration: 480, maxZoom: 1 });
    }, 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.length]);

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onNodeClick={(_event, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      connectionMode={ConnectionMode.Loose}
      nodesConnectable={false}
      nodesDraggable={editable}
      elementsSelectable
      minZoom={0.2}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      className="drafting-grid"
      aria-label="Organization map"
    >
      <Controls
        position="bottom-left"
        showInteractive={false}
        className="border border-rule bg-sheet"
      />
      <ScaleReadout />
    </ReactFlow>
  );
}

export function OrganizationMap(props: OrganizationMapProps) {
  return (
    <ReactFlowProvider>
      <MapCanvas {...props} />
    </ReactFlowProvider>
  );
}
