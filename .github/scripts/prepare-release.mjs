import { execSync } from "node:child_process";
import fs from "node:fs";

const bump = (process.env.RELEASE_BUMP || "patch").toLowerCase();
const channel = (process.env.RELEASE_CHANNEL || "beta").toLowerCase();
const repository = process.env.GITHUB_REPOSITORY || "";
const sha = process.env.GITHUB_SHA || "";

if (!["patch", "minor"].includes(bump)) {
  throw new Error(`Unsupported RELEASE_BUMP value: ${bump}`);
}

if (!["beta", "stable"].includes(channel)) {
  throw new Error(`Unsupported RELEASE_CHANNEL value: ${channel}`);
}

if (!repository) {
  throw new Error("Missing GITHUB_REPOSITORY");
}

const packagePath = "package.json";
const tauriConfigPath = "src-tauri/tauri.conf.json";
const cargoPath = "src-tauri/Cargo.toml";

const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
const cargoToml = fs.readFileSync(cargoPath, "utf8");

const current = parseVersion(packageJson.version);
if (!current) {
  throw new Error(`Invalid current version in package.json: ${packageJson.version}`);
}

const rawTags = execSync('git tag --list "v*"', { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const parsedTags = rawTags
  .map((tag) => parseTag(tag))
  .filter(Boolean)
  .filter((version) => version.major === current.major);

const latest = pickLatest([
  ...parsedTags,
  { ...current, tag: `v${current.raw}` }
]);

let nextMajor = latest.major;
let nextMinor = latest.minor;
let nextPatch = latest.patch;

if (bump === "minor") {
  nextMinor += 1;
  nextPatch = 0;
} else {
  nextPatch += 1;
}

let betaNumber = null;
if (channel === "beta") {
  const previousBeta = parsedTags
    .filter((item) => item.major === nextMajor && item.minor === nextMinor && item.patch === nextPatch && item.beta !== null)
    .reduce((max, item) => Math.max(max, item.beta), 0);

  betaNumber = previousBeta + 1;
}

const coreVersion = `${nextMajor}.${nextMinor}.${nextPatch}`;
const fullVersion = betaNumber === null ? coreVersion : `${coreVersion}-beta.${betaNumber}`;
const tag = `v${fullVersion}`;
const releaseTitle = `Roblox Account Manager ${tag}`;
const updaterEndpoint = `https://raw.githubusercontent.com/${repository}/update-manifests/${channel}/latest.json`;

packageJson.version = fullVersion;

tauriConfig.version = fullVersion;
tauriConfig.plugins ??= {};
tauriConfig.plugins.updater ??= {};
tauriConfig.plugins.updater.endpoints = [updaterEndpoint];

const updatedCargoToml = cargoToml.replace(/^version\s*=\s*".*"$/m, `version = "${fullVersion}"`);
if (updatedCargoToml === cargoToml) {
  throw new Error(`Could not update version in ${cargoPath}`);
}

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8");
fs.writeFileSync(cargoPath, updatedCargoToml, "utf8");

const shortSha = sha ? sha.slice(0, 7) : "unknown";
const channelLabel = channel === "beta" ? "Beta" : "Stable";
const releaseBody = [
  `Automated ${channelLabel} release for commit ${shortSha}.`,
  "",
  "Download options (you only need one):",
  "- `Roblox Account Manager_*_x64-setup.exe` (recommended)",
  "- `Roblox Account Manager_*_x64_en-US.msi`",
  "- `roblox-account-manager.exe` (portable binary, advanced use)",
  "",
  `Bump mode: ${bump}`,
  `Channel: ${channelLabel}`
].join("\n");

setOutput("version", fullVersion);
setOutput("tag", tag);
setOutput("release_title", releaseTitle);
setMultilineOutput("release_body", releaseBody);
setOutput("updater_endpoint", updaterEndpoint);

function parseTag(tag) {
  if (!tag.startsWith("v")) {
    return null;
  }

  const parsed = parseVersion(tag.slice(1));
  if (!parsed) {
    return null;
  }

  return { ...parsed, tag };
}

function parseVersion(input) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(String(input).trim());
  if (!match) {
    return null;
  }

  return {
    raw: String(input).trim(),
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    beta: match[4] ? Number(match[4]) : null
  };
}

function pickLatest(versions) {
  return versions.reduce((best, candidate) => (compareVersions(candidate, best) > 0 ? candidate : best));
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  const aStable = a.beta === null;
  const bStable = b.beta === null;

  if (aStable && !bStable) return 1;
  if (!aStable && bStable) return -1;
  if (aStable && bStable) return 0;

  return a.beta - b.beta;
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  fs.appendFileSync(outputPath, `${name}=${value}\n`, "utf8");
}

function setMultilineOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  fs.appendFileSync(outputPath, `${name}<<EOF\n${value}\nEOF\n`, "utf8");
}
