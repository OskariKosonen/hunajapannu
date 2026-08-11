const CaseFilesPanel = ({ caseFiles }) => (
  <section className="border border-emerald-500/70 rounded-lg bg-slate-950/80 shadow-lg overflow-hidden min-w-[320px] sm:min-w-0 sm:overflow-visible overflow-x-auto custom-scrollbar">
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-emerald-500/70">
      <span className="text-[0.65rem] px-2 py-0.5 rounded-full border border-emerald-500/70 text-emerald-300">
        CASE FILES
      </span>
      <span className="text-[0.65rem] text-emerald-500">curated incidents</span>
    </div>

    <div className="p-3 sm:p-4 text-[0.6rem] sm:text-[0.7rem] leading-tight space-y-3">
      {caseFiles.map((file) => (
        <div
          key={file.id}
          className="border border-emerald-800/70 rounded-lg bg-slate-950/80 p-3 space-y-2"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-emerald-200 font-semibold">{file.title}</span>
            <span className="text-[0.55rem] text-emerald-500">{file.timeframe}</span>
          </div>
          <p className="text-emerald-400">{file.summary}</p>
          <div className="border-l-2 border-emerald-600/80 pl-2 text-emerald-200 font-mono text-[0.55rem] break-words">
            {file.snippet}
          </div>
          <div className="flex flex-wrap gap-1">
            {file.tags.map((tag) => (
              <span
                key={`${file.id}-${tag.id}`}
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[0.55rem] ${tag.badgeColor}`}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[0.55rem] text-emerald-500">
        Manually selected highlights from sessions.
      </p>
    </div>
  </section>
);

export default CaseFilesPanel;
