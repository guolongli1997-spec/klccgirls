// chat.ts
export interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'file' | 'system';
  fileUrl?: string;
  fileSize?: number;
  fileName?: string;
  fileType?: string;
  replyTo?: string;
  editedAt?: Date;
  deleted?: boolean;
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatUser {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen?: Date;
  typing: boolean;
  typingTimeout?: NodeJS.Timeout;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: 'direct' | 'group' | 'channel';
  participants: ChatUser[];
  lastMessage?: Message;
  unreadCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  metadata?: Record<string, any>;
}

export interface TypingIndicator {
  userId: string;
  username: string;
  roomId: string;
  isTyping: boolean;
}

export interface ChatState {
  rooms: ChatRoom[];
  currentRoomId: string | null;
  messages: Record<string, Message[]>;
  users: Record<string, ChatUser>;
  isLoading: boolean;
  error: string | null;
}

// services/chatService.ts
import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

export interface ChatServiceConfig {
  serverUrl: string;
  apiKey?: string;
  accountId?: string;
  namespace?: string;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export class ChatService extends EventEmitter {
  private socket: Socket | null = null;
  private currentRoomId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnected = false;
  private userId: string | null = null;
  private messageCache: Map<string, Message[]> = new Map();
  private readonly config: ChatServiceConfig;

