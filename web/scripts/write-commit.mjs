// Writes the commit this build was made from into public/commit.txt, so
// Vite copies it verbatim into dist/ and it's served at /commit.txt — an
// easy way to check which commit a running deploy is actually serving,
// without needing to guess from bundle contents. Railway sets
// RAILWAY_GIT_COMMIT_SHA automatically for services deployed from a GitHub
// repo; falls back to the local git HEAD for other environments.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function currentCommit() {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

const outPath = fileURLToPath(new URL('../public/commit.txt', import.meta.url));
writeFileSync(outPath, currentCommit());
