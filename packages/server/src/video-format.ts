import { spawn } from 'node:child_process';
import { JoploError } from '@joplo-app/core';
/** Optional local encoder. Capture and sample-clock calibration always happen before conversion. */
export async function encodeMp4(input: string, output: string, overwrite = false): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', ['-nostdin', '-v', 'error', overwrite ? '-y' : '-n', '-i', input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', output], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', b => { stderr = (stderr + String(b)).slice(-16000); });
    child.once('error', e => reject(new JoploError('EXPORT_FAILED', `MP4 needs local ffmpeg with H.264/AAC support: ${e.message}. Use .webm to export without it.`)));
    child.once('close', code => code === 0 ? resolve() : reject(new JoploError('EXPORT_FAILED', `MP4 encoding failed (exit ${code}): ${stderr}`)));
  });
}
