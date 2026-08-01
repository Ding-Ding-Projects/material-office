import path from 'node:path';
import { ValidationError } from './errors.js';

export const PYUNO_PROBE_CODE = [
  'import sys',
  'sys.path.insert(0,sys.argv[1])',
  'import uno',
  'assert uno.getComponentContext() is not None'
].join(';');

export const PYUNO_BROKER_LAUNCH_CODE = [
  'import runpy,sys',
  'sys.path.insert(0,sys.argv[1])',
  'sys.argv=sys.argv[2:]',
  "runpy.run_path(sys.argv[0],run_name='__main__')"
].join(';');

export function sanitizedPythonEnvironment(environment = process.env) {
  const result = Object.create(null);
  for (const [key, value] of Object.entries(environment)) {
    if (/^(?:PYTHON|UNO_|URE_)/i.test(key) || typeof value !== 'string') continue;
    result[key] = value;
  }
  return result;
}

function absoluteDirectory(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new ValidationError(`${label} must be an absolute path.`);
  }
  return path.resolve(value);
}

export function pyunoProbeArguments(programDirectory) {
  const program = absoluteDirectory(programDirectory, 'LibreOffice program directory');
  return ['-I', '-c', PYUNO_PROBE_CODE, program];
}

export function pyunoBrokerArguments(programDirectory, brokerPath, brokerArguments) {
  const program = absoluteDirectory(programDirectory, 'LibreOffice program directory');
  if (typeof brokerPath !== 'string' || !path.isAbsolute(brokerPath) || brokerPath.includes('\0')) {
    throw new ValidationError('UNO broker path must be absolute.');
  }
  if (!Array.isArray(brokerArguments) || brokerArguments.some((value) => typeof value !== 'string')) {
    throw new ValidationError('UNO broker arguments are invalid.');
  }
  return [
    '-I',
    '-c',
    PYUNO_BROKER_LAUNCH_CODE,
    program,
    path.resolve(brokerPath),
    ...brokerArguments
  ];
}
