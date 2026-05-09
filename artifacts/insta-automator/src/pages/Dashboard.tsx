import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTodaysPosts,
  useGetStats,
  useGeneratePost,
  useApprovePost,
  useRejectPost,
  usePublishPost,
  useUpdatePost,
  useGetConfig,
  useUpdateConfig,
  getGetConfigQueryKey,
  getGetTodaysPostsQueryKey,
  getGetStatsQueryKey,
  getListPostsQueryKey
} from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Loader2, Check, X, Send, Clock, Image as ImageIcon,
  Edit3, Save, CheckCircle2, Film, Layout, Sparkles,
  TrendingUp, Eye, BarChart2, Upload, RefreshCw, Zap,
  Flame, ChevronRight, RotateCcw, Maximize2, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface TrendingTopic {
  title: string;
  searchQuery: string;
  imageQuery: string;
  hashtags: string[];
  contentAngle: string;
  region: string;
}

interface AccountInsights {
  profile: {
    followers_count?: number;
    media_count?: number;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
  recentMedia: Array<{
    id: string;
    mediaType: string;
    timestamp: string;
    likeCount: number;
    commentsCount: number;
    caption?: string;
    thumbnailUrl?: string;
  }>;
}

export function Dashboard() {
  const { data: posts, isLoading: loadingPosts } = useGetTodaysPosts({
    query: { refetchInterval: 3000 } as any,
  });
  const { data: stats } = useGetStats({ query: { refetchInterval: 15000 } as any });
  const { data: config } = useGetConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const generatePost = useGeneratePost();
  const approvePost = useApprovePost();
  const rejectPost = useRejectPost();
  const publishPost = usePublishPost();
  const updatePost = useUpdatePost();
  const updateConfig = useUpdateConfig();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [localImageSource, setLocalImageSource] = useState<"ai" | "search" | null>(null);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<TrendingTopic | null>(null);
  const [accountInsights, setAccountInsights] = useState<AccountInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [previewPost, setPreviewPost] = useState<any | null>(null);
  const [customNiche, setCustomNiche] = useState("");

  const activeSource = localImageSource ?? (config?.imageSource as "ai" | "search" | null) ?? "ai";
  const activeNiche = customNiche.trim() || config?.niche || "";

  useEffect(() => {
    if (config?.niche) setCustomNiche(config.niche);
  }, [config?.niche]);

  // Load trending topics on mount
  useEffect(() => {
    fetchTrending();
  }, []);

  // Load analytics if Instagram connected
  useEffect(() => {
    if (config?.instagramAccountId && config?.metaAccessToken && showInsights) {
      fetchInsights();
    }
  }, [config?.instagramAccountId, showInsights]);

  const fetchTrending = async () => {
    setLoadingTrending(true);
    try {
      const res = await fetch("/api/analytics/trending");
      if (res.ok) {
        const data = await res.json();
        setTrendingTopics(data.topics || []);
      }
    } catch {}
    setLoadingTrending(false);
  };

  const handleSaveNiche = () => {
    const niche = customNiche.trim();
    if (niche.length < 2) {
      toast({ title: "Add a niche", description: "Niche must be at least 2 characters.", variant: "destructive" });
      return;
    }

    updateConfig.mutate({ data: { niche } } as any, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
        toast({ title: "Niche updated", description: "New captions will use this custom niche." });
        fetchTrending();
      },
      onError: (err: any) => toast({ title: "Could not save niche", description: String(err?.message || err), variant: "destructive" }),
    });
  };

  const fetchInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch("/api/analytics/account");
      if (res.ok) setAccountInsights(await res.json());
    } catch {}
    setLoadingInsights(false);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTodaysPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
  };

  const handleGenerate = (type: "image" | "reels" | "carousel") => {
    setGeneratingType(type);
    generatePost.mutate({ data: { type, imageSource: activeSource } } as any, {
      onSuccess: () => {
        toast({ title: `${type === "reels" ? "Reel" : type === "carousel" ? "Carousel" : "Post"} generated!` });
        invalidate();
      },
      onError: (err: any) => toast({ title: "Generation failed", description: String(err?.message || err), variant: "destructive" }),
      onSettled: () => setGeneratingType(null),
    });
  };

  const handleRegenerateCaption = async (postId: number) => {
    setRegeneratingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/regenerate-caption`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast({ title: "Caption refreshed!" });
      invalidate();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
    setRegeneratingId(null);
  };

  const handleApprove = (id: number) => approvePost.mutate({ id } as any, { onSuccess: invalidate });
  const handleReject = (id: number) => rejectPost.mutate({ id } as any, { onSuccess: invalidate });
  const handlePublish = (id: number) =>
    publishPost.mutate({ id } as any, {
      onSuccess: () => { toast({ title: "Live on Instagram!" }); invalidate(); },
      onError: (err: any) => toast({ title: "Publish failed", description: String(err?.message || err), variant: "destructive" }),
    });

  const startEditing = (post: any) => { setEditingId(post.id); setEditCaption(post.caption); setEditHashtags(post.hashtags); };
  const saveEdit = (id: number) =>
    updatePost.mutate({ id, data: { caption: editCaption, hashtags: editHashtags } } as any, {
      onSuccess: () => { setEditingId(null); invalidate(); toast({ title: "Caption saved" }); },
    });

  const STATS = [
    { label: "Total Published", value: stats?.totalPosted ?? "—", icon: CheckCircle2, color: "from-emerald-500/20 to-emerald-500/5", iconColor: "text-emerald-400", border: "border-emerald-500/20" },
    { label: "Pending Review", value: stats?.totalPending ?? "—", icon: Clock, color: "from-amber-500/20 to-amber-500/5", iconColor: "text-amber-400", border: "border-amber-500/20" },
    { label: "This Month", value: stats?.postsThisMonth ?? "—", icon: BarChart2, color: "from-blue-500/20 to-blue-500/5", iconColor: "text-blue-400", border: "border-blue-500/20" },
    { label: "Followers", value: accountInsights?.profile?.followers_count ? `${(accountInsights.profile.followers_count / 1000).toFixed(1)}K` : (stats?.postsThisWeek ?? "—"), icon: TrendingUp, color: "from-violet-500/20 to-violet-500/5", iconColor: "text-violet-400", border: "border-violet-500/20" },
  ];

  return (
    <div className="space-y-8 pb-12 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-primary fill-primary/20" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">AI Content Engine</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Content <span className="ig-text">Pipeline</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-orange-400 font-semibold">Trending-first</span>
            </span>
            · <span className="text-emerald-400">●</span> Auto-pilot running
          </p>
        </div>

        <div className="w-full sm:w-[420px]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Custom Niche</p>
          <div className="flex gap-2">
            <Input
              value={customNiche}
              onChange={(e) => setCustomNiche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveNiche();
              }}
              className="h-10 rounded-xl bg-muted border-border/70 text-xs"
              placeholder="Example: IPL cricket analysis for Chennai fans"
            />
            <Button
              onClick={handleSaveNiche}
              disabled={updateConfig.isPending || customNiche.trim() === (config?.niche || "").trim()}
              className="h-10 rounded-xl ig-gradient border-0 text-white px-4"
              title="Save niche"
            >
              {updateConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 truncate">Active: {activeNiche || "No niche set"}</p>
        </div>

        {/* Source Toggle */}
        <div className="flex flex-col items-end gap-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Image Source</p>
          <div className="flex items-center rounded-xl border border-border p-1 gap-1" style={{ background: "hsl(var(--muted))" }}>
            {(["ai", "search"] as const).map((src) => (
              <button
                key={src}
                onClick={() => {
                  setLocalImageSource(src);
                  updateConfig.mutate({ data: { imageSource: src } } as any, { onError: () => setLocalImageSource(null) });
                }}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all duration-150 ${activeSource === src ? "ig-gradient text-white shadow-lg scale-[1.03]" : "text-muted-foreground hover:text-foreground"}`}
              >
                {src === "ai" ? "✨ AI Images" : "🔍 Real Photos"}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {activeSource === "ai" ? "Flux AI generates every image" : "Fetches real news photos from web"}
          </p>
        </div>
      </div>

      {/* ── Trending Topics Panel ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-rose-500/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-500/15">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400 fill-orange-400/30" />
            <span className="text-sm font-bold text-foreground">Trending in India</span>
            <button
              onClick={() => {
                if (!loadingTrending) {
                  fetchTrending();
                }
              }}
              disabled={loadingTrending}
              className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-orange-500/40 text-orange-400 hover:bg-orange-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingTrending ? "Finding..." : "Auto-Generate Niches"}
            </button>
          </div>
          <button
            onClick={fetchTrending}
            disabled={loadingTrending}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${loadingTrending ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="p-4">
          {loadingTrending ? (
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8 w-36 rounded-full" />)}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {trendingTopics.map((topic, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedTopic(topic);
                  }}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    selectedTopic?.title === topic.title
                      ? "ig-gradient border-transparent text-white"
                      : "border-orange-500/30 text-foreground hover:border-orange-500/60 hover:bg-orange-500/10"
                  }`}
                >
                  <span className="text-orange-400 group-hover:text-orange-300">🔥</span>
                  <span className="max-w-[320px] text-left whitespace-normal leading-snug">{topic.title}</span>
                  <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">{topic.region}</span>
                </button>
              ))}
            </div>
          )}
          {selectedTopic && (
            <div className="mt-4 rounded-xl border border-orange-500/20 bg-background/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{selectedTopic.title}</p>
                  <p className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold mt-0.5">{selectedTopic.region}</p>
                </div>
                <button onClick={() => setSelectedTopic(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  clear
                </button>
              </div>
              <p className="text-xs leading-6 text-muted-foreground">{selectedTopic.contentAngle}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Search Evidence</p>
                  <p className="text-xs text-foreground/80">{selectedTopic.searchQuery}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Visual Direction</p>
                  <p className="text-xs text-foreground/80">{selectedTopic.imageQuery}</p>
                </div>
              </div>
              {!!selectedTopic.hashtags?.length && (
                <p className="text-xs text-primary/70 font-mono break-words">{selectedTopic.hashtags.join(" ")}</p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCustomNiche(selectedTopic.title);
                  toast({ title: "Niche copied", description: "Review it, then save if you want captions to use it." });
                }}
                className="rounded-lg text-xs"
              >
                Use as niche draft
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Generate Buttons */}
      <div className="grid grid-cols-3 gap-3">
        <GenerateButton onClick={() => handleGenerate("image")} loading={generatingType === "image"} disabled={!!generatingType} icon={<ImageIcon className="h-4 w-4" />} label="Post" gradient="from-pink-600 via-rose-500 to-orange-500" />
        <GenerateButton onClick={() => handleGenerate("reels")} loading={generatingType === "reels"} disabled={!!generatingType} icon={<Film className="h-4 w-4" />} label="Reel" gradient="from-violet-600 via-purple-600 to-pink-600" />
        <GenerateButton onClick={() => handleGenerate("carousel")} loading={generatingType === "carousel"} disabled={!!generatingType} icon={<Layout className="h-4 w-4" />} label="Carousel" gradient="from-amber-500 via-orange-500 to-rose-500" />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div key={s.label} className={`stat-card border ${s.border} rounded-2xl`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${s.color} rounded-2xl pointer-events-none`} />
            <div className="relative z-10">
              <s.icon className={`h-5 w-5 mb-3 ${s.iconColor}`} />
              <div className="text-3xl font-extrabold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-medium">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Instagram Analytics Panel ────────────────────────────────────── */}
      {config?.instagramAccountId && (
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-violet-500/5 overflow-hidden">
          <button
            onClick={() => setShowInsights(!showInsights)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-bold text-foreground">Instagram Insights</span>
              {accountInsights?.profile?.username && (
                <span className="text-xs text-muted-foreground">@{accountInsights.profile.username}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              {loadingInsights ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <ChevronRight className={`h-4 w-4 transition-transform ${showInsights ? "rotate-90" : ""}`} />
            </div>
          </button>

          {showInsights && (
            <div className="px-5 pb-5 border-t border-blue-500/10">
              {loadingInsights ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                </div>
              ) : accountInsights ? (
                <div className="mt-4 space-y-4">
                  {/* Profile header */}
                  <div className="flex items-center gap-3">
                    {accountInsights.profile.profile_picture_url && (
                      <img src={accountInsights.profile.profile_picture_url} alt="Profile" className="h-10 w-10 rounded-full" />
                    )}
                    <div>
                      <div className="font-bold text-sm">{accountInsights.profile.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {accountInsights.profile.followers_count?.toLocaleString("en-IN")} followers · {accountInsights.profile.media_count} posts
                      </div>
                    </div>
                  </div>

                  {/* Recent media grid */}
                  {accountInsights.recentMedia.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">Recent Performance</p>
                      <div className="grid grid-cols-4 gap-2">
                        {accountInsights.recentMedia.slice(0, 8).map((m) => (
                          <div key={m.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                            {m.thumbnailUrl ? (
                              <img src={m.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5">
                              <span className="text-[10px] text-white font-bold">❤️ {m.likeCount}</span>
                              <span className="text-[10px] text-white/80">💬 {m.commentsCount}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">Could not load Instagram insights.</p>
                  <button onClick={fetchInsights} className="text-xs text-primary hover:underline mt-1">Try again</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Next scheduled auto-post banner */}
      {stats?.nextScheduledPost && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-violet-500/5 px-5 py-3.5">
          <div className="h-8 w-8 rounded-full ig-gradient flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Next auto-post scheduled for</p>
            <p className="text-sm font-bold text-foreground">{format(new Date(stats.nextScheduledPost), "EEEE, MMM d · h:mm a")}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold">Auto-pilot</span>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">Upcoming Pipeline</h2>
            {!!posts?.posts?.length && (
              <Badge variant="outline" className="badge-pending text-xs font-bold px-2.5">
                {posts.posts.length} waiting
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="badge-approved gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            Live Sync
          </Badge>
        </div>

        {loadingPosts ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[520px] rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {generatePost.isPending && (
              <div className="card-glass rounded-2xl flex flex-col items-center justify-center min-h-[520px] border-dashed border-2 border-primary/30 gap-4">
                <div className="h-16 w-16 rounded-full ig-gradient flex items-center justify-center animate-pulse">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-foreground">Generating {generatingType}…</p>
                  <p className="text-xs text-muted-foreground mt-1">Using saved niche: {config?.niche || "India Instagram trends"}</p>
                </div>
              </div>
            )}

            {!posts?.posts?.length && !generatePost.isPending && (
              <div className="col-span-full flex flex-col items-center justify-center py-24 gap-4">
                <div className="h-20 w-20 rounded-2xl bg-muted border border-border flex items-center justify-center">
                  <ImageIcon className="h-9 w-9 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <h3 className="font-bold text-lg">Queue is empty</h3>
                  <p className="text-sm text-muted-foreground mt-1">Pick a trending topic above or click Generate</p>
                </div>
                <Button onClick={() => handleGenerate("image")} className="ig-gradient border-0 text-white rounded-xl px-8 shadow-lg">
                  <Sparkles className="h-4 w-4 mr-2" /> Generate First Post
                </Button>
              </div>
            )}

            {posts?.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                editing={editingId === post.id}
                onEdit={() => startEditing(post)}
                onCancel={() => setEditingId(null)}
                onSave={() => saveEdit(post.id)}
                onApprove={() => handleApprove(post.id)}
                onReject={() => handleReject(post.id)}
                onPublish={() => handlePublish(post.id)}
                onRegenerateCaption={() => handleRegenerateCaption(post.id)}
                editState={{ caption: editCaption, setCaption: setEditCaption, hashtags: editHashtags, setHashtags: setEditHashtags }}
                isSaving={updatePost.isPending}
                isPublishing={publishPost.isPending}
                isRegeneratingCaption={regeneratingId === post.id}
                onOpenPreview={() => setPreviewPost(post)}
              />
            ))}
          </div>
        )}
      </div>

      {previewPost && (
        <PostPreviewModal
          post={previewPost}
          onClose={() => setPreviewPost(null)}
          onEdit={() => {
            startEditing(previewPost);
            setPreviewPost(null);
          }}
        />
      )}
    </div>
  );
}

function GenerateButton({ onClick, loading, disabled, icon, label, gradient }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-px disabled:opacity-50 disabled:cursor-not-allowed group transition-all hover:scale-[1.02] active:scale-[0.98]`}
    >
      <div className="bg-card/80 backdrop-blur-sm rounded-[calc(var(--radius)*1.1-1px)] px-4 py-3 flex items-center justify-center gap-2 group-hover:bg-transparent transition-colors">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <span className="text-white/80 group-hover:text-white transition-colors">{icon}</span>}
        <span className="text-sm font-bold text-foreground group-hover:text-white transition-colors">
          {loading ? "Generating…" : `Generate ${label}`}
        </span>
      </div>
    </button>
  );
}

