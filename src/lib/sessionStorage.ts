type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** O renderizador web do Expo não possui window nem armazenamento de sessão. */
export function sessionStorage(storage: StorageAdapter, serverRender: boolean): StorageAdapter {
  if (!serverRender) return storage;
  return {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  };
}
