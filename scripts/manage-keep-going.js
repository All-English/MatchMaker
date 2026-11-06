#!/usr/bin/env node

/**
 * Manage and synchronize "Keep going!" audio announcements.
 *
 * Usage:
 *   node scripts/manage-keep-going.js check       # Inspect status of voices and audio files
 *   node scripts/manage-keep-going.js generate    # Generate any missing audio variations
 *   node scripts/manage-keep-going.js clean       # Remove orphaned audio files
 */

const fs = require("fs");
const path = require("path");

const SCRIPT_PATH = path.resolve(__dirname, "../script.js");
const AUDIO_DIR = path.resolve(__dirname, "../audio/keep_going");

const VARIATIONS = [
  { suffix: "_v1.mp3", text: "[excited] Keep going!" },
  { suffix: "_v2.mp3", text: "[playful] Keep going!" },
  { suffix: "_v3.mp3", text: "[encouraging] Keep going!" }
];

const ELEVENLABS_PRONUNCIATION_DICT_ID = "sKcMTMc7IZdOIqGSuKGL";
const ELEVENLABS_PRONUNCIATION_VERSION_ID = "lBWAKvEKQsfx4Ajakhf7";

function getVoicesFromScript() {
  const content = fs.readFileSync(SCRIPT_PATH, "utf8");
  const match = content.match(/const voiceList = \[([\s\S]*?)\]/);
  if (!match) {
    throw new Error("Could not find 'voiceList' in script.js");
  }

  const voices = [];
  const lines = match[1].split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const idMatch = trimmed.match(/"([^"]+)"/);
    if (idMatch) {
      const id = idMatch[1];
      const nameMatch = trimmed.match(/\/\/\s*(.*)/);
      const name = nameMatch ? nameMatch[1].trim() : id;
      voices.push({ id, name });
    }
  }
  return voices;
}

function getExistingAudioFiles() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
  return fs.readdirSync(AUDIO_DIR).filter(file => file.endsWith(".mp3"));
}

function analyzePool() {
  const voices = getVoicesFromScript();
  const existingFiles = new Set(getExistingAudioFiles());

  const missing = [];
  const configuredFileSet = new Set();

  for (const voice of voices) {
    for (const v of VARIATIONS) {
      const fileName = `${voice.id}${v.suffix}`;
      configuredFileSet.add(fileName);
      if (!existingFiles.has(fileName)) {
        missing.push({
          voice,
          variation: v,
          fileName,
          filePath: path.join(AUDIO_DIR, fileName)
        });
      }
    }
  }

  const orphaned = [];
  for (const file of existingFiles) {
    if (!configuredFileSet.has(file)) {
      orphaned.push(file);
    }
  }

  return { voices, existingFiles, missing, orphaned };
}

async function generateMissing(filterVoiceId = null, forceAll = false) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Error: Missing ELEVENLABS_API_KEY environment variable.");
    process.exit(1);
  }

  const { voices, missing } = analyzePool();

  let toGenerate = missing;
  if (forceAll) {
    toGenerate = [];
    for (const voice of voices) {
      for (const v of VARIATIONS) {
        toGenerate.push({
          voice,
          variation: v,
          fileName: `${voice.id}${v.suffix}`,
          filePath: path.join(AUDIO_DIR, `${voice.id}${v.suffix}`)
        });
      }
    }
  }

  if (filterVoiceId) {
    toGenerate = toGenerate.filter(item => item.voice.id === filterVoiceId);
  }

  if (toGenerate.length === 0) {
    console.log("Everything is up to date! No audio files need generation.");
    return;
  }

  console.log(`Generating ${toGenerate.length} audio file(s)...`);

  for (const item of toGenerate) {
    console.log(`Synthesizing ${item.voice.name} (${item.voice.id}) with prompt "${item.variation.text}" -> ${item.fileName}...`);

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${item.voice.id}`;
    const payload = {
      text: item.variation.text,
      model_id: "eleven_v4_turbo",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 0.85
      },
      pronunciation_dictionary_locators: [
        {
          pronunciation_dictionary_id: ELEVENLABS_PRONUNCIATION_DICT_ID,
          version_id: ELEVENLABS_PRONUNCIATION_VERSION_ID
        }
      ]
    };

    let res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify(payload)
    });

    // Fallback if pronunciation dictionary locator fails
    if (!res.ok && payload.pronunciation_dictionary_locators) {
      delete payload.pronunciation_dictionary_locators;
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      console.error(`Failed to generate ${item.fileName}:`, res.status, await res.text());
      continue;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(item.filePath, buffer);
    console.log(`  Saved ${item.fileName} (${buffer.length} bytes)`);

    // Polite delay for rate limits
    await new Promise(r => setTimeout(r, 400));
  }

  console.log("\nDone generating audio files.");
}

function cleanOrphaned() {
  const { orphaned } = analyzePool();
  if (orphaned.length === 0) {
    console.log("No orphaned audio files found.");
    return;
  }

  console.log(`Found ${orphaned.length} orphaned audio file(s):`);
  for (const file of orphaned) {
    const fullPath = path.join(AUDIO_DIR, file);
    fs.unlinkSync(fullPath);
    console.log(`  Removed ${file}`);
  }
  console.log("Cleanup complete.");
}

function runCheck() {
  const { voices, existingFiles, missing, orphaned } = analyzePool();

  console.log(`\n=== Keep Going Audio Status ===`);
  console.log(`Voices in script.js: ${voices.length}`);
  console.log(`Expected audio files: ${voices.length * VARIATIONS.length}`);
  console.log(`Existing audio files: ${existingFiles.size}`);
  console.log(`Missing variations:   ${missing.length}`);
  console.log(`Orphaned files:       ${orphaned.length}`);

  if (missing.length > 0) {
    console.log("\nMissing Files:");
    for (const item of missing) {
      console.log(`  - ${item.fileName} (${item.voice.name}) [Prompt: "${item.variation.text}"]`);
    }
    console.log(`\nRun: node scripts/manage-keep-going.js generate`);
  } else {
    console.log("\nAll voice variations are present on disk!");
  }

  if (orphaned.length > 0) {
    console.log("\nOrphaned Files (voices not in voiceList):");
    for (const file of orphaned) {
      console.log(`  - ${file}`);
    }
    console.log(`Run: node scripts/manage-keep-going.js clean to remove them.`);
  }
  console.log("");
}

// CLI argument parsing
const command = process.argv[2] || "check";

switch (command) {
  case "check":
  case "status":
    runCheck();
    break;
  case "generate":
    const force = process.argv.includes("--force");
    const voiceArgIdx = process.argv.indexOf("--voice");
    const voiceId = voiceArgIdx !== -1 ? process.argv[voiceArgIdx + 1] : null;
    generateMissing(voiceId, force);
    break;
  case "clean":
    cleanOrphaned();
    break;
  default:
    console.log("Usage: node scripts/manage-keep-going.js [check|generate|clean]");
    break;
}
