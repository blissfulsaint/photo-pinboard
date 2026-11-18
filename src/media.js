
export const VIDEO_EXT=/\.(mp4|mov|m4v|3gp|3g2|avi|mkv|webm|mts|m2ts|mpg|mpeg|wmv)$/i;
export function isVideo(photo){return photo.kind==='video'||VIDEO_EXT.test(photo.name??'')||/^video\//.test(photo.file?.type??photo.type??'');}
export function durationLabel(seconds){if(!Number.isFinite(seconds)||seconds<=0)return 'VIDEO';const rounded=Math.floor(seconds);return Math.floor(rounded/60)+':'+String(rounded%60).padStart(2,'0');}
