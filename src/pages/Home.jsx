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
import { useUIStore, usePeerStore, useSpaceStore, useIdentityStore, useDmStore } from '../stores';
import { subscribeToUserBanStatus, subscribeToMembers, updateMemberOnlineStatus, updateMemberVoiceStatus, syncMemberProfile, createOrGetDm } from '../lib/firestore';
import { DmSidebar } from '../components/DmSidebar';
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
  const { activeDmId, setActiveDm, dms } = useDmStore();

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

  // Sayfa her yüklenişinde (refresh dahil) kendi ses kanalı kaydını temizle.
  // Çünkü voice.isInVoice persist edilmez ve Firestore'da stale kayıt kalabilir.
  useEffect(() => {
    const { uid } = useIdentityStore.getState().identity || {};
    const { spaces: allSpaces } = useSpaceStore.getState();
    if (!uid || !allSpaces?.length) return;

    // Tüm üye olduğumuz space'lerde voiceChannelId'yi null yap
    allSpaces.forEach(space => {
      if (space?.id) {
        updateMemberVoiceStatus(space.id, uid, null).catch(() => {});
      }
    });
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

  // Profile Sync
  useEffect(() => {
    if (!activeSpaceId || !identity?.uid) return;
    syncMemberProfile(activeSpaceId, identity.uid, {
      username: identity.username,
      avatarColor: identity.avatarColor,
    });
  }, [activeSpaceId, identity?.uid, identity?.username, identity?.avatarColor]);

  // Voice Status Cleanup on Load
  useEffect(() => {
    if (!activeSpaceId || !identity?.uid) return;
    // Sayfa yenilendiğinde (veya ilk açılışta) ses kanalından çıktı olarak işaretle.
    if (!voice.isInVoice) {
      updateMemberVoiceStatus(activeSpaceId, identity.uid, null);
      const { voiceChannelId, setVoiceChannelId } = usePeerStore.getState();
      if (voiceChannelId) {
        setVoiceChannelId(null);
        broadcastVoiceStatus({ channelId: null, isMuted: false, isDeafened: false });
      }
    }
  }, [activeSpaceId, identity?.uid]); // Sadece açılışta ve space değişiminde kontrol et

  // Heartbeat & Online status tracking for activeSpace
  useEffect(() => {
    if (!activeSpaceId || !identity?.uid) return;

    const currentStatus = useIdentityStore.getState().identity?.status || 'online';
    updateMemberOnlineStatus(activeSpaceId, identity.uid, currentStatus !== 'offline', currentStatus, identity.customStatus || '');

    const interval = setInterval(() => {
      const status = useIdentityStore.getState().identity?.status || 'online';
      updateMemberOnlineStatus(activeSpaceId, identity.uid, status !== 'offline', status, identity.customStatus || '');
    }, 30000);

    const handleUnload = () => {
      const status = useIdentityStore.getState().identity?.status || 'online';
      updateMemberOnlineStatus(activeSpaceId, identity.uid, false, status, identity.customStatus || '');
      updateMemberVoiceStatus(activeSpaceId, identity.uid, null);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      // Sadece activeSpaceId değiştiğinde eski space'ten çıkış yap
      const status = useIdentityStore.getState().identity?.status || 'online';
      updateMemberOnlineStatus(activeSpaceId, identity.uid, false, status, identity.customStatus || '').catch(() => {});
      updateMemberVoiceStatus(activeSpaceId, identity.uid, null).catch(() => {});
    };
  }, [activeSpaceId, identity?.uid]);


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

  // --- DM Ringing Listener ---
  const [incomingCall, setIncomingCall] = useState(null);
  
  useEffect(() => {
    if (!identity?.uid) return;
    
    // Find if any DM has an activeCall with status 'ringing' where we are not the caller
    const ringingDm = dms.find(dm => 
      dm.activeCall && 
      dm.activeCall.status === 'ringing' && 
      dm.activeCall.caller !== identity.uid
    );
    
    if (ringingDm && !voice.isInVoice) {
      setIncomingCall(ringingDm);
    } else {
      setIncomingCall(null);
    }
  }, [dms, identity?.uid, voice.isInVoice]);

  const handleAcceptCall = async () => {
    if (incomingCall) {
      const dmId = incomingCall.id;
      const withVideo = incomingCall.activeCall?.hasVideo || false;
      import('../lib/firestore').then(({ updateDmCallStatus }) => {
        updateDmCallStatus(dmId, 'accepted', incomingCall.activeCall.caller);
      });
      setActiveSpace(null);
      setActiveDm(dmId);
      voice.joinVoice(dmId, true, withVideo);
      setIncomingCall(null);
    }
  };

  const handleRejectCall = async () => {
    if (incomingCall) {
      const dmId = incomingCall.id;
      import('../lib/firestore').then(({ updateDmCallStatus }) => {
        updateDmCallStatus(dmId, 'rejected', incomingCall.activeCall.caller);
      });
      setIncomingCall(null);
    }
  };

  const connectedPeerIds = Object.keys(peers);

  useEffect(() => {
    const handleJoinVoice = (e) => {
      const { channelId } = e.detail;
      voice.joinVoice(channelId, connectedPeerIds);
    };
    const handleJoinDmVoice = (e) => {
      const { dmId, withVideo } = e.detail;
      voice.joinVoice(dmId, connectedPeerIds, true, withVideo);
    };
    window.addEventListener('illaki:join-voice', handleJoinVoice);
    window.addEventListener('illaki:join-dm-voice', handleJoinDmVoice);
    return () => {
      window.removeEventListener('illaki:join-voice', handleJoinVoice);
      window.removeEventListener('illaki:join-dm-voice', handleJoinDmVoice);
    };
  }, [voice.joinVoice, connectedPeerIds]);

  // Ekran paylaşımı sadece ses kanalındayken görünsün
  const activeStream = voice.isInVoice
    ? (screenShare.remoteScreenStream || screenShare.localScreenStream)
    : null;
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

        {activeSpaceId ? (
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
                contextId={activeSpaceId || activeDmId}
                isDm={!!activeDmId}
              />
            }
          />
        ) : (
          <DmSidebar
            onSelectFriends={() => setActiveDm(null)}
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
                contextId={activeSpaceId || activeDmId}
                isDm={!!activeDmId}
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
        ) : activeDmId ? (
          <ChatArea
            isDm={true}
            dmId={activeDmId}
            sendMessage={sendMessage}
            onToggleSidebar={toggleSidebar}
            screenShare={screenShare}
            voice={voice}
          />
        ) : (
          <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <div className={styles.welcomeScreen} style={{ flex: 1, display: window.innerWidth <= 768 ? 'flex' : 'none' }}>
              <button
                className={styles.mobileMenuBtnWelcome}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSidebar();
                }}
              >
                ☰ Menü
              </button>
              <h2>Arkadaşlar</h2>
            </div>
            <FriendsPanel 
              onJoinSpace={(code, id) => connectToPeer(code, id)} 
              onStartDm={async (friendUid) => {
                if (!identity?.uid) return;
                const dmId = await createOrGetDm(identity.uid, friendUid);
                setActiveDm(dmId);
                if (window.innerWidth <= 768) toggleSidebar();
              }}
            />
          </div>
        )}
      </div>

      {/* Right panel overlay for mobile */}
      {rightPanel && <div className={styles.rightPanelOverlay} onClick={() => setRightPanel(null)} />}

      <div className={`${styles.rightPanels} ${rightPanel ? styles.rightPanelsOpen : ''}`}>
        {activeSpaceId && rightPanel === 'members' && (
          <MembersPanel kickPeer={kickPeer} onClose={() => setRightPanel(null)} />
        )}
        {(activeSpaceId || activeDmId) && rightPanel === 'music' && (
          <MusicBotPanel 
            onClose={() => setRightPanel(null)} 
            isVoiceConnected={voice.isInVoice} 
            contextId={activeSpaceId || activeDmId}
            isDm={!!activeDmId}
          />
        )}
      </div>

      {/* --- Incoming Call Modal --- */}
      {incomingCall && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          color: 'white',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{
            background: 'var(--surface)',
            padding: '40px',
            borderRadius: '24px',
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            border: '1px solid var(--border)'
          }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '24px' }}>Gelen Arama 📞</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
              Biri sizi arıyor...
            </p>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
              <button 
                onClick={handleRejectCall}
                style={{
                  background: '#EF4444',
                  color: 'white',
                  border: 'none',
                  padding: '12px 30px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Reddet
              </button>
              <button 
                onClick={handleAcceptCall}
                style={{
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '12px 30px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Kabul Et
              </button>
            </div>
          </div>
        </div>
      )}

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
