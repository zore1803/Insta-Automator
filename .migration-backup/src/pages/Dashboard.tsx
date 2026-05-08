import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTodaysPosts,
  useGetStats,
  useGeneratePost,
  useApprovePost,
  useRejectPost,
  usePublishPost,
  useUpdatePost,
  getGetTodaysPostsQueryKey,
  getGetStatsQueryKey,
  getListPostsQueryKey
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Plus, Check, X, Send, Clock, Image as ImageIcon, Loader2, Edit3, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useGetConfig, useUpdateConfig } from "@workspace/api-client-react";
import { Target } from "lucide-react";

export function Dashboard() {
  const { data: posts, isLoading: loadingPosts } = useGetTodaysPosts({
    query: { refetchInterval: 2000 } as any
  });
  const { data: stats, isLoading: loadingStats } = useGetStats({
    query: { refetchInterval: 10000 } as any
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const generatePost = useGeneratePost();
  const approvePost = useApprovePost();
  const rejectPost = useRejectPost();
  const publishPost = usePublishPost();
  const updatePost = useUpdatePost();

  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");

  const { data: config } = useGetConfig();
  const updateConfig = useUpdateConfig();
  const [nicheValue, setNicheValue] = useState("");
  const [generatingType, setGeneratingType] = useState<"image" | "reels" | "carousel" | null>(null);

  // Sync nicheValue when config loads
  React.useEffect(() => {
    if (config?.niche && !nicheValue) {
      setNicheValue(config.niche);
    }
  }, [config?.niche]);

  const handleNicheSave = () => {
    updateConfig.mutate({ data: { niche: nicheValue } } as any, {
      onSuccess: () => toast({ title: "Niche updated!", description: `The AI is now focused on: ${nicheValue}` })
    });
  };

  const handleGenerate = (type: any = "image") => {
    setGeneratingType(type);
    generatePost.mutate({ data: { type, imageSource: config?.imageSource } as any } as any, {
      onSuccess: () => {
        toast({ title: "Success!", description: `A fresh ${type} post has been generated and added to your queue.` });
        queryClient.invalidateQueries({ queryKey: getGetTodaysPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Failed to generate post", description: String(err), variant: "destructive" });
      },
      onSettled: () => {
        setGeneratingType(null);
      }
    });
  };

  const handleApprove = (id: number) => {
    approvePost.mutate({ id } as any, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodaysPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      }
    });
  };

  const handleReject = (id: number) => {
    rejectPost.mutate({ id } as any, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodaysPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      }
    });
  };

  const handlePublish = (id: number) => {
    publishPost.mutate({ id } as any, {
      onSuccess: () => {
        toast({ title: "Boom!", description: "Your post is now live on Instagram." });
        queryClient.invalidateQueries({ queryKey: getGetTodaysPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Failed to publish", description: String(err), variant: "destructive" });
      }
    });
  };

  const startEditing = (post: any) => {
    setEditingPostId(post.id);
    setEditCaption(post.caption);
    setEditHashtags(post.hashtags);
  };

  const saveEdit = (id: number) => {
    updatePost.mutate({ id, data: { caption: editCaption, hashtags: editHashtags } } as any, {
      onSuccess: () => {
        setEditingPostId(null);
        queryClient.invalidateQueries({ queryKey: getGetTodaysPostsQueryKey() });
        toast({ title: "Changes saved" });
      }
    });
  };

  return (
    <div className="space-y-10 pb-10">
      {/* Header Section */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4 flex-1 max-w-2xl">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gradient">Dashboard</h1>
            <p className="text-muted-foreground text-lg">Manage your automated content pipeline in real-time.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-2xl border border-white/5 shadow-inner flex-1">
              <div className="bg-primary/10 p-2 rounded-xl">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Current Focus Niche</label>
                <Textarea 
                  value={nicheValue}
                  onChange={(e) => setNicheValue(e.target.value)}
                  onBlur={handleNicheSave}
                  placeholder="Enter your niche details (be as descriptive as you want!)"
                  className="border-0 bg-transparent min-h-[40px] focus-visible:ring-0 px-1 font-medium text-foreground resize-none py-1 scrollbar-hide"
                />
              </div>
              {nicheValue !== config?.niche && (
                <Button size="sm" onClick={handleNicheSave} className="rounded-xl px-4 h-9">Save</Button>
              )}
            </div>

            <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-2xl border border-white/5 shadow-inner">
               <Button 
                variant={config?.imageSource === 'ai' ? 'default' : 'ghost'} 
                size="sm" 
                disabled={updateConfig.isPending}
                onClick={() => updateConfig.mutate({ data: { imageSource: 'ai' } } as any, { onSuccess: () => queryClient.invalidateQueries() })}
                className="rounded-xl h-9 px-4 gap-2"
              >
                {updateConfig.isPending && config?.imageSource !== 'ai' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-4 w-4" />} AI
              </Button>
               <Button 
                variant={config?.imageSource === 'search' ? 'default' : 'ghost'} 
                size="sm" 
                disabled={updateConfig.isPending}
                onClick={() => updateConfig.mutate({ data: { imageSource: 'search' } } as any, { onSuccess: () => queryClient.invalidateQueries() })}
                className="rounded-xl h-9 px-4 gap-2"
              >
                {updateConfig.isPending && config?.imageSource !== 'search' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-4 w-4" />} Real Search
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button 
            onClick={() => handleGenerate("image")} 
            disabled={generatePost.isPending} 
            size="lg"
            className="shrink-0 gap-2 shadow-xl hover:scale-105 transition-transform bg-gradient-to-r from-primary to-blue-600 border-0 rounded-2xl"
          >
            {generatePost.isPending && generatingType === "image" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
            Generate Post
          </Button>
          <Button 
            onClick={() => handleGenerate("reels")} 
            disabled={generatePost.isPending} 
            size="lg"
            className="shrink-0 gap-2 shadow-xl hover:scale-105 transition-transform bg-gradient-to-r from-fuchsia-600 to-orange-500 border-0 rounded-2xl"
          >
            {generatePost.isPending && generatingType === "reels" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Generate Reel
          </Button>
          <Button 
            onClick={() => handleGenerate("carousel")} 
            disabled={generatePost.isPending} 
            size="lg"
            className="shrink-0 gap-2 shadow-xl hover:scale-105 transition-transform bg-gradient-to-r from-amber-500 to-yellow-600 border-0 rounded-2xl"
          >
            {generatePost.isPending && generatingType === "carousel" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Generate Carousel
          </Button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {loadingStats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted/50 animate-pulse border border-white/5" />
          ))
        ) : stats ? (
          <>
            <StatsCard title="Total Published" value={stats.totalPosted} icon={<Check className="h-5 w-5" />} color="text-green-500" />
            <StatsCard title="Pending Approval" value={stats.totalPending} icon={<Clock className="h-5 w-5" />} color="text-amber-500" />
            <StatsCard title="Approved Queue" value={stats.totalApproved} icon={<Plus className="h-5 w-5" />} color="text-blue-500" />
            <StatsCard title="Month Progress" value={stats.postsThisMonth} icon={<ImageIcon className="h-5 w-5" />} color="text-fuchsia-500" />
          </>
        ) : null}
      </div>

      {/* Posts Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">Upcoming Pipeline</h2>
            {posts?.posts && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3">
                {posts.posts.length} Posts Waiting
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Live Sync Active
          </Badge>
        </div>

        {loadingPosts ? (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[450px] rounded-3xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {/* Generation Placeholder */}
            {generatePost.isPending && (
              <Card className="glass-card overflow-hidden border-primary/30 animate-pulse border-2 border-dashed flex items-center justify-center h-full min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 rounded-full bg-primary/10">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  </div>
                  <p className="font-semibold text-primary">Generating Magic...</p>
                  <p className="text-xs text-muted-foreground">Claude & DALL-E are crafting your post</p>
                </div>
              </Card>
            )}

            {!posts?.posts?.length && !generatePost.isPending ? (
              <div className="col-span-full py-20">
                <Card className="glass-card flex flex-col items-center justify-center p-12 text-center bg-muted/5 border-dashed border-2">
                  <div className="p-6 rounded-full bg-primary/5 mb-6">
                    <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Queue is empty</h3>
                  <p className="text-muted-foreground max-w-sm mb-8">Your automation hasn't created any posts for today yet. Ready to start?</p>
                  <Button size="lg" onClick={() => handleGenerate("image")} variant="outline" className="rounded-full px-10">Generate First Post</Button>
                </Card>
              </div>
            ) : (
              posts?.posts.map((post) => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  editing={editingPostId === post.id}
                  onEdit={() => startEditing(post)}
                  onCancel={() => setEditingPostId(null)}
                  onSave={() => saveEdit(post.id)}
                  onApprove={() => handleApprove(post.id)}
                  onReject={() => handleReject(post.id)}
                  onPublish={() => handlePublish(post.id)}
                  editState={{ 
                    caption: editCaption, 
                    setCaption: setEditCaption, 
                    hashtags: editHashtags, 
                    setHashtags: setEditHashtags 
                  }}
                  isSaving={updatePost.isPending}
                  isPublishing={publishPost.isPending}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Card className="glass-card relative overflow-hidden group">
      <div className={`absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-20 transition-opacity ${color}`}>
        {React.cloneElement(icon as React.ReactElement<any>, { className: "h-20 w-20" })}
      </div>
      <CardHeader className="pb-2">
        <CardDescription className="text-sm font-medium uppercase tracking-wider">{title}</CardDescription>
        <CardTitle className="text-4xl font-extrabold flex items-center gap-3 mt-1">
          {value}
        </CardTitle>
      </CardHeader>
      <div className={`h-1 w-full mt-4 bg-gradient-to-r from-transparent to-primary/20`} />
    </Card>
  );
}

function PostCard({ 
  post, editing, onEdit, onCancel, onSave, onApprove, onReject, onPublish, editState, isSaving, isPublishing 
}: any) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = post.mediaType === "carousel" && post.mediaUrls ? post.mediaUrls : [post.imageUrl];

  return (
    <Card className="glass-card overflow-hidden flex flex-col h-full group">
      <div className="aspect-square relative bg-muted/20 overflow-hidden">
        {post.mediaType === "reels" && post.videoUrl ? (
          <video 
            src={post.videoUrl} 
            className="object-cover w-full h-full"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : slides.length > 0 ? (
          <>
            <img 
              src={slides[currentSlide]} 
              alt={`${post.imagePrompt} - slide ${currentSlide + 1}`} 
              className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105" 
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop';
              }}
            />
            
            {post.mediaType === "carousel" && slides.length > 1 && (
              <>
                <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 z-30">
                  {slides.map((_: any, i: number) => (
                    <div 
                      key={i} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${i === currentSlide ? "w-4 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" : "w-1.5 bg-white/40"}`} 
                    />
                  ))}
                </div>
                
                <button 
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation(); 
                    setCurrentSlide(prev => (prev > 0 ? prev - 1 : slides.length - 1)); 
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center z-40 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:scale-110 active:scale-95"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                
                <button 
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation(); 
                    setCurrentSlide(prev => (prev < slides.length - 1 ? prev + 1 : 0)); 
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center z-40 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:scale-110 active:scale-95"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>

                <div className="absolute top-3 right-3 z-30">
                  <Badge className="bg-black/60 text-white border-white/20 backdrop-blur-md font-bold px-2 py-0.5">
                    {currentSlide + 1} / {slides.length}
                  </Badge>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full w-full">
            <Loader2 className="h-10 w-10 animate-spin text-primary/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute top-4 left-4 flex gap-2">
          <Badge className="bg-black/80 text-white border-white/20">
            {post.mediaType === "reels" ? "🎬 REEL" : post.mediaType === "carousel" ? `📷 CAROUSEL (${post.mediaUrls?.length || 0})` : "📷 POST"}
          </Badge>
          <Badge className={`
            px-3 py-1 rounded-full backdrop-blur-md shadow-lg border-white/20
            ${post.status === "approved" ? "bg-green-500/80 text-white" : 
              post.status === "posted" ? "bg-blue-500/80 text-white" : 
              post.status === "rejected" ? "bg-red-500/80 text-white" : "bg-black/60 text-white"}
          `}>
            {post.status.toUpperCase()}
          </Badge>
        </div>
      </div>
      
      <CardContent className="p-6 flex-1 flex flex-col space-y-4">
        <div className="flex items-center text-xs font-bold text-primary tracking-widest uppercase">
          <Clock className="mr-2 h-3.5 w-3.5" />
          {format(new Date(post.scheduledFor), "h:mm a")} • {format(new Date(post.scheduledFor), "MMM d")}
        </div>

        {editing ? (
          <div className="space-y-4 flex-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Caption</label>
              <Textarea 
                value={editState.caption} 
                onChange={(e) => editState.setCaption(e.target.value)}
                className="text-sm min-h-[120px] bg-background/50 border-white/5 focus:border-primary/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Hashtags</label>
              <Textarea 
                value={editState.hashtags} 
                onChange={(e) => editState.setHashtags(e.target.value)}
                className="text-sm min-h-[60px] bg-background/50 border-white/5 text-primary font-mono"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-4">
            <p className="text-sm leading-relaxed text-foreground/90 font-medium line-clamp-4 italic">
              "{post.caption}"
            </p>
            <div className="flex flex-wrap gap-1">
              {post.hashtags.split(" ").map((tag: string, i: number) => (
                <span key={i} className="text-[10px] font-bold text-primary/70">{tag}</span>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 pt-0 gap-3 mt-auto">
        {editing ? (
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancel</Button>
            <Button className="flex-1 shadow-lg bg-primary hover:bg-primary/90" onClick={onSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        ) : (
          <>
            {post.status === "pending" && (
              <div className="flex w-full gap-3">
                <Button variant="outline" className="flex-1 border-green-500/30 text-green-600 hover:bg-green-500 hover:text-white transition-all rounded-xl" onClick={onApprove}>
                  <Check className="h-4 w-4 mr-2" /> Approve
                </Button>
                <Button variant="outline" className="flex-1 border-red-500/30 text-red-600 hover:bg-red-500 hover:text-white transition-all rounded-xl" onClick={onReject}>
                  <X className="h-4 w-4 mr-2" /> Reject
                </Button>
              </div>
            )}
            
            {post.status === "approved" && (
              <div className="flex w-full gap-3">
                <Button className="flex-[4] h-12 shadow-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:scale-[1.02] transition-all border-0 rounded-xl" onClick={onPublish} disabled={isPublishing}>
                  {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Publish to Instagram
                </Button>
                <Button variant="outline" className="flex-1 h-12 border-red-500/30 text-red-600 hover:bg-red-500 hover:text-white transition-all rounded-xl" onClick={onReject}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {(post.status === "pending" || post.status === "approved") && (
              <Button variant="secondary" size="icon" className="shrink-0 rounded-xl" onClick={onEdit}>
                <Edit3 className="h-4 w-4" />
              </Button>
            )}
            
            {post.status === "posted" && (
              <Button variant="outline" disabled className="w-full rounded-xl gap-2 border-green-500/20 text-green-600 opacity-100 bg-green-50/50">
                <CheckCircle2 className="h-4 w-4" /> Posted successfully
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}

