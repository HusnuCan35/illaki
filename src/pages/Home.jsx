import { useEffect, useState } from 'react';
import { ServerSidebar } from '../components/ServerSidebar';
import { ChannelSidebar } from '../components/ChannelSidebar';
import { ChatArea } from '../components/ChatArea';
import { MembersPanel } from '../components/MembersPanel';
import { MusicBotPanel } from '../components/MusicBotPanel';
import { VoiceChannel } from '../components/VoiceChannel';
import { StreamStageModal } from '../components/StreamStageModal';
import { BanScreenModal } from '../components/BanScreenModal';
import { CreateSpaceModal, JoinSpaceModal, SpaceSettingsModal } from './SpaceModals';
import { DiscoverServers } from '../components/DiscoverServers';
import { FriendsPanel } from '../components/FriendsPanel';
import { SettingsModal } from './Settings';
import { usePeer } from '../hooks/usePeer';
import { useVoice } from '../hooks/useVoice';
import { useScreenShare } from '../hooks/useScreenShare';
import { useUIStore, usePeerStore, useSpaceStore, useIdentityStore } from '../stores';
import { subscribeToUserBanStatus, subscribeToMembers, updateMemberOnlineStatus, updateMemberVoiceStatus, syncMemberProfile } from '../lib/firestore';
import styles from './Home.module.css';

