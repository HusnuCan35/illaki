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
export const useSpaceStore = create(
  persist(
    (set, get) => ({
      spaces: [],           // [{ id, name, code, members, unread }]
      activeSpaceId: null,
      channels: {},         // { [spaceId]: [{ id, name, type }] }
      activeChannelId: 'general',

      addSpace: (space) => set((s) => {
        // Prevent duplicate spaces
        if (s.spaces.some(sp => sp.id === space.id)) return s;
        return { spaces: [...s.spaces, space] };
      }),
      setSpaces: (spaces) => set((s) => {
        const spaceExists = spaces.some(sp => sp.id === s.activeSpaceId);
        return {
          spaces,
          activeSpaceId: spaceExists ? s.activeSpaceId : (spaces[0]?.id || null),
        };
      }),
      removeSpace: (id) => set((s) => ({ spaces: s.spaces.filter(sp => sp.id !== id) })),
      setActiveSpace: (id) => set({ activeSpaceId: id, activeChannelId: 'general' }),
      setActiveChannel: (id) => set({ activeChannelId: id }),
      setChannels: (spaceId, channels) => set((s) => ({
        channels: { ...s.channels, [spaceId]: channels }
      })),
      
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
    }),
    { name: 'illaki-spaces' }
  )
);

// Messages store (per space/channel)
export const useMessageStore = create((set, get) => ({
  messages: {}, // { [spaceId_channelId]: [{ id, content, sender, timestamp, type }] }

  addMessage: (spaceId, channelId, message) => set((s) => {
    const key = `${spaceId}_${channelId || 'general'}`;
    return {
      messages: {
        ...s.messages,
        [key]: [...(s.messages[key] || []), message],
      },
    };
  }),

  getMessages: (spaceId, channelId) => {
    const { messages } = get();
    const key = `${spaceId}_${channelId || 'general'}`;
    return messages[key] || [];
  },

  clearMessages: (spaceId, channelId) => set((s) => {
    const key = `${spaceId}_${channelId || 'general'}`;
    const next = { ...s.messages };
    delete next[key];
    return { messages: next };
  }),
}));

// Peers / Connection status store
export const usePeerStore = create(
  persist(
    (set) => ({
      peerId: null,          // our own peer ID
      voiceChannelId: null,  // our own voice channel
      peers: {},             // { [peerId]: { username, status, connection, voiceChannelId } }
      connectionStatus: 'disconnected', // disconnected | connecting | connected

      setPeerId: (id) => set({ peerId: id }),
      setVoiceChannelId: (id) => set({ voiceChannelId: id }),
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
    }),
    { 
      name: 'illaki-peer',
      // Sadece peerId'yi kalıcı yap, diğer P2P state'leri sekmeler arası korunmasın
      partialize: (state) => ({ peerId: state.peerId })
    }
  )
);


// UI / App state store
export const useUIStore = create((set) => ({
  view: 'landing',   // landing | home | chat | settings
  sidebarOpen: window.innerWidth > 768,
  settingsOpen: false,
  joinModalOpen: false,
  createModalOpen: false,
  toasts: [],
  musicVolume: 50, // 0-100

  setView: (view) => set({ view }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setJoinModalOpen: (v) => set({ joinModalOpen: v }),
  setCreateModalOpen: (v) => set({ createModalOpen: v }),
  setMusicVolume: (v) => set({ musicVolume: v }),

  addToast: (toast) => set((s) => ({
    toasts: [...s.toasts, { id: Date.now(), ...toast }],
  })),
  removeToast: (id) => set((s) => ({
    toasts: s.toasts.filter(t => t.id !== id),
  })),
}));
