import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Paperclip, Smile, Hash, Users, Copy,
  Check, Phone, Video, Lock, Image, FileText,
  Play, X, Upload, Settings, LogOut, Volume2, Music, Menu,
  Reply, Edit2, Trash2, Dices, Gamepad2, CheckSquare
} from 'lucide-react';
import { GameZone } from './GameZone';
import {
  useMessageStore, useSpaceStore, useIdentityStore,
  usePeerStore, useUIStore,
} from '../stores';
import { sendEncryptedMessage, subscribeToMessages, uploadMedia, subscribeToDuels, createDuel, subscribeToMembers } from '../lib/firestore';
import { processMediaFile, formatFileSize } from '../lib/mediaProcessor';
import EmojiPicker from 'emoji-picker-react';
import { UserProfileModal } from './UserProfileModal';
import { CameraGrid } from './CameraGrid';
import { DiceRoller } from './DiceRoller';
import { JackpotMachine } from './JackpotMachine';
import { DuelModal } from './DuelModal';
import { BotDuelModal } from './BotDuelModal';
import styles from './ChatArea.module.css';

// Format timestamp
function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) +
    ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// Group messages by sender + time proximity
function groupMessages(messages) {
  const groups = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const isGrouped =
      prev &&
      prev.sender === msg.sender &&
      msg.timestamp - prev.timestamp < 5 * 60 * 1000;
    if (isGrouped) {
      groups[groups.length - 1].messages.push(msg);
    } else {
      groups.push({ sender: msg.sender, own: msg.own, messages: [msg] });
    }
  });
  return groups;
}

function AvatarMini({ username, color, own }) {
  return (
    <div
      className={styles.msgAvatar}
      style={{ background: own ? 'var(--accent)' : (color || '#6366f1') }}
      aria-hidden="true"
    >
      {(username || '?').slice(0, 2).toUpperCase()}
    </div>
  );
}

// Media message renderer
function MediaBubble({ msg }) {
  const [lightbox, setLightbox] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);

  if (msg.type === 'image') {
    return (
      <div className={styles.mediaBubble}>
        {/* Progressive: thumb önce */}
        <div
          className={styles.imageWrapper}
          onClick={() => setLightbox(true)}
          title="Büyütmek için tıkla"
        >
          {msg.thumbnailUrl && (
            <img
              src={msg.thumbnailUrl}
              alt="thumbnail"
              className={`${styles.msgImage} ${thumbLoaded ? styles.hidden : ''}`}
              aria-hidden={thumbLoaded}
            />
          )}
          {msg.mediaUrl && (
            <img
              src={msg.mediaUrl}
              alt={msg.mediaName || 'Görsel'}
              className={`${styles.msgImage} ${thumbLoaded ? '' : styles.loadingImg}`}
              onLoad={() => setThumbLoaded(true)}
              loading="lazy"
            />
          )}
          {!thumbLoaded && (
            <div className={styles.imgPlaceholder}>
              <Image size={24} />
            </div>
          )}
        </div>
        {msg.mediaSize && (
          <span className={styles.mediaInfo}>{formatFileSize(msg.mediaSize)}</span>
        )}
        {/* Lightbox */}
        {lightbox && (
          <div className={styles.lightbox} onClick={() => setLightbox(false)}>
            <button className={styles.lightboxClose}><X size={20} /></button>
            <img src={msg.mediaUrl} alt={msg.mediaName || 'Görsel'} className={styles.lightboxImg} />
          </div>
        )}
      </div>
    );
  }

  if (msg.type === 'video') {
    return (
      <div className={styles.mediaBubble}>
        <div className={styles.videoWrapper}>
          {msg.thumbnailUrl ? (
            <div className={styles.videoThumbContainer}>
              <img src={msg.thumbnailUrl} alt="Video thumbnail" className={styles.videoThumb} />
              <a
                href={msg.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.playOverlay}
                title="Videoyu aç"
              >
                <div className={styles.playBtn}><Play size={20} fill="white" /></div>
              </a>
              {msg.mediaDuration && (
                <span className={styles.videoDuration}>
                  {formatDuration(msg.mediaDuration)}
                </span>
              )}
            </div>
          ) : (
            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
              <Video size={14} /> Video
            </a>
          )}
        </div>
        {msg.mediaSize && (
          <span className={styles.mediaInfo}>{formatFileSize(msg.mediaSize)}</span>
        )}
      </div>
    );
  }

  // Generic file
  return (
    <a href={msg.mediaUrl || '#'} download={msg.mediaName} className={styles.fileLink} target="_blank" rel="noopener noreferrer">
      <FileText size={14} />
      <span>{msg.mediaName || 'Dosya'}</span>
      {msg.mediaSize && <span className={styles.fileSize}>({formatFileSize(msg.mediaSize)})</span>}
    </a>
  );
}

