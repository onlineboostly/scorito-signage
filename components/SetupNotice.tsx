/** Shown when the public Supabase env vars are missing (first deploy / fresh clone). */
export default function SetupNotice() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 px-16 text-center">
      <div
        className="h-1.5 w-24 rounded-full bg-gradient-to-r from-bisharp-orange via-bisharp-blue to-bisharp-green"
        aria-hidden
      />
      <h1 className="font-heading text-5xl font-bold">Configuratie ontbreekt</h1>
      <p className="max-w-3xl font-body text-2xl leading-relaxed text-bisharp-light/70">
        Zet <code className="text-bisharp-blue">NEXT_PUBLIC_SUPABASE_URL</code> en{' '}
        <code className="text-bisharp-blue">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{' '}
        <code className="text-bisharp-orange">.env.local</code> (lokaal) of in de
        Vercel-projectinstellingen, en herlaad deze pagina.
      </p>
    </div>
  );
}
