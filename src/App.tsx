const MODELS = ["C4F16", "C4F16_DS", "C4F32", "C4F32_DS"] as const;

function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-950 p-8 text-neutral-100">
      <h1 className="text-3xl font-semibold tracking-tight">NetsuCast</h1>
      <p className="text-sm text-neutral-400">
        Récupère le flux vidéo d'un site et le lit avec un upscale ArtCNN.
      </p>
      <ul className="flex gap-2 text-xs">
        {MODELS.map((m) => (
          <li key={m} className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300">
            {m}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
