export type VaultysCertificate =
  | {
      version: number;
      protocol: string;
      service: string;
      state: number;
      timestamp: number;
      error: string | null;
      metadata: Record<string, unknown> | null;
      pk1: string | null;
      pk2: string | null;
      nonce: string | null;
      sign1: string | null;
      sign2: string | null;
    }
  | {
      dataSize: number;
      parseError: true;
    };
