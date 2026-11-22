import factory from './avif_enc.js';
export default function (options = {}) {
  return factory({ ...options, noInitialRun: true });
}