  constructor(config: ChatServiceConfig) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      ...config
    };
    this.maxReconnectAttempts = this.config.reconnectAttempts || 5;
  }

  connect(userId: string, token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.userId = userId;
    
    this.socket = io(this.config.serverUrl, {
      auth: { 
        token,
        userId,
        apiKey: this.config.apiKey,
        accountId: this.config.accountId
      },
      transports: ['websocket'],
      reconnection: this.config.autoReconnect,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.config.reconnectDelay,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to chat server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected', { userId: this.userId });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from chat server:', reason);
      this.isConnected = false;
      this.emit('disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('connection_failed', { error: error.message });
      }
    });

    // Message events
    this.socket.on('message', (message: Message) => {
      this.handleNewMessage(message);
    });

    this.socket.on('message_history', ({ roomId, messages }: { roomId: string; messages: Message[] }) => {
      this.messageCache.set(roomId, messages);
      this.emit('history_received', { roomId, messages });
    });

    this.socket.on('message_updated', ({ messageId, updates }: { messageId: string; updates: Partial<Message> }) => {
      this.emit('message_updated', { messageId, updates });
    });

    this.socket.on('message_deleted', ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      this.emit('message_deleted', { messageId, roomId });
    });

    // Typing indicators
    this.socket.on('typing', (indicator: TypingIndicator) => {
      this.emit('user_typing', indicator);
    });

    // User events
    this.socket.on('user_joined', (user: ChatUser) => {
      this.emit('user_joined', user);
    });

    this.socket.on('user_left', ({ userId, roomId }: { userId: string; roomId: string }) => {
      this.emit('user_left', { userId, roomId });
    });

    this.socket.on('user_status', (user: ChatUser) => {
      this.emit('user_status', user);
    });

    // Room events
    this.socket.on('room_created', (room: ChatRoom) => {
      this.emit('room_created', room);
    });

    this.socket.on('room_updated', (room: ChatRoom) => {
      this.emit('room_updated', room);
    });

    this.socket.on('room_deleted', (roomId: string) => {
      this.emit('room_deleted', roomId);
    });

    // Read receipts
    this.socket.on('message_read', ({ messageId, userId, roomId }: { messageId: string; userId: string; roomId: string }) => {
      this.emit('message_read', { messageId, userId, roomId });
    });

    this.socket.on('messages_read', ({ roomId, userId, timestamp }: { roomId: string; userId: string; timestamp: Date }) => {
      this.emit('messages_read', { roomId, userId, timestamp });
    });

    // Error handling
    this.socket.on('error', (error: { code: string; message: string }) => {
      console.error('Chat error:', error);
      this.emit('error', error);
    });
  }

  private handleNewMessage(message: Message): void {
    const roomMessages = this.messageCache.get(message.id) || [];
    roomMessages.push(message);
    this.messageCache.set(message.id, roomMessages);
    this.emit('message_received', message);
  }

  // Room Management
  joinRoom(roomId: string): Promise<{ success: boolean; room?: ChatRoom; error?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('join_room', roomId, (response: { success: boolean; room?: ChatRoom; error?: string }) => {
        if (response.success) {
          this.currentRoomId = roomId;
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to join room'));
        }
      });
    });
  }

  leaveRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('leave_room', roomId, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          if (this.currentRoomId === roomId) {
            this.currentRoomId = null;
          }
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to leave room'));
        }
      });
    });
  }

  createRoom(roomData: Partial<ChatRoom>): Promise<ChatRoom> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('create_room', roomData, (response: { success: boolean; room?: ChatRoom; error?: string }) => {
        if (response.success && response.room) {
          resolve(response.room);
        } else {
          reject(new Error(response.error || 'Failed to create room'));
        }
      });
    });
  }

  // Message Operations
  sendMessage(content: string, type: Message['type'] = 'text', options?: {
    replyTo?: string;
    fileData?: any;
  }): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      if (!this.currentRoomId) {
        reject(new Error('Not in a room'));
        return;
      }

      const messageData = {
        roomId: this.currentRoomId,
        content,
        type,
        replyTo: options?.replyTo,
        ...options?.fileData,
        timestamp: new Date(),
      };

      this.socket.emit('send_message', messageData, (response: { success: boolean; message?: Message; error?: string }) => {
        if (response.success && response.message) {
          this.handleNewMessage(response.message);
          resolve(response.message);
        } else {
          reject(new Error(response.error || 'Failed to send message'));
        }
      });
    });
  }

  editMessage(messageId: string, content: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('edit_message', { messageId, content }, (response: { success: boolean; message?: Message; error?: string }) => {
        if (response.success && response.message) {
          resolve(response.message);
        } else {
          reject(new Error(response.error || 'Failed to edit message'));
        }
      });
    });
  }

  deleteMessage(messageId: string, roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('delete_message', { messageId, roomId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to delete message'));
        }
      });
    });
  }

  addReaction(messageId: string, emoji: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('add_reaction', { messageId, emoji }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to add reaction'));
        }
      });
    });
  }

  removeReaction(messageId: string, emoji: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('remove_reaction', { messageId, emoji }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to remove reaction'));
        }
      });
    });
  }

  // Typing Indicator
  sendTyping(isTyping: boolean, roomId?: string): void {
    if (!this.socket || !this.isConnected) return;

    const targetRoomId = roomId || this.currentRoomId;
    if (!targetRoomId) return;

    this.socket.emit('typing', { roomId: targetRoomId, isTyping });
  }

  // File Upload
  async uploadFile(file: File): Promise<string> {
    // Implementation using Cloudflare R2
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', this.userId || '');
    formData.append('roomId', this.currentRoomId || '');

    const response = await fetch(`${this.config.serverUrl}/api/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${this.socket?.auth?.token}`
      }
    });

    if (!response.ok) {
      throw new Error('File upload failed');
    }

    const data = await response.json();
    return data.fileUrl;
  }

  // Message History
  getMessageHistory(roomId: string, limit: number = 50, before?: Date): Promise<Message[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const cached = this.messageCache.get(roomId);
      if (cached && !before) {
        resolve(cached);
        return;
      }

      this.socket.emit('get_history', { roomId, limit, before }, (response: { success: boolean; messages?: Message[]; error?: string }) => {
        if (response.success && response.messages) {
          this.messageCache.set(roomId, response.messages);
          resolve(response.messages);
        } else {
          reject(new Error(response.error || 'Failed to get message history'));
        }
      });
    });
  }

  // Search Messages
  searchMessages(roomId: string, query: string): Promise<Message[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('search_messages', { roomId, query }, (response: { success: boolean; messages?: Message[]; error?: string }) => {
        if (response.success && response.messages) {
          resolve(response.messages);
        } else {
          reject(new Error(response.error || 'Failed to search messages'));
        }
      });
    });
  }

  // User Management
  getUserStatus(userId: string): Promise<ChatUser> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('get_user_status', userId, (response: { success: boolean; user?: ChatUser; error?: string }) => {
        if (response.success && response.user) {
          resolve(response.user);
        } else {
          reject(new Error(response.error || 'Failed to get user status'));
        }
      });
    });
  }

  updateUserStatus(status: ChatUser['status']): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('update_status', status, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to update status'));
        }
      });
    });
  }

  // Read Receipts
  markMessageRead(messageId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('mark_read', { messageId, roomId: this.currentRoomId }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to mark message as read'));
        }
      });
    });
  }

  markAllRead(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('mark_all_read', roomId, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to mark all as read'));
        }
      });
    });
  }

  // Disconnect
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentRoomId = null;
      this.userId = null;
      this.messageCache.clear();
      this.emit('disconnected', { reason: 'manual' });
    }
  }

  // Utility Methods
  isConnectedToChat(): boolean {
    return this.isConnected && this.socket?.connected || false;
  }

  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  getCachedMessages(roomId: string): Message[] {
    return this.messageCache.get(roomId) || [];
  }

  clearCache(): void {
    this.messageCache.clear();
  }

  // Event Listeners (convenience methods)
  onMessage(callback: (message: Message) => void): void {
    this.on('message_received', callback);
  }

  onTyping(callback: (indicator: TypingIndicator) => void): void {
    this.on('user_typing', callback);
  }

  onUserJoined(callback: (user: ChatUser) => void): void {
    this.on('user_joined', callback);
  }

  onUserLeft(callback: (data: { userId: string; roomId: string }) => void): void {
    this.on('user_left', callback);
  }

  onError(callback: (error: { code: string; message: string }) => void): void {
    this.on('error', callback);
  }

  onConnected(callback: () => void): void {
    this.on('connected', callback);
  }

  onDisconnected(callback: (data: { reason: string }) => void): void {
    this.on('disconnected', callback);
  }

  removeAllListeners(event?: string): void {
    super.removeAllListeners(event);
  }
}

