import api from './api.js';

/** Container formats a browser can play directly in a <video> element. */
const DIRECT_VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

export function isPlayableVideo(url) {
  return typeof url === 'string' && DIRECT_VIDEO.test(url);
}

/** Extracts a privacy-enhanced YouTube embed URL if the URL is a YouTube link. */
export function getYouTubeEmbedUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
  );
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}

/** Extracts a Vimeo player embed URL if the URL is a Vimeo link. */
export function getVimeoEmbedUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(
    /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/(?:\d+\/)?video\/|video\/|)(\d+)/i,
  );
  return match ? `https://player.vimeo.com/video/${match[1]}` : null;
}

/**
 * Uploads a video file for a node. Not JSON, so the axios instance's default
 * Content-Type is cleared to let the browser add the multipart boundary.
 */
export async function uploadModuleVideo(moduleId, file, onProgress) {
  const form = new FormData();
  form.append('file', file, file.name);

  const { data } = await api.post(`/modules/${moduleId}/video`, form, {
    headers: { 'Content-Type': undefined },
    timeout: 300_000,
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    },
  });
  return data;
}

/** Points the node at a video hosted elsewhere (drive link, CDN, school server). */
export async function attachModuleVideoUrl(moduleId, url, label) {
  const { data } = await api.put(`/modules/${moduleId}/video-url`, {
    url,
    label: label || undefined,
  });
  return data;
}

export async function removeModuleVideo(moduleId) {
  const { data } = await api.delete(`/modules/${moduleId}/video`);
  return data;
}
