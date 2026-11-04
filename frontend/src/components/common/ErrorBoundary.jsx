import { Component } from "react";
import Button from "../ui/Button";
import { AlertIcon } from "../ui/icons";

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
      <section role="alert" className="rounded-lg border border-danger/30 bg-surface p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-danger">
          <AlertIcon size={14} />
          {this.props.name ? `${this.props.name} failed to render` : "Panel failed to render"}
        </div>
        <p className="text-sm text-fg-muted">
          The rest of the dashboard is unaffected. Details are in the browser console.
        </p>
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </section>
    );
  }
}

export default ErrorBoundary;
