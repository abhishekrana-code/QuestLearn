import { motion } from 'framer-motion';
import SkillNode from './SkillNode.jsx';

const COLUMN_WIDTH = 230;
const ROW_HEIGHT = 185;
const PADDING_X = 32;
const PADDING_Y = 60;

export default function SkillTreeCanvas({ nodes, onSelect, onLockedClick, activeId }) {
  const maxX = Math.max(0, ...nodes.map((node) => node.positionX));
  const maxY = Math.max(0, ...nodes.map((node) => node.positionY));

  const width = PADDING_X * 2 + (maxX + 1) * COLUMN_WIDTH;
  const height = PADDING_Y * 2 + (maxY + 1) * ROW_HEIGHT;

  const positionOf = (node) => ({
    x: PADDING_X + node.positionX * COLUMN_WIDTH + COLUMN_WIDTH / 2,
    y: PADDING_Y + node.positionY * ROW_HEIGHT + ROW_HEIGHT / 2,
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = nodes
    .filter((node) => node.parentId && byId.has(node.parentId))
    .map((node) => {
      const from = positionOf(byId.get(node.parentId));
      const to = positionOf(node);
      return {
        id: node.id,
        from,
        to,
        locked: node.status === 'LOCKED',
        index: node.orderIndex,
      };
    });

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card">
      <div
        className="relative grid-floor"
        style={{ width, height, minWidth: '100%' }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="edgeUnlocked" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                style={{ stopColor: 'hsl(var(--gold))', stopOpacity: 0.85 }}
              />
              <stop
                offset="100%"
                style={{ stopColor: 'hsl(var(--rune))', stopOpacity: 0.7 }}
              />
            </linearGradient>
          </defs>

          {edges.map((edge) => {
            const curve = `M ${edge.from.x} ${edge.from.y} C ${edge.from.x} ${
              edge.from.y + (edge.to.y - edge.from.y) * 0.45
            }, ${edge.to.x} ${edge.from.y + (edge.to.y - edge.from.y) * 0.55}, ${edge.to.x} ${edge.to.y}`;

            return (
              <motion.path
                key={edge.id}
                d={curve}
                fill="none"
                stroke={
                  edge.locked ? 'hsl(var(--border-strong) / 0.9)' : 'url(#edgeUnlocked)'
                }
                strokeWidth={edge.locked ? 2 : 3}
                strokeDasharray={edge.locked ? '6 8' : undefined}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: edge.index * 0.05, ease: 'easeOut' }}
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const point = positionOf(node);
          return (
            <SkillNode
              key={node.id}
              node={node}
              x={point.x}
              y={point.y}
              active={activeId === node.id}
              onSelect={onSelect}
              onLockedClick={onLockedClick}
            />
          );
        })}

        {nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-sm text-fg-subtle">
            This course has no skill nodes yet.
          </div>
        )}
      </div>
    </div>
  );
}
