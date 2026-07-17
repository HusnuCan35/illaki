import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// User identity store
export const useIdentityStore = create(
  persist(
    (set) => ({
      identity: null, // { id, username, avatar, createdAt }
      setIdentity: (identity) => set({ identity }),
      clearIdentity: () => set({ identity: null }),
    }),
    { name: 'illaki-identity' }
  )
);

// Spaces (rooms) store
export const useSpaceStore = create((set, get) => ({
  spaces: [],           // [{ id, name, code, members, unread }]
  activeSpaceId: null,

  addSpace: (space) => set((s) => ({ spaces: [...s.spaces, space] })),
  removeSpace: (id) => set((s) => ({ spaces: s.spaces.filter(sp => sp.id !== id) })),
  setActiveSpace: (id) => set({ activeSpaceId: id }),
  
  updateSpace: (id, updates) => set((s) => ({
    spaces: s.spaces.map(sp => sp.id === id ? { ...sp, ...updates } : sp),
  })),

  incrementUnread: (id) => set((s) => ({
    spaces: s.spaces.map(sp =>
      sp.id === id ? { ...sp, unread: (sp.unread || 0) + 1 } : sp,
    ),
  })),

  clearUnread: (id) => set((s) => ({
    spaces: s.spaces.map(sp => sp.id === id ? { ...sp, unread: 0 } : sp),
  })),

  getActiveSpace: () => {
    const { spaces, activeSpaceId } = get();
    return spaces.find(sp => sp.id === activeSpaceId) || null;
  },
}));

// Messages store (per space)
export const useMessageStore = create((set, get) => ({
  messages: {}, // { [spaceId]: [{ id, content, sender, timestamp, type }] }

  addMessage: (spaceId, message) => set((s) => ({
    messages: {
      ...s.messages,
      [spaceId]: [...(s.messages[spaceId] || []), message],
    },
  })),

  getMessages: (spaceId) => {
    const { messages } = get();
    return messages[spaceId] || [];
  },

  clearMessages: (spaceId) => set((s) => {
    const next = { ...s.messages };
    delete next[spaceId];
    return { messages: next };
  }),
}));

// Peers / Connection status store
export const usePeerStore = create((set) => ({
  peerId: null,          // our own peer ID
  peers: {},             // { [peerId]: { username, status, connection } }
  connectionStatus: 'disconnected', // disconnected | connecting | connected

  setPeerId: (id) => set({ peerId: id }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addPeer: (id, data) => set((s) => ({
    peers: { ...s.peers, [id]: data },
  })),
  removePeer: (id) => set((s) => {
    const next = { ...s.peers };
    delete next[id];
    return { peers: next };
  }),
  updatePeer: (id, updates) => set((s) => ({
    peers: { ...s.peers, [id]: { ...s.peers[id], ...updates } },
  })),
}));

// UI / App state store
export const useUIStore = create((set) => ({
  view: 'landing',   // landing | home | chat | settings
  sidebarOpen: true,
  settingsOpen: false,
  joinModalOpen: false,
  createModalOpen: false,
  toasts: [],

  setView: (view) => set({ view }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setJoinModalOpen: (v) => set({ joinModalOpen: v }),
  setCreateModalOpen: (v) => set({ createModalOpen: v }),

  addToast: (toast) => set((s) => ({
    toasts: [...s.toasts, { id: Date.now(), ...toast }],
  })),
  removeToast: (id) => set((s) => ({
    toasts: s.toasts.filter(t => t.id !== id),
  })),
}));
