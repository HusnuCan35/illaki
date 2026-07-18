import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Paperclip, Smile, Hash, Users, Copy,
  Check, Phone, Video, Lock, Image, FileText,
  Play, X, Upload, Settings, LogOut, Volume2, Music, Menu,
  Reply, Edit2, Trash2, Dices, Gamepad2
} from 'lucide-react';
import { GameZone } from './GameZone';
import {
  useMessageStore, useSpaceStore, useIdentityStore,
  usePeerStore, useUIStore,
} from '../stores';
import { sendEncryptedMessage, subscribeToMessages, uploadMedia } from '../lib/firestore';
import { processMediaFile, formatFileSize } from '../lib/mediaProcessor';
import EmojiPicker from 'emoji-picker-react';
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

function MessageGroup({ group, onReply, onDelete, onEdit, onReact, identity }) {
  return (
    <div className={`${styles.msgGroup} ${group.own ? styles.own : ''}`}>
      {!group.own && group.type !== 'system' && <AvatarMini username={group.sender} />}
      <div className={styles.msgContent}>
        {!group.own && group.type !== 'system' && <div className={styles.msgSender}>{group.sender}</div>}
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
            />
          ))}
        </div>
      </div>
      {group.own && group.type !== 'system' && <AvatarMini username={group.sender} own />}
    </div>
  );
}

function MessageBubble({ msg, group, onReply, onDelete, onEdit, onReact, identity }) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

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
      onMouseLeave={() => setShowActions(false)}
    >
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

      {showActions && !isEditing && (
        <div className={`${styles.msgActions} ${group.own ? styles.msgActionsRight : styles.msgActionsLeft}`}>
          <button className={styles.actionBtn} onClick={() => onReact(msg.id, '👍')} title="Beğen"><Smile size={14} /></button>
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

function ScreenViewer({ stream, label, onStop }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  if (!stream) return null;
  return (
    <div className={styles.screenViewer}>
      <div className={styles.screenLabel}>
        {label} Ekran Paylaşıyor
        {onStop && <button className={styles.stopScreenBtn} onClick={onStop}>Durdur</button>}
      </div>
      <video ref={videoRef} autoPlay playsInline className={styles.screenVideo} />
    </div>
  );
}

export function ChatArea({ sendMessage: sendP2PMessage, onToggleMembers, onToggleMusic, rightPanel, screenShare, onOpenSettings, onToggleSidebar }) {
  const { addMessage, getMessages } = useMessageStore();
  const { activeSpaceId, getActiveSpace, activeChannelId, channels } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { peers } = usePeerStore();
  const { addToast } = useUIStore();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGameZone, setShowGameZone] = useState(false);
  const [firebaseMessages, setFirebaseMessages] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null); // { fileName, progress }

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const unsubscribeRef = useRef(null);

  const activeSpace = getActiveSpace();
  const spaceChannels = activeSpaceId ? channels[activeSpaceId] || [] : [];
  const activeChannel = spaceChannels.find(c => c.id === activeChannelId);
  const onlinePeers = Object.keys(peers).length;

  const [replyingTo, setReplyingTo] = useState(null);

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
          if (roll > 0.95) { // %5 şans
            pointsAwarded = 1000;
            gameResult = `🎰 **JACKPOT!** İnanılmaz bir şans! Büyük ödülü kazandın! (+${pointsAwarded} Puan)`;
          } else {
            gameResult = `🎰 Jackpot denedi ama kazanamadı. Bol şans...`;
          }
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
            onClick={onToggleSidebar}
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
              <span className={styles.onlineCount}>
                <span className={styles.onlineDot} aria-hidden="true" />
                {onlinePeers} bağlı
              </span>
              <span className={styles.e2eBadge}>
                <Lock size={10} /> E2E
              </span>
            </div>
          </div>
        </div>

        <div className={styles.headerActions}>
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

      {/* Upload indicator */}
      {uploadProgress && (
        <UploadIndicator progress={uploadProgress.progress} fileName={uploadProgress.fileName} />
      )}

      {/* Screen Share (Pinned to Top) */}
      {screenShare?.remoteScreenStream && (
        <ScreenViewer stream={screenShare.remoteScreenStream} label={screenShare.remoteSharer} />
      )}
      {screenShare?.localScreenStream && !screenShare?.remoteScreenStream && (
        <ScreenViewer
          stream={screenShare.localScreenStream}
          label="Sen"
          onStop={() => screenShare.stopScreenShare()}
        />
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
              onReact={(msgId, emoji) => {
                import('../lib/firestore').then(({ toggleMessageReaction }) => {
                  toggleMessageReaction(activeSpaceId, activeChannelId, msgId, identity.uid, emoji)
                    .catch(console.error);
                });
              }}
              identity={identity}
            />
          ))
        )}
        <div ref={messagesEndRef} aria-hidden="true" />
      </main>

      {/* Input */}
      <footer className={styles.inputArea}>
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

          <button
            className={styles.inputAction}
            onClick={() => setShowGameZone(!showGameZone)}
            title="Mini Oyunlar"
          >
            <Gamepad2 size={18} />
          </button>
          {showGameZone && (
            <GameZone 
              onClose={() => setShowGameZone(false)}
              onGameCommand={(cmd) => handleSend(cmd)}
            />
          )}

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
