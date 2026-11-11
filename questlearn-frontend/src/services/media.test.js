import { describe, expect, it } from 'vitest';
import {
  getVimeoEmbedUrl,
  getYouTubeEmbedUrl,
  isPlayableVideo,
} from './media.js';

describe('media service', () => {
  describe('isPlayableVideo', () => {
    it('recognizes direct video files', () => {
      expect(isPlayableVideo('/api/v1/media/videos/abc-123.mp4')).toBe(true);
      expect(isPlayableVideo('https://cdn.example.com/lecture.webm')).toBe(true);
      expect(isPlayableVideo('clip.mov')).toBe(true);
    });

    it('rejects web links and non-video files', () => {
      expect(isPlayableVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
      expect(isPlayableVideo('https://example.com/doc.pdf')).toBe(false);
      expect(isPlayableVideo(null)).toBe(false);
    });
  });

  describe('getYouTubeEmbedUrl', () => {
    it('extracts ID from standard watch URL', () => {
      expect(getYouTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      );
    });

    it('extracts ID from short youtu.be URL', () => {
      expect(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      );
    });

    it('extracts ID from embed URL', () => {
      expect(getYouTubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      );
    });

    it('returns null for non-youtube URLs', () => {
      expect(getYouTubeEmbedUrl('https://vimeo.com/123456')).toBeNull();
      expect(getYouTubeEmbedUrl('')).toBeNull();
    });
  });

  describe('getVimeoEmbedUrl', () => {
    it('extracts ID from vimeo video URL', () => {
      expect(getVimeoEmbedUrl('https://vimeo.com/76979871')).toBe(
        'https://player.vimeo.com/video/76979871',
      );
    });

    it('returns null for non-vimeo URLs', () => {
      expect(getVimeoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
      expect(getVimeoEmbedUrl(null)).toBeNull();
    });
  });
});