// hooks/useChat.ts
import { useState, useEffect, useCallback, useRef } from 'react';

export function useChat(service: ChatService, roomId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, ChatUser>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (roomId) {
      joinRoom(roomId);
    }

    const onConnected = () => setIsConnected(true);
    const onDisconnected = () => setIsConnected(false);
    const onMessage = (message: Message) => {
      setMessages(prev => [...prev, message]);
    };
    const onHistory = ({ messages: history }: { messages: Message[] }) => {
      setMessages(history);
      setIsLoading(false);
    };
    const onTyping = (indicator: TypingIndicator) => {
      setTypingUsers(prev => {
        const newMap = new Map(prev);
        if (indicator.isTyping) {
          newMap.set(indicator.userId, {
            id: indicator.userId,
            username: indicator.username,
            status: 'online',
            typing: true
          });
        } else {
          newMap.delete(indicator.userId);
        }
        return newMap;
      });
    };
    const onError = (err: { message: string }) => setError(err.message);

    service.on('connected', onConnected);
    service.on('disconnected', onDisconnected);
    service.on('message_received', onMessage);
    service.on('history_received', onHistory);
    service.on('user_typing', onTyping);
    service.on('error', onError);

    return () => {
      service.off('connected', onConnected);
      service.off('disconnected', onDisconnected);
      service.off('message_received', onMessage);
      service.off('history_received', onHistory);
      service.off('user_typing', onTyping);
      service.off('error', onError);
    };
  }, [service, roomId]);

  const joinRoom = useCallback(async (roomId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await service.joinRoom(roomId);
      currentRoomIdRef.current = roomId;
      const history = await service.getMessageHistory(roomId);
      setMessages(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  const sendMessage = useCallback(async (content: string, type: Message['type'] = 'text') => {
    if (!content.trim()) return;
    try {
      await service.sendMessage(content, type);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [service]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await service.editMessage(messageId, content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit message');
    }
  }, [service]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const roomId = currentRoomIdRef.current;
    if (!roomId) return;
    try {
      await service.deleteMessage(messageId, roomId);
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    }
  }, [service]);

  const sendTyping = useCallback((isTyping: boolean) => {
    service.sendTyping(isTyping);
  }, [service]);

  const markRead = useCallback(async (messageId: string) => {
    try {
      await service.markMessageRead(messageId);
    } catch (err) {
      console.error('Failed to mark message as read:', err);
    }
  }, [service]);

  return {
    messages,
    typingUsers,
    isConnected,
    isLoading,
    error,
    sendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    markRead,
    joinRoom,
    clearError: () => setError(null),
  };
}

// utils/chatHelpers.ts
export class ChatHelpers {
  static formatTimestamp(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
  }

  static groupMessagesByDate(messages: Message[]): Map<string, Message[]> {
    const groups = new Map<string, Message[]>();
    messages.forEach(msg => {
      const date = msg.timestamp.toDateString();
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(msg);
    });
    return groups;
  }

  static generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  static validateMessageContent(content: string): boolean {
    return content.trim().length > 0 && content.length <= 4000;
  }

  static sanitizeInput(input: string): string {
    return input.replace(/<[^>]*>/g, '').trim();
  }

  static getFileIcon(fileType: string): string {
    const icons: Record<string, string> = {
      'image': '📷',
      'video': '🎬',
      'audio': '🎵',
      'pdf': '📄',
      'word': '📝',
      'excel': '📊',
      'zip': '📦',
      'default': '📎'
    };
    return icons[fileType] || icons.default;
  }

  static isImage(fileType: string): boolean {
    return fileType.startsWith('image/');
  }

  static isVideo(fileType: string): boolean {
    return fileType.startsWith('video/');
  }

  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
    return `${(bytes / 1073741824).toFixed(1)}GB`;
  }
}

// Example usage with Cloudflare API token from your JSON
export class CloudflareChatService extends ChatService {
  constructor(config: ChatServiceConfig) {
    super({
      ...config,
      apiKey: config.apiKey || process.env.CLOUDFLARE_API_TOKEN,
      accountId: config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID,
    });
  }

  async uploadToR2(file: File, path: string): Promise<string> {
    // Implement R2 upload using Cloudflare API
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/r2/upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to upload to R2');
    }

    const data = await response.json();
    return data.result.url;
  }

  async storeMessageMetadata(messageId: string, metadata: Record<string, any>): Promise<void> {
    // Store metadata in Cloudflare KV
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/kv/namespaces/${this.config.namespace}/values/${messageId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to store message metadata');
    }
  }
}