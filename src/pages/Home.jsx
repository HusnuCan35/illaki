import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { ChatArea } from '../components/ChatArea';
import { MembersPanel } from '../components/MembersPanel';
import { VoiceChannel } from '../components/VoiceChannel';
import { CreateSpaceModal, JoinSpaceModal } from './SpaceModals';
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
      <Sidebar
        onCreateSpace={() => setCreateOpen(true)}
        onJoinSpace={() => setJoinOpen(true)}
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

      <div className={styles.content}>
        <ChatArea
          sendMessage={sendMessage}
          onToggleMembers={() => setMembersOpen(m => !m)}
          membersOpen={membersOpen}
          screenShare={screenShare}
        />
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
    </div>
  );
}