function formatDuration(s) {
  if (!s || isNaN(s)) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function MessageGroup({ group, onReply, onDelete, onEdit, onReact, identity, onOpenProfile, isSelectMode, selectedMsgIds, onToggleSelectMsg }) {
  const senderInfo = {
    uid: group.senderUid || group.messages?.[0]?.senderUid || group.sender,
    username: group.sender,
    avatarColor: group.messages?.[0]?.avatarColor,
  };

  return (
    <div className={`${styles.msgGroup} ${group.own ? styles.own : ''}`}>
      {!group.own && group.type !== 'system' && (
        <div style={{ cursor: 'pointer' }} onClick={() => onOpenProfile && onOpenProfile(senderInfo)}>
          <AvatarMini username={group.sender} color={group.messages?.[0]?.avatarColor} />
        </div>
      )}
      <div className={styles.msgContent}>
        {!group.own && group.type !== 'system' && (
          <div className={styles.msgSender} style={{ cursor: 'pointer' }} onClick={() => onOpenProfile && onOpenProfile(senderInfo)}>
            {group.sender}
          </div>
        )}
        <div className={styles.msgBubbles}>
          {group.messages.map((msg) => (
            <MessageBubble 
              key={msg.id} 
              msg={msg} 
              group={group} 
              onReply={onReply} 
              onDelete={onDelete} 
              onEdit={onEdit} 
              onReact={onReact} 
              identity={identity}
              isSelectMode={isSelectMode}
              isSelected={selectedMsgIds?.has(msg.id)}
              onToggleSelect={() => onToggleSelectMsg && onToggleSelectMsg(msg.id)}
            />
          ))}
        </div>
      </div>
      {group.own && group.type !== 'system' && (
        <div style={{ cursor: 'pointer' }} onClick={() => onOpenProfile && onOpenProfile({ uid: identity?.uid, username: identity?.username, avatarColor: identity?.avatarColor })}>
          <AvatarMini username={group.sender} own />
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, group, onReply, onDelete, onEdit, onReact, identity, isSelectMode, isSelected, onToggleSelect }) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleEditSave = () => {
    if (editContent.trim() && editContent !== msg.content) {
      onEdit(msg.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditContent(msg.content);
    setIsEditing(false);
  };

  if (msg.type === 'system') {
    const isDice = msg.content.includes('Zar attı');
    return (
      <div className={styles.systemMessage}>
        {isDice && <Dices size={16} className={styles.diceAnim} />}
        <span>{msg.content}</span>
      </div>
    );
  }

  return (
    <div 
      className={styles.msgBubbleWrapper}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!showEmojiPicker) setShowActions(false);
      }}
      onClick={(e) => {
        // On mobile, tap to toggle actions (only if not in select mode)
        if ('ontouchstart' in window && !isSelectMode && !showEmojiPicker) {
          e.stopPropagation();
          setShowActions(prev => !prev);
        }
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
    >
      {isSelectMode && (
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={onToggleSelect}
          style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }}
        />
      )}
      {msg.replyTo && (
        <div className={styles.replyContext}>
          <div className={styles.replyBar} />
          <span className={styles.replyUsername}>@{msg.replyTo.sender}</span>
          <span className={styles.replyContent}>
            {msg.replyTo.content || "Medya mesajı"}
          </span>
        </div>
      )}
      
      <div className={`${styles.msgBubble} ${group.own ? styles.ownBubble : styles.otherBubble}`}>
        {isEditing ? (
          <div className={styles.editMode}>
            <input 
              autoFocus 
              value={editContent} 
              onChange={e => setEditContent(e.target.value)} 
              onKeyDown={e => {
                if (e.key === 'Enter') handleEditSave();
                if (e.key === 'Escape') handleEditCancel();
              }}
              className={styles.editInput}
            />
            <div className={styles.editActions}>
              <button onClick={handleEditCancel} className={styles.cancelBtn}>İptal</button>
              <button onClick={handleEditSave} className={styles.saveBtn}>Kaydet</button>
            </div>
          </div>
        ) : (
          (msg.type === 'image' || msg.type === 'video' || msg.type === 'file') && msg.mediaUrl ? (
            <MediaBubble msg={msg} />
          ) : (
            <span>{msg.content}</span>
          )
        )}
        <div className={styles.msgMetaInfo}>
          {msg.isEdited && <span className={styles.editedMark}>(düzenlendi)</span>}
          <time className={styles.msgTime} dateTime={new Date(msg.timestamp).toISOString()}>
            {formatTime(msg.timestamp)}
          </time>
        </div>
      </div>
      
      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
        <div className={styles.reactionsArea}>
          {Object.entries(msg.reactions).map(([emoji, users]) => (
            <button 
              key={emoji} 
              className={`${styles.reactionPill} ${users.includes(identity?.uid) ? styles.reactionPillActive : ''}`}
              onClick={() => onReact(msg.id, emoji)}
            >
              <span className={styles.reactionEmoji}>{emoji}</span>
              <span className={styles.reactionCount}>{users.length}</span>
            </button>
          ))}
        </div>
      )}

      {showActions && !isEditing && !isSelectMode && (
        <div className={`${styles.msgActions} ${group.own ? styles.msgActionsRight : styles.msgActionsLeft}`}>
          <div style={{ position: 'relative' }}>
            <button className={styles.actionBtn} onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Tepki Ekle"><Smile size={14} /></button>
            {showEmojiPicker && (
              <>
                <div 
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setShowEmojiPicker(false); 
                    setShowActions(false); 
                  }}
                />
                <div 
                  style={{ 
                    position: 'absolute', 
                    bottom: '100%', 
                    left: '50%', 
                    transform: 'translateX(-50%)', 
                    zIndex: 50, 
                    marginBottom: '8px', 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)', 
                    borderRadius: '8px', 
                    overflow: 'hidden' 
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <EmojiPicker 
                    theme="dark" 
                    onEmojiClick={(emojiData) => {
                      onReact(msg.id, emojiData.emoji);
                      setShowEmojiPicker(false);
                      setShowActions(false);
                    }}
                    width={280}
                    height={350}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              </>
            )}
          </div>
          <button className={styles.actionBtn} onClick={() => onReply(msg)} title="Yanıtla"><Reply size={14} /></button>
          {group.own && (
            <>
              <button className={styles.actionBtn} onClick={() => setIsEditing(true)} title="Düzenle"><Edit2 size={14} /></button>
              <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => onDelete(msg.id)} title="Sil"><Trash2 size={14} /></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WelcomeScreen({ space }) {
  if (!space) return null;
  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeIcon}>{space.icon || <Hash size={32} />}</div>
      <h1 className={styles.welcomeTitle}>{space.name} kanalına hoş geldin</h1>
      <p className={styles.welcomeDesc}>
        Bu kanal uçtan uca şifreli (AES-256-GCM). Sunucu mesajları asla görmez.
        Hesabınla her girişinde mesajlar senkronize edilir.
      </p>
      <div className={styles.welcomeCode}>
        <Lock size={13} />
        <span>Oda Kodu:</span>
        <code style={{ color: space?.themeColor || 'var(--accent)' }}>{space.code}</code>
      </div>
    </div>
  );
}

// Upload progress indicator
function UploadIndicator({ progress, fileName }) {
  return (
    <div className={styles.uploadIndicator}>
      <Upload size={14} />
      <span>{fileName}</span>
      <div className={styles.uploadBar}>
        <div className={styles.uploadFill} style={{ width: `${progress}%` }} />
      </div>
      <span>{progress}%</span>
    </div>
  );
}

function ScreenViewer({ stream, label, onStop, onOpenStage }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  if (!stream) return null;
  return (
    <div className={styles.screenViewer}>
      <div className={styles.screenLabel}>
        <span>🔴 {label} Ekran Paylaşıyor</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onOpenStage && (
            <button className={styles.stopScreenBtn} style={{ background: '#66FCF1', color: '#000', fontWeight: 'bold' }} onClick={onOpenStage}>
              Ayrı Ekranda İzle (Tam Ekran)
            </button>
          )}
          {onStop && <button className={styles.stopScreenBtn} onClick={onStop}>Durdur</button>}
        </div>
      </div>
      <video ref={videoRef} autoPlay playsInline className={styles.screenVideo} onClick={onOpenStage} style={{ cursor: 'pointer' }} />
    </div>
  );
}

