type Props = {
  title: string;
  subtitle?: string;
};

/** Centered full-area message for "no data yet" / "no matches today". */
export default function EmptyState({ title, subtitle }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div
        className="h-1.5 w-24 rounded-full bg-gradient-to-r from-bisharp-orange via-bisharp-blue to-bisharp-green"
        aria-hidden
      />
      <h2 className="font-heading text-6xl font-bold">{title}</h2>
      {subtitle ? (
        <p className="font-body text-2xl text-bisharp-light/55">{subtitle}</p>
      ) : null}
    </div>
  );
}
