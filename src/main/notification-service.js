import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import {
  requireIdentifier,
  requirePlainObject,
  requireString
} from './validation.js';

const LEVELS = /^(?:info|success|warning|error|progress)$/;

export class NotificationService {
  constructor(state, options = {}) {
    this.state = state;
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.maximum = options.maximum ?? 500;
  }

  async list(input = {}) {
    const payload = input === undefined ? {} : requirePlainObject(input, 'notification query');
    const includeDismissed = payload.includeDismissed === true;
    const records = await this.state.getRecords();
    return records.notifications
      .filter((notification) => includeDismissed || !notification.dismissedAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async add(input) {
    const payload = requirePlainObject(input, 'notification');
    const notification = {
      id: this.id(),
      level: requireString(payload.level ?? 'info', 'notification level', { pattern: LEVELS }),
      title: requireString(payload.title, 'notification title', { maxLength: 120 }),
      body: requireString(payload.body, 'notification body', { minLength: 0, maxLength: 2_000 }),
      createdAt: this.now().toISOString(),
      dismissedAt: null
    };
    const result = await this.state.updateRecords((records) => ({
      ...records,
      notifications: [...records.notifications, notification].slice(-this.maximum)
    }), 'notification recorded');
    return { notification, history: result.history };
  }

  async dismiss(input) {
    const payload = typeof input === 'string' ? { id: input } : requirePlainObject(input, 'dismiss request');
    const id = requireIdentifier(payload.id, 'notification identifier');
    let found = false;
    const dismissedAt = this.now().toISOString();
    const result = await this.state.updateRecords((records) => ({
      ...records,
      notifications: records.notifications.map((notification) => {
        if (notification.id !== id) return notification;
        found = true;
        return { ...notification, dismissedAt: notification.dismissedAt ?? dismissedAt };
      })
    }), 'notification dismissed');
    if (!found) {
      throw new AppError('NOTIFICATION_NOT_FOUND', 'The notification was not found.');
    }
    return { dismissed: true, id, history: result.history };
  }

  async clearDismissed() {
    const result = await this.state.updateRecords((records) => ({
      ...records,
      notifications: records.notifications.filter((notification) => !notification.dismissedAt)
    }), 'notification history cleared');
    return { cleared: true, history: result.history };
  }
}
