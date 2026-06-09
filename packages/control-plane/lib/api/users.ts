import { UserSummary } from "@/lib/api/utils/api-types";
import { BaseApi } from "./base";

export interface User extends UserSummary {
  isAdmin: boolean;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UserGrant {
  id: string;
  userDid: string;
  capability: string;
  realmId?: string;
  grantedBy: string;
  createdAt: string;
  expiresAt?: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  role?: User["role"];
  invitedBy: string;
  createdAt: string;
  expiresAt?: string;
  acceptedAt?: string;
}

export interface UnclaimedUser {
  id: string;
  name?: string;
  email?: string;
  qrCodeUrl?: string;
  createdAt: string;
}

export class UsersApi extends BaseApi {
  list(params?: { page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ users: User[]; total: number }>(
      `/api/users${qs ? `?${qs}` : ""}`
    );
  }

  getMe() {
    return this.get<User>("/api/users/me");
  }

  updateMe(data: Partial<Pick<User, "name" | "avatarUrl" | "metadata">>) {
    return this.patch<User>("/api/users/me", data);
  }

  search(q: string) {
    return this.get<{ users: User[] }>(
      `/api/users/search?q=${encodeURIComponent(q)}`
    );
  }

  getOne(did: string) {
    return this.get<User>(`/api/users/${did}`);
  }

  update(
    did: string,
    data: Partial<Pick<User, "name" | "avatarUrl" | "metadata">>
  ) {
    return this.patch<User>(`/api/users/${did}`, data);
  }

  remove(did: string) {
    return this.delete<void>(`/api/users/${did}`);
  }

  setAdmin(did: string, isAdmin: boolean) {
    return this.patch<User>(`/api/users/${did}/admin`, { isAdmin });
  }

  // Grants
  listGrants(did: string) {
    return this.get<{ grants: UserGrant[] }>(`/api/users/${did}/grants`);
  }

  createGrant(
    did: string,
    data: Pick<UserGrant, "capability"> &
      Partial<Pick<UserGrant, "realmId" | "expiresAt">>
  ) {
    return this.post<UserGrant>(`/api/users/${did}/grants`, data);
  }

  revokeGrant(did: string, grantId: string) {
    return this.delete<void>(`/api/users/${did}/grants/${grantId}`);
  }

  // Invitations
  listInvitations() {
    return this.get<{ invitations: UserInvitation[] }>("/api/users/invite");
  }

  inviteByEmail(
    data: Pick<UserInvitation, "email"> & Partial<Pick<UserInvitation, "role">>
  ) {
    return this.post<UserInvitation>("/api/users/invite/email", data);
  }

  registerFromInvite(data: { token: string; name?: string }) {
    return this.post<User>("/api/users/invite/from-email", data);
  }

  // Unclaimed users
  getUnclaimed(id: string) {
    return this.get<UnclaimedUser>(`/api/users/unclaimed/${id}`);
  }

  updateUnclaimed(
    id: string,
    data: Partial<Pick<UnclaimedUser, "name" | "email">>
  ) {
    return this.patch<UnclaimedUser>(`/api/users/unclaimed/${id}`, data);
  }

  removeUnclaimed(id: string) {
    return this.delete<void>(`/api/users/unclaimed/${id}`);
  }

  sendQr(id: string) {
    return this.post<void>(`/api/users/unclaimed/${id}/send-qr`);
  }
}

export const usersApi = new UsersApi();
