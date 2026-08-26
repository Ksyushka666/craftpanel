import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function DashboardRoute() {
  return <DashboardLayout><Home /></DashboardLayout>;
}

function Router() {
  return <Switch>
    <Route path="/" component={DashboardRoute} />
    <Route path="/servers" component={DashboardRoute} />
    <Route path="/library" component={DashboardRoute} />
    <Route path="/backups" component={DashboardRoute} />
    <Route path="/files" component={DashboardRoute} />
    <Route path="/settings" component={DashboardRoute} />
    <Route path="/help" component={DashboardRoute} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  return <ErrorBoundary>
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>;
}

export default App;
