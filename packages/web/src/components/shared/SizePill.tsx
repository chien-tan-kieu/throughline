import type { StorySize } from "@cc/shared";
type Props = { size: StorySize | null; onClick?: () => void };
const labels: Record<StorySize, string> = { XS: "X-Small", S: "Small", M: "Medium", L: "Large", XL: "X-Large" };
export function SizePill({ size, onClick }: Props) {
  if (!size) {
    return (
      <button className="size-pill unset" onClick={onClick} style={{ borderStyle: "dashed", opacity: 0.5 }}>
        <span className="size">—</span>
        <span className="label">Set size</span>
      </button>
    );
  }
  return (
    <button className={`size-pill ${size.toLowerCase()}`} onClick={onClick}>
      <span className="size">{size}</span>
      <span className="label">{labels[size]}</span>
    </button>
  );
}
