import {
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  onPositionsChange: (positions: { id: string; x: number; y: number }[]) => void | Promise<void>;
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
  const [nodes, setNodes, onNodesChange] = useNodesState<AtlasNode>([]);
  const saveTimer = useRef<number | null>(null);
  /** Positions the user has moved but the server has not confirmed yet. */
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

  /**
   * Rebuilds the nodes React Flow renders.
   *
   * This runs when the data or the presentation inputs change — never while a
   * node is being dragged. That distinction is the whole point: React Flow is
   * controlled, and it hides a node until it has measured it. Rebuilding the
   * node objects on every drag frame threw those measurements away sixty times
   * a second, so the map blinked out while you moved anything. Drags now go
   * through `onNodesChange`, which mutates positions in place and keeps the
   * measurements intact.
   */
  useEffect(() => {
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));

      return graph.nodes.map((node, index) => {
        const ref = drawingIndex(index + 1);
        const existing = previous.get(node.id);
        // Prefer a position the user just dragged but we have not saved yet,
        // so a refetch landing mid-flight cannot snap the node backwards.
        const position = pending.current.get(node.id) ?? { x: node.x, y: node.y };
        // Carrying these across a rebuild avoids a re-measure flash when the
        // graph refetches (someone else moved a node, a task changed, …).
        const carried = { measured: existing?.measured, selected: existing?.selected };

        if (node.kind === 'TEAM' && node.team) {
          return {
            ...carried,
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
          ...carried,
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
      });
    });
  }, [graph.nodes, selectedNodeId, editable, workload, setNodes]);

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
      const entries = Array.from(pending.current.entries());
      if (entries.length === 0) return;

      const payload = entries.map(([id, position]) => ({ id, ...position }));
      void Promise.resolve(onPositionsChange(payload)).finally(() => {
        // Only forget the local position once the server owns it.
        for (const [id] of entries) pending.current.delete(id);
      });
    }, 650);
  }, [onPositionsChange]);

  const handleNodeDragStop = useCallback(
    (_event: unknown, _node: AtlasNode, moved: AtlasNode[]) => {
      if (!editable) return;
      for (const node of moved) {
        pending.current.set(node.id, { x: node.position.x, y: node.position.y });
      }
      queueSave();
    },
    [editable, queueSave],
  );

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
      onNodesChange={onNodesChange}
      onNodeDragStop={handleNodeDragStop}
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
