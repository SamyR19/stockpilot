#!/usr/bin/env node

import { existsSync, mkdirSync, lstatSync, rmSync, symlinkSync, readlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const packageDir = process.cwd();
const sdkDir = join(repoRoot, "packages", "plugins", "sdk");
const scopeDir = join(packageDir, "node_modules", "@paperclipai");
const linkTarget = join(scopeDir, "plugin-sdk");

if (!existsSync(join(packageDir, "package.json"))) {
  throw new Error(`No package.json found in plugin directory: ${packageDir}`);
}

mkdirSync(scopeDir, { recursive: true });

try {
  const stat = lstatSync(linkTarget);
  if (stat.isSymbolicLink()) {
    rmSync(linkTarget, { force: true });
  } else {
    console.log("  i Keeping existing installed @paperclipai/plugin-sdk directory in place");
    process.exit(0);
  }
} catch {
  // target does not exist yet
}

const relativeSdkDir = relative(scopeDir, sdkDir);

try {
  symlinkSync(relativeSdkDir, linkTarget, "dir");
  console.log(`  ✓ Linked local @paperclipai/plugin-sdk for ${packageDir}`);
} catch (err) {
  // Idempotent: a concurrent postinstall or a cached node_modules (e.g. Vercel
  // build cache between deploys) may have already created the link between our
  // lstat check above and now. If a correct link already exists, treat it as
  // success rather than failing the entire install.
  if (err && err.code === "EEXIST") {
    let existingTarget = null;
    try {
      existingTarget = readlinkSync(linkTarget);
    } catch {
      // not a symlink we can read — fall through to re-throw
    }
    if (existingTarget === relativeSdkDir) {
      console.log(`  i @paperclipai/plugin-sdk link already present for ${packageDir}`);
    } else {
      // A stale/incorrect link exists — replace it.
      rmSync(linkTarget, { force: true });
      symlinkSync(relativeSdkDir, linkTarget, "dir");
      console.log(`  ✓ Re-linked local @paperclipai/plugin-sdk for ${packageDir}`);
    }
  } else {
    throw err;
  }
}
