// Display API — perfil e métricas por vídeo (coletadas pelo worker a cada 6h).

import { tiktokRequest } from "./http.js";
import type { TikTokUserInfo, TikTokVideo, VideoListPage } from "./types.js";

const USER_INFO_FIELDS = [
  "open_id",
  "union_id",
  "avatar_url",
  "display_name",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
].join(",");

const VIDEO_FIELDS = [
  "id",
  "title",
  "create_time",
  "cover_image_url",
  "share_url",
  "duration",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
].join(",");

interface RawUser {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

interface RawVideo {
  id: string;
  title?: string;
  create_time?: number;
  cover_image_url?: string;
  share_url?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

function mapVideo(v: RawVideo): TikTokVideo {
  return {
    id: v.id,
    title: v.title,
    createTime: v.create_time,
    coverImageUrl: v.cover_image_url,
    shareUrl: v.share_url,
    duration: v.duration,
    viewCount: v.view_count ?? 0,
    likeCount: v.like_count ?? 0,
    commentCount: v.comment_count ?? 0,
    shareCount: v.share_count ?? 0,
  };
}

/** /v2/user/info/ → followers, following, likes, video_count */
export async function getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const data = await tiktokRequest<{ user: RawUser }>(
    `/v2/user/info/?fields=${USER_INFO_FIELDS}`,
    { method: "GET", accessToken },
  );
  const u = data.user;
  return {
    openId: u.open_id,
    unionId: u.union_id,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    followerCount: u.follower_count ?? 0,
    followingCount: u.following_count ?? 0,
    likesCount: u.likes_count ?? 0,
    videoCount: u.video_count ?? 0,
  };
}

/** /v2/video/list/ — paginado por cursor */
export async function listVideos(
  accessToken: string,
  opts: { cursor?: number; maxCount?: number } = {},
): Promise<VideoListPage> {
  const data = await tiktokRequest<{ videos?: RawVideo[]; cursor?: number; has_more?: boolean }>(
    `/v2/video/list/?fields=${VIDEO_FIELDS}`,
    {
      accessToken,
      json: {
        max_count: Math.min(opts.maxCount ?? 20, 20),
        ...(opts.cursor !== undefined && { cursor: opts.cursor }),
      },
    },
  );
  return {
    videos: (data.videos ?? []).map(mapVideo),
    cursor: data.cursor ?? 0,
    hasMore: data.has_more ?? false,
  };
}

/** /v2/video/query/ — métricas de vídeos específicos (máx. 20 ids) */
export async function queryVideos(
  accessToken: string,
  videoIds: string[],
): Promise<TikTokVideo[]> {
  if (videoIds.length === 0) return [];
  const data = await tiktokRequest<{ videos?: RawVideo[] }>(
    `/v2/video/query/?fields=${VIDEO_FIELDS}`,
    { accessToken, json: { filters: { video_ids: videoIds.slice(0, 20) } } },
  );
  return (data.videos ?? []).map(mapVideo);
}
