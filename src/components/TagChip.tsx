type Props = {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
};

// タグごとに、ピンク・黄色・ミントのどれかになる(同じ名前は、いつも同じ色)
const SOFT = [
  "border-orange-200 bg-orange-100 text-orange-800",
  "border-amber-200 bg-butter text-amber-900",
  "border-teal-200 bg-mintbg text-teal-900",
];
const colorIndex = (label: string) => [...label].reduce((n, c) => n + c.charCodeAt(0), 0) % SOFT.length;

export function TagChip({ label, selected, onClick, onRemove }: Props) {
  const base = "inline-flex items-center gap-1 rounded-full border-2 px-2.5 text-sm font-bold";
  const color = selected
    ? "border-orange-600 bg-orange-600 text-white"
    : SOFT[colorIndex(label)];

  if (onClick) {
    return (
      // スマホでは押しやすいよう縦に広げる(パソコン幅は従来どおり)
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`${base} ${color} py-2 hover:opacity-80 sm:py-0.5`}
      >
        {label}
      </button>
    );
  }
  return (
    <span className={`${base} ${color} py-0.5`}>
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`タグ「${label}」を外す`}
          className="-my-3 -mr-2.5 px-3.5 py-3 leading-none hover:opacity-70 sm:m-0 sm:p-0"
        >
          ×
        </button>
      )}
    </span>
  );
}
