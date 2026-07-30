// Types partagés pour les providers de push (FCM + APNs).

export type NotificationKind = 'due_reminder' | 'streak_danger' | 'deck_updated';

export interface PushPayload {
  to: string;
  notification: {
    title: string;
    body: string;
  };
  data: {
    kind: NotificationKind;
    deeplink?: string;
  };
}

export interface PushProvider {
  send(args: {
    deviceToken: string;
    payload: Omit<PushPayload, 'to'>;
  }): Promise<{ sent: boolean; reason?: string }>;
}
