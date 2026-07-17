import { useEffect, useState, useCallback } from 'react';
import { ServerSidebar } from '../components/ServerSidebar';
import { ChannelSidebar } from '../components/ChannelSidebar';
import { ChatArea } from '../components/ChatArea';
import { MembersPanel } from '../components/MembersPanel';
import { VoiceChannel } from '../components/VoiceChannel';
import { CreateSpaceModal, JoinSpaceModal, SpaceSettingsModal } from './SpaceModals';
import { SettingsModal } from './Settings';
import { usePeer } from '../hooks/usePeer';
import { useVoice } from '../hooks/useVoice';
import { useScreenShare } from '../hooks/useScreenShare';
import { useUIStore, usePeerStore, useSpaceStore } from '../stores';
import styles from './Home.module.css';

export function Home() {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  const [spaceSettingsOpen, setSpaceSettingsOpen] = useState(false);
  const { settingsOpen, setSettingsOpen } = useUIStore();

  const { initPeer, connectToPeer, sendMessage, getPeer, kickPeer, broadcastSpaceUpdate, broadcastSpaceDelete } = usePeer();
  const voice = useVoice(getPeer);
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

  const connectedPeerIds = Object.keys(peers);

  return (
    <div className={styles.root}>
      <ServerSidebar
        onCreateSpace={() => setCreateOpen(true)}
        onJoinSpace={() => setJoinOpen(true)}
      />

      {activeSpaceId && (
        <ChannelSidebar
          activeSpaceId={activeSpaceId}
          onOpenSettings={() => setSpaceSettingsOpen(true)}
          onBroadcastUpdate={broadcastSpaceUpdate}
          onBroadcastDelete={broadcastSpaceDelete}
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
              screenShare={screenShare}
            />
          }
        />
      )}

      <div className={styles.content}>
        {activeSpaceId ? (
          <ChatArea
            sendMessage={sendMessage}
            onToggleMembers={() => setMembersOpen(m => !m)}
            membersOpen={membersOpen}
            screenShare={screenShare}
            onOpenSettings={() => setSpaceSettingsOpen(true)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: 'var(--text-muted)' }}>
            <h2>illaki'ye Hoş Geldiniz</h2>
            <p>Başlamak için sol menüden bir sunucu seçin veya yeni bir tane oluşturun.</p>
          </div>
        )}
      </div>

      {membersOpen && activeSpaceId && <MembersPanel kickPeer={kickPeer} />}

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
