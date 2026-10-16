import { describe, it, expect, vi } from 'vitest';
import {
  validateBotEnvironment,
  validateServerEnvironment,
  validateEnvironment,
} from '../src/env.js';

describe('Environment Validation (src/env.js)', () => {
  const validBotEnv = {
    DISCORD_TOKEN: 'valid_bot_token_1234567890',
  };

  const validServerEnv = {
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_CLIENT_SECRET: 'valid_client_secret_xyz',
    DISCORD_REDIRECT_URI: 'https://example.com/auth/callback',
    SESSION_SECRET: 'super_secret_session_key_that_is_at_least_32_characters_long',
  };

  const validFullEnv = {
    ...validBotEnv,
    ...validServerEnv,
  };

  describe('validateBotEnvironment', () => {
    it('passes with minimal valid bot environment in development', () => {
      expect(() => validateBotEnvironment({ ...validBotEnv, NODE_ENV: 'development' })).not.toThrow();
    });

    it('throws error when DISCORD_TOKEN is missing or blank', () => {
      expect(() => validateBotEnvironment({})).toThrow(/Missing required env: DISCORD_TOKEN/);
      expect(() => validateBotEnvironment({ DISCORD_TOKEN: '   ' })).toThrow(/Missing required env: DISCORD_TOKEN/);
    });

    it('requires UPSTASH credentials in production mode', () => {
      const prodEnv = {
        ...validBotEnv,
        NODE_ENV: 'production',
      };
      expect(() => validateBotEnvironment(prodEnv)).toThrow(/UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN/);

      const prodEnvWithRedis = {
        ...prodEnv,
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'valid_token_123',
      };
      expect(() => validateBotEnvironment(prodEnvWithRedis)).not.toThrow();
    });

    it('warns when placeholder or weak credentials are used', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const weakEnv = {
        DISCORD_TOKEN: 'your_discord_bot_token',
        RIOT_API_KEY: 'dev-secret-change-me',
      };

      expect(() => validateBotEnvironment(weakEnv)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Placeholder/weak values detected'));
      warnSpy.mockRestore();
    });
  });

  describe('validateServerEnvironment', () => {
    it('passes with valid server environment in development', () => {
      expect(() => validateServerEnvironment({ ...validServerEnv, NODE_ENV: 'development' })).not.toThrow();
    });

    it('throws error when required server variables are missing', () => {
      expect(() => validateServerEnvironment({})).toThrow(/Missing required env: DISCORD_CLIENT_ID/);
      
      const partial = {
        DISCORD_CLIENT_ID: '123',
      };
      expect(() => validateServerEnvironment(partial)).toThrow(/DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, SESSION_SECRET/);
    });

    it('requires UPSTASH in production for server process', () => {
      const prodEnv = {
        ...validServerEnv,
        NODE_ENV: 'production',
      };
      expect(() => validateServerEnvironment(prodEnv)).toThrow(/UPSTASH_REDIS_REST_URL/);

      const validProdServer = {
        ...prodEnv,
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'valid_token_123',
      };
      expect(() => validateServerEnvironment(validProdServer)).not.toThrow();
    });

    it('warns when SESSION_SECRET is too short (< 32 chars) or uses placeholder', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const shortSecretEnv = {
        ...validServerEnv,
        SESSION_SECRET: 'short_secret',
      };

      expect(() => validateServerEnvironment(shortSecretEnv)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SESSION_SECRET (quá ngắn, cần ≥32 ký tự)'));

      const placeholderEnv = {
        ...validServerEnv,
        DISCORD_CLIENT_SECRET: 'your_application_client_secret',
      };
      expect(() => validateServerEnvironment(placeholderEnv)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Placeholder/weak values'));
      warnSpy.mockRestore();
    });
  });

  describe('validateEnvironment (monolith legacy)', () => {
    it('validates both bot and server variables together', () => {
      expect(() => validateEnvironment(validFullEnv)).not.toThrow();
      expect(() => validateEnvironment(validBotEnv)).toThrow(/Missing required env: DISCORD_CLIENT_ID/);
    });
  });
});
