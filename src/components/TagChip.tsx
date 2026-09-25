type Props = {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
};

export function TagChip({ label, selected, onClick, onRemove }: Props) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2.5 text-sm";
  const color = selected
    ? "border-orange-600 bg-orange-600 text-white"
    : "border-orange-200 bg-orange-50 text-orange-800";

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
