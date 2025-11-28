// src/notifications/config/notification-types.config.ts

export enum RefinedNotificationType {
  // Call types
  CALL_VIDEO = 'call_video',
  CALL_AUDIO = 'call_audio',
  
  // Message/Chat types
  MESSAGE_DIRECT = 'message_direct',
  CHAT_GROUP = 'chat_group',
  
  // Event types
  LIVE_EVENT_STARTED = 'live_event_started',
  LIVE_EVENT_REMINDER = 'live_event_reminder',
  
  // System types
  SYSTEM_PROMOTIONAL = 'system_promotional',
  
  // Security types
  FORCE_LOGOUT = 'force_logout',
}

export interface NotificationTypeConfig {
  priority: 'low' | 'medium' | 'high' | 'urgent';
  sound: string;
  androidChannelId: string;
  iosCategory?: string;
  isFullScreen: boolean;
  vibrate: boolean;
  foregroundBehavior: 'banner' | 'modal' | 'toast' | 'full-screen' | 'none';
  backgroundBehavior: 'heads-up' | 'standard' | 'full-screen' | 'silent';
}

export const NOTIFICATION_TYPE_CONFIGS: Record<string, NotificationTypeConfig> = {
  // ========================================
  // CALL NOTIFICATIONS
  // ========================================
  [RefinedNotificationType.CALL_VIDEO]: {
    priority: 'urgent',
    sound: 'call_ringtone.mp3',
    androidChannelId: 'call-channel',
    iosCategory: 'call',
    isFullScreen: true,
    vibrate: true,
    foregroundBehavior: 'full-screen',
    backgroundBehavior: 'full-screen',
  },
  [RefinedNotificationType.CALL_AUDIO]: {
    priority: 'urgent',
    sound: 'call_ringtone.mp3',
    androidChannelId: 'call-channel',
    iosCategory: 'call',
    isFullScreen: true,
    vibrate: true,
    foregroundBehavior: 'full-screen',
    backgroundBehavior: 'full-screen',
  },

  // ========================================
  // MESSAGE/CHAT NOTIFICATIONS
  // ========================================
  [RefinedNotificationType.MESSAGE_DIRECT]: {
    priority: 'high',
    sound: 'message_tone.mp3',
    androidChannelId: 'message-channel',
    iosCategory: 'message',
    isFullScreen: false,
    vibrate: true,
    foregroundBehavior: 'banner',
    backgroundBehavior: 'heads-up',
  },
  [RefinedNotificationType.CHAT_GROUP]: {
    priority: 'high',
    sound: 'chat_tone.mp3',
    androidChannelId: 'chat-channel',
    iosCategory: 'message',
    isFullScreen: false,
    vibrate: true,
    foregroundBehavior: 'banner',
    backgroundBehavior: 'heads-up',
  },

  // ========================================
  // LIVE EVENT NOTIFICATIONS
  // ========================================
  [RefinedNotificationType.LIVE_EVENT_STARTED]: {
    priority: 'high',
    sound: 'event_alert.mp3',
    androidChannelId: 'event-channel',
    iosCategory: 'event',
    isFullScreen: false,
    vibrate: true,
    foregroundBehavior: 'modal',
    backgroundBehavior: 'heads-up',
  },
  [RefinedNotificationType.LIVE_EVENT_REMINDER]: {
    priority: 'high',
    sound: 'event_alert.mp3',
    androidChannelId: 'event-channel',
    iosCategory: 'event',
    isFullScreen: false,
    vibrate: true,
    foregroundBehavior: 'modal',
    backgroundBehavior: 'heads-up',
  },

  // ========================================
  // SYSTEM/PROMOTIONAL NOTIFICATIONS
  // ========================================
  [RefinedNotificationType.SYSTEM_PROMOTIONAL]: {
    priority: 'medium',
    sound: 'subtle_tone.mp3',
    androidChannelId: 'system-channel',
    isFullScreen: false,
    vibrate: false,
    foregroundBehavior: 'toast',
    backgroundBehavior: 'standard',
  },

  // ========================================
  // FORCE LOGOUT
  // ========================================
  [RefinedNotificationType.FORCE_LOGOUT]: {
    priority: 'urgent',
    sound: 'alert.mp3',
    androidChannelId: 'security-channel',
    isFullScreen: false,
    vibrate: true,
    foregroundBehavior: 'modal',
    backgroundBehavior: 'silent', // ✅ As per your requirement
  },
};

/**
 * Get notification configuration for a specific type
 */
export function getNotificationConfig(type: string): NotificationTypeConfig {
  return NOTIFICATION_TYPE_CONFIGS[type] || {
    priority: 'medium',
    sound: 'default',
    androidChannelId: 'default-channel',
    isFullScreen: false,
    vibrate: true,
    foregroundBehavior: 'banner',
    backgroundBehavior: 'standard',
  };
}

/**
 * Check if notification type requires real-time Socket.io delivery
 */
export function shouldUseSocketIo(type: string): boolean {
  const realTimeTypes = [
    RefinedNotificationType.MESSAGE_DIRECT,
    RefinedNotificationType.CHAT_GROUP,
    'chat_message', // Keep existing type for backward compatibility
  ];
  
  return realTimeTypes.includes(type as any);
}
