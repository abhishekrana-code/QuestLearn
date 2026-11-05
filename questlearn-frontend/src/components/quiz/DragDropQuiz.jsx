import { useState } from 'react';
import { GripVertical, RotateCcw, X } from 'lucide-react';

export default function DragDropQuiz({ prompt, items, targets, matches, setMatches, disabled }) {
  const [selected, setSelected] = useState(null);

  const assign = (item, target) => {
    if (disabled) return;
    setMatches((previous) => {
      const next = { ...previous };
      Object.keys(next).forEach((key) => {
        if (next[key] === target) delete next[key];
      });
      if (target) {
        next[item] = target;
      } else {
        delete next[item];
      }
      return next;
    });
    setSelected(null);
  };

  const targetFor = (item) => matches[item];
  const itemFor = (target) => Object.keys(matches).find((key) => matches[key] === target);

  return (
    <div>
      <p className="text-sm font-medium leading-relaxed text-slate-100">{prompt}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
        Drag a tile onto a slot, or tap a tile then tap a slot.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => {
          const isPlaced = Boolean(targetFor(item));
          const isSelected = selected === item;
          return (
            <button
              key={item}
              type="button"
              draggable={!disabled}
              disabled={disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', item);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => !disabled && setSelected(isSelected ? null : item)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                isSelected
                  ? 'border-gold bg-gold/15 text-gold-soft shadow-glow'
                  : isPlaced
                    ? 'border-white/5 bg-white/5 text-slate-500'
                    : 'border-arcane/40 bg-arcane/10 text-arcane-soft hover:border-arcane/70'
              } ${disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
            >
              <GripVertical size={13} className="opacity-60" />
              {item}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        {targets.map((target) => {
          const placedItem = itemFor(target);
          return (
            <div
              key={target}
              onDragOver={(event) => {
                if (!disabled) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const item = event.dataTransfer.getData('text/plain');
                if (item) assign(item, target);
              }}
              onClick={() => {
                if (selected) assign(selected, target);
              }}
              className={`flex min-h-[54px] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
                placedItem
                  ? 'border-rune/40 bg-rune/5'
                  : 'border-dashed border-white/15 bg-ink-900/40'
              } ${selected && !disabled ? 'cursor-pointer hover:border-gold/50' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200">{target}</p>
                <p
                  className={`mt-0.5 truncate text-[11px] ${
                    placedItem ? 'text-rune' : 'text-slate-600'
                  }`}
                >
                  {placedItem ?? 'Drop a matching tile here'}
                </p>
              </div>

              {placedItem && !disabled && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    assign(placedItem, null);
                  }}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white/10 hover:text-rose-300"
                  aria-label={`Remove ${placedItem}`}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!disabled && Object.keys(matches).length > 0 && (
        <button
          type="button"
          onClick={() => setMatches({})}
          className="btn-ghost mt-3 px-3 py-1.5 text-xs"
        >
          <RotateCcw size={13} /> Reset matches
        </button>
      )}
    </div>
  );
}
