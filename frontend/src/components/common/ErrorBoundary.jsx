import { Component } from "react";

/**
 * Keeps one misbehaving panel from taking the page down with it.
 *
 * Every panel renders data straight from the API, so a single unexpected
 * shape — a null where a number was assumed, say — would otherwise throw
 * during render and leave the whole dashboard blank. Contained here, the
 * rest of the page carries on and the broken panel says so.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`Panel "${this.props.name}" crashed:`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section
        role="alert"
        className="border border-red-500/60 rounded-xl bg-slate-950/80 p-4 text-[0.72rem] space-y-2"
      >
        <div className="text-red-300 font-semibold">
          {this.props.name ? `${this.props.name} failed to render` : "Panel failed to render"}
        </div>
        <p className="text-emerald-500 text-[0.68rem]">
          The rest of the dashboard is unaffected. Details are in the browser console.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="px-2.5 py-1 rounded-md border border-emerald-700/70 text-emerald-300 hover:border-emerald-500/70 transition text-[0.68rem]"
        >
          Try again
        </button>
      </section>
    );
  }
}

export default ErrorBoundary;
