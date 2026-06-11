// Tipos (camelCase) das respostas do TikTok — o mapeamento
// snake_case → camelCase acontece nos módulos oauth/display/publish.

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  /** segundos até expirar (access: 24h) */
  expiresIn: number;
  /** segundos até expirar (refresh: 365d) */
  refreshExpiresIn: number;
  openId: string;
  scope: string;
  tokenType: string;
}

export interface TikTokUserInfo {
  openId: string;
  unionId?: string;
  displayName?: string;
  avatarUrl?: string;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

export interface TikTokVideo {
  id: string;
  title?: string;
  createTime?: number;
  coverImageUrl?: string;
  shareUrl?: string;
  duration?: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

export interface VideoListPage {
  videos: TikTokVideo[];
  cursor: number;
  hasMore: boolean;
}

export type PublishStatusName =
  | "PROCESSING_UPLOAD"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export interface PublishStatus {
  status: PublishStatusName;
  failReason?: string;
  /** ids públicos do post quando PUBLISH_COMPLETE (direct post) */
  publiclyAvailablePostId?: Array<string | number>;
  uploadedBytes?: number;
}

export interface CreatorInfo {
  creatorUsername?: string;
  creatorNickname?: string;
  creatorAvatarUrl?: string;
  /** privacy levels permitidos para ESTA conta (fonte da verdade p/ UI) */
  privacyLevelOptions: string[];
  commentDisabled?: boolean;
  duetDisabled?: boolean;
  stitchDisabled?: boolean;
  maxVideoPostDurationSec?: number;
}

export interface InitUploadResult {
  publishId: string;
  uploadUrl: string;
}
