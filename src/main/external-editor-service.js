import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ValidationError } from './errors.js';
import { spawnDetached } from './process-runner.js';
import {
  requireAbsolutePath,
  requireBoolean,
  requireIdentifier,
  requirePlainObject,
  requireString
} from './validation.js';

const EDITOR_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'vscode',
    name: 'Visual Studio Code',
    acceptsDirectories: true,
    candidates: [
      ['LOCALAPPDATA', 'Programs', 'Microsoft VS Code', 'Code.exe'],
      ['ProgramFiles', 'Microsoft VS Code', 'Code.exe'],
      ['ProgramFiles(x86)', 'Microsoft VS Code', 'Code.exe']
    ]
  }),
  Object.freeze({
    id: 'cursor',
    name: 'Cursor',
    acceptsDirectories: true,
    candidates: [
      ['LOCALAPPDATA', 'Programs', 'cursor', 'Cursor.exe'],
      ['ProgramFiles', 'Cursor', 'Cursor.exe']
    ]
  }),
  Object.freeze({
    id: 'notepad-plus-plus',
    name: 'Notepad++',
    acceptsDirectories: false,
    candidates: [
      ['ProgramFiles', 'Notepad++', 'notepad++.exe'],
      ['ProgramFiles(x86)', 'Notepad++', 'notepad++.exe']
    ]
  }),
  Object.freeze({
    id: 'sublime-text',
    name: 'Sublime Text',
    acceptsDirectories: true,
    candidates: [
      ['ProgramFiles', 'Sublime Text', 'sublime_text.exe'],
      ['ProgramFiles', 'Sublime Text 3', 'sublime_text.exe']
    ]
  }),
  Object.freeze({
    id: 'windows-notepad',
    name: 'Notepad',
    acceptsDirectories: false,
    candidates: [
      ['SystemRoot', 'System32', 'notepad.exe'],
      ['WINDIR', 'System32', 'notepad.exe']
    ]
  })
]);

async function pathType(fileSystem, candidate) {
  try {
    const stat = await fileSystem.stat(candidate);
    return stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : null;
  } catch {
    return null;
  }
}

function validateCustomEditor(input) {
  const editor = requirePlainObject(input, 'custom editor');
  const executable = requireAbsolutePath(editor.executable, 'editor executable');
  if (path.extname(executable).toLowerCase() !== '.exe') {
    throw new ValidationError('A custom editor must use a Windows executable.');
  }
  return {
    id: requireIdentifier(editor.id, 'editor identifier'),
    name: requireString(editor.name, 'editor name', { maxLength: 80 }),
    executable,
    acceptsDirectories: editor.acceptsDirectories === undefined
      ? true
      : requireBoolean(editor.acceptsDirectories, 'accepts directories'),
    source: 'custom'
  };
}

export class ExternalEditorService {
  constructor(options = {}) {
    this.fs = options.fs ?? fs;
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.launch = options.launch ?? spawnDetached;
  }

  async discover(customEditors = []) {
    if (this.platform !== 'win32') return [];
    const discovered = [];
    const seenExecutables = new Set();

    const override = this.env.MATERIAL_OFFICE_EDITOR;
    if (override && path.isAbsolute(override) && path.extname(override).toLowerCase() === '.exe') {
      const executable = path.resolve(override);
      if (await pathType(this.fs, executable) === 'file') {
        discovered.push({
          id: 'environment-editor',
          name: path.basename(executable, '.exe'),
          executable,
          acceptsDirectories: true,
          source: 'environment'
        });
        seenExecutables.add(executable.toLowerCase());
      }
    }

    for (const definition of EDITOR_DEFINITIONS) {
      for (const [environmentKey, ...segments] of definition.candidates) {
        const root = this.env[environmentKey];
        if (!root || !path.isAbsolute(root)) continue;
        const executable = path.resolve(root, ...segments);
        if (seenExecutables.has(executable.toLowerCase())) break;
        if (await pathType(this.fs, executable) === 'file') {
          discovered.push({
            id: definition.id,
            name: definition.name,
            executable,
            acceptsDirectories: definition.acceptsDirectories,
            source: 'standard-path'
          });
          seenExecutables.add(executable.toLowerCase());
          break;
        }
      }
    }

    if (!Array.isArray(customEditors) || customEditors.length > 20) {
      throw new ValidationError('Custom editors must be a list of at most 20 entries.');
    }
    for (const entry of customEditors) {
      const editor = validateCustomEditor(entry);
      const key = editor.executable.toLowerCase();
      if (!seenExecutables.has(key) && await pathType(this.fs, editor.executable) === 'file') {
        discovered.push(editor);
        seenExecutables.add(key);
      }
    }
    return discovered;
  }

  async verifyCustomExecutable(candidatePath) {
    const executable = requireAbsolutePath(candidatePath, 'editor executable');
    if (path.extname(executable).toLowerCase() !== '.exe') {
      throw new ValidationError('A custom editor must use a Windows executable.');
    }
    if (await pathType(this.fs, executable) !== 'file') {
      throw new AppError('EDITOR_NOT_FOUND', 'The selected external editor is not available.');
    }
    const normalizedKey = executable.toLowerCase();
    return {
      id: `custom-${createHash('sha256').update(normalizedKey).digest('hex').slice(0, 16)}`,
      name: path.basename(executable, path.extname(executable)),
      executable,
      acceptsDirectories: true,
      source: 'custom'
    };
  }

  async open(input, customEditors = []) {
    const payload = requirePlainObject(input, 'editor request');
    const editorId = requireIdentifier(payload.editorId, 'editor identifier');
    const targetPath = requireAbsolutePath(payload.targetPath, 'target path');
    const targetType = await pathType(this.fs, targetPath);
    if (!targetType) {
      throw new AppError('EDITOR_TARGET_NOT_FOUND', 'The selected file or folder does not exist.');
    }
    const editors = await this.discover(customEditors);
    const editor = editors.find((candidate) => candidate.id === editorId);
    if (!editor) {
      throw new AppError('EDITOR_NOT_FOUND', 'The selected external editor is not available.');
    }
    if (targetType === 'directory' && !editor.acceptsDirectories) {
      throw new AppError('EDITOR_FOLDER_UNSUPPORTED', 'The selected editor cannot open a folder.');
    }

    const launched = await this.launch(editor.executable, [targetPath], {
      shell: false,
      windowsHide: false
    });
    return {
      launched: true,
      pid: launched.pid ?? null,
      editor: {
        id: editor.id,
        name: editor.name,
        executable: editor.executable
      },
      targetPath
    };
  }
}

export { validateCustomEditor };
