/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// Compositions are laid out at 1920×1080 and rendered at 2× → 3840×2160 (4K UHD).
Config.setScale(2);
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
Config.setAudioCodec("aac");
Config.setAudioBitrate("320k");