function PostCard({ post, editing, onEdit, onCancel, onSave, onApprove, onReject, onPublish, onRegenerateCaption, editState, isSaving, isPublishing, isRegeneratingCaption, onOpenPreview }: any) {
  const [slide, setSlide] = useState(0);
  const slides = post.mediaType === "carousel" && post.mediaUrls?.length >= 2 ? post.mediaUrls : post.mediaType === "carousel" && post.mediaUrls?.length === 1 ? [post.mediaUrls[0], post.mediaUrls[0]] : [post.imageUrl];

  const statusCls = post.status === "approved" ? "badge-approved" : post.status === "posted" ? "badge-posted" : post.status === "rejected" ? "badge-rejected" : "badge-pending";
  const statusLabel = post.status === "pending" ? "⏳ PENDING" : post.status === "approved" ? "✅ APPROVED" : post.status === "posted" ? "🚀 POSTED" : "❌ REJECTED";
  const typeLabel = post.mediaType === "reels" ? "🎬 REEL" : post.mediaType === "carousel" ? `🖼 ×${slides.length}` : "📷 POST";

  return (
    <div className="post-card rounded-2xl overflow-hidden group">
      {/* Media */}
      <div className="aspect-[4/5] relative bg-muted overflow-hidden">
        {post.mediaType === "reels" && post.videoUrl ? (
          <video src={post.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
        ) : slides[0] ? (
          <img
            src={slides[slide]}
            alt={post.caption}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Carousel nav */}
        {post.mediaType === "carousel" && slides.length > 1 && (
          <>
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1 z-10">
              {slides.map((_: any, i: number) => (
                <button key={i} onClick={() => setSlide(i)} className={`h-1 rounded-full transition-all ${i === slide ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
              ))}
            </div>
            {["left", "right"].map((dir) => (
              <button
                key={dir}
                onClick={() => setSlide((p) => dir === "left" ? (p > 0 ? p - 1 : slides.length - 1) : (p < slides.length - 1 ? p + 1 : 0))}
                className={`absolute ${dir === "left" ? "left-2" : "right-2"} top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary text-xs font-bold`}
              >
                {dir === "left" ? "‹" : "›"}
              </button>
            ))}
          </>
        )}

        <div className="absolute top-3 left-3 flex gap-1.5 z-10">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white border border-white/10">{typeLabel}</span>
        </div>
        <div className="absolute top-3 right-3 z-10">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm ${statusCls}`}>{statusLabel}</span>
        </div>

        <button
          onClick={onOpenPreview}
          className="absolute bottom-3 right-3 z-10 h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center border border-white/10 hover:bg-primary transition-colors"
          title="Open full preview"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-white/70" />
          <span className="text-[11px] text-white/80 font-medium">{format(new Date(post.scheduledFor), "h:mm a · MMM d")}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {editing ? (
          <>
            <Textarea value={editState.caption} onChange={(e) => editState.setCaption(e.target.value)} className="text-xs min-h-[100px] bg-muted border-border/60 resize-none focus:border-primary/50" placeholder="Caption…" />
            <Textarea value={editState.hashtags} onChange={(e) => editState.setHashtags(e.target.value)} className="text-xs min-h-[40px] bg-muted border-border/60 resize-none text-primary/80 font-mono" placeholder="#hashtags" />
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-foreground/85 line-clamp-4">{post.caption}</p>
            <p className="text-[10px] text-primary/60 font-mono line-clamp-1">{post.hashtags}</p>
          </>
        )}

        {/* Regenerate caption button */}
        {!editing && (post.status === "pending" || post.status === "approved") && (
          <button
            onClick={() => onRegenerateCaption()}
            disabled={isRegeneratingCaption}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors w-fit"
          >
            {isRegeneratingCaption
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RotateCcw className="h-3 w-3" />
            }
            {isRegeneratingCaption ? "Regenerating…" : "Regenerate caption"}
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 mt-auto">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={onCancel} className="flex-1 text-xs h-8 rounded-lg">Cancel</Button>
              <Button size="sm" onClick={onSave} disabled={isSaving} className="flex-1 text-xs h-8 rounded-lg ig-gradient border-0 text-white">
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Save
              </Button>
            </>
          ) : (
            <>
              {post.status === "pending" && (
                <>
                  <Button size="sm" onClick={onApprove} className="flex-1 h-8 text-xs rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500 hover:text-white transition-colors">
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" onClick={onReject} className="flex-1 h-8 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors">
                    <X className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </>
              )}
              {post.status === "approved" && (
                <>
                  <Button size="sm" onClick={onPublish} disabled={isPublishing} className="flex-[3] h-8 text-xs rounded-lg ig-gradient border-0 text-white shadow-md">
                    {isPublishing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                    Publish Now
                  </Button>
                  <Button size="sm" onClick={onReject} className="h-8 w-8 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white p-0">
                    <X className="h-3 w-3" />
                  </Button>
                </>
              )}
              {post.status === "posted" && (
                <div className="flex-1 h-8 text-xs rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Live on Instagram
                </div>
              )}
              {(post.status === "pending" || post.status === "approved") && (
                <Button size="sm" onClick={onEdit} variant="ghost" className="h-8 w-8 p-0 rounded-lg shrink-0">
                  <Edit3 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PostPreviewModal({ post, onClose, onEdit }: any) {
  const [slide, setSlide] = useState(0);
  const slides = post.mediaType === "carousel" && post.mediaUrls?.length >= 2 ? post.mediaUrls : [post.imageUrl];
  const canSlide = post.mediaType === "carousel" && slides.length > 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md p-3 sm:p-6 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-6xl max-h-[94vh] overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl grid lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative min-h-[48vh] lg:min-h-[82vh] bg-black flex items-center justify-center">
          {post.mediaType === "reels" && post.videoUrl ? (
            <video src={post.videoUrl} className="h-full max-h-[82vh] w-full object-contain" controls autoPlay loop playsInline />
          ) : (
            <img
              src={slides[slide]}
              alt={post.caption}
              className="h-full max-h-[82vh] w-full object-contain"
              referrerPolicy="no-referrer"
            />
          )}

          {canSlide && (
            <>
              <button
                onClick={() => setSlide((p) => (p > 0 ? p - 1 : slides.length - 1))}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 text-white flex items-center justify-center border border-white/10 hover:bg-primary"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setSlide((p) => (p < slides.length - 1 ? p + 1 : 0))}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 text-white flex items-center justify-center border border-white/10 hover:bg-primary"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5">
                {slides.map((_: string, i: number) => (
                  <button key={i} onClick={() => setSlide(i)} className={`h-1.5 rounded-full ${i === slide ? "w-7 bg-white" : "w-2 bg-white/40"}`} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="min-h-0 max-h-[94vh] overflow-y-auto p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="uppercase text-[10px]">{post.mediaType}</Badge>
                <Badge variant="outline" className="uppercase text-[10px]">{post.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Scheduled {format(new Date(post.scheduledFor), "MMM d, h:mm a")}
              </p>
            </div>
            <button onClick={onClose} className="h-9 w-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Caption</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{post.caption}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Hashtags</p>
            <p className="text-sm leading-7 text-primary/80 font-mono break-words">{post.hashtags}</p>
          </div>

          {post.imagePrompt && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Visual Prompt</p>
              <p className="text-xs leading-6 text-muted-foreground">{post.imagePrompt}</p>
            </div>
          )}

          <Button onClick={onEdit} className="w-full rounded-xl ig-gradient border-0 text-white">
            <Edit3 className="h-4 w-4 mr-2" /> Edit caption
          </Button>
        </div>
      </div>
    </div>
  );
}
