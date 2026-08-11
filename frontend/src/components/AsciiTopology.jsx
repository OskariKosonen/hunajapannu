import ScrollShadow from "./common/ScrollShadow";
import topologySvg from "../assets/topology3.svg";

const AsciiTopology = () => (
  <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl sm:mx-auto">
    <div className="relative px-4 sm:px-5 py-3 border-b border-emerald-800/60 bg-slate-950/70 flex items-center justify-between gap-2">
      <div className="space-y-1">
        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-emerald-200">Attack pipeline</p>
        <h3 className="text-lg sm:text-xl font-semibold text-green-100">Network topology</h3>
      </div>
    </div>

    <div className="relative p-3 sm:p-4">
      <ScrollShadow className="w-full min-w-0" topScrollbar>
        <div className="flex justify-center w-full min-w-0">
          <img
            src={topologySvg}
            alt="Network topology diagram"
            className="max-w-full h-auto max-h-[80vh] sm:max-h-[720px] object-contain bg-slate-950/80 border border-emerald-800/70 rounded-lg p-3 sm:p-4 shadow-inner"
          />
        </div>
      </ScrollShadow>
    </div>
  </section>
);

export default AsciiTopology;
