import { describe, it, expect } from 'vitest';
import { calculateNextReminderTime, REPEAT_INTERVALS_MS } from '../src/bot/reminderWorker.js';
import { reminderService } from '../dashboard/src/domains/utility/services/reminder.service.js';

describe('Reminder Worker & Frequency Logic', () => {
  describe('calculateNextReminderTime', () => {
    it('should return null when repeat is "none" or unsupported', () => {
      const now = new Date('2025-01-01T10:00:00.000Z').getTime();
      expect(calculateNextReminderTime('2025-01-01T10:00:00.000Z', 'none', now)).toBeNull();
      expect(calculateNextReminderTime('2025-01-01T10:00:00.000Z', 'invalid', now)).toBeNull();
    });

    it('should handle "hourly" repeat correctly', () => {
      const start = '2025-01-01T10:00:00.000Z';
      const referenceNow = new Date('2025-01-01T10:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'hourly', referenceNow);
      expect(next).toBe('2025-01-01T11:00:00.000Z');
    });

    it('should handle "daily" repeat correctly', () => {
      const start = '2025-01-01T10:00:00.000Z';
      const referenceNow = new Date('2025-01-01T10:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'daily', referenceNow);
      expect(next).toBe('2025-01-02T10:00:00.000Z');
    });

    it('should handle "weekly" repeat correctly', () => {
      const start = '2025-01-01T10:00:00.000Z';
      const referenceNow = new Date('2025-01-01T10:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'weekly', referenceNow);
      expect(next).toBe('2025-01-08T10:00:00.000Z');
    });

    it('should handle standard "monthly" advance across normal months', () => {
      const start = '2025-01-15T10:00:00.000Z';
      const referenceNow = new Date('2025-01-15T10:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'monthly', referenceNow);
      const nextDate = new Date(next);
      expect(nextDate.getUTCFullYear()).toBe(2025);
      expect(nextDate.getUTCMonth()).toBe(1); // Feb (0-indexed: 1)
      expect(nextDate.getUTCDate()).toBe(15);
      expect(nextDate.getUTCHours()).toBe(10);
    });

    it('should handle "monthly" day clamping for month-end in non-leap year (Jan 31 -> Feb 28)', () => {
      const start = '2025-01-31T12:00:00.000Z';
      const referenceNow = new Date('2025-01-31T12:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'monthly', referenceNow);
      const nextDate = new Date(next);
      expect(nextDate.getUTCFullYear()).toBe(2025);
      expect(nextDate.getUTCMonth()).toBe(1); // February
      expect(nextDate.getUTCDate()).toBe(28); // Clamped to 28
    });

    it('should handle "monthly" day clamping for leap year (Jan 31, 2024 -> Feb 29, 2024)', () => {
      const start = '2024-01-31T12:00:00.000Z';
      const referenceNow = new Date('2024-01-31T12:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'monthly', referenceNow);
      const nextDate = new Date(next);
      expect(nextDate.getUTCFullYear()).toBe(2024);
      expect(nextDate.getUTCMonth()).toBe(1); // February
      expect(nextDate.getUTCDate()).toBe(29); // Clamped to 29 in leap year
    });

    it('should handle "monthly" 30-day month clamping (March 31 -> April 30)', () => {
      const start = '2025-03-31T08:00:00.000Z';
      const referenceNow = new Date('2025-03-31T08:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'monthly', referenceNow);
      const nextDate = new Date(next);
      expect(nextDate.getUTCFullYear()).toBe(2025);
      expect(nextDate.getUTCMonth()).toBe(3); // April
      expect(nextDate.getUTCDate()).toBe(30); // Clamped to 30
    });

    it('should handle "monthly" year rollover (Dec 15, 2025 -> Jan 15, 2026)', () => {
      const start = '2025-12-15T09:30:00.000Z';
      const referenceNow = new Date('2025-12-15T09:30:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'monthly', referenceNow);
      const nextDate = new Date(next);
      expect(nextDate.getUTCFullYear()).toBe(2026);
      expect(nextDate.getUTCMonth()).toBe(0); // January
      expect(nextDate.getUTCDate()).toBe(15);
    });

    it('should catch up stale reminders over multiple elapsed intervals', () => {
      // Reminder from 3 months ago: Nov 10, 2024. Current time: Jan 20, 2025.
      const start = '2024-11-10T12:00:00.000Z';
      const referenceNow = new Date('2025-01-20T00:00:00.000Z').getTime();
      const next = calculateNextReminderTime(start, 'monthly', referenceNow);
      const nextDate = new Date(next);
      // Next occurrence after Jan 20 must be Feb 10, 2025
      expect(nextDate.getUTCFullYear()).toBe(2025);
      expect(nextDate.getUTCMonth()).toBe(1); // February
      expect(nextDate.getUTCDate()).toBe(10);
      expect(nextDate.getTime()).toBeGreaterThan(referenceNow);
    });

    it('should return null for invalid date ISO string', () => {
      expect(calculateNextReminderTime('invalid-date', 'monthly', Date.now())).toBeNull();
    });
  });

  describe('dashboard reminderService validation', () => {
    it('should accept "monthly" as a valid repeat interval', () => {
      const raw = {
        id: 'rem_123',
        channelId: '123456789012345678',
        message: 'Monthly report',
        time: '2025-01-01T00:00:00.000Z',
        repeat: 'monthly',
      };
      const validated = reminderService.validateReminder(raw);
      expect(validated.repeat).toBe('monthly');
    });

    it('should fallback invalid repeat to "none"', () => {
      const raw = {
        id: 'rem_123',
        channelId: '123456789012345678',
        message: 'Test',
        time: '2025-01-01T00:00:00.000Z',
        repeat: 'yearly',
      };
      const validated = reminderService.validateReminder(raw);
      expect(validated.repeat).toBe('none');
    });
  });
});
