import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPosts,
  useApprovePost,
  useRejectPost,
  usePublishPost,
  getListPostsQueryKey,
  getGetStatsQueryKey
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Check, X, Send, Image as ImageIcon, Loader2, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ListPostsStatus } from "@workspace/api-client-react";

export function PostHistory() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data, isLoading } = useListPosts(
    statusFilter !== "all" ? { status: statusFilter as ListPostsStatus } : undefined
  );
  const posts = data?.posts || [];
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approvePost = useApprovePost();
  const rejectPost = useRejectPost();
  const publishPost = usePublishPost();

  const handleApprove = (id: number) => {
    approvePost.mutate({ id }, {
      onSuccess: () => invalidateAndToast("Post approved")
    });
  };

  const handleReject = (id: number) => {
    rejectPost.mutate({ id }, {
      onSuccess: () => invalidateAndToast("Post rejected")
    });
  };

  const handlePublish = (id: number) => {
    publishPost.mutate({ id }, {
      onSuccess: () => invalidateAndToast("Post published!"),
      onError: (err) => toast({ title: "Publish failed", description: String(err), variant: "destructive" })
    });
  };

  const invalidateAndToast = (message: string) => {
    toast({ title: message });
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Post History</h1>
        <p className="text-muted-foreground mt-1">Review all generated content and their statuses.</p>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search captions..." className="pl-9 bg-background" disabled />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[100px]">Image</TableHead>
              <TableHead>Content</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[180px]">Created At</TableHead>
              <TableHead className="w-[180px]">Scheduled For</TableHead>
              <TableHead className="w-[180px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No posts found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              posts.map((post) => (
                <TableRow key={post.id} className="group">
                  <TableCell>
                    <div className="h-16 w-16 rounded-md overflow-hidden bg-muted flex items-center justify-center border">
                      {post.imageUrl ? (
                        <img src={post.imageUrl} alt="post preview" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm line-clamp-1">{post.caption}</p>
                    <p className="text-xs text-primary font-mono mt-1 line-clamp-1">{post.hashtags}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      post.status === "approved" ? "default" :
                      post.status === "posted" ? "secondary" :
                      post.status === "rejected" ? "destructive" : "outline"
                    }>
                      {post.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(post.createdAt), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(post.scheduledFor), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {post.status === "pending" && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleApprove(post.id)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleReject(post.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {post.status === "approved" && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10" onClick={() => handlePublish(post.id)}>
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleReject(post.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
