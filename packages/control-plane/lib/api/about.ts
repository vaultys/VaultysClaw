import { apiClient, unwrap } from "./ts-rest/client";

export class AboutApi {
  async getDoc(name: string) {
    return unwrap(await apiClient.about.get({ query: { doc: name } }));
  }
}

export const aboutApi = new AboutApi();
