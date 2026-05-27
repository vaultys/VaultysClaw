/**
 * X (Twitter) API v2 client wrapper
 *
 * Handles OAuth 2.0 Bearer Token authentication and tweet posting.
 * Uses native fetch API (available in Node 18+).
 */

export interface XPostResponse {
  data: {
    id: string;
    text: string;
  };
}

export interface XErrorResponse {
  errors: Array<{
    value?: string;
    message: string;
    type?: string;
  }>;
  title?: string;
  detail?: string;
  type?: string;
}

export class XClient {
  private bearerToken: string;
  private apiBaseUrl = "https://api.twitter.com/2";

  constructor(bearerToken: string) {
    if (!bearerToken || bearerToken.trim().length === 0) {
      throw new Error("X Bearer Token is required");
    }
    this.bearerToken = bearerToken.trim();
  }

  /**
   * Post a tweet to X.
   * Text must be <= 280 characters.
   */
  async postTweet(text: string): Promise<{ id: string; text: string; url: string }> {
    if (!text || text.trim().length === 0) {
      throw new Error("Tweet text is required");
    }

    const trimmed = text.trim();
    if (trimmed.length > 280) {
      throw new Error(`Tweet text exceeds 280 characters (${trimmed.length})`);
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/tweets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmed,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as XErrorResponse;
        const errorMsg = errorData.errors?.[0]?.message || errorData.detail || response.statusText;
        throw new Error(
          `X API error (${response.status}): ${errorMsg}`
        );
      }

      const data = (await response.json()) as XPostResponse;

      return {
        id: data.data.id,
        text: data.data.text,
        url: `https://x.com/i/web/status/${data.data.id}`,
      };
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(`Failed to post tweet: ${String(err)}`);
    }
  }

  /**
   * Post a tweet with media (image/video).
   * Requires media_ids array from media upload endpoints.
   * (Not fully implemented in this MVP version)
   */
  async postTweetWithMedia(
    text: string,
    mediaIds: string[],
  ): Promise<{ id: string; text: string; url: string }> {
    if (mediaIds.length === 0) {
      return this.postTweet(text);
    }

    // For MVP, just post without media
    console.warn("Media posting not fully supported in MVP version");
    return this.postTweet(text);
  }

  /**
   * Validate that the bearer token has access to the API.
   */
  async validateToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/tweets/search/recent?max_results=10`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
