import { Injectable } from '@nestjs/common';
import { NotificationData } from './fcm.service';

@Injectable()
export class NotificationTemplatesService {
  
  // Normal notifications (chat messages, session updates, etc.)
  createNormalNotification(title: string, body: string, data: { [key: string]: string }): NotificationData {
    return {
      title,
      body,
      data: {
        ...data,
        notificationType: 'normal'
      }
    };
  }

  // Live event notifications (astrologer goes live, live events)
  createLiveEventNotification(title: string, body: string, data: { [key: string]: string }): NotificationData {
    return {
      title,
      body,
      data: {
        ...data,
        notificationType: 'liveEvents'
      }
    };
  }

  // Chat message notification (normal type)
  createChatMessageNotification(senderName: string, message: string, sessionId: string): NotificationData {
    return this.createNormalNotification(
      `Message from ${senderName}`,
      message.length > 100 ? `${message.substring(0, 100)}...` : message,
      {
        type: 'chat_message',
        sessionId,
        senderName,
        clickAction: 'CHAT_MESSAGE'
      }
    );
  }

  // Session start notification (normal type)
  createSessionStartNotification(astrologerName: string, sessionType: 'chat' | 'call'): NotificationData {
    return this.createNormalNotification(
      `${sessionType === 'chat' ? 'Chat' : 'Call'} session started`,
      `Your ${sessionType} session with ${astrologerName} has started`,
      {
        type: 'session_start',
        sessionType,
        astrologerName,
        clickAction: sessionType === 'chat' ? 'CHAT_SESSION' : 'CALL_SESSION'
      }
    );
  }

  // Session end notification (normal type)
  createSessionEndNotification(astrologerName: string, duration: number): NotificationData {
    const durationText = duration > 60 
      ? `${Math.floor(duration / 60)} min ${duration % 60} sec`
      : `${duration} sec`;

    return this.createNormalNotification(
      'Session completed',
      `Your session with ${astrologerName} lasted ${durationText}`,
      {
        type: 'session_end',
        astrologerName,
        duration: duration.toString(),
        clickAction: 'SESSION_SUMMARY'
      }
    );
  }

  // Astrologer goes live notification (live event type) - RENAMED to avoid conflict
  createAstrologerLiveNotification(astrologerName: string): NotificationData {
    return this.createLiveEventNotification(
      `${astrologerName} is now LIVE`,
      `Join the live session with ${astrologerName}`,
      {
        type: 'astrologer_live',
        astrologerName,
        clickAction: 'LIVE_SESSION'
      }
    );
  }

  // Special live event starting notification - RENAMED to avoid conflict
  createSpecialLiveEventNotification(eventTitle: string, eventDescription: string): NotificationData {
    return this.createLiveEventNotification(
      eventTitle,
      eventDescription,
      {
        type: 'special_live_event',
        clickAction: 'LIVE_EVENT'
      }
    );
  }

  // Wallet recharge notification (normal type)
  createWalletRechargeNotification(amount: number): NotificationData {
    return this.createNormalNotification(
      'Wallet recharged successfully',
      `₹${amount} has been added to your wallet`,
      {
        type: 'wallet_recharge',
        amount: amount.toString(),
        clickAction: 'WALLET'
      }
    );
  }

  // Low balance notification (normal type)
  createLowBalanceNotification(): NotificationData {
    return this.createNormalNotification(
      'Low wallet balance',
      'Your wallet balance is running low. Recharge now to continue sessions.',
      {
        type: 'low_balance',
        clickAction: 'WALLET_RECHARGE'
      }
    );
  }
}
