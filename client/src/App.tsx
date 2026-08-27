import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useRoute } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function DashboardRoute() {
  return <DashboardLayout><Home /></DashboardLayout>;
}

function InvitationRoute() {
  const [, params] = useRoute<{ token: string }>("/invite/:token");
  const [email, setEmail] = useState("");
  const accept = trpc.auth.acceptInvitation.useMutation({ onSuccess: result => toast.success(`Доступ выдан: ${result.role}`), onError: error => toast.error(error.message) });
  return <div className="flex min-h-screen items-center justify-center bg-[#f4f1e8] p-4 dark:bg-[#111713]"><Card className="w-full max-w-md rounded-[24px]"><CardHeader><CardTitle>Приглашение в CraftPanel</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-[#899386]">Введите email, на который было отправлено приглашение.</p><Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="admin@example.com" /><Button className="w-full" disabled={!params?.token || !email || accept.isPending} onClick={() => params?.token && accept.mutate({ token: params.token, email })}>Принять приглашение</Button></CardContent></Card></div>;
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
    <Route path="/invite/:token" component={InvitationRoute} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  return <ErrorBoundary>
    <ThemeProvider defaultTheme="light" switchable>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  </ErrorBoundary>;
}

export default App;
