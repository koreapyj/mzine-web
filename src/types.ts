// API DTOs — derived from the desktop app (Moazine.Domain.Dtos) and a live content_info response.
// Only fields used by the viewer are required; everything else is optional.

/** Common envelope: `{ data: { icon, code, msg, result } }` (content_info, secure-url). */
export interface ApiEnvelope<T> {
  data?: { icon?: string; code?: string; msg?: string; result?: T };
  /** Error responses (e.g. 401) put these at top level instead. */
  icon?: string;
  code?: string;
  msg?: string;
}

/** One page image entry. NOTE: the API calls pages "articles". */
export interface Article {
  article_id: number;
  /** Unsigned URL (not directly fetchable — 401). Kept for reference only. */
  content: string;
  /** "W*H", e.g. "1640*2160" */
  size: string;
  /** Display page number. */
  page_no: number;
  /** "Real" page number used for the secure-url `pages` param. 0 = app help image → exclude. */
  issue_page_no: number;
  thumbnail: string;
  thumbnail_size?: string;
}

export interface Toc {
  article_id: number;
  subject: string;
  /** First page (issue_page_no) of this article. */
  page: number;
  last_page?: number;
  skip_pages?: string[];
}

export interface MagazineInfo {
  magazine_id: number;
  magazine_name?: string;
  issue_id: number;
  zinio_issue_id?: number;
  title: string;
  subject?: string;
  locale?: string;
  /** "Y" | "N". App maps this to `IsReadingDirectionLTR`; assume "Y" = normal left-to-right (unverified). */
  is_rtl_flip?: string;
  is_compressed?: string;
  is_print?: string;
  recent_view_page?: number;
  image_type?: string;
  cdn_base_url: string;
  cdn_zip_base_url?: string;
  articles: Article[];
  toc?: Toc[];
  zinio_auth_info?: unknown;
}

/** Arguments captured from the site's global `windowViewer(...)` call. */
export interface LaunchParams {
  token: string;
  issueId: number;
  /** windowViewer's `magazineId` arg, which is actually an article_id. */
  articleId?: number;
  /** -1 or undefined = not specified. */
  page?: number;
  /** -1 = default profile. */
  profileId: number;
}

/** A normalized page in reading order. */
export interface PageItem {
  /** 0-based index in reading order. */
  index: number;
  /** issue_page_no — used for secure-url requests. */
  realPage: number;
  /** page_no for display. */
  label: number;
  articleId: number;
  width: number;
  height: number;
}

/** A spread = 1 or 2 page indexes, in visual left→right order. */
export type Spread = number[];

export type SignType = 'contents' | 'thumbnail';
