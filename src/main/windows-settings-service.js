import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';
import { spawnDetached } from './process-runner.js';

export const CONTRAST_SETTINGS_URI = 'ms-settings:easeofaccess-highcontrast';

export class WindowsSettingsService {
  constructor(options = {}) {
    this.fs = options.fs ?? fs;
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.launch = options.launch ?? spawnDetached;
  }

  async openContrastSettings() {
    if (this.platform !== 'win32') {
      throw new AppError('WINDOWS_REQUIRED', 'Windows contrast settings are available only on Windows.');
    }
    const windowsDirectory = this.env.SystemRoot ?? this.env.WINDIR;
    if (!windowsDirectory || !path.isAbsolute(windowsDirectory)) {
      throw new AppError('WINDOWS_SETTINGS_UNAVAILABLE', 'Windows Settings could not be located.');
    }
    const executable = path.resolve(windowsDirectory, 'explorer.exe');
    try {
      if (!(await this.fs.stat(executable)).isFile()) throw new Error('not a file');
    } catch (error) {
      throw new AppError('WINDOWS_SETTINGS_UNAVAILABLE', 'Windows Settings could not be located.', { cause: error });
    }
    const launched = await this.launch(executable, [CONTRAST_SETTINGS_URI], {
      shell: false,
      windowsHide: false
    });
    return { launched: true, pid: launched.pid ?? null };
  }
}
