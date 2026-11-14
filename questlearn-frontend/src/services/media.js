import api from './api.js';

/** Container formats a browser can play directly in a <video> element. */
const DIRECT_VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

export function isPlayableVideo(url) {
  return typeof url === 'string' && DIRECT_VIDEO.test(url);
}

/**
 * The second a YouTube link asks the player to start at, so a long lesson can open
 * at the part it is teaching. Accepts t=90, t=1m30s, t=1h2m3s and start=90.
 */
function youTubeStartSeconds(url) {
  const found = url.match(/[?&](?:t|start)=([0-9hms]+)/i);
  if (!found) return 0;
  const value = found[1].toLowerCase();
  if (/^\d+$/.test(value)) return Number(value);
  const hours = Number(value.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)m/)?.[1] ?? 0);
  const seconds = Number(value.match(/(\d+)s/)?.[1] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Extracts a privacy-enhanced YouTube embed URL if the URL is a YouTube link. */
export function getYouTubeEmbedUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
  );
  if (!match) return null;
  const start = youTubeStartSeconds(url);
  return `https://www.youtube-nocookie.com/embed/${match[1]}${start > 0 ? `?start=${start}` : ''}`;
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
 * Uploads a video file for a node in three steps: ask for a signed ticket, put the
 * bytes at the address it names, then tell the server which object arrived. The
 * bytes go straight to the storage, so a large lesson is streamed once and never
 * buffered by the application server.
 */
export async function uploadModuleVideo(moduleId, file, onProgress) {
  const { data: ticket } = await api.post(`/modules/${moduleId}/video/upload-ticket`, null, {
    params: { filename: file.name },
  });

  await putFile(ticket, file, onProgress);

  const { data } = await api.post(`/modules/${moduleId}/video/attachments`, {
    name: ticket.name,
    label: file.name,
  });
  return data;
}

/**
 * The raw PUT an upload ticket describes. XMLHttpRequest rather than fetch because
 * only it reports upload progress, which is the difference between a spinner and a
 * teacher knowing a 90 MB file is moving.
 */
function putFile(ticket, file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(ticket.method || 'PUT', ticket.uploadUrl, true);
    request.timeout = 300_000;

    const headers = ticket.headers || {};
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    if (!headers['Content-Type']) {
      request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    }

    request.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
      } else if (request.status === 403) {
        reject(new Error('That upload link expired. Choose the file again.'));
      } else {
        reject(new Error(`The video could not be uploaded (HTTP ${request.status}).`));
      }
    };
    request.onerror = () => reject(new Error('The upload could not reach the storage.'));
    request.ontimeout = () =>
      reject(new Error('The upload timed out. Try a smaller file, or attach a link instead.'));

    request.send(file);
  });
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
