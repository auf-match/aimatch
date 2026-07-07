import AllPipelinesBoard from "./all-pipelines-board";

export default function PipelinePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-card px-6 py-5 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <h1 className="text-2xl font-bold tracking-tight">Этапы</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Воронка по всем открытым вакансиям
        </p>
      </div>

      <div className="p-6">
        <AllPipelinesBoard />
      </div>
    </div>
  );
}
