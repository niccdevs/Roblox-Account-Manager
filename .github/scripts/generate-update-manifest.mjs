import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const tag = process.env.RELEASE_TAG;
const channel = process.env.RELEASE_CHANNEL || "beta";
const repo = process.env.GITHUB_REPOSITORY;

if (!tag || !repo) {
  console.error("RELEASE_TAG and GITHUB_REPOSITORY are required");
  process.exit(1);
}

const version = tag.startsWith("v") ? tag.slice(1) : tag;

const assetsJson = execSync(`gh release view "${tag}" --repo "${repo}" --json assets`, {
  encoding: "utf-8",
});
const { assets } = JSON.parse(assetsJson);

const nsisZip = assets.find((a) => a.name.endsWith(".nsis.zip"));
const nsisZipSig = assets.find((a) => a.name.endsWith(".nsis.zip.sig"));

if (!nsisZip || !nsisZipSig) {
  console.error("Could not find .nsis.zip or .nsis.zip.sig in release assets");
  console.error("Available assets:", assets.map((a) => a.name).join(", "));
  process.exit(1);
}

const signature = execSync(`gh release download "${tag}" --repo "${repo}" --pattern "${nsisZipSig.name}" --output -`, {
  encoding: "utf-8",
}).trim();

const releaseJson = execSync(`gh release view "${tag}" --repo "${repo}" --json body,publishedAt`, {
  encoding: "utf-8",
});
const releaseData = JSON.parse(releaseJson);

const manifest = {
  version,
  notes: releaseData.body || "",
  pub_date: releaseData.publishedAt || new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: nsisZip.url,
    },
  },
};

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
