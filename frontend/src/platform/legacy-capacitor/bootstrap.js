import '../../styles/legacy-capacitor/mobile-shell.css';
import '../../styles/legacy-capacitor/safe-area.css';
import { initCapacitorNative } from './runtime';

export async function initialize() {
  await initCapacitorNative();
}
