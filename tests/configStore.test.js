import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/configDefaults.js';

describe('Config Defaults & Patching', () => {
  it('should contain default values for prefix and disabledCommands', () => {
    expect(defaultConfig.prefix).toBe('!');
    expect(Array.isArray(defaultConfig.disabledCommands)).toBe(true);
    expect(defaultConfig.disabledCommands.length).toBe(0);
  });

  it('should contain core commands', () => {
    expect(Array.isArray(defaultConfig.core?.commands)).toBe(true);
    const pingCmd = defaultConfig.core.commands.find(c => c.name === 'ping');
    expect(pingCmd).toBeDefined();
    expect(pingCmd?.type).toBe('ping');
  });
});
