import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const tag = process.env.RELEASE_TAG;
const channel = process.env.RELEASE_CHANNEL || "beta";
const repo = process.env.GITHUB_REPOSITORY;

if (!tag || !repo) {
  console.error("RELEASE_TAG and GITHUB_REPOSITORY are required");
  process.exit(1);
}

const version = tag.startsWith("v") ? tag.slice(1) : tag;

const manifest = JSON.parse(
  execSync(`gh release download "${tag}" --repo "${repo}" --pattern "latest.json" --output -`, {
    encoding: "utf-8",
  })
);

manifest.version = version;

if (!manifest.notes) {
  const releaseJson = execSync(`gh release view "${tag}" --repo "${repo}" --json body,publishedAt`, {
    encoding: "utf-8",
  });
  const releaseData = JSON.parse(releaseJson);
  manifest.notes = releaseData.body || "";
  if (!manifest.pub_date) {
    manifest.pub_date = releaseData.publishedAt || new Date().toISOString();
  }
}

const tmpDir = ".tmp-update-manifest";
execSync(`git clone --depth 1 --branch update-manifests --single-branch "https://github.com/${repo}.git" "${tmpDir}"`, {
  stdio: "inherit",
});

const channelDir = join(tmpDir, channel);
mkdirSync(channelDir, { recursive: true });
writeFileSync(join(channelDir, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");

execSync(`git -C "${tmpDir}" add -A`, { stdio: "inherit" });

const status = execSync(`git -C "${tmpDir}" status --porcelain`, { encoding: "utf-8" }).trim();
if (!status) {
  console.log("No changes to update manifest");
  process.exit(0);
}

execSync(`git -C "${tmpDir}" commit -m "update ${channel}/latest.json to ${version}"`, {
  stdio: "inherit",
});
execSync(`git -C "${tmpDir}" push origin update-manifests`, { stdio: "inherit" });

console.log(`Updated ${channel}/latest.json to ${version}`);
