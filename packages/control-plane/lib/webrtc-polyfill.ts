import * as wrtc from "@roamhq/wrtc";

// Polyfill WebRTC globals required by PeerJS when running in Node.js
(global as Record<string, unknown>).RTCPeerConnection = wrtc.RTCPeerConnection;
(global as Record<string, unknown>).RTCSessionDescription =
  wrtc.RTCSessionDescription;
(global as Record<string, unknown>).RTCIceCandidate = wrtc.RTCIceCandidate;
(global as Record<string, unknown>).getUserMedia = wrtc.getUserMedia;
