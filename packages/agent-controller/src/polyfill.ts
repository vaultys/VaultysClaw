// WebRTC polyfill for Node.js.
// Must be the first import in the entry point so globals are set before peerjs
// loads its module-level support-detection IIFE.
// Uses createRequire to load the CJS binding directly (ESM import * synthesis
// does not expose native-addon exports like RTCPeerConnection).
import { createRequire } from "module";
const _req = createRequire(import.meta.url);
const wrtc = _req("@roamhq/wrtc") as Record<string, unknown>;
(global as Record<string, unknown>).RTCPeerConnection = wrtc.RTCPeerConnection;
(global as Record<string, unknown>).RTCSessionDescription = wrtc.RTCSessionDescription;
(global as Record<string, unknown>).RTCIceCandidate = wrtc.RTCIceCandidate;
(global as Record<string, unknown>).getUserMedia = wrtc.getUserMedia;
