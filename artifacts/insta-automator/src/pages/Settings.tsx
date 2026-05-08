import React, { useEffect, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetConfig,
  useUpdateConfig,
  getGetConfigQueryKey
} from "@workspace/api-client-react";
import {
  Loader2, Save, Instagram, BrainCircuit, RefreshCw,
  CheckCircle2, ExternalLink, LogIn, AlertCircle, Clock, LogOut, Link2, Sparkles, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormDescription, FormField,
  FormItem, FormLabel, FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const META_APP_ID = import.meta.env.VITE_META_APP_ID || "987994583687283";
const META_PERMISSIONS = [
  "instagram_content_publish",
  "instagram_manage_contents",
  "instagram_manage_comments",
  "instagram_basic",
  "pages_read_engagement",
  "pages_show_list",
  "business_management",
].join(",");

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; version: string; xfbml: boolean; cookie: boolean }) => void;
      login: (
        callback: (response: { authResponse?: { accessToken: string }; status: string }) => void,
        opts: { scope: string; return_scopes: boolean }
      ) => void;
      getLoginStatus: (callback: (response: { authResponse?: { accessToken: string }; status: string }) => void) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const configSchema = z.object({
  niche: z.string().min(2, "Niche must be at least 2 characters"),
  language: z.string().min(2, "Language must be at least 2 characters"),
  morningPostTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Must be HH:MM format"),
  afternoonPostTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Must be HH:MM format"),
  eveningPostTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Must be HH:MM format"),
  nightPostTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Must be HH:MM format"),
  lateNightPostTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Must be HH:MM format"),
  midnightPostTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Must be HH:MM format"),
  autoApprove: z.boolean(),
  instagramAccountId: z.string(),
  metaAccessToken: z.string(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

type LoginResult = { success: boolean; message: string; instagramAccountId?: string | null };

function useFacebookSDK() {
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    if (window.FB) { setSdkReady(true); return; }

    window.fbAsyncInit = () => {
      window.FB!.init({ appId: META_APP_ID, version: "v21.0", xfbml: false, cookie: true });
      setSdkReady(true);
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, []);

  return sdkReady;
}

export function Settings() {
  const { data: config, isLoading } = useGetConfig();
  const updateConfig = useUpdateConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sdkReady = useFacebookSDK();

  const [fbLoginLoading, setFbLoginLoading] = useState(false);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [aiProvider, setAiProvider] = useState<{ textModel: string; imageModel: string; openaiConfigured: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/config/ai-provider")
      .then(r => r.json())
      .then(d => setAiProvider(d as { textModel: string; imageModel: string; openaiConfigured: boolean }))
      .catch(() => null);
  }, []);

  // Manual token exchange state
  const [shortToken, setShortToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [exchangeResult, setExchangeResult] = useState<LoginResult | null>(null);

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      niche: "",
      language: "English",
      morningPostTime: "09:00",
      afternoonPostTime: "12:00",
      eveningPostTime: "15:00",
      nightPostTime: "18:00",
      lateNightPostTime: "21:00",
      midnightPostTime: "00:00",
      autoApprove: false,
      instagramAccountId: "",
      metaAccessToken: "",
    },
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (config && !initialized.current) {
      form.reset({
        niche: config.niche,
        language: config.language,
        morningPostTime: config.morningPostTime,
        afternoonPostTime: config.afternoonPostTime,
        eveningPostTime: config.eveningPostTime,
        nightPostTime: config.nightPostTime,
        lateNightPostTime: config.lateNightPostTime,
        midnightPostTime: config.midnightPostTime,
        autoApprove: config.autoApprove,
        instagramAccountId: config.instagramAccountId,
        metaAccessToken: config.metaAccessToken,
      });
      initialized.current = true;
    }
  }, [config, form]);

  const saveTokenToBackend = useCallback(async (accessToken: string): Promise<LoginResult> => {
    const res = await fetch("/api/config/meta-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    return res.json() as Promise<LoginResult>;
  }, []);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/config/disconnect-meta", { method: "POST" });
      const data = await res.json() as { success: boolean; message: string };
      if (data.success) {
        toast({ title: "Disconnected", description: "Your Instagram account has been unlinked." });
        setLoginResult(null);
        initialized.current = false;
        queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
      }
    } catch (err) {
      toast({ title: "Failed to disconnect", description: String(err), variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleFacebookLogin = () => {
    if (!window.FB) {
      toast({ title: "Facebook SDK not ready yet, please try again in a moment", variant: "destructive" });
      return;
    }

    // CRITICAL: Call FB.login immediately before ANY state updates to prevent popup blockers
    window.FB.login(async (response) => {
      setFbLoginLoading(true);
      setLoginResult(null);

      if (response.authResponse?.accessToken) {
        try {
          const result = await saveTokenToBackend(response.authResponse.accessToken);
          setLoginResult(result);
          if (result.success) {
            toast({ title: "Connected to Facebook!", description: result.message });
            initialized.current = false;
            queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
          } else {
            toast({ title: "Connection issue", description: result.message, variant: "destructive" });
          }
        } catch (err) {
          setLoginResult({ success: false, message: String(err) });
          toast({ title: "Failed to save token", description: String(err), variant: "destructive" });
        }
      } else {
        setLoginResult({ success: false, message: "Login cancelled or permission denied." });
        toast({ title: "Login cancelled", variant: "destructive" });
      }
      setFbLoginLoading(false);
    }, { scope: META_PERMISSIONS, return_scopes: true });
  };

  const handleExchangeToken = async () => {
    if (!shortToken) {
      toast({ title: "Please paste your access token", variant: "destructive" });
      return;
    }
    setExchanging(true);
    setExchangeResult(null);
    try {
      const body: Record<string, string> = { shortLivedToken: shortToken };
      if (appSecret) body["appSecret"] = appSecret;

      const res = await fetch("/api/config/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as LoginResult & { error?: string; details?: string };
      if (!res.ok || !(data as { success?: boolean }).success) {
        const msg = (data as { details?: string; error?: string }).details ?? (data as { error?: string }).error ?? "Exchange failed";
        setExchangeResult({ success: false, message: msg });
        toast({ title: "Token exchange failed", description: msg, variant: "destructive" });
      } else {
        setExchangeResult({ success: true, message: data.message, instagramAccountId: data.instagramAccountId });
        toast({ title: "Token saved!", description: data.message });
        initialized.current = false;
        queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
        setShortToken("");
        setAppSecret("");
      }
    } catch (err) {
      setExchangeResult({ success: false, message: String(err) });
      toast({ title: "Network error", description: String(err), variant: "destructive" });
    } finally {
      setExchanging(false);
    }
  };

  const onSubmit = (data: ConfigFormValues) => {
    updateConfig.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Failed to save settings", description: String(err), variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return <div className="flex h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const hasToken = !!config?.metaAccessToken;
  const hasIgAccount = !!config?.instagramAccountId;
  const isConnected = hasToken && hasIgAccount;

  return (
    <div className="space-y-10 pb-10">
      <div className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-gradient">Configuration</h1>
        <p className="text-muted-foreground text-lg">Manage your AI automation engine and API connections.</p>
      </div>

      {/* Meta Connection Card */}
      <Card className={`glass-card border-primary/20 bg-gradient-to-br ${isConnected ? "from-green-500/[0.05] to-emerald-500/[0.03]" : "from-violet-500/[0.03] to-fuchsia-500/[0.03]"}`}>
        <CardHeader className="pb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <CardTitle className="text-2xl flex items-center gap-3">
                <Instagram className="h-6 w-6 text-primary" />
                Instagram Connection
              </CardTitle>
              <CardDescription className="text-base">
                Link your Facebook Page and Instagram Business account to publish posts.
              </CardDescription>
            </div>
            <Badge
              variant={isConnected ? "default" : "outline"}
              className={isConnected
                ? "bg-green-500/15 text-green-500 border-green-500/30 px-4 py-2 text-sm font-bold"
                : "px-4 py-2 text-sm font-bold text-muted-foreground"}>
              {isConnected ? (
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Connected</span>
              ) : (
                <span className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Not Connected</span>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Connected state banner */}
          {isConnected && (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="font-bold text-green-600">Account linked successfully</p>
                  <p className="text-sm text-muted-foreground">Instagram ID: <span className="font-mono text-green-600/80">{config?.instagramAccountId}</span></p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500/40 rounded-xl h-10 px-5"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          )}

          {/* One-click Facebook Login */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#1877F2] flex items-center justify-center shadow-lg shadow-[#1877F2]/20 shrink-0">
                <Instagram className="text-white h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-lg">{isConnected ? "Reconnect with Facebook" : "Connect with Facebook"}</p>
                <p className="text-sm text-muted-foreground">The most reliable way to connect. We never see your password.</p>
              </div>
            </div>

            {loginResult && (
              <div className={`flex items-start gap-3 rounded-xl p-4 text-sm ${loginResult.success ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-red-500/10 text-red-600 border border-red-500/20"}`}>
                {loginResult.success
                  ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                  : <AlertCircle className="h-5 w-5 shrink-0" />}
                <span className="font-medium">{loginResult.message}</span>
              </div>
            )}

            <Button
              onClick={handleFacebookLogin}
              disabled={fbLoginLoading || !sdkReady}
              size="lg"
              className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white w-full sm:w-auto h-12 px-8 rounded-xl shadow-lg shadow-[#1877F2]/20"
            >
              {fbLoginLoading
                ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                : <LogIn className="h-5 w-5 mr-2" />}
              {fbLoginLoading ? "Authorizing..." : sdkReady ? (isConnected ? "Reconnect with Facebook" : "Connect with Facebook") : "Initializing SDK..."}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
              <span className="bg-background px-4 text-muted-foreground">Advanced — Manual Token</span>
            </div>
          </div>

          {/* Manual token paste */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Paste a token manually if the button above doesn't work
              </p>
              <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-bold">
                Graph API Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-2">
                <Input
                  className="h-12 bg-white/5 border-white/10 rounded-xl"
                  placeholder="System Access Token (EAAB...)"
                  value={shortToken}
                  onChange={e => setShortToken(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  className="h-12 bg-white/5 border-white/10 rounded-xl"
                  placeholder="App Secret (optional)"
                  value={appSecret}
                  onChange={e => setAppSecret(e.target.value)}
                />
              </div>
            </div>

            {exchangeResult && (
              <div className={`flex items-start gap-3 rounded-xl p-4 text-sm ${exchangeResult.success ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-red-500/10 text-red-600 border border-red-500/20"}`}>
                {exchangeResult.success
                  ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                  : <AlertCircle className="h-5 w-5 shrink-0" />}
                <span className="font-medium">{exchangeResult.message}</span>
              </div>
            )}

            <Button onClick={handleExchangeToken} disabled={exchanging} variant="outline" className="h-11 rounded-xl border-white/10 hover:bg-white/5">
              {exchanging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {exchanging ? "Connecting..." : "Connect with Token"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
          <div className="grid gap-8 md:grid-cols-2">
            {/* Content AI Card */}
            <Card className="glass-card h-full">
              <CardHeader className="pb-6">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-3">
                      <BrainCircuit className="h-6 w-6 text-primary" />
                      AI Intelligence
                    </CardTitle>
                    <CardDescription>Customize how AI interprets your brand.</CardDescription>
                  </div>
                  {aiProvider && (
                    <Badge
                      variant="outline"
                      className={aiProvider.openaiConfigured
                        ? "bg-violet-500/15 text-violet-400 border-violet-500/30 px-3 py-1.5 text-xs font-bold"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/25 px-3 py-1.5 text-xs font-bold"}>
                      {aiProvider.openaiConfigured
                        ? <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> {aiProvider.textModel} · {aiProvider.imageModel}</span>
                        : <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Pollinations (free)</span>}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {aiProvider && (
                  <div className={`rounded-xl border p-4 text-sm flex items-start gap-3 ${aiProvider.openaiConfigured
                    ? "bg-violet-500/10 border-violet-500/20 text-violet-300"
                    : "bg-amber-500/8 border-amber-500/20 text-amber-400"}`}>
                    {aiProvider.openaiConfigured
                      ? <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                      : <Zap className="h-4 w-4 shrink-0 mt-0.5" />}
                    <div>
                      {aiProvider.openaiConfigured ? (
                        <>
                          <p className="font-bold">Premium AI active</p>
                          <p className="text-xs opacity-80 mt-0.5">Captions via {aiProvider.textModel} · Images via {aiProvider.imageModel}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-bold">Using free AI (Pollinations)</p>
                          <p className="text-xs opacity-80 mt-0.5">Add an <span className="font-mono">OPENAI_API_KEY</span> secret to upgrade to premium AI.</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <FormField control={form.control} name="niche" render={({ field }: { field: any }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Niche & Tone</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="e.g. Luxury real estate in Dubai, focused on high-net-worth investors..."
                        className="min-h-[120px] bg-white/5 border-white/10 rounded-xl focus:border-primary/50" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="language" render={({ field }: { field: any }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Output Language</FormLabel>
                    <FormControl>
                      <Input className="h-12 bg-white/5 border-white/10 rounded-xl" placeholder="English" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Automation Settings Card */}
            <Card className="glass-card h-full">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl flex items-center gap-3">
                  <Clock className="h-6 w-6 text-primary" />
                  Smart Scheduler
                </CardTitle>
                <CardDescription>Optimize your posting times for maximum engagement.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField control={form.control} name="morningPostTime" render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Morning slot</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 bg-white/5 border-white/10 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="afternoonPostTime" render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Afternoon slot</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 bg-white/5 border-white/10 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="eveningPostTime" render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Evening slot</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 bg-white/5 border-white/10 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="nightPostTime" render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Night slot</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 bg-white/5 border-white/10 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lateNightPostTime" render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Late Night</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 bg-white/5 border-white/10 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="midnightPostTime" render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Midnight</FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 bg-white/5 border-white/10 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                
                <FormField control={form.control} name="autoApprove" render={({ field }: { field: any }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-2xl border border-white/10 p-5 bg-white/5">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-bold">Full Automation</FormLabel>
                      <FormDescription className="text-xs">
                        Bypass approval queue. Posts go live instantly.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch 
                        checked={field.value} 
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-primary" 
                      />
                    </FormControl>
                  </FormItem>
                )} />
              </CardContent>
            </Card>
          </div>

          {/* Manual Credentials Override Card */}
          <Card className="glass-card border-primary/20 bg-gradient-to-br from-violet-500/[0.03] to-fuchsia-500/[0.03]">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-primary" />
                Direct API Credentials
              </CardTitle>
              <CardDescription>If the automated Facebook connection fails or is blocked, enter your credentials directly here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField control={form.control} name="instagramAccountId" render={({ field }: { field: any }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Instagram Account ID</FormLabel>
                    <FormControl>
                      <Input className="h-12 bg-white/5 border-white/10 rounded-xl" placeholder="e.g. 178414... " {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="metaAccessToken" render={({ field }: { field: any }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meta Access Token</FormLabel>
                    <FormControl>
                      <Input type="password" className="h-12 bg-white/5 border-white/10 rounded-xl" placeholder="EAAB..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-4">
            <Button 
              type="submit" 
              size="lg" 
              className="min-w-[220px] h-14 rounded-2xl shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 font-bold text-lg" 
              disabled={updateConfig.isPending}
            >
              {updateConfig.isPending
                ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                : <Save className="h-5 w-5 mr-2" />}
              Save All Settings
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
