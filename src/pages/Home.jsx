import { useEffect, useState, useCallback } from 'react';
import { ServerSidebar } from '../components/ServerSidebar';
import { ChannelSidebar } from '../components/ChannelSidebar';
import { ChatArea } from '../components/ChatArea';
import { MembersPanel } from '../components/MembersPanel';
import { MusicBotPanel } from '../components/MusicBotPanel';
import { VoiceChannel } from '../components/VoiceChannel';
import { CreateSpaceModal, JoinSpaceModal, SpaceSettingsModal } from './SpaceModals';
import { DiscoverServers } from '../components/DiscoverServers';
import { FriendsPanel } from '../components/FriendsPanel';
import { SettingsModal } from './Settings';
import { usePeer } from '../hooks/usePeer';
import { useVoice } from '../hooks/useVoice';
import { useScreenShare } from '../hooks/useScreenShare';
import { useUIStore, usePeerStore, useSpaceStore } from '../stores';
import styles from './Home.module.css';

export function Home() {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState(window.innerWidth > 900 ? 'members' : null); // 'members' | 'music' | null
  const [spaceSettingsOpen, setSpaceSettingsOpen] = useState(false);
  const { settingsOpen, setSettingsOpen, sidebarOpen, toggleSidebar } = useUIStore();

  const { initPeer, connectToPeer, sendMessage, getPeer, kickPeer, kickFromVoice, broadcastSpaceUpdate, broadcastSpaceDelete, broadcastVoiceStatus } = usePeer();
  const voice = useVoice(getPeer, broadcastVoiceStatus);
  const screenShare = useScreenShare(getPeer);
  const { peers } = usePeerStore();
  const { activeSpaceId } = useSpaceStore();

  // Home sayfasındayken body scroll'u kilitle (Landing'de açık olsun)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    initPeer().catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-connect to space P2P network when activeSpaceId changes (e.g. on load or switch)
  useEffect(() => {
    if (activeSpaceId) {
      const space = useSpaceStore.getState().spaces.find(s => s.id === activeSpaceId);
      if (space && space.code) {
        connectToPeer(space.code, activeSpaceId).catch(() => {
          // Ignore errors, likely already connected or we are the host
        });
      }
    }
  }, [activeSpaceId, connectToPeer]);

  const connectedPeerIds = Object.keys(peers);

  useEffect(() => {
    const handleJoinVoice = (e) => {
      const { channelId } = e.detail;
      voice.joinVoice(channelId, connectedPeerIds);
    };
    window.addEventListener('illaki:join-voice', handleJoinVoice);
    return () => window.removeEventListener('illaki:join-voice', handleJoinVoice);
  }, [voice.joinVoice, connectedPeerIds]);

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
            onOpenSettings={() => setSpaceSettingsOpen(true)}
            onToggleSidebar={toggleSidebar}
          />
        ) : (
          <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <div className={styles.welcomeScreen} style={{ flex: 1 }}>
              {/* Mobile menu button for welcome screen */}
              <button className={styles.mobileMenuBtnWelcome} onClick={toggleSidebar}>
                ☰ Menü
              </button>
              <h2>illaki'ye Hoş Geldiniz</h2>
              <p>Başlamak için sol menüden bir sunucu seçin veya yeni bir tane oluşturun.</p>
            </div>
            {window.innerWidth > 768 && <FriendsPanel onJoinSpace={(code, id) => connectToPeer(code, id)} />}
          </div>
        )}
      </div>

      <div className={`${styles.rightPanels} ${rightPanel ? styles.rightPanelsOpen : ''}`}>
        {activeSpaceId && rightPanel === 'members' && <MembersPanel kickPeer={kickPeer} />}
        {activeSpaceId && rightPanel === 'music' && <MusicBotPanel />}
      </div>

      {/* CreateSpaceModal artık initPeerWithCode almıyor — peerId zaten var */}
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
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setDiscoverOpen(false); }}>
          <div className={styles.modalContent} style={{ width: '90%', maxWidth: '800px', height: '80vh', padding: 0 }}>
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
