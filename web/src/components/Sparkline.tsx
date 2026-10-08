type Props = {
  values: Array<number | null>;
  down: boolean;
};

export function Sparkline({ values, down }: Props) {
  const numbers = values.filter((value): value is number => value != null);
  if (numbers.length === 0) {
    return (
      <svg className="spark" viewBox="0 0 120 36" aria-hidden="true">
        <line className="spark-empty" x1="0" x2="120" y1="28" y2="28" />
      </svg>
    );
  }
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = Math.max(1, max - min);
  const segments: string[] = [];
  let current = "";
  values.forEach((value, index) => {
    if (value == null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    const x = values.length === 1 ? 60 : (index / (values.length - 1)) * 120;
    const y = 4 + (1 - (value - min) / span) * 28;
    const command = `${x.toFixed(1)} ${y.toFixed(1)}`;
    current += current ? ` L ${command}` : `M ${command}`;
  });
  if (current) segments.push(current);

  return (
    <svg className={`spark ${down ? "down" : "up"}`} viewBox="0 0 120 36" aria-hidden="true">
      {segments.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
