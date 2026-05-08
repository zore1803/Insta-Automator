import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPosts,
  useApprovePost,
  useRejectPost,
  usePublishPost,
  useRetryPost,
  getListPostsQueryKey,
  getGetStatsQueryKey,
  ListPostsStatus
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Check, X, Send, Image as ImageIcon, Loader2, Film, Layout, RefreshCw, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STATUS_OPTIONS = [
  { value: "all", label: "All Posts" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "posted", label: "Posted" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
];

const STATUS_STYLE: Record<string, string> = {
  pending: "badge-pending",
  approved: "badge-approved",
  posted: "badge-posted",
  rejected: "badge-rejected",
  failed: "bg-red-950/80 text-red-400 border-red-800",
};

export function PostHistory() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data, isLoading } = useListPosts(
    statusFilter !== "all" ? { status: statusFilter as ListPostsStatus } : undefined,
    { query: { refetchInterval: 5000 } } as any
  );
  const posts = data?.posts || [];
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approvePost = useApprovePost();
  const rejectPost = useRejectPost();
  const publishPost = usePublishPost();
  const retryPost = useRetryPost();

  const invalidate = (msg: string) => {
    toast({ title: msg });
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-up pb-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Post <span className="ig-text">History</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{data?.total ?? "—"} total posts generated</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-muted border-border text-sm rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
              <ImageIcon className="h-7 w-7 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">No posts found for this filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {posts.map((post) => (
              <div key={post.id} className={`card-glass rounded-2xl overflow-hidden group flex flex-col ${post.status === "failed" ? "ring-1 ring-red-800/50" : ""}`}>
                {/* Thumbnail */}
                <div className="aspect-square relative bg-muted overflow-hidden">
                  {post.mediaType === "reels" && post.videoUrl ? (
                    <video src={post.videoUrl} className="w-full h-full object-cover" muted loop playsInline />
                  ) : post.imageUrl ? (
                    <img
                      src={post.imageUrl}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                      onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

                  {/* Type icon */}
                  <div className="absolute top-2 left-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white">
                      {post.mediaType === "reels" ? "🎬" : post.mediaType === "carousel" ? "🖼" : "📷"}
                      {" "}{post.mediaType?.toUpperCase()}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[post.status] || ""}`}>
                      {post.status.toUpperCase()}
                    </span>
                    {post.status === "failed" && post.publishError && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="h-5 w-5 rounded-full bg-red-950/80 border border-red-800 flex items-center justify-center cursor-help">
                            <AlertCircle className="h-3 w-3 text-red-400" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[220px] text-xs bg-card border-border text-foreground">
                          <p className="font-semibold mb-1 text-red-400">Publish failed</p>
                          <p>{post.publishError}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* Quick actions overlay */}
                  <div className="absolute inset-0 flex items-end justify-center pb-3 gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {post.status === "pending" && (
                      <>
                        <button
                          onClick={() => approvePost.mutate({ id: post.id } as any, { onSuccess: () => invalidate("Approved!") })}
                          className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => rejectPost.mutate({ id: post.id } as any, { onSuccess: () => invalidate("Rejected") })}
                          className="h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {post.status === "approved" && (
                      <button
                        onClick={() => publishPost.mutate({ id: post.id } as any, {
                          onSuccess: () => invalidate("Posted to Instagram!"),
                          onError: (e: any) => toast({ title: "Failed", description: String(e?.message), variant: "destructive" }),
                        })}
                        className="h-8 px-4 rounded-full ig-gradient text-white text-xs font-bold flex items-center gap-1 hover:scale-105 transition-transform shadow-lg"
                      >
                        <Send className="h-3 w-3" /> Post
                      </button>
                    )}
                    {post.status === "failed" && (
                      <button
                        onClick={() => retryPost.mutate({ id: post.id } as any, {
                          onSuccess: () => invalidate("Retried — post published!"),
                          onError: (e: any) => {
                            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
                            toast({ title: "Retry failed", description: String(e?.message), variant: "destructive" });
                          },
                        })}
                        disabled={retryPost.isPending}
                        className="h-8 px-4 rounded-full bg-red-800 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {retryPost.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Retry
                      </button>
                    )}
                  </div>
                </div>

                {/* Caption */}
                <div className="p-3 flex-1">
                  <p className="text-[11px] text-foreground/80 line-clamp-2 leading-relaxed">{post.caption}</p>
                  {post.status === "failed" && post.publishError && (
                    <p className="text-[10px] text-red-400 mt-1 line-clamp-1" title={post.publishError}>
                      ⚠ {post.publishError}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {format(new Date(post.createdAt), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
