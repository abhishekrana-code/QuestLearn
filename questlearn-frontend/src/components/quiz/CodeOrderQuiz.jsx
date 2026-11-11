import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';

function OrderItem({ index, line, disabled, lines }) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={index}
      dragListener={false}
      dragControls={controls}
      className="flex items-start gap-2 rounded-lg border border-line bg-card/70 px-3 py-2.5 shadow-card"
    >
      <button
        type="button"
        onPointerDown={(event) => !disabled && controls.start(event)}
        className="mt-0.5 cursor-grab touch-none text-fg-subtle transition-colors hover:text-foreground disabled:cursor-not-allowed active:cursor-grabbing"
        aria-label="Drag to reorder"
        disabled={disabled}
      >
        <GripVertical size={16} />
      </button>
      <code className="flex-1 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-foreground/90">
        {lines[index]}
      </code>
    </Reorder.Item>
  );
}

export default function CodeOrderQuiz({ prompt, lines, order, setOrder, disabled }) {
  return (
    <div>
      <p className="text-sm font-medium leading-relaxed text-foreground">{prompt}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
        Drag the handle, or use the arrows, to place each line in the right order.
      </p>

      <Reorder.Group
        axis="y"
        values={order}
        onReorder={disabled ? () => {} : setOrder}
        className="mt-3 space-y-2"
      >
        {order.map((lineIndex) => (
          <OrderItem
            key={lineIndex}
            index={lineIndex}
            line={lines[lineIndex]}
            lines={lines}
            disabled={disabled}
          />
        ))}
      </Reorder.Group>

      {!disabled && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setOrder([...order].reverse())}
          >
            Reverse order
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setOrder([...order].sort((a, b) => a - b))}
          >
            Shuffle back
          </button>
        </div>
      )}
    </div>
  );
}
