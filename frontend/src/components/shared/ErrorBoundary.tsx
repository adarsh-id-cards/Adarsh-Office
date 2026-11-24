import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "An unexpected client error occurred.",
    };
  }

  private handleReload = (): void => {
    this.setState({ hasError: false, errorMessage: "" });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h1 className="text-base font-semibold">Application Render Error</h1>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Pro Office encountered an unexpected error while rendering this view. Your session and
              server data remain intact.
            </p>
            {this.state.errorMessage ? (
              <pre className="mt-3 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-700">
                {this.state.errorMessage}
              </pre>
            ) : null}
            <div className="mt-5 flex justify-end">
              <Button onClick={this.handleReload} size="sm">
                <RotateCcw className="h-3.5 w-3.5" />
                Reload Application
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
