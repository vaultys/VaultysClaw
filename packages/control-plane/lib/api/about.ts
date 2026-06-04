import { BaseApi } from "./base";

export class AboutApi extends BaseApi {
  getDoc(name: string) {
    return this.get<{ content: string }>(
      `/api/about?doc=${encodeURIComponent(name)}`
    );
  }
}

export const aboutApi = new AboutApi();
