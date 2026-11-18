import type { ApiEnvelope, LaunchParams, MagazineInfo, SignType } from './types';

export const API_BASE = 'https://api-v2.moazine.com';

export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function headers(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { 'X-Api-Token': token, 'X-Access-System': 'B2C' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function parse<T>(res: Response): Promise<T> {
  let body: ApiEnvelope<T> | undefined;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = undefined;
  }
  const code = body?.data?.code ?? body?.code;
  const msg = body?.data?.msg ?? body?.msg;
  if (!res.ok || code !== 'success' || body?.data?.result === undefined) {
    throw new ApiError(msg || `요청 실패 (HTTP ${res.status})`, code, res.status);
  }
  return body.data.result;
}

export async function fetchContentInfo(p: LaunchParams): Promise<MagazineInfo> {
  const q = new URLSearchParams({
    view_type: 'issue',
    issue_id: String(p.issueId),
    device_type: 'pc',
    profile_id: String(p.profileId),
  });
  const res = await fetch(`${API_BASE}/api/content_info?${q}`, { headers: headers(p.token) });
  return parse<MagazineInfo>(res);
}

export async function requestSignedUrls(
  info: MagazineInfo,
  token: string,
  type: SignType,
  realPages: number[],
): Promise<string[]> {
  const res = await fetch(info.cdn_base_url, {
    method: 'POST',
    headers: headers(token, true),
    body: JSON.stringify({ issue_id: info.issue_id, type, device_type: 'pc', pages: realPages }),
  });
  const urls = await parse<string[]>(res);
  if (!Array.isArray(urls) || urls.length !== realPages.length) {
    throw new ApiError('서명된 URL 응답이 올바르지 않습니다.', 'bad_response', res.status);
  }
  return urls;
}
