import { spawnSync } from 'node:child_process';

const REQUIRED_NODE_MAJOR = 22;
const FFMPEG_TOOLS = ['ffmpeg', 'ffprobe'];

const FFMPEG_HINTS = {
  darwin: 'On macOS: brew install ffmpeg',
  win32:
    'On Windows: install a build linked from the official FFmpeg download page (https://ffmpeg.org/download.html) and make sure both ffmpeg.exe and ffprobe.exe resolve from PATH',
  linux: 'On Linux: install ffmpeg with your package manager (it includes ffprobe)',
};

export function checkNodeVersion(versionString) {
  const major = Number.parseInt(String(versionString).replace(/^v/, ''), 10);
  return { ok: major === REQUIRED_NODE_MAJOR, major };
}

function nodeVersionFailure(versionString) {
  return [
    `This app requires Node.js ${REQUIRED_NODE_MAJOR}.x, but you are running ${versionString}.`,
    'better-sqlite3 is pinned to a version with prebuilt binaries for Node 22 only; other majors fall back to a local C++ build or crash.',
    `Install Node ${REQUIRED_NODE_MAJOR} from https://nodejs.org/en/download (or with a version manager such as fnm: "fnm install ${REQUIRED_NODE_MAJOR} && fnm use ${REQUIRED_NODE_MAJOR}").`,
    'The required major version is also recorded in .node-version.',
  ].join('\n');
}

function ffmpegWarning(missingTools, platform) {
  const hint = FFMPEG_HINTS[platform] ?? FFMPEG_HINTS.linux;
  return [
    `Could not find ${missingTools.join(' and ')} on PATH.`,
    'The app will start, but importing and playing local video files needs FFmpeg (both ffmpeg and ffprobe).',
    `${hint}, then restart the app.`,
  ].join('\n');
}

export function runPrecheck({ nodeVersion, platform, checkCommand, env }) {
  if (env.TANKU_SKIP_PRECHECK === '1') {
    return { skipped: true, failures: [], warnings: [] };
  }

  const failures = [];
  const warnings = [];

  if (!checkNodeVersion(nodeVersion).ok) {
    failures.push(nodeVersionFailure(nodeVersion));
  }

  const missingTools = FFMPEG_TOOLS.filter((tool) => !checkCommand(tool));
  if (missingTools.length > 0) {
    warnings.push(ffmpegWarning(missingTools, platform));
  }

  return { skipped: false, failures, warnings };
}

export function defaultCheckCommand(command) {
  return spawnSync(command, ['-version'], { stdio: 'ignore' }).error == null;
}