export function ChatArea({ 
  sendMessage: sendP2PMessage, 
  onToggleMembers, 
  onToggleMusic, 
  rightPanel, 
  screenShare, 
  voice,
  onOpenSettings, 
  onToggleSidebar,
  onOpenStreamStage
}) {
  const { addMessage, getMessages } = useMessageStore();
  const { activeSpaceId, getActiveSpace, activeChannelId, channels } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { peers } = usePeerStore();
  const { addToast } = useUIStore();

  const activeSpace = getActiveSpace();
  const spaceChannels = activeSpaceId ? channels[activeSpaceId] || [] : [];
  const activeChannel = spaceChannels.find(c => c.id === activeChannelId);
  const onlinePeers = Object.keys(peers).length;

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGameZone, setShowGameZone] = useState(false);
  const [firebaseMessages, setFirebaseMessages] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null); // { fileName, progress }
  const [profileModalUser, setProfileModalUser] = useState(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState(new Set());
  const [dbMembers, setDbMembers] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [myTimeoutInfo, setMyTimeoutInfo] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!activeSpaceId) return;
    import('../lib/firestore').then(({ subscribeToMembers }) => {
      const unsub = subscribeToMembers(activeSpaceId, (members) => {
        setDbMembers(members);
      });
      return () => unsub();
    });
  }, [activeSpaceId]);

  const myMember = dbMembers.find(m => m.uid === identity?.uid);
  const isPrivileged = activeSpace?.isHost || myMember?.role === 'admin' || myMember?.role === 'mod';

  const handleToggleSelectMsg = (msgId) => {
    setSelectedMsgIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleBulkDeleteSelected = async () => {
    if (selectedMsgIds.size === 0) return;
    if (!window.confirm(`Seçilen ${selectedMsgIds.size} mesajı silmek istediğinize emin misiniz?`)) return;
    try {
      const { deleteMultipleMessages } = await import('../lib/firestore');
      await deleteMultipleMessages(activeSpaceId, activeChannelId, Array.from(selectedMsgIds));
      addToast({ type: 'success', message: `${selectedMsgIds.size} mesaj silindi.` });
      setSelectedMsgIds(new Set());
      setIsSelectMode(false);
    } catch (err) {
      addToast({ type: 'error', message: 'Silinemedi: ' + err.message });
    }
  };

  const handleClearChannel = async () => {
    if (!window.confirm('Bu kanaldaki TÜM mesajları silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) return;
    try {
      const { clearChannelMessages } = await import('../lib/firestore');
      await clearChannelMessages(activeSpaceId, activeChannelId);
      addToast({ type: 'info', message: 'Kanal temizlendi.' });
      setSelectedMsgIds(new Set());
      setIsSelectMode(false);
    } catch (err) {
      addToast({ type: 'error', message: 'Kanal temizlenemedi: ' + err.message });
    }
  };

  const [showDiceRoller, setShowDiceRoller] = useState(false);
  const [diceValue, setDiceValue] = useState(6);
  const [showJackpot, setShowJackpot] = useState(false);
  const [isJackpotWin, setIsJackpotWin] = useState(false);
  const [jackpotPendingMessage, setJackpotPendingMessage] = useState(null);
  const [duels, setDuels] = useState([]);
  const [activeDuel, setActiveDuel] = useState(null);
  const [showBotDuel, setShowBotDuel] = useState(false);
  const [showMemberSelectDuel, setShowMemberSelectDuel] = useState(false);
  const [spaceMembers, setSpaceMembers] = useState([]);

  // Duels dinleyicisi
  useEffect(() => {
    if (!activeSpaceId || !identity?.uid) return;
    const unsub = subscribeToDuels(activeSpaceId, (dList) => {
      setDuels(dList);
      // En yeni aktif (pending / accepted) veya canlı takip edilen düelloyu seç
      const myDuels = dList
        .filter(d => (d.challengerUid === identity.uid || d.opponentUid === identity.uid))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const newestDuel = myDuels[0];
      if (newestDuel) {
        if (newestDuel.status === 'pending' || newestDuel.status === 'accepted') {
          setActiveDuel(newestDuel);
        } else if (newestDuel.status === 'completed') {
          // Tamamlanan düelloyu yalnızca açık olan pencerede canlı güncelle
          setActiveDuel(prev => (prev?.id === newestDuel.id ? newestDuel : null));
        } else {
          setActiveDuel(null);
        }
      }
    });
    return () => unsub();
  }, [activeSpaceId, identity?.uid]);

  // Sunucu üyeleri dinleyicisi
  useEffect(() => {
    if (!activeSpaceId) return;
    const unsub = subscribeToMembers(activeSpaceId, (mList) => {
      setSpaceMembers(mList.filter(m => m.uid !== identity?.uid));
    });
    return () => unsub();
  }, [activeSpaceId, identity?.uid]);

  // Firebase real-time mesaj dinleyicisi
  useEffect(() => {
    if (!activeSpaceId || !identity?.uid) return;

    // Hemen ekranı temizle ki eski sunucunun mesajları görünmesin
    setFirebaseMessages([]);

    // Önceki dinleyiciyi temizle
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    try {
      const unsubscribe = subscribeToMessages(
        activeSpaceId,
        activeChannelId,
        identity.uid,
        (msgs) => setFirebaseMessages(msgs)
      );
      unsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error('Firebase mesaj dinleyici hatası:', err);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [activeSpaceId, activeChannelId, identity?.uid]);

  // P2P mesajlarını Firebase mesajlarıyla birleştir (duplikat engelle)
  const p2pMessages = activeSpaceId ? getMessages(activeSpaceId, activeChannelId) : [];
  const allMessages = mergeMessages(firebaseMessages, p2pMessages);
  const groups = groupMessages(allMessages);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  useEffect(() => {
    if (activeSpaceId) inputRef.current?.focus();
  }, [activeSpaceId]);

  const handleSend = useCallback(async (overrideText) => {
    let content = (typeof overrideText === 'string' ? overrideText : input).trim();
    if (!content || !activeSpaceId || !identity) return;

    setSending(true);
    if (typeof overrideText !== 'string') {
      setInput('');
    }
    const currentReply = replyingTo;
    setReplyingTo(null);

    try {
      let isGameCommand = false;
      let gameResult = null;
      let pointsAwarded = 0;

      // Oyun komutlarını yakala
      if (content.startsWith('/')) {
        const cmd = content.toLowerCase();
        isGameCommand = true;
        
        if (cmd === '/zar') {
          const roll = Math.floor(Math.random() * 6) + 1;
          pointsAwarded = roll * 10;
          gameResult = `🎲 Zar attı ve **${roll}** geldi! (+${pointsAwarded} Puan)`;
          setDiceValue(roll);
          setShowDiceRoller(true);
        } else if (['/tas', '/kagit', '/makas'].includes(cmd)) {
          const choices = ['tas', 'kagit', 'makas'];
          const botChoice = choices[Math.floor(Math.random() * 3)];
          const userChoice = cmd.substring(1);
          
          let resultText = '';
          if (userChoice === botChoice) {
            resultText = 'Berabere!';
            pointsAwarded = 5;
          } else if (
            (userChoice === 'tas' && botChoice === 'makas') ||
            (userChoice === 'kagit' && botChoice === 'tas') ||
            (userChoice === 'makas' && botChoice === 'kagit')
          ) {
            resultText = 'Kazandın!';
            pointsAwarded = 25;
          } else {
            resultText = 'Kaybettin.';
            pointsAwarded = 0;
          }
          
          const emojiMap = { tas: '🪨', kagit: '📄', makas: '✂️' };
          gameResult = `🤖 Bot **${emojiMap[botChoice]}** seçti. Sen **${emojiMap[userChoice]}** seçtin. ${resultText} (+${pointsAwarded} Puan)`;
        } else if (['/yazi', '/tura'].includes(cmd)) {
          const isYazi = Math.random() > 0.5;
          const userChoice = cmd.substring(1);
          const result = isYazi ? 'yazi' : 'tura';
          
          if (userChoice === result) {
            pointsAwarded = 20;
            gameResult = `🪙 Madeni para atıldı: **${result.toUpperCase()}**. Kazandın! (+${pointsAwarded} Puan)`;
          } else {
            gameResult = `🪙 Madeni para atıldı: **${result.toUpperCase()}**. Kaybettin!`;
          }
        } else if (cmd === '/jackpot') {
          const roll = Math.random();
          const win = roll > 0.95; // %5 şans
          pointsAwarded = win ? 1000 : 0;
          gameResult = win
            ? `🎰 **JACKPOT!** İnanılmaz bir şans! Büyük ödülü kazandın! (+${pointsAwarded} Puan)`
            : `🎰 Jackpot denedi ama kazanamadı. Bol şans...`;
          setIsJackpotWin(win);
          setShowJackpot(true);
          // Set these on state so we can send them when animation finishes
          setJackpotPendingMessage({ gameResult, pointsAwarded });
          isGameCommand = false; // Don't send immediately
        } else {
          isGameCommand = false; // Tanınmayan komut
        }
      }

      if (isGameCommand && gameResult) {
        // Sistemi mesajı olarak Firebase'e yaz
        content = gameResult;
        await sendEncryptedMessage(activeSpaceId, activeChannelId, 'system', 'Sistem', content, 'system', null, currentReply);
        
        // Puan ekle
        if (pointsAwarded > 0) {
          import('../lib/firestore').then(({ updateMemberPoints }) => {
            updateMemberPoints(activeSpaceId, identity.uid, pointsAwarded).catch(console.error);
          });
        }
      } else {
        // Normal mesaj
        await sendEncryptedMessage(activeSpaceId, activeChannelId, identity.uid, identity.username, content, 'text', null, currentReply);
        // P2P'ye sadece normal mesajlar gitsin
        sendP2PMessage(activeSpaceId, activeChannelId, content);
      }
      
    } catch (err) {
      console.error('Mesaj gönderilemedi:', err);
      addToast({ type: 'error', message: 'Mesaj gönderilemedi. Lütfen tekrar dene.' });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, replyingTo, activeSpaceId, activeChannelId, identity, sendP2PMessage, addToast]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeSpaceId || !identity) return;

    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      addToast({ type: 'error', message: 'Dosya boyutu 50MB\'dan küçük olmalıdır.' });
      return;
    }

    setSending(true);
    setUploadProgress({ fileName: file.name, progress: 0 });

    try {
      // Medyayı işle (sıkıştır + thumbnail)
      const processed = await processMediaFile(file);
      setUploadProgress(p => ({ ...p, progress: 30 }));

      // Benzersiz mesaj ID'si
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      let mediaUrl = null;
      let thumbnailUrl = null;

      if (processed.type === 'image' || processed.type === 'video') {
        // Ana dosyayı yükle
        mediaUrl = await uploadMedia(
          activeSpaceId, messageId,
          processed.compressedBlob,
          processed.type === 'image' ? 'original.webp' : `original.${file.name.split('.').pop()}`
        );
        setUploadProgress(p => ({ ...p, progress: 70 }));

        // Thumbnail yükle
        if (processed.thumbnailBlob) {
          thumbnailUrl = await uploadMedia(
            activeSpaceId, messageId,
            processed.thumbnailBlob,
            'thumbnail.webp'
          );
        }
        setUploadProgress(p => ({ ...p, progress: 90 }));
      } else {
        // Diğer dosyalar — doğrudan yükle
        mediaUrl = await uploadMedia(activeSpaceId, messageId, file, file.name);
        setUploadProgress(p => ({ ...p, progress: 90 }));
      }

      // Firebase'e şifreli mesaj yaz
      await sendEncryptedMessage(
        activeSpaceId, activeChannelId, identity.uid, identity.username,
        file.name, // content = dosya adı
        processed.type,
        {
          url: mediaUrl,
          thumbnailUrl,
          type: file.type,
          size: file.size,
          name: file.name,
          duration: processed.duration,
          dimensions: processed.dimensions,
        }
      );

      setUploadProgress(p => ({ ...p, progress: 100 }));
      setTimeout(() => setUploadProgress(null), 1000);
    } catch (err) {
      console.error('Dosya gönderilemedi:', err);
      addToast({ type: 'error', message: 'Dosya gönderilemedi: ' + err.message });
      setUploadProgress(null);
    } finally {
      setSending(false);
      e.target.value = '';
    }
  };

  const copyCode = async () => {
    if (!activeSpace?.code) return;
    await navigator.clipboard.writeText(activeSpace.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dinamik oda stillerini ayarla
  const spaceStyle = {
    ...(activeSpace?.themeColor && { '--accent': activeSpace.themeColor, '--accent-light': activeSpace.themeColor, '--accent-dark': activeSpace.themeColor }),
  };

  const messagesStyle = {
    ...(activeSpace?.backgroundImage && { 
      backgroundImage: `url(${activeSpace.backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }),
  };

  if (!activeSpaceId) {
    return (
      <div className={styles.noSpace}>
        <div className={styles.noSpaceIcon}><Hash size={40} /></div>
        <h2>Space seç veya oluştur</h2>
        <p>Sol panelden bir space seç ya da yeni bir tane oluştur.</p>
      </div>
    );
  }

  if (activeSpaceId && !activeSpace) {
    return (
      <div className={styles.noSpace}>
        <div className={styles.noSpaceIcon}><Hash size={40} /></div>
        <h2>Sunucu Yükleniyor...</h2>
      </div>
    );
  }

  return (
    <div className={styles.chatArea} style={spaceStyle}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button 
            className={styles.mobileMenuBtn} 
            onClick={(e) => {
              e.stopPropagation();
              onToggleSidebar();
            }}
            title="Menüyü Aç"
            aria-label="Menü"
          >
            <Menu size={20} />
          </button>
          <div className={styles.headerIcon}>
            <span style={{ fontSize: '1rem' }}>{activeChannel?.type === 'voice' ? <Volume2 size={16} /> : '#'}</span>
          </div>
          <div>
            <div className={styles.headerName}>{activeChannel?.name || 'genel'}</div>
            <div className={styles.headerMeta}>
              <span className={styles.e2eBadge}>
                <Lock size={10} /> E2E
              </span>
            </div>
          </div>
        </div>

        <div className={styles.headerActions}>
          {isPrivileged && (
            <button
              className={`${styles.headerBtn} ${isSelectMode ? styles.headerBtnActive : ''}`}
              onClick={() => {
                setIsSelectMode(prev => !prev);
                setSelectedMsgIds(new Set());
              }}
              title="Toplu Mesaj Sil (Seçim Modu)"
            >
              <CheckSquare size={16} />
            </button>
          )}
          <button
            className={`${styles.headerBtn} ${rightPanel === 'music' ? styles.headerBtnActive : ''}`}
            onClick={onToggleMusic}
            title="Müzik Botu"
          >
            <Music size={16} />
          </button>
          <button className={styles.codeButton} onClick={copyCode} title="Oda kodunu kopyala">
            <code>{activeSpace?.code}</code>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            className={`${styles.headerBtn} ${rightPanel === 'members' ? styles.headerBtnActive : ''}`}
            onClick={onToggleMembers}
            title="Üyeler"
            aria-label="Üyeleri Gizle/Göster"
            aria-pressed={rightPanel === 'members'}
          >
            <Users size={16} />
          </button>
          <button
            className={styles.headerBtn}
            onClick={onOpenSettings}
            title={activeSpace?.isHost ? 'Oda Ayarları' : 'Odadan Ayrıl'}
          >
            {activeSpace?.isHost ? <Settings size={16} /> : <LogOut size={16} />}
          </button>
        </div>
      </header>

      {/* Bulk Delete Toolbar */}
      {isSelectMode && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>
            {selectedMsgIds.size} mesaj seçildi
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                const allIds = new Set(allMessages.map(m => m.id));
                setSelectedMsgIds(allIds);
              }}
              style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#FFF', fontSize: '12px', cursor: 'pointer' }}
            >
              Tümünü Seç
            </button>
            <button
              disabled={selectedMsgIds.size === 0}
              onClick={handleBulkDeleteSelected}
              style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: selectedMsgIds.size > 0 ? '#EF4444' : '#64748B', color: '#FFF', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
            >
              Seçilenleri Sil ({selectedMsgIds.size})
            </button>
            <button
              onClick={handleClearChannel}
              style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #EF4444', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
            >
              Tüm Kanalı Temizle
            </button>
            <button
              onClick={() => { setIsSelectMode(false); setSelectedMsgIds(new Set()); }}
              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#94A3B8', fontSize: '12px', cursor: 'pointer' }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Upload indicator */}
      {uploadProgress && (
        <UploadIndicator progress={uploadProgress.progress} fileName={uploadProgress.fileName} />
      )}
      {/* Screen Share (Pinned to Top) */}
      {screenShare?.remoteScreenStream && (
        <ScreenViewer 
          stream={screenShare.remoteScreenStream} 
          label={screenShare.remoteSharer} 
          onOpenStage={onOpenStreamStage}
        />
      )}
      {screenShare?.localScreenStream && !screenShare?.remoteScreenStream && (
        <ScreenViewer
          stream={screenShare.localScreenStream}
          label="Sen"
          onStop={() => screenShare.stopScreenShare()}
          onOpenStage={onOpenStreamStage}
        />
      )}

      {/* Camera Video Grid */}
      {voice?.voiceParticipants && (
        <CameraGrid participants={voice.voiceParticipants} />
      )}

      {profileModalUser && (
        <UserProfileModal
          isOpen={!!profileModalUser}
          user={profileModalUser}
          onClose={() => setProfileModalUser(null)}
        />
      )}

      <DiceRoller
        isOpen={showDiceRoller}
        value={diceValue}
        onComplete={() => setShowDiceRoller(false)}
      />

      <JackpotMachine
        isOpen={showJackpot}
        isWin={isJackpotWin}
        onComplete={async () => {
          setShowJackpot(false);
          if (jackpotPendingMessage) {
            try {
              await sendEncryptedMessage(
                activeSpaceId, 
                activeChannelId, 
                'system', 
                'Sistem', 
                jackpotPendingMessage.gameResult, 
                'system', 
                null, 
                null
              );
              if (jackpotPendingMessage.pointsAwarded > 0) {
                const { updateMemberPoints } = await import('../lib/firestore');
                await updateMemberPoints(activeSpaceId, identity.uid, jackpotPendingMessage.pointsAwarded);
              }
            } catch (err) {
              console.error('Failed to send jackpot message:', err);
            }
            setJackpotPendingMessage(null);
          }
        }}
      />

      <DuelModal
        isOpen={!!activeDuel}
        duel={activeDuel}
        onClose={() => setActiveDuel(null)}
      />

      <BotDuelModal
        isOpen={showBotDuel}
        onClose={() => setShowBotDuel(false)}
      />

      {showMemberSelectDuel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: '#0E1017', border: '1px solid rgba(255, 126, 32, 0.3)', borderRadius: '20px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#FFF', fontSize: '16px', fontWeight: 'bold' }}>👥 1v1 Düello İsteği Gönder</h3>
              <button onClick={() => setShowMemberSelectDuel(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#A1A1AA', marginBottom: '14px' }}>Düello etmek istediğin sunucu üyesini seç:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
              {spaceMembers.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#71717A', padding: '20px', fontSize: '13px' }}>
                  Sunucuda düello edebileceğin başka üye bulunamadı.
                </div>
              ) : (
                spaceMembers.map(m => (
                  <button
                    key={m.uid}
                    onClick={async () => {
                      try {
                        await createDuel(activeSpaceId, identity, { uid: m.uid, username: m.username });
                        addToast({ type: 'success', message: `${m.username} kullanıcısına 1v1 düello teklifi gönderildi!` });
                        setShowMemberSelectDuel(false);
                      } catch (err) {
                        addToast({ type: 'error', message: 'Düello daveti gönderilemedi.' });
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', cursor: 'pointer',
                      fontSize: '14px', fontWeight: '600'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: m.avatarColor || '#FF7E20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' }}>
                        {m.username?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <span>{m.username}</span>
                    </div>
                    <span style={{ fontSize: '12px', background: 'rgba(255, 126, 32, 0.2)', color: '#FF7E20', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>
                      ⚔️ Düelloya Çağır
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <main className={styles.messages} style={messagesStyle} role="log" aria-live="polite" aria-label="Mesajlar">
        {allMessages.length === 0 && !screenShare?.remoteScreenStream && !screenShare?.localScreenStream ? (
          <WelcomeScreen space={activeSpace} />
        ) : (
          groups.map((group, i) => (
            <MessageGroup 
              key={i} 
              group={group} 
              onReply={(msg) => {
                setReplyingTo(msg);
                inputRef.current?.focus();
              }}
              onDelete={async (msgId) => {
                try {
                  const { deleteMessage } = await import('../lib/firestore');
                  await deleteMessage(activeSpaceId, activeChannelId, msgId);
                } catch (err) {
                  addToast({ type: 'error', message: 'Silinemedi: ' + err.message });
                }
              }}
              onEdit={(msg) => {
                const newContent = prompt('Mesajı düzenle:', msg.content);
                if (newContent && newContent.trim() !== msg.content) {
                  import('../lib/firestore').then(({ editMessage }) => {
                    editMessage(activeSpaceId, activeChannelId, msg.id, identity.uid, newContent.trim())
                      .catch(err => addToast({ type: 'error', message: 'Düzenlenemedi: ' + err.message }));
                  });
                }
              }}
              onReact={async (msgId, emoji) => {
                try {
                  const { toggleReaction } = await import('../lib/firestore');
                  await toggleReaction(activeSpaceId, activeChannelId, msgId, identity.uid, emoji);
                } catch (err) {
                  console.error('Tepki eklenemedi:', err);
                }
              }}
              identity={identity}
              onOpenProfile={(u) => setProfileModalUser(u)}
              isSelectMode={isSelectMode}
              selectedMsgIds={selectedMsgIds}
              onToggleSelectMsg={handleToggleSelectMsg}
            />
          ))
        )}
        <div ref={messagesEndRef} aria-hidden="true" />
      </main>

      {/* Input */}
      <footer className={styles.inputArea}>
        {myTimeoutInfo ? (
          <div style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '12px',
            padding: '14px 18px',
            color: '#F59E0B',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
          }}>
            <span style={{ fontSize: '20px' }}>⛔</span>
            <div>
              <div style={{ fontWeight: '700', fontSize: '14px', color: '#FFF' }}>
                Susturuldunuz (Zaman Aşımı) — Kalan Süre: ~{myTimeoutInfo.remainingMinutes} dk
              </div>
              <div style={{ fontSize: '12px', color: '#CBD5E1', marginTop: '2px' }}>
                Yönetici: <strong>{myTimeoutInfo.by}</strong> | Sebep: <em>"{myTimeoutInfo.reason}"</em>
              </div>
            </div>
          </div>
        ) : (
          <>
            {replyingTo && (
              <div className={styles.replyingToBanner}>
                <div className={styles.replyingToInfo}>
                  <Reply size={14} />
                  <span>Yanıtlanıyor: <strong>@{replyingTo.senderUsername}</strong></span>
                </div>
                <button className={styles.cancelReplyBtn} onClick={() => setReplyingTo(null)}>
                  <X size={14} />
                </button>
              </div>
            )}
            
            {showEmoji && (
              <div className={styles.emojiPickerWrapper}>
                <EmojiPicker
                  theme="dark"
                  onEmojiClick={(emojiData) => setInput(prev => prev + emojiData.emoji)}
                />
              </div>
            )}
            <div className={styles.inputContainer}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt"
              />

              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <button
                  className={styles.inputAction}
                  onClick={() => setShowGameZone(!showGameZone)}
                  title="Mini Oyunlar / Eğlence Merkezi"
                >
                  <Gamepad2 size={18} />
                </button>
                {showGameZone && (
                  <GameZone 
                    onClose={() => setShowGameZone(false)}
                    onGameCommand={(cmd) => handleSend(cmd)}
                    onOpenBotDuel={() => setShowBotDuel(true)}
                    onOpenFriendDuel={() => setShowMemberSelectDuel(true)}
                  />
                )}
              </div>

              <button
                className={styles.inputAction}
                title="Dosya ekle"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
              >
                <Paperclip size={18} />
              </button>

              <div className={styles.inputWrapper}>
                <textarea
                  ref={inputRef}
                  id="message-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`#${activeChannel?.name || 'genel'} kanalına yaz...`}
                  rows={1}
                  maxLength={2000}
                  className={styles.textarea}
                  aria-label="Mesaj yaz"
                  disabled={sending}
                />
          </div>

          <button
            className={`${styles.inputAction} ${showEmoji ? styles.activeAction : ''}`}
            title="Emoji"
            onClick={() => setShowEmoji(prev => !prev)}
          >
            <Smile size={18} />
          </button>

          <button
            className={`${styles.sendBtn} ${input.trim() ? styles.sendActive : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || sending}
            aria-label="Mesaj gönder"
            id="send-message-btn"
          >
            <Send size={16} />
          </button>
        </div>
      </>
    )}
  </footer>
</div>
  );
}

// P2P ve Firebase mesajlarını birleştir, duplikatları kaldır
function mergeMessages(firebaseMsgs, p2pMsgs) {
  const seen = new Set();
  const all = [...firebaseMsgs];

  // P2P mesajlarından yalnızca Firebase'de olmayanları ekle
  for (const msg of p2pMsgs) {
    const key = `${msg.sender}_${msg.content}_${Math.floor(msg.timestamp / 2000)}`;
    if (!seen.has(key) && !firebaseMsgs.some(fm =>
      fm.sender === msg.sender &&
      Math.abs(fm.timestamp - msg.timestamp) < 3000 &&
      fm.content === msg.content
    )) {
      all.push(msg);
    }
    seen.add(key);
  }

  return all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}
