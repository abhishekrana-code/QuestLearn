/**
 * QuestLearn mark: three connected nodes on an orange tile.
 * The tile is deliberately small and sharp-cornered next to the softer cards,
 * which is what stops the brand from looking like a generic gradient badge.
 */
export default function Logo({ size = 'md', inverse = false, markOnly = false, className = '' }) {
  const tile =
    size === 'lg' ? 'h-11 w-11 rounded-[13px]' : size === 'sm' ? 'h-8 w-8 rounded-[9px]' : 'h-9 w-9 rounded-[10px]';
  const word =
    size === 'lg' ? 'text-[21px]' : size === 'sm' ? 'text-[15px]' : 'text-[17px]';

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`grid ${tile} shrink-0 place-items-center bg-brand shadow-[0_2px_0_hsl(var(--brand-shade))]`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none">
          <path
            d="M7.3 17.4c0-3.4 3.1-3.7 4.7-5.3 1.6-1.6 1.5-3.5 1.5-5.2"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="7.3" cy="17.4" r="2.3" fill="white" />
          <circle cx="12.1" cy="11.4" r="1.7" fill="white" />
          <circle cx="13.6" cy="6.6" r="2.3" fill="white" />
        </svg>
      </span>

      {!markOnly && (
        <span
          className={`font-display ${word} font-semibold leading-none tracking-[-0.045em] ${
            inverse ? 'text-white' : 'text-foreground'
          }`}
        >
          QuestLearn<span className="text-gold">.</span>
        </span>
      )}
    </span>
  );
}