export function Home() {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState(window.innerWidth > 900 ? 'members' : null); // 'members' | 'music' | null
  const [spaceSettingsOpen, setSpaceSettingsOpen] = useState(false);
  const [streamStageOpen, setStreamStageOpen] = useState(false);
  const [bannedInfo, setBannedInfo] = useState(null);

  const { settingsOpen, setSettingsOpen, sidebarOpen, toggleSidebar, addToast } = useUIStore();
  const { identity } = useIdentityStore();
  const { activeSpaceId, spaces, setActiveSpace, removeSpace } = useSpaceStore();

  const { initPeer, connectToPeer, sendMessage, getPeer, kickPeer, kickFromVoice, broadcastSpaceUpdate, broadcastSpaceDelete, broadcastVoiceStatus } = usePeer();
  const voice = useVoice(getPeer, broadcastVoiceStatus);
  const screenShare = useScreenShare(getPeer);
  const { peers } = usePeerStore();

  const activeSpace = spaces.find(s => s.id === activeSpaceId);

  // Home sayfasındayken body scroll'u kilitle (Landing'de açık olsun)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    initPeer().catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-connect to space P2P network when activeSpaceId changes
  useEffect(() => {
    if (activeSpaceId) {
      const space = useSpaceStore.getState().spaces.find(s => s.id === activeSpaceId);
      if (space && space.code) {
        connectToPeer(space.code, activeSpaceId).catch(() => {});
      }
    }
  }, [activeSpaceId, connectToPeer]);

  // Heartbeat & Online status tracking for activeSpace
  useEffect(() => {
    if (!activeSpaceId || !identity?.uid) return;

    updateMemberOnlineStatus(activeSpaceId, identity.uid, true);

    // Profil bilgilerini senkronize et ve stale ses kanalı kaydını temizle
    syncMemberProfile(activeSpaceId, identity.uid, {
      username: identity.username,
      avatarColor: identity.avatarColor,
    });
    if (!voice.isInVoice) {
      updateMemberVoiceStatus(activeSpaceId, identity.uid, null);
      const { voiceChannelId, setVoiceChannelId } = usePeerStore.getState();
      if (voiceChannelId) {
        setVoiceChannelId(null);
        broadcastVoiceStatus({ channelId: null, isMuted: false, isDeafened: false });
      }
    }

    const interval = setInterval(() => {
      updateMemberOnlineStatus(activeSpaceId, identity.uid, true);
    }, 30000);

    const handleUnload = () => {
      updateMemberOnlineStatus(activeSpaceId, identity.uid, false);
      if (!voice.isInVoice) {
        updateMemberVoiceStatus(activeSpaceId, identity.uid, null);
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      updateMemberOnlineStatus(activeSpaceId, identity.uid, false).catch(() => {});
      if (!voice.isInVoice) {
        updateMemberVoiceStatus(activeSpaceId, identity.uid, null).catch(() => {});
      }
    };
  }, [activeSpaceId, identity?.uid, identity?.username, identity?.avatarColor, voice.isInVoice, broadcastVoiceStatus]);

  // Real-time Ban & Membership check for current user in activeSpace
  useEffect(() => {
    if (!activeSpaceId || !identity?.uid) {
      setBannedInfo(null);
      return;
    }

    // 1. Dinle: Ban durumu
    const unsubBan = subscribeToUserBanStatus(activeSpaceId, identity.uid, (banData) => {
      if (banData) {
        setBannedInfo(banData);
        voice.leaveVoice();
        screenShare.stopScreenShare();
      } else {
        setBannedInfo(null);
      }
    });

    // 2. Dinle: Üyelik silinme (Kick) durumu
    const unsubMembers = subscribeToMembers(activeSpaceId, (members) => {
      const isMember = members.some(m => m.uid === identity.uid);
      const isHost = activeSpace?.hostUid === identity.uid;
      
      // Eğer üye listede yoksa ve host değilse kick yemiştir
      if (!isMember && !isHost && members.length > 0) {
        addToast({ type: 'warning', message: `${activeSpace?.name || 'Sunucu'} sunucusundan atıldınız.` });
        voice.leaveVoice();
        screenShare.stopScreenShare();
        removeSpace(activeSpaceId);
        setActiveSpace(null);
      }
    });

    return () => {
      unsubBan();
      unsubMembers();
    };
  }, [activeSpaceId, identity?.uid, activeSpace?.hostUid]);

  const connectedPeerIds = Object.keys(peers);

  useEffect(() => {
    const handleJoinVoice = (e) => {
      const { channelId } = e.detail;
      voice.joinVoice(channelId, connectedPeerIds);
    };
    window.addEventListener('illaki:join-voice', handleJoinVoice);
    return () => window.removeEventListener('illaki:join-voice', handleJoinVoice);
  }, [voice.joinVoice, connectedPeerIds]);

  const activeStream = screenShare.remoteScreenStream || screenShare.localScreenStream;
  const sharerName = screenShare.remoteScreenStream ? (screenShare.remoteSharer || 'Biri') : 'Sen';

  return (
    <div className={styles.root}>
      {/* Mobile Overlay */}
      {sidebarOpen && <div className={styles.sidebarOverlay} onClick={toggleSidebar} />}
      
      <div className={`${styles.sidebars} ${sidebarOpen ? styles.sidebarsOpen : ''}`}>
        <ServerSidebar
          onCreateSpace={() => setCreateOpen(true)}
          onJoinSpace={() => setJoinOpen(true)}
          onDiscover={() => setDiscoverOpen(true)}
        />

        {activeSpaceId && (
          <ChannelSidebar
            activeSpaceId={activeSpaceId}
            onOpenSettings={() => setSpaceSettingsOpen(true)}
            onBroadcastUpdate={broadcastSpaceUpdate}
            onBroadcastDelete={broadcastSpaceDelete}
            kickFromVoice={kickFromVoice}
            screenShare={screenShare}
            onOpenStreamStage={() => setStreamStageOpen(true)}
            voiceSlot={
              <VoiceChannel
                {...voice}
                connectedPeerIds={connectedPeerIds}
                onJoin={voice.joinVoice}
                onLeave={() => {
                  voice.leaveVoice();
                  screenShare.stopScreenShare();
                }}
                onToggleMute={voice.toggleMute}
                onToggleDeafen={voice.toggleDeafen}
                onToggleCamera={voice.toggleCamera}
                screenShare={screenShare}
              />
            }
          />
        )}
      </div>

      <div className={styles.content}>
        {activeSpaceId ? (
          <ChatArea
            sendMessage={sendMessage}
            onToggleMembers={() => setRightPanel(p => p === 'members' ? null : 'members')}
            onToggleMusic={() => setRightPanel(p => p === 'music' ? null : 'music')}
            rightPanel={rightPanel}
            screenShare={screenShare}
            voice={voice}
            onOpenSettings={() => setSpaceSettingsOpen(true)}
            onToggleSidebar={toggleSidebar}
            onOpenStreamStage={() => setStreamStageOpen(true)}
          />
        ) : (
          <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <div className={styles.welcomeScreen} style={{ flex: 1 }}>
              <button
                className={styles.mobileMenuBtnWelcome}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSidebar();
                }}
              >
                ☰ Menü
              </button>
              <h2>illaki'ye Hoş Geldiniz</h2>
              <p>Başlamak için sol menüden bir sunucu seçin veya yeni bir tane oluşturun.</p>
            </div>
            {window.innerWidth > 768 && <FriendsPanel onJoinSpace={(code, id) => connectToPeer(code, id)} />}
          </div>
        )}
      </div>

      {/* Right panel overlay for mobile */}
      {rightPanel && <div className={styles.rightPanelOverlay} onClick={() => setRightPanel(null)} />}

      <div className={`${styles.rightPanels} ${rightPanel ? styles.rightPanelsOpen : ''}`}>
        {activeSpaceId && rightPanel === 'members' && (
          <MembersPanel kickPeer={kickPeer} onClose={() => setRightPanel(null)} />
        )}
        {activeSpaceId && rightPanel === 'music' && (
          <MusicBotPanel onClose={() => setRightPanel(null)} isVoiceConnected={!!voice.voiceChannelId} />
        )}
      </div>

      {/* Stream Viewer Modal / Fullscreen Stage */}
      <StreamStageModal
        isOpen={streamStageOpen}
        onClose={() => setStreamStageOpen(false)}
        stream={activeStream}
        sharerName={sharerName}
        isSelf={!screenShare.remoteScreenStream}
        onStopShare={() => screenShare.stopScreenShare()}
      />

      {/* Ban Screen Overlay Modal */}
      {bannedInfo && (
        <BanScreenModal
          banInfo={bannedInfo}
          spaceName={activeSpace?.name}
          onLeave={() => {
            removeSpace(activeSpaceId);
            setActiveSpace(null);
            setBannedInfo(null);
          }}
        />
      )}

      <CreateSpaceModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <JoinSpaceModal
        isOpen={joinOpen}
        onClose={() => setJoinOpen(false)}
        connectToPeer={connectToPeer}
      />

      {discoverOpen && (
        <div className={styles.modalOverlay} style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setDiscoverOpen(false); }}>
          <div className={styles.modalContent} style={{ width: '92%', maxWidth: '800px', height: '85vh', padding: 0 }}>
             <button className={styles.closeModalBtn} onClick={() => setDiscoverOpen(false)}>×</button>
             <DiscoverServers onClose={() => setDiscoverOpen(false)} onJoin={(code, id) => connectToPeer(code, id)} />
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <SpaceSettingsModal
        isOpen={spaceSettingsOpen}
        onClose={() => setSpaceSettingsOpen(false)}
      />
    </div>
  );
}
