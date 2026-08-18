export type StoredObject = {
  key: string;
  sha256: string;
  bytes: number;
};

export const OBJECT_STORE = 'OBJECT_STORE';

export interface ObjectStore {
  put(sha256: string, body: NodeJS.ReadableStream | Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
}
